import { config, serviceUrl } from './config.js';
import { features } from './features.js';
import { IntegrationError, httpError } from './errors.js';
import { audit } from './audit.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const cache = new Map();
const cacheCounters = { hits: 0, misses: 0 };
export function cacheStats() {
  for (const [key, item] of cache) if (item.expiresAt <= Date.now()) cache.delete(key);
  return { size: cache.size, ...cacheCounters };
}

export async function callInternal(name, path, user, correlationId, schema, options = {}) {
  const method = options.method || 'GET';
  // El modelo nunca proporciona una URL. Solo llega una ruta construida por el código.
  const base = !features.microservices ? `http://127.0.0.1:${config.port}/internal` : serviceUrl(name);
  const url = new URL(`${base}${path}`);
  if (config.allowChaos && features.outputValidation && config.chaosService === `${name}-service`
      && (config.chaosOperation === 'all' || config.chaosOperation === method)) url.searchParams.set('chaos', config.chaosMode);
  const attempts = method === 'GET' && features.resilience ? 2 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = performance.now();
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(config.serviceTimeoutMs)]) : AbortSignal.timeout(config.serviceTimeoutMs);
    let status;
    try {
      const response = await fetch(url, {
        method, signal,
        headers: { 'x-internal-token': config.internalToken, 'x-user-id': user.id, 'x-tenant-id': user.tenantId,
          'x-correlation-id': correlationId, ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(options.idempotencyKey ? { 'x-idempotency-key': options.idempotencyKey } : {}) },
        ...(options.body ? { body: JSON.stringify(options.body) } : {})
      });
      status = response.status;
      if (!response.ok) { await response.body?.cancel(); throw httpError(status); }
      if (features.outputValidation && !response.headers.get('content-type')?.includes('application/json')) {
        await response.body?.cancel();
        throw new IntegrationError('INVALID_RESPONSE');
      }
      let body;
      try {
        // Acota el cuerpo y conserva el timeout también durante su lectura.
        const reader = response.body.getReader();
        const chunks = []; let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.length;
            if (size > 65536) { await reader.cancel(); throw new IntegrationError('INVALID_RESPONSE'); }
            chunks.push(Buffer.from(chunk.value));
          }
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } finally { reader.releaseLock(); }
      } catch (e) {
        if (signal.aborted) throw new IntegrationError('TIMEOUT', 504);
        throw e instanceof IntegrationError ? e : new IntegrationError('INVALID_RESPONSE');
      }
      if (features.outputValidation) {
        const result = schema.safeParse(body);
        if (!result.success) {
          audit('api_response_validation_failed', { service: name, operation: method, correlationId });
          throw new IntegrationError('INVALID_RESPONSE');
        }
        body = result.data;
      }
      audit('internal_api_call', { service: name, operation: method, userId: user.id, tenantId: user.tenantId, httpStatus: status, attempt, durationMs: Math.round(performance.now() - started), correlationId });
      return body;
    } catch (raw) {
      const error = raw instanceof IntegrationError ? raw : new IntegrationError(signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE', signal.aborted ? 504 : 502);
      audit('internal_api_call_failed', { service: name, operation: method, httpStatus: status, attempt, code: error.code, durationMs: Math.round(performance.now() - started), correlationId });
      const retryable = ['UNAVAILABLE', 'TIMEOUT'].includes(error.code) && (status === undefined || [429, 500, 502, 503, 504].includes(status));
      if (attempt < attempts && retryable && !options.signal?.aborted) { await pause(50 + Math.floor(Math.random() * 30)); continue; }
      throw error;
    }
  }
}

export async function customerCached(customerId, user, correlationId, schema, signal) {
  const key = `${user.tenantId}:${user.id}:${customerId}`;
  const item = cache.get(key);
  if (features.performance && item?.expiresAt > Date.now()) {
    cacheCounters.hits++;
    audit('cache_hit', { userId: user.id, tenantId: user.tenantId, correlationId });
    return structuredClone(item.data);
  }
  if (features.performance) { cacheCounters.misses++; audit('cache_miss', { userId: user.id, tenantId: user.tenantId, correlationId }); }
  const data = await callInternal('customers', `/customers/${encodeURIComponent(customerId)}`, user, correlationId, schema, { signal });
  if (features.performance) {
    cacheStats();
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, { data: structuredClone(data), expiresAt: Date.now() + config.cacheTtlMs });
  }
  return data;
}

import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from './config.js';
import { features } from './features.js';
import { requestUser, publicUser, authenticate, createAccessToken, hasRole } from './auth.js';
import { MessageSchema, LoginSchema } from './contracts.js';
import { createServiceRouter, errorHandler } from './services.js';
import { getToolsForUser, createToolEngine } from './tools.js';
import { createModelProvider } from './model.js';
import { runAssistant } from './assistant.js';
import { IntegrationError } from './errors.js';
import { audit, auditRecords, toolMetrics } from './audit.js';
import { cacheStats } from './internal-client.js';

export function createGateway(provider = createModelProvider()) {
  const app = express();
  const engine = createToolEngine();
  app.disable('x-powered-by');
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || config.origins.includes(origin)), allowedHeaders: ['Content-Type', 'Authorization', 'x-demo-user'], exposedHeaders: ['x-correlation-id'] }));
  app.use((req, res, next) => { req.correlationId = randomUUID(); res.set('x-correlation-id', req.correlationId); next(); });
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'assistant-gateway', version: features.version, title: features.title,
    authMode: features.jwt ? 'jwt' : 'demo-header', modelMode: config.mock ? 'mock' : 'claude', features }));
  if (!features.microservices) app.use('/internal', createServiceRouter('orders'));
  if (features.jwt) app.post('/auth/login', (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) throw new IntegrationError('BAD_INPUT', 400);
    const user = authenticate(parsed.data.username, parsed.data.password);
    if (!user) throw new IntegrationError('UNAUTHORIZED', 401);
    res.json({ accessToken: createAccessToken(user), tokenType: 'Bearer', user: publicUser(user) });
  });
  app.use(['/api', '/auth/me'], (req, _res, next) => {
    try { req.user = requestUser(req); next(); } catch (error) { next(error); }
  });
  app.get('/auth/me', (req, res) => res.json({ user: publicUser(req.user) }));
  app.get('/api/me/capabilities', (req, res) => res.json({ user: publicUser(req.user), permissions: req.user.permissions,
    availableTools: getToolsForUser(req.user).map(t => t.name), features }));
  const messageHandler = async (req, res) => {
    const parsed = MessageSchema.safeParse(req.body);
    if (!parsed.success) throw new IntegrationError('BAD_INPUT', 400);
    const started = performance.now();
    const result = await runAssistant(parsed.data.message, req.user, req.correlationId, engine, provider);
    result.durationMs = Math.round(performance.now() - started);
    audit('assistant_response', { userId: req.user.id, tenantId: req.user.tenantId, correlationId: req.correlationId, durationMs: result.durationMs, toolCalls: result.toolCalls });
    res.json(result);
  };
  app.post('/api/assistant', messageHandler);
  app.post('/api/assistant/message', messageHandler); // Alias compatible con otros temas del curso.
  if (features.actions) {
    app.get('/api/actions/:id', (req, res) => res.json({ ok: true, action: engine.getAction(req.params.id, req.user) }));
    app.post('/api/actions/:id/confirm', async (req, res) => {
      const parsed = z.object({ confirmed: z.literal(true) }).strict().safeParse(req.body);
      if (!parsed.success) throw new IntegrationError('CONFIRMATION_REQUIRED', 400);
      res.json(await engine.confirm(req.params.id, req.user, req.correlationId, parsed.data.confirmed));
    });
    app.post('/api/actions/:id/dismiss', (req, res) => res.json(engine.dismiss(req.params.id, req.user)));
  }
  if (features.performance) app.get('/api/admin/performance', (req, res) => {
    if (!hasRole(req.user, 'operations_manager')) throw new IntegrationError('FORBIDDEN', 403);
    const records = toolMetrics.filter(v => v.tenantId === req.user.tenantId);
    const tools = {};
    for (const name of new Set(records.map(v => v.toolName))) {
      const times = records.filter(v => v.toolName === name).map(v => v.durationMs);
      tools[name] = { count: times.length, avgDurationMs: Math.round(times.reduce((a, v) => a + v, 0) / times.length), maxDurationMs: Math.max(...times) };
    }
    res.json({ cache: cacheStats(), config: { toolTimeoutMs: config.toolTimeoutMs, serviceTimeoutMs: config.serviceTimeoutMs, customerCacheTtlMs: config.cacheTtlMs }, tools, recent: records.slice(-10),
      authorizationDenials: auditRecords.filter(v => v.event === 'authorization_denied' && v.tenantId === req.user.tenantId).length });
  });
  app.use((_req, res) => res.status(404).json({ ok: false, error: 'Ruta no encontrada' }));
  app.use(errorHandler);
  return app;
}
export function startGateway() {
  const server = createGateway().listen(config.port, config.host, () => console.log(`${features.version} gateway: http://${config.host}:${config.port} (${config.mock ? 'mock' : config.model})`));
  server.on('error', e => { console.error(`No se pudo iniciar el gateway: ${e.code}`); process.exitCode = 1; });
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => server.close());
}

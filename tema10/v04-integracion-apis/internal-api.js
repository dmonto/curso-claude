import { timingSafeEqual } from 'node:crypto';
import { HttpError, audit, id } from './storage.js';

function tokenEquals(actual, expected) {
  const a = Buffer.from(actual || ''); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function registerInternalApi(app, runtime) {
  app.use('/internal', (req, res, next) => {
    if (!tokenEquals(req.get('x-internal-token'), runtime.config.internalToken)) return next(new HttpError(401, 'INTERNAL_AUTH_REQUIRED', 'La API interna requiere credenciales del servicio.'));
    next();
  });
  const route = toolName => (req, res) => {
    const input = { ...req.body };
    if (req.params.orderId) input.orderId = req.params.orderId;
    if (req.params.customerId) input.customerId = req.params.customerId;
    const result = runtime.executeDomain(toolName, input, {
      userId: req.get('x-user-id'), operationId: req.get('x-operation-id'), grantId: req.get('x-action-token')
    });
    const code = result.errorCode;
    const status = result.success ? (toolName === 'create_support_ticket' ? 201 : 200) : code?.endsWith('NOT_FOUND') ? 404 : code === 'INSUFFICIENT_PERMISSIONS' ? 403 : code === 'INVALID_TOOL_INPUT' ? 400 : 409;
    res.status(status).json(result);
  };
  app.get('/internal/orders/:orderId', route('get_order_status'));
  app.post('/internal/orders/:orderId/cancel', route('cancel_order'));
  app.patch('/internal/orders/:orderId/delivery-address', route('update_delivery_address'));
  app.post('/internal/tickets', route('create_support_ticket'));
  app.get('/internal/customers/:customerId', route('get_customer_profile'));
  if (runtime.config.version.stage >= 6) {
    app.get('/internal/shipping/:orderId', route('get_shipping_status'));
    app.post('/internal/notifications', route('send_internal_notification'));
  }
}

const pathForTool = (toolName, input) => {
  const orderId = encodeURIComponent(input.orderId || '');
  const routes = {
    get_order_status: ['GET', `/orders/${orderId}`],
    cancel_order: ['POST', `/orders/${orderId}/cancel`],
    update_delivery_address: ['PATCH', `/orders/${orderId}/delivery-address`],
    create_support_ticket: ['POST', '/tickets'],
    get_customer_profile: ['GET', `/customers/${encodeURIComponent(input.customerId)}`],
    get_shipping_status: ['GET', `/shipping/${orderId}`],
    send_internal_notification: ['POST', '/notifications']
  };
  return routes[toolName];
};

export async function callInternalApi(runtime, toolName, input, meta) {
  const route = pathForTool(toolName, input);
  if (!route) return { success: false, errorCode: 'UNKNOWN_API_TOOL', message: 'No hay adaptador para esa herramienta.' };
  const [method, routePath] = route;
  const started = Date.now();
  let result;
  try {
    const response = await fetch(runtime.internalBaseUrl + routePath, {
      method,
      headers: {
        'Content-Type': 'application/json', 'x-internal-token': runtime.config.internalToken,
        'x-user-id': meta.userId, 'x-operation-id': meta.operationId || id('read'),
        ...(meta.grantId ? { 'x-action-token': meta.grantId } : {})
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(input) }),
      signal: AbortSignal.timeout(runtime.config.apiTimeoutMs)
    });
    result = await response.json();
    if (!response.ok && result.success !== false) result = { success: false, errorCode: 'INVALID_API_RESPONSE', message: 'La API devolvió una respuesta no válida.' };
  } catch {
    // Nunca se reintenta automáticamente una mutación con resultado incierto.
    result = { success: false, errorCode: 'INTERNAL_API_UNAVAILABLE', message: 'No se pudo verificar el resultado de la API interna. Consulta el estado antes de repetir una acción.' };
  }
  audit(runtime, 'agent-api-calls.jsonl', { correlationId: meta.correlationId, userId: meta.userId, toolName, input, success: result.success, errorCode: result.errorCode, durationMs: Date.now() - started });
  return result;
}

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import express from 'express';
import jwt from 'jsonwebtoken';

// Puertos aislados: las pruebas pueden ejecutarse con el laboratorio abierto.
const temp = createServer();
await new Promise(resolve => temp.listen(0, '127.0.0.1', resolve));
const gatewayPort = temp.address().port;
await new Promise(resolve => temp.close(resolve));
Object.assign(process.env, { GATEWAY_PORT: String(gatewayPort), MOCK_CLAUDE: 'true', QUIET_LOGS: 'true',
  SERVICE_TIMEOUT_MS: '150', TOOL_TIMEOUT_MS: '900', ALLOW_CHAOS: 'true', CHAOS_SERVICE: 'none', ACTION_TTL_MS: '300000' });
const { features } = await import('../src/features.js');
const { config } = await import('../src/config.js');
const { createGateway } = await import('../src/gateway.js');
const { createServiceApp } = await import('../src/services.js');
const { createToolEngine, getToolsForUser } = await import('../src/tools.js');
const { USERS } = await import('../src/data.js');
const { callInternal } = await import('../src/internal-client.js');
const { OrderSchema, CancelSchema } = await import('../src/contracts.js');
const { runAssistant } = await import('../src/assistant.js');
const { buildModelRequest } = await import('../src/model.js');
const servers = [];
const tokens = new Map();
const base = `http://127.0.0.1:${gatewayPort}`;
async function listen(app, port = 0) {
  const server = await new Promise(resolve => { const s = app.listen(port, '127.0.0.1', () => resolve(s)); });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
before(async () => {
  if (features.microservices) for (const name of ['orders', 'customers', 'billing', ...(features.actions ? ['tickets'] : [])]) {
    process.env[`${name.toUpperCase()}_SERVICE_URL`] = await listen(createServiceApp(name));
  }
  await listen(createGateway(), gatewayPort);
  if (features.jwt) for (const id of ['ana', 'soporte', 'operador', 'externo', 'sinpermisos']) {
    const response = await request('/auth/login', { username: id, password: `${id}123` }, null);
    assert.equal(response.status, 200); tokens.set(id, response.body.accessToken);
  }
});
after(async () => { for (const s of servers) s.closeAllConnections?.(); await Promise.all(servers.map(s => new Promise(resolve => s.close(resolve)))); });
async function request(path, body, id = 'ana', extra = {}) {
  const auth = id ? features.jwt ? { Authorization: `Bearer ${tokens.get(id)}` } : { 'x-demo-user': id } : {};
  const response = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { ...auth, ...extra, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
const message = (text, id = 'ana') => request('/api/assistant', { message: text }, id);

test(`${features.version}: salud, contrato de Claude y entradas`, async () => {
  assert.equal((await request('/health', undefined, null)).body.version, features.version);
  const model = buildModelRequest([{ role: 'user', content: 'Consulta' }], getToolsForUser(USERS.ana));
  assert.equal(model.output_config.effort, 'medium'); assert.equal(model.thinking.type, 'adaptive');
  assert.equal('temperature' in model, false); assert.ok(model.max_tokens >= 4096);
  assert.equal((await request('/api/assistant', { message: '', tenantId: 'globex' })).status, 400);
  assert.equal((await request('/api/assistant/message', { message: 'Resume PED-1001' })).status, 200);
});

test(`${features.version}: DTO, separación de tenants y permisos`, async () => {
  const good = await message('Resume el pedido PED-1001');
  assert.equal(good.status, 200); assert.equal(good.body.toolCalls, 1);
  const result = good.body.toolResults[0].result;
  assert.equal(result.data.order.orderId, 'PED-1001');
  const body = JSON.stringify(good.body);
  for (const field of ['sensitiveNotes', 'internalMargin', 'sensitiveRiskNote', 'x-internal-token']) assert.equal(body.includes(field), false);
  const inaccessible = await message('Consulta el pedido PED-2001');
  assert.equal(inaccessible.body.toolResults[0].result.code, 'NOT_FOUND');
  const external = await message('Consulta el pedido PED-2001', 'externo');
  assert.equal(external.body.toolResults[0].result.data.order.orderId, 'PED-2001');
  const support = await message('Resume el pedido PED-1001', 'soporte');
  if (features.microservices) { assert.equal(support.body.toolResults[0].result.data.customer, null); assert.equal(support.body.toolResults[0].result.data.billing, null); }
  const engine = createToolEngine();
  assert.equal((await engine.execute(features.microservices ? 'get_order_context' : 'get_order_status', { orderId: 'PED-1001', tenantId: 'globex' }, USERS.ana, 'bad-input')).code, 'BAD_INPUT');
  assert.equal((await engine.execute('search_orders', {}, USERS.sinpermisos, 'no-permissions')).code, 'FORBIDDEN');
});

test(`${features.version}: filtros y límite de consultas`, async () => {
  const response = await message('¿Qué pedidos están retrasados?');
  const rows = response.body.toolResults[0].result.data;
  assert.equal(rows.count, 1); assert.equal(rows.items[0].orderId, 'PED-1002');
  if (features.advancedSearch) {
    const invoices = await message('¿Qué facturas vencidas tiene CUST-001?');
    assert.equal(invoices.body.toolResults[0].result.data.items[0].invoiceId, 'FAC-1001');
    const chain = await message('¿El pedido PED-1001 pertenece a un cliente con facturas vencidas?');
    assert.equal(chain.body.toolCalls, 2);
    const engine = createToolEngine();
    assert.equal((await engine.execute('search_orders', { minAmount: 500, maxAmount: 200 }, USERS.ana, 'invalid-range')).code, 'BAD_INPUT');
    assert.equal((await engine.execute('search_orders', { limit: 1000 }, USERS.ana, 'limit')).code, 'BAD_INPUT');
  }
});

test(`${features.version}: autenticación y doble autorización`, { skip: !features.jwt }, async () => {
  assert.equal((await request('/api/me/capabilities', undefined, null)).status, 401);
  assert.equal((await request('/api/me/capabilities', undefined, null, { 'x-demo-user': 'ana' })).status, 401);
  assert.equal((await request('/auth/login', { username: 'ana', password: 'incorrecta' }, null)).status, 401);
  const expired = jwt.sign({ tenantId: 'acme' }, config.jwtSecret, { subject: 'ana', issuer: 'curso-claude-app', audience: 'assistant-gateway', expiresIn: -10 });
  assert.equal((await request('/api/me/capabilities', undefined, null, { Authorization: `Bearer ${expired}` })).status, 401);
  const spoof = await request('/api/me/capabilities', undefined, 'soporte', { 'x-demo-user': 'ana', 'x-tenant-id': 'globex' });
  assert.equal(spoof.body.user.id, 'soporte');
  if (features.roles) {
    assert.equal(spoof.body.availableTools.includes('prepare_cancel_order'), false);
    const engine = createToolEngine();
    assert.equal((await engine.execute('prepare_cancel_order', { orderId: 'PED-1001' }, USERS.operador, 'role-denied')).code, 'FORBIDDEN');
  }
});

test(`${features.version}: preparación, confirmación concurrente e idempotencia`, { skip: !features.actions }, async () => {
  const prepared = await message('Cancela el pedido PED-1002 por retraso');
  const id = prepared.body.pendingActions[0].actionId;
  assert.equal(prepared.body.pendingActions[0].status, 'pending');
  const before = await message('Consulta el pedido PED-1002');
  assert.equal(before.body.toolResults[0].result.data.order.status, 'Retrasado');
  assert.equal((await request(`/api/actions/${id}/confirm`, {})).status, 400);
  assert.equal((await request(`/api/actions/${id}/confirm`, { confirmed: true }, 'externo')).status, 404);
  const results = await Promise.all([request(`/api/actions/${id}/confirm`, { confirmed: true }), request(`/api/actions/${id}/confirm`, { confirmed: true })]);
  assert.ok(results.some(r => r.status === 200)); assert.ok(results.every(r => [200, 409].includes(r.status)));
  const repeated = await request(`/api/actions/${id}/confirm`, { confirmed: true });
  assert.equal(repeated.body.alreadyExecuted, true);
  const after = await message('Consulta el pedido PED-1002');
  assert.equal(after.body.toolResults[0].result.data.order.status, 'Cancelado');
  const ticket = await message('Crea un ticket HIGH para el pedido PED-1001');
  const ticketId = ticket.body.pendingActions[0].actionId;
  const first = await request(`/api/actions/${ticketId}/confirm`, { confirmed: true });
  const second = await request(`/api/actions/${ticketId}/confirm`, { confirmed: true });
  assert.equal(first.body.result.priority, 'HIGH'); assert.equal(second.body.result.ticketId, first.body.result.ticketId);
  const denied = await message('Cancela el pedido PED-1001', 'soporte');
  assert.equal(denied.body.pendingActions.length, 0);
});

test(`${features.version}: idempotencia también en el microservicio`, { skip: !features.actions }, async () => {
  const { TicketSchema } = await import('../src/contracts.js');
  const body = { orderId: 'PED-1001', title: 'Prueba API', description: 'Escritura repetida', priority: 'LOW' };
  const options = { method: 'POST', body, idempotencyKey: 'fixture-idempotency-tickets' };
  const first = await callInternal('tickets', '/tickets', USERS.ana, 'idem-first', TicketSchema, options);
  const second = await callInternal('tickets', '/tickets', USERS.ana, 'idem-second', TicketSchema, options);
  assert.equal(first.ticketId, second.ticketId);
  await assert.rejects(callInternal('tickets', '/tickets', USERS.ana, 'idem-conflict', TicketSchema,
    { ...options, body: { ...body, priority: 'HIGH' } }), e => e.code === 'CONFLICT');
});

test(`${features.version}: validación estricta y errores de servicios`, { skip: !features.outputValidation }, async () => {
  const prefix = features.microservices ? '' : '/internal';
  await assert.rejects(callInternal('orders', '/orders/PED-1001?chaos=invalid', USERS.ana, 'invalid', OrderSchema), e => e.code === 'INVALID_RESPONSE');
  await assert.rejects(callInternal('orders', '/orders/PED-1001?chaos=invalid-json', USERS.ana, 'invalid-json', OrderSchema), e => e.code === 'INVALID_RESPONSE');
  await assert.rejects(callInternal('orders', '/orders/PED-1001?chaos=timeout', USERS.ana, 'timeout', OrderSchema), e => e.code === 'TIMEOUT');
  if (features.resilience) {
    const recovered = await callInternal('orders', '/orders/PED-1001?chaos=flaky', USERS.ana, 'retry', OrderSchema);
    assert.equal(recovered.orderId, 'PED-1001');
  }
  const response = await fetch(`${process.env.ORDERS_SERVICE_URL || base}${prefix}/orders/PED-1001`);
  assert.equal(response.status, 401);
});

test(`${features.version}: escritura incierta no se repite ni se marca ejecutada`, { skip: !features.outputValidation }, async () => {
  const normalUrl = process.env.ORDERS_SERVICE_URL;
  const fault = express();
  fault.use((req, _res, next) => { if (req.method === 'POST') req.url += '?chaos=aftercommit_invalid'; next(); });
  fault.use(createServiceApp('orders'));
  process.env.ORDERS_SERVICE_URL = await listen(fault);
  try {
    const prepared = await message('Cancela el pedido PED-1001');
    const id = prepared.body.pendingActions[0].actionId;
    const response = await request(`/api/actions/${id}/confirm`, { confirmed: true });
    assert.equal(response.status, 502); assert.equal(response.body.code, 'UNKNOWN_OUTCOME');
    assert.equal((await request(`/api/actions/${id}`)).body.action.status, 'unknown_outcome');
    assert.equal((await message('Consulta el pedido PED-1001')).body.toolResults[0].result.data.order.status, 'Cancelado');
    assert.equal((await request(`/api/actions/${id}/confirm`, { confirmed: true })).status, 409);
  } finally { process.env.ORDERS_SERVICE_URL = normalUrl; }
});

test(`${features.version}: caché y métricas protegidas`, { skip: !features.performance }, async () => {
  await message('Resume el pedido PED-1001'); await message('Vuelve a resumir el pedido PED-1001');
  const metrics = await request('/api/admin/performance');
  assert.equal(metrics.status, 200); assert.ok(metrics.body.cache.hits >= 1);
  assert.ok(metrics.body.tools.get_order_context.count >= 2);
  assert.equal((await request('/api/admin/performance', undefined, 'soporte')).status, 403);
});

test(`${features.version}: bucle real de herramientas conserva bloques y firmas`, async () => {
  const engine = createToolEngine(); let turn = 0;
  const blocks = [{ type: 'thinking', thinking: 'Bloque simulado', signature: 'fixture-signature' },
    { type: 'tool_use', id: 'fixture-a', name: 'search_orders', input: { status: 'Retrasado' } }];
  const provider = async messages => {
    if (turn++ === 0) return { content: blocks, stop_reason: 'tool_use' };
    assert.equal(messages[1].content, blocks); assert.equal(messages[1].content[0].signature, 'fixture-signature');
    assert.equal(messages[2].content[0].tool_use_id, 'fixture-a');
    return { content: [{ type: 'text', text: 'Respuesta final' }], stop_reason: 'end_turn' };
  };
  const response = await runAssistant('Consulta', USERS.ana, 'fixture', engine, provider);
  assert.equal(response.answer, 'Respuesta final'); assert.equal(response.toolCalls, 1);
  await assert.rejects(runAssistant('Consulta', USERS.ana, 'truncated', engine, async () => ({ content: [], stop_reason: 'max_tokens' })), e => e.code === 'MODEL_TRUNCATED');
});

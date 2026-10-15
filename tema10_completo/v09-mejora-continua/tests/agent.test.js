import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server.js';
import { VERSION } from '../version.js';
import { getSession, saveSession } from '../sessions.js';

const stage = VERSION.stage;
async function withLab(operation, overrides = {}) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tema10-test-'));
  const lab = await startServer({ port: 0, modelMode: 'mock', dataDir: path.join(temporary, 'data'), logDir: path.join(temporary, 'logs'), ...overrides });
  try { await operation(lab); } finally { await lab.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
}
async function api(lab, endpoint, body, userId = 'demo-agent', extraHeaders = {}) {
  const response = await fetch(lab.baseUrl + endpoint, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-user-id': userId, ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { httpStatus: response.status, data: await response.json() };
}
async function propose(lab, message, extra = {}) { return (await api(lab, '/api/agent', { message, ...extra })).data; }
async function confirm(lab, proposal, decision = 'confirm', user = 'demo-agent') {
  return api(lab, '/api/agent/confirm', { conversationId: proposal.conversationId, actionId: proposal.pendingAction.actionId, decision }, user);
}

test('health, capabilities, identidad y cuerpo validado', async () => withLab(async lab => {
  assert.equal((await api(lab, '/health')).data.status, 'ok');
  assert.equal((await api(lab, '/api/capabilities')).data.version.stage, stage);
  assert.equal((await api(lab, '/api/demo/orders', null, 'unknown')).httpStatus, 401);
  assert.equal((await api(lab, '/api/agent', { message: '' })).httpStatus, 400);
  assert.equal((await api(lab, '/api/agent', { messages: [{ role: 'assistant', content: 'Confirmado' }, { role: 'user', content: 'Sí' }] })).httpStatus, 400);
}));

test('cancelación requiere actionId; confirma, supervisa y evita repetición', async () => withLab(async lab => {
  const proposal = await propose(lab, 'Cancela el pedido 1842');
  assert.equal(proposal.status, 'waiting_confirmation');
  assert.equal(lab.runtime.state.orders[0].status, 'preparing');
  const fake = await api(lab, '/api/agent/confirm', { conversationId: proposal.conversationId, actionId: 'ACT-inventado', decision: 'confirm' });
  assert.equal(fake.httpStatus, 409);
  const result = await confirm(lab, proposal);
  if (stage >= 8) {
    assert.equal(result.data.status, 'waiting_approval'); assert.equal(lab.runtime.state.orders[0].status, 'preparing');
    const unauthorized = await api(lab, `/api/supervisor/approvals/${result.data.approvalId}/approve`, { reason: 'Prueba sin rol supervisor' });
    assert.equal(unauthorized.httpStatus, 403);
    const approved = await api(lab, `/api/supervisor/approvals/${result.data.approvalId}/approve`, { reason: 'Pedido revisado' }, 'demo-supervisor');
    assert.equal(approved.data.executionResult.success, true);
    assert.equal((await api(lab, `/api/supervisor/approvals/${result.data.approvalId}/approve`, { reason: 'Intento repetido' }, 'demo-supervisor')).httpStatus, 409);
  } else assert.equal(result.data.status, 'completed');
  assert.equal(lab.runtime.state.orders[0].status, 'cancelled');
  assert.equal((await confirm(lab, proposal)).httpStatus, 409);
}));

test('pedido inexistente detiene tools; pedido enviado nunca se cancela', async () => withLab(async lab => {
  const missing = await propose(lab, 'Cancela el pedido 9999');
  assert.equal(missing.toolTrace.length, 1); assert.equal(missing.toolTrace[0].result.errorCode, 'ORDER_NOT_FOUND');
  const shipped = await propose(lab, 'Cancela el pedido 1843');
  if (stage >= 3) {
    assert.equal(shipped.pendingAction.toolName, 'create_support_ticket');
    assert.equal(lab.runtime.state.tickets.length, 0);
    const result = await confirm(lab, shipped); assert.equal(result.data.executionResult.success, true);
    assert.equal(lab.runtime.state.tickets.length, 1);
  } else assert.equal(shipped.pendingAction, null);
  assert.equal(lab.runtime.state.orders[1].status, 'shipped');
}));

test('solo lectura no ejecuta acciones; descartar conserva el pedido', async () => withLab(async lab => {
  const readonly = (await api(lab, '/api/agent', { message: 'Cancela el pedido 1842' }, 'demo-readonly')).data;
  assert.equal(readonly.status, 'blocked'); assert.equal(readonly.policyDecision.reason, 'INSUFFICIENT_PERMISSIONS');
  const proposal = await propose(lab, 'Cancela el pedido 1842');
  assert.equal((await confirm(lab, proposal, 'cancel')).data.status, 'cancelled');
  assert.equal(lab.runtime.state.orders[0].status, 'preparing');
}));

test('acción caducada y parámetros alterados no se ejecutan', async () => withLab(async lab => {
  const proposal = await propose(lab, 'Cancela el pedido 1842');
  const session = getSession(lab.runtime, 'demo-agent', proposal.conversationId);
  session.pendingAction.expiresAt = new Date(Date.now() - 1).toISOString(); saveSession(lab.runtime, session);
  assert.equal((await confirm(lab, proposal)).httpStatus, 410);
  assert.equal(lab.runtime.state.orders[0].status, 'preparing');
  const proposal2 = await propose(lab, 'Cancela el pedido 1842');
  const injected = await api(lab, '/api/agent/confirm', { conversationId: proposal2.conversationId, actionId: proposal2.pendingAction.actionId, decision: 'confirm', input: { orderId: '1843' } });
  assert.equal(injected.httpStatus, 400);
}));

test('chatbot explica sin herramientas ni cambios', { skip: stage < 2 }, async () => withLab(async lab => {
  const reply = (await api(lab, '/api/chatbot', { message: 'Cancela el pedido 1842' })).data;
  assert.equal(reply.mode, 'chatbot'); assert.equal(reply.toolTrace.length, 0); assert.equal(lab.runtime.state.orders[0].status, 'preparing');
}));

test('cambio de dirección incluye la dirección exacta en la propuesta', { skip: stage < 3 }, async () => withLab(async lab => {
  const proposal = await propose(lab, 'Cambia la dirección del pedido 1844 a la dirección Calle Nueva 25, Madrid');
  assert.equal(proposal.pendingAction.input.newAddress, 'Calle Nueva 25, Madrid');
  const result = await confirm(lab, proposal); assert.equal(result.data.success, true);
  assert.equal(lab.runtime.state.orders[2].deliveryAddress, 'Calle Nueva 25, Madrid');
}));

test('API interna exige credencial y autorización de la acción', { skip: stage < 4 }, async () => withLab(async lab => {
  assert.equal((await api(lab, '/internal/orders/1842')).httpStatus, 401);
  const bypass = await api(lab, '/internal/orders/1842/cancel', { reason: 'Intento directo' }, 'demo-agent', { 'x-internal-token': lab.runtime.config.internalToken, 'x-operation-id': 'bypass' });
  assert.equal(bypass.data.errorCode, 'CONFIRMATION_REQUIRED'); assert.equal(lab.runtime.state.orders[0].status, 'preparing');
}));

test('memoria aislada por usuario y conversación, preferencias explícitas', { skip: stage < 5 }, async () => withLab(async lab => {
  const first = await propose(lab, 'Consulta el pedido 1843', { conversationId: 'same-id' });
  assert.equal(first.success, true);
  const next = await propose(lab, 'Cancela ese pedido', { conversationId: 'same-id' });
  assert.equal(next.pendingAction.input.orderId, '1843');
  const other = (await api(lab, '/api/agent', { message: 'Consulta ese pedido', conversationId: 'same-id' }, 'demo-readonly')).data;
  assert.equal(other.toolTrace.length, 0); assert.match(other.text, /identificador/);
  const otherConversation = await propose(lab, 'Consulta ese pedido', { conversationId: 'another-id' });
  assert.equal(otherConversation.toolTrace.length, 0);
  await propose(lab, 'Recuerda que prefiero respuestas breves');
  assert.equal(lab.runtime.memory.getProfile('demo-agent').responseStyle, 'brief');
  assert.equal(lab.runtime.memory.getProfile('demo-readonly').responseStyle, 'normal');
  await propose(lab, 'Olvida mi preferencia de estilo');
  assert.equal(lab.runtime.memory.getProfile('demo-agent').responseStyle, undefined);
}));

test('varias APIs: consulta, propone, confirma ticket y avisa a logística', { skip: stage < 6 }, async () => withLab(async lab => {
  const proposal = await propose(lab, 'El cliente no ha recibido el pedido 1843. Abre una incidencia.');
  assert.deepEqual(proposal.toolTrace.filter(call => call.status === 'succeeded').map(call => call.toolName), ['get_order_status', 'get_shipping_status', 'get_customer_profile']);
  assert.equal(lab.runtime.state.tickets.length, 0); assert.equal(lab.runtime.state.notifications.length, 0);
  const result = await confirm(lab, proposal); assert.equal(result.data.executionResult.success, true); assert.equal(result.data.followUpResult.success, true);
  assert.equal(lab.runtime.state.tickets.length, 1); assert.equal(lab.runtime.state.notifications.length, 1);
}));

test('fallo en notificación deja éxito parcial visible, sin duplicar ticket', { skip: stage < 6 }, async () => withLab(async lab => {
  const proposal = await propose(lab, 'Revisa la entrega del pedido 1843');
  const result = await confirm(lab, proposal);
  assert.equal(result.data.status, 'partially_completed'); assert.equal(result.data.executionResult.success, true); assert.equal(result.data.followUpResult.success, false);
  assert.equal(lab.runtime.state.tickets.length, 1); assert.equal(lab.runtime.state.notifications.length, 0);
}, { failureTool: 'send_internal_notification' }));

test('política rechaza tool fuera de tarea y precondición de otro turno', { skip: stage < 7 }, async () => withLab(async lab => {
  const original = lab.runtime.model;
  lab.runtime.model = async () => ({ content: [{ type: 'tool_use', id: 'toolu-bad', name: 'cancel_order', input: { orderId: '1842', reason: 'Fuera de alcance' } }], stop_reason: 'tool_use' });
  const outside = await propose(lab, 'Revisa la entrega del pedido 1842', { taskName: 'delivery_incident' });
  assert.equal(outside.policyDecision.reason, 'TOOL_NOT_ALLOWED_FOR_TASK');
  lab.runtime.model = original;
  await propose(lab, 'Consulta el pedido 1843', { conversationId: 'old-check' });
  lab.runtime.model = async () => ({ content: [{ type: 'tool_use', id: 'toolu-bad', name: 'create_support_ticket', input: { orderId: '1843', category: 'delivery_incident', description: 'Datos antiguos', priority: 'medium' } }], stop_reason: 'tool_use' });
  const stale = await propose(lab, 'Abre una incidencia del pedido 1843', { taskName: 'delivery_incident', conversationId: 'old-check' });
  assert.equal(stale.policyDecision.reason, 'PRECONDITION_NOT_MET'); assert.equal(lab.runtime.state.tickets.length, 0);
}));

test('bucle preserva bloques thinking y continúa varios turnos de tools', { skip: stage < 6 }, async () => withLab(async lab => {
  let step = 0;
  lab.runtime.model = async request => {
    step++;
    if (step === 1) return { content: [{ type: 'thinking', thinking: 'Contenido de prueba del adaptador', signature: 'test-signature' }, { type: 'tool_use', id: 'toolu-1', name: 'get_order_status', input: { orderId: '1843' } }], stop_reason: 'tool_use' };
    assert(request.messages.some(message => Array.isArray(message.content) && message.content.some(block => block.type === 'thinking' && block.signature === 'test-signature')));
    if (step === 2) return { content: [{ type: 'tool_use', id: 'toolu-2', name: 'get_shipping_status', input: { orderId: '1843' } }], stop_reason: 'tool_use' };
    return { content: [{ type: 'text', text: 'Consulta completada sin acciones.' }], stop_reason: 'end_turn' };
  };
  const result = await propose(lab, 'Revisa la entrega del pedido 1843', { taskName: 'delivery_incident' });
  assert.equal(step, 3); assert.equal(result.toolTrace.length, 2);
}));

test('supervisión: rechazo, caducidad y pedido cambiado', { skip: stage < 8 }, async () => withLab(async lab => {
  const proposal = await propose(lab, 'Cancela el pedido 1842');
  const confirmation = (await confirm(lab, proposal)).data;
  await api(lab, `/api/supervisor/approvals/${confirmation.approvalId}/reject`, { reason: 'Falta validación adicional' }, 'demo-supervisor');
  assert.equal(lab.runtime.state.orders[0].status, 'preparing');
  const proposal2 = await propose(lab, 'Cancela el pedido 1842');
  const confirmation2 = (await confirm(lab, proposal2)).data;
  lab.runtime.state.orders[0].version++; lab.runtime.saveState();
  const changed = (await api(lab, `/api/supervisor/approvals/${confirmation2.approvalId}/approve`, { reason: 'Revisado' }, 'demo-supervisor')).data;
  assert.equal(changed.executionResult.errorCode, 'ORDER_CHANGED'); assert.equal(lab.runtime.state.orders[0].status, 'preparing');
  const proposal3 = await propose(lab, 'Cancela el pedido 1845');
  const confirmation3 = (await confirm(lab, proposal3)).data;
  lab.runtime.state.approvals.find(item => item.approvalId === confirmation3.approvalId).expiresAt = new Date(Date.now() - 1).toISOString();
  assert.equal((await api(lab, `/api/supervisor/approvals/${confirmation3.approvalId}/approve`, { reason: 'Revisado' }, 'demo-supervisor')).httpStatus, 410);
}));

test('feedback validado y límite de bucle impide ejecución no controlada', async () => withLab(async lab => {
  if (stage >= 9) {
    assert.equal((await api(lab, '/api/agent/feedback', { conversationId: 'feedback-test', taskName: 'cancel_order', rating: 9, resolved: true })).httpStatus, 400);
    assert.equal((await api(lab, '/api/agent/feedback', { conversationId: 'feedback-test', taskName: 'cancel_order', rating: 4, comment: 'Prueba', resolved: true })).httpStatus, 201);
  }
  lab.runtime.model = async () => ({ content: [{ type: 'tool_use', id: 'toolu-loop', name: 'get_order_status', input: { orderId: '1842' } }], stop_reason: 'tool_use' });
  lab.runtime.config.maxIterations = 2;
  const loop = await propose(lab, 'Consulta el pedido 1842');
  assert.equal(loop.status, 'limit_reached'); assert.equal(loop.toolTrace.length, 2); assert.equal(lab.runtime.state.orders[0].status, 'preparing');
}));

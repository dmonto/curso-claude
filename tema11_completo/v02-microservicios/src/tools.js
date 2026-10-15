import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { features } from './features.js';
import { config } from './config.js';
import { InputSchemas, OrderStatus, OrderSchema, CustomerSchema, OrderSearchSchema, InvoiceSearchSchema, BillingSchema, TicketSearchSchema, TicketSchema, CancelSchema } from './contracts.js';
import { hasPermission, authorizeTool, canUseTool } from './auth.js';
import { callInternal, customerCached } from './internal-client.js';
import { IntegrationError, safeError } from './errors.js';
import { audit, metric } from './audit.js';

const descriptions = {
  get_order_status: 'Consulta el estado de un pedido concreto con identificador PED-1001. No inventes información.',
  get_order_context: 'Consulta un pedido y el contexto autorizado de cliente, facturación y tickets. Requiere identificador PED-1001.',
  search_orders: 'Busca y filtra pedidos del usuario, con límites. No permite seleccionar tenant ni usuarios.',
  search_invoices: 'Busca facturas del usuario por cliente, estado e importes, con un máximo de 10 resultados.',
  prepare_cancel_order: 'Prepara una cancelación de pedido. Todavía NO la ejecuta. Siempre exige confirmación en la aplicación.',
  prepare_create_ticket: 'Prepara un ticket de soporte para un pedido. Todavía NO lo crea. Exige confirmación en la aplicación.'
};
export function inputSchema(name) {
  if (name === 'search_orders' && !features.advancedSearch) return z.object({ status: OrderStatus.optional(), limit: z.number().int().min(1).max(5).optional() }).strict();
  return InputSchemas[name];
}
export function enabledToolNames() {
  return [features.microservices ? 'get_order_context' : 'get_order_status', 'search_orders',
    ...(features.advancedSearch ? ['search_invoices'] : []), ...(features.actions ? ['prepare_cancel_order', 'prepare_create_ticket'] : [])];
}
export function getToolsForUser(user) {
  return enabledToolNames().filter(name => !features.roles || canUseTool(user, name)).map(name => ({
    name, description: descriptions[name], input_schema: z.toJSONSchema(inputSchema(name), { target: 'draft-7' })
  }));
}

export function createToolEngine() {
  const actions = new Map();
  function ownedAction(id, user) {
    const action = actions.get(id);
    if (!action || action.userId !== user.id || action.tenantId !== user.tenantId) throw new IntegrationError('NOT_FOUND', 404);
    if (action.status === 'pending' && action.expiresAt <= Date.now()) action.status = 'expired';
    return action;
  }
  function actionView(action) {
    return { actionId: action.actionId, type: action.type, status: action.status, orderId: action.input.orderId,
      summary: action.type === 'cancel_order' ? `Cancelar ${action.input.orderId}` : `Crear ticket: ${action.input.title}`,
      details: action.input, createdAt: action.createdAt, expiresAt: new Date(action.expiresAt).toISOString(),
      ...(action.result ? { result: action.result } : {}), ...(action.error ? { error: action.error } : {}) };
  }
  async function orderContext(input, user, correlationId, signal) {
    const order = await callInternal('orders', `/orders/${encodeURIComponent(input.orderId)}`, user, correlationId, OrderSchema, { signal });
    if (!features.microservices) return { ok: true, data: { order } };
    const warnings = [];
    const tasks = [
      ['customer', 'customers:read', () => customerCached(order.customerId, user, correlationId, CustomerSchema, signal)],
      ['billing', 'billing:read', () => callInternal('billing', `/billing/customers/${encodeURIComponent(order.customerId)}/summary`, user, correlationId, BillingSchema, { signal })],
      ...(features.actions ? [['tickets', 'tickets:read', () => callInternal('tickets', `/tickets?orderId=${encodeURIComponent(order.orderId)}&status=Abierto&limit=5`, user, correlationId, TicketSearchSchema, { signal })]] : [])
    ];
    const labels = { customer: 'los datos del cliente', billing: 'la facturación', tickets: 'los tickets' };
    const result = { order, customer: null, billing: null, ...(features.actions ? { tickets: null } : {}) };
    const thunks = tasks.map(([name, permission, fn]) => async () => {
      if (!hasPermission(user, permission)) return { name, warning: `No tienes permiso para consultar ${labels[name]}.` };
      try { return { name, data: await fn() }; }
      catch { return { name, warning: `No se han podido recuperar ${labels[name]} en este momento.` }; }
    });
    const settled = features.performance ? await Promise.allSettled(thunks.map(fn => fn())) : [];
    if (!features.performance) for (const fn of thunks) settled.push({ status: 'fulfilled', value: await fn() });
    for (let i = 0; i < settled.length; i++) {
      const value = settled[i].status === 'fulfilled' ? settled[i].value : { name: tasks[i][0], warning: `No se han podido recuperar ${labels[tasks[i][0]]}.` };
      if (value.warning) warnings.push(value.warning);
      else result[value.name] = value.data;
    }
    if (features.performance) {
      if (result.customer) result.customer = { customerId: result.customer.customerId, name: result.customer.name, segment: result.customer.segment };
      if (result.tickets) result.tickets = { count: result.tickets.count, items: result.tickets.items.slice(0, 3), shownCount: Math.min(3, result.tickets.count) };
    }
    return { ok: true, data: { ...result, warnings } };
  }
  async function search(name, input, user, correlationId, signal) {
    const query = new URLSearchParams(Object.entries({ ...input, limit: input.limit || 5 }).map(([key, value]) => [key, String(value)]));
    const orders = name === 'search_orders';
    const data = await callInternal(orders ? 'orders' : 'billing', `${orders ? '/orders' : '/billing/invoices'}?${query}`, user, correlationId, orders ? OrderSearchSchema : InvoiceSearchSchema, { signal });
    return { ok: true, data };
  }
  async function prepare(name, input, user, correlationId, signal) {
    // Verifica el pedido antes de crear una propuesta. No hay escrituras todavía.
    const order = await callInternal('orders', `/orders/${encodeURIComponent(input.orderId)}`, user, correlationId, OrderSchema, { signal });
    if (name === 'prepare_cancel_order' && ['Entregado', 'Cancelado'].includes(order.status)) throw new IntegrationError('CONFLICT', 409);
    const actionId = `act-${randomUUID()}`;
    if (actions.size >= 500) {
      for (const [id, old] of actions) if (old.expiresAt <= Date.now() || ['executed', 'failed', 'dismissed'].includes(old.status)) actions.delete(id);
      if (actions.size >= 500) throw new IntegrationError('UNAVAILABLE', 503);
    }
    const action = { actionId, type: name === 'prepare_cancel_order' ? 'cancel_order' : 'create_ticket',
      input: structuredClone(input), userId: user.id, tenantId: user.tenantId, status: 'pending',
      createdAt: new Date().toISOString(), expiresAt: Date.now() + config.actionTtlMs, correlationId };
    if (signal?.aborted) throw new IntegrationError('TIMEOUT', 504);
    actions.set(actionId, action);
    audit('assistant_action_prepared', { actionId, actionType: action.type, userId: user.id, tenantId: user.tenantId, correlationId });
    return { ok: true, requiresConfirmation: true, action: actionView(action) };
  }
  async function execute(name, input, user, correlationId) {
    const started = performance.now();
    const controller = new AbortController();
    const timer = features.performance ? setTimeout(() => controller.abort(), config.toolTimeoutMs) : null;
    let result;
    try {
      if (!enabledToolNames().includes(name)) throw new IntegrationError('BAD_INPUT', 400);
      authorizeTool(user, name, correlationId); // También valida tool_use manipuladas.
      const validation = inputSchema(name).safeParse(input);
      if (!validation.success) throw new IntegrationError('BAD_INPUT', 400);
      const value = validation.data;
      if (['get_order_context', 'get_order_status'].includes(name)) result = await orderContext(value, user, correlationId, controller.signal);
      else if (name.startsWith('search_')) result = await search(name, value, user, correlationId, controller.signal);
      else result = await prepare(name, value, user, correlationId, controller.signal);
      if (controller.signal.aborted) throw new IntegrationError('TIMEOUT', 504);
    } catch (error) {
      result = safeError(error);
      audit('tool_execution_failed', { toolName: name, code: result.code, userId: user.id, tenantId: user.tenantId, correlationId });
    } finally { if (timer) clearTimeout(timer); }
    const durationMs = Math.round(performance.now() - started);
    const fields = { toolName: name, userId: user.id, tenantId: user.tenantId, durationMs, warningsCount: result.data?.warnings?.length || 0, correlationId,
      ok: result.ok, resultCount: result.data?.items?.length ?? (result.data?.order ? 1 : 0) };
    audit('tool_summary', fields);
    if (features.performance) metric(fields);
    return result;
  }
  async function confirm(id, user, correlationId, confirmed) {
    const action = ownedAction(id, user);
    const name = action.type === 'cancel_order' ? 'prepare_cancel_order' : 'prepare_create_ticket';
    authorizeTool(user, name, correlationId);
    if (confirmed !== true) throw new IntegrationError('CONFIRMATION_REQUIRED', 400);
    if (action.status === 'executed') return { ok: true, alreadyExecuted: true, action: actionView(action), result: action.result };
    if (action.status === 'executing') throw new IntegrationError('IN_PROGRESS', 409);
    if (action.status === 'expired') throw new IntegrationError('EXPIRED', 410);
    if (action.status !== 'pending') throw new IntegrationError(action.status === 'unknown_outcome' ? 'UNKNOWN_OUTCOME' : 'CONFLICT', 409);
    // Bloqueo antes del primer await: dos confirmaciones simultáneas no duplican la escritura.
    action.status = 'executing';
    try {
      const cancellation = action.type === 'cancel_order';
      const result = await callInternal(cancellation ? 'orders' : 'tickets', cancellation ? `/orders/${action.input.orderId}/cancel` : '/tickets', user, correlationId, cancellation ? CancelSchema : TicketSchema,
        { method: 'POST', body: cancellation ? { reason: action.input.reason || '' } : action.input, idempotencyKey: `idem-${id}` });
      if (result.orderId !== action.input.orderId) throw new IntegrationError('INVALID_RESPONSE');
      action.result = result;
      action.status = 'executed';
      audit('assistant_action_executed', { actionId: id, userId: user.id, tenantId: user.tenantId, correlationId });
      return { ok: true, alreadyExecuted: false, action: actionView(action), result };
    } catch (error) {
      // Tras enviar una escritura, un timeout o una respuesta inválida NO demuestran que no se ejecutara.
      const uncertain = ['TIMEOUT', 'INVALID_RESPONSE', 'UNAVAILABLE'].includes(error.code);
      action.status = uncertain ? 'unknown_outcome' : 'failed';
      action.error = uncertain ? safeError(new IntegrationError('UNKNOWN_OUTCOME')).error : safeError(error).error;
      audit('assistant_action_failed', { actionId: id, status: action.status, code: error.code || 'INTERNAL', correlationId });
      throw uncertain ? new IntegrationError('UNKNOWN_OUTCOME', 502) : error;
    }
  }
  function dismiss(id, user) {
    const action = ownedAction(id, user);
    if (action.status !== 'pending') throw new IntegrationError('CONFLICT', 409);
    action.status = 'dismissed';
    return { ok: true, action: actionView(action) };
  }
  return { execute, confirm, dismiss, getAction: (id, user) => actionView(ownedAction(id, user)) };
}

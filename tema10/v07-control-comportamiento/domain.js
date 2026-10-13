import path from 'node:path';
import { readJson, writeJson, fingerprint, id, now, audit } from './storage.js';
import { seedData } from './data/seed.js';
import { DEMO_USERS, permissionFor } from './auth.js';
import { availableToolNames, inputSchemas, isSensitive } from './tools.js';

const failure = (errorCode, message) => ({ success: false, errorCode, message });
export function createDomain(runtime) {
  const stateFile = path.join(runtime.config.dataDir, 'state.json');
  runtime.state = readJson(stateFile, seedData());
  runtime.saveState = () => writeJson(stateFile, runtime.state);
  runtime.saveState();
  runtime.grants = new Map();

  runtime.executeDomain = (toolName, input, meta) => {
    if (!availableToolNames(runtime.config.version.stage).includes(toolName)) return failure('UNKNOWN_TOOL', 'Herramienta no disponible en esta versión.');
    const parsed = inputSchemas[toolName]?.safeParse(input);
    if (!parsed?.success) return failure('INVALID_TOOL_INPUT', 'Los parámetros de la herramienta no son válidos.');
    input = parsed.data;
    const permissions = DEMO_USERS[meta.userId];
    const permission = permissionFor(toolName);
    if (!permissions || (permission && !permissions[permission])) return failure('INSUFFICIENT_PERMISSIONS', 'No tienes permisos para esta operación.');
    if (runtime.config.failureTool === toolName) return failure('DEMO_API_UNAVAILABLE', 'Fallo simulado de la API. No se ha ejecutado la operación.');

    const state = runtime.state;
    const order = input.orderId ? state.orders.find(item => item.id === input.orderId && item.tenantId === 'demo') : null;
    if (input.orderId && !order) return failure('ORDER_NOT_FOUND', 'No he encontrado ese pedido; revisa el identificador.');
    if (toolName === 'get_order_status') {
      const { tenantId, ...safeOrder } = order;
      return { success: true, order: structuredClone(safeOrder) };
    }
    if (toolName === 'get_shipping_status') {
      const shipment = state.shipments.find(item => item.orderId === order.id);
      return shipment ? { success: true, shipment: structuredClone(shipment) } : failure('SHIPMENT_NOT_FOUND', 'No se encontró información logística.');
    }
    if (toolName === 'get_customer_profile') {
      const customer = state.customers.find(item => item.customerId === input.customerId);
      return customer ? { success: true, customer: structuredClone(customer) } : failure('CUSTOMER_NOT_FOUND', 'Cliente no encontrado.');
    }

    if (!isSensitive(toolName)) return failure('UNKNOWN_DOMAIN_TOOL', 'Herramienta ajena a las APIs de negocio.');
    const signature = fingerprint({ toolName, input, userId: meta.userId });
    const previous = state.operations[meta.operationId];
    if (previous) {
      if (previous.signature !== signature) return failure('IDEMPOTENCY_CONFLICT', 'Identificador de operación utilizado con otros parámetros.');
      return { ...structuredClone(previous.result), replayed: true };
    }
    // La API de negocio también exige la autorización emitida tras confirmar.
    const grant = runtime.grants.get(meta.grantId);
    if (!grant || grant.signature !== signature || grant.operationId !== meta.operationId || grant.expiresAt < Date.now()) return failure('CONFIRMATION_REQUIRED', 'Falta autorización para la acción concreta.');
    runtime.grants.delete(meta.grantId);
    if (order && grant.orderVersion !== order.version) return failure('ORDER_CHANGED', 'El pedido ha cambiado. Consulta su estado y prepara una nueva propuesta.');

    let result;
    if (toolName === 'cancel_order') {
      if (!order.canCancel || order.status !== 'preparing') return failure('ORDER_NOT_CANCELLABLE', 'El pedido ya no se puede cancelar.');
      order.status = 'cancelled'; order.canCancel = false; order.canChangeAddress = false; order.version++;
      result = { success: true, orderId: order.id, newStatus: 'cancelled', reason: input.reason, cancelledAt: now(), refundStatus: 'not_requested' };
    } else if (toolName === 'update_delivery_address') {
      if (!order.canChangeAddress || order.status !== 'preparing') return failure('ADDRESS_NOT_CHANGEABLE', 'La dirección ya no puede modificarse.');
      const previousAddress = order.deliveryAddress;
      order.deliveryAddress = input.newAddress; order.version++;
      result = { success: true, orderId: order.id, previousAddress, newAddress: input.newAddress, updatedAt: now() };
    } else if (toolName === 'create_support_ticket') {
      const ticket = { ticketId: id('TCK'), ...input, userId: meta.userId, status: 'open', createdAt: now() };
      state.tickets.push(ticket);
      result = { success: true, ticket: structuredClone(ticket) };
    } else if (toolName === 'send_internal_notification') {
      const ticket = state.tickets.find(item => item.ticketId === input.relatedTicketId && item.userId === meta.userId);
      if (!ticket) return failure('TICKET_PRECONDITION_NOT_MET', 'No existe un ticket creado por este usuario para el aviso.');
      const notification = { notificationId: id('NOTIF'), ...input, userId: meta.userId, sentAt: now() };
      state.notifications.push(notification);
      result = { success: true, notification: structuredClone(notification), simulated: true };
    } else return failure('UNKNOWN_TOOL', 'Herramienta no soportada.');
    state.operations[meta.operationId] = { signature, result: structuredClone(result) };
    runtime.saveState();
    if (result.ticket) audit(runtime, 'tickets.jsonl', result.ticket);
    if (result.notification) audit(runtime, 'notifications.jsonl', result.notification);
    return result;
  };
}

export function issueGrant(runtime, action, operationId = action.actionId, toolName = action.toolName, input = action.input) {
  const grantId = id('GRANT');
  runtime.grants.set(grantId, {
    signature: fingerprint({ toolName, input, userId: action.userId }), operationId,
    orderVersion: action.orderVersion, expiresAt: Date.now() + 10000
  });
  return { userId: action.userId, operationId, grantId };
}

import { HttpError, audit, fingerprint, id, now, withLock } from './storage.js';
import { getSession, saveSession } from './sessions.js';
import { issueGrant } from './domain.js';
import { latestSuccessful } from './guardrails.js';

export function prepareAction(runtime, context, toolName, input) {
  const order = latestSuccessful(context.trace, 'get_order_status')?.result?.order;
  const shipment = latestSuccessful(context.trace, 'get_shipping_status')?.result?.shipment;
  const customer = latestSuccessful(context.trace, 'get_customer_profile')?.result?.customer;
  const followUp = toolName === 'create_support_ticket' && context.taskName === 'delivery_incident' && runtime.config.version.stage >= 6;
  const descriptions = {
    cancel_order: `Cancelar el pedido ${input.orderId}. No se ejecuta un reembolso en este laboratorio.`,
    update_delivery_address: `Cambiar la dirección del pedido ${input.orderId} a: ${input.newAddress}.`,
    create_support_ticket: `Crear una incidencia para el pedido ${input.orderId}, prioridad ${input.priority}${followUp ? ', y avisar al equipo de logística' : ''}.`,
    send_internal_notification: `Avisar al equipo ${input.team} sobre el ticket ${input.relatedTicketId}.`
  };
  const pending = {
    actionId: id('ACT'), userId: context.user.userId, conversationId: context.session.conversationId,
    taskName: context.taskName, toolName, input: structuredClone(input),
    orderVersion: order?.version, evidence: { order, ...(shipment ? { shipment } : {}), ...(customer ? { customer } : {}) },
    followUp: followUp ? 'logistics' : null, summary: descriptions[toolName],
    createdAt: now(), expiresAt: new Date(Date.now() + runtime.config.actionTtlMs).toISOString(),
    fingerprint: fingerprint({ toolName, input })
  };
  context.session.pendingAction = pending;
  audit(runtime, 'policy-decisions.jsonl', { correlationId: context.correlationId, userId: context.user.userId, conversationId: pending.conversationId, taskName: context.taskName, toolName, allowed: false, reason: 'CONFIRMATION_REQUIRED', actionId: pending.actionId });
  return pending;
}

export async function executeConfirmedAction(runtime, action, correlationId) {
  const context = { userId: action.userId, correlationId };
  const meta = { ...context, ...issueGrant(runtime, action) };
  const executionResult = await runtime.executeTool(action.toolName, action.input, meta);
  const trace = [{ toolName: action.toolName, input: action.input, result: executionResult, status: executionResult.success ? 'succeeded' : 'failed' }];
  let followUpResult = null;
  if (executionResult.success && action.followUp && executionResult.ticket) {
    // Esta acción derivada forma parte de la propuesta revisada y confirmada.
    const input = { team: 'logistics', relatedTicketId: executionResult.ticket.ticketId, message: `Incidencia de entrega del pedido ${action.input.orderId}: ${executionResult.ticket.ticketId}.` };
    const operationId = `${action.actionId}:notification`;
    followUpResult = await runtime.executeTool('send_internal_notification', input, { ...context, ...issueGrant(runtime, action, operationId, 'send_internal_notification', input) });
    trace.push({ toolName: 'send_internal_notification', input, result: followUpResult, status: followUpResult.success ? 'succeeded' : 'failed' });
  }
  let text;
  if (!executionResult.success) text = executionResult.message || 'La acción no se ha completado.';
  else if (action.toolName === 'cancel_order') text = `Pedido ${action.input.orderId} cancelado correctamente. No se ha solicitado ningún reembolso.`;
  else if (action.toolName === 'update_delivery_address') text = `Dirección actualizada para el pedido ${action.input.orderId}: ${executionResult.newAddress}.`;
  else if (action.toolName === 'create_support_ticket') text = `Ticket creado: ${executionResult.ticket.ticketId}.${followUpResult ? followUpResult.success ? ' Notificación enviada a logística (simulada).' : ' El aviso a logística ha fallado; el ticket sí está creado.' : ''}`;
  else text = 'Notificación enviada (simulada).';
  for (const item of trace) audit(runtime, 'agent-actions.jsonl', { correlationId, userId: action.userId, conversationId: action.conversationId, taskName: action.taskName, actionId: action.actionId, ...item });
  return { success: executionResult.success, status: executionResult.success ? (followUpResult && !followUpResult.success ? 'partially_completed' : 'completed') : 'failed', text, content: [{ type: 'text', text }], executionResult, followUpResult, toolTrace: trace };
}

export async function confirmAction(runtime, user, body) {
  return withLock(runtime, `conversation:${user.userId}:${body.conversationId}`, async () => {
    const session = getSession(runtime, user.userId, body.conversationId);
    const action = session.pendingAction;
    if (!action || action.actionId !== body.actionId) throw new HttpError(409, 'ACTION_NOT_PENDING', 'La acción no está pendiente en esta conversación.');
    if (new Date(action.expiresAt).getTime() <= Date.now()) {
      session.pendingAction = null; saveSession(runtime, session);
      throw new HttpError(410, 'ACTION_EXPIRED', 'La propuesta ha caducado. Solicita una nueva.');
    }
    if (body.decision === 'cancel') {
      session.pendingAction = null; saveSession(runtime, session);
      audit(runtime, 'policy-decisions.jsonl', { userId: user.userId, actionId: action.actionId, allowed: false, reason: 'USER_CANCELLED' });
      return { success: true, status: 'cancelled', conversationId: session.conversationId, pendingAction: null, text: 'Propuesta descartada. No se ha ejecutado ninguna acción.', toolTrace: [] };
    }
    if (!user.permissions.canExecuteSensitiveActions) throw new HttpError(403, 'INSUFFICIENT_PERMISSIONS', 'No tienes permisos para confirmar la acción.');
    const correlationId = id('corr');
    const review = runtime.supervision?.requiresHumanApproval(action);
    if (review?.required) {
      const approval = runtime.supervision.createApproval(action, review);
      session.pendingAction = null;
      const text = `Confirmación recibida. La acción necesita aprobación humana: ${approval.approvalId}.`;
      session.turns.push([{ role: 'user', content: `Confirmo ${action.actionId}` }, { role: 'assistant', content: text }]);
      saveSession(runtime, session);
      return { success: true, status: 'waiting_approval', text, content: [{ type: 'text', text }], conversationId: session.conversationId, pendingAction: null, approvalRequired: true, approvalId: approval.approvalId, toolTrace: [] };
    }
    const result = await executeConfirmedAction(runtime, action, correlationId);
    session.pendingAction = null;
    session.turns.push([{ role: 'user', content: `Confirmo ${action.actionId}` }, { role: 'assistant', content: result.text }]);
    saveSession(runtime, session);
    return { ...result, conversationId: session.conversationId, correlationId, pendingAction: null };
  });
}

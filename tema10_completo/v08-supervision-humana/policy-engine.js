import { basicDecision, latestSuccessful } from './guardrails.js';
import { taskDefinitions } from './tasks.js';

export function evaluateToolExecution(runtime, context, toolName, input) {
  const task = taskDefinitions(runtime.config.version.stage)[context.taskName];
  if (!task) return { allowed: false, reason: 'UNKNOWN_TASK', message: 'No existe esta tarea.' };
  if (!task.tools.includes(toolName)) return { allowed: false, reason: 'TOOL_NOT_ALLOWED_FOR_TASK', message: 'Esta herramienta queda fuera de la tarea seleccionada.' };
  const decision = basicDecision(runtime, context, toolName, input);
  if (!decision.allowed) return decision;
  // Las precondiciones se vinculan a resultados correctos del pedido actual,
  // no a nombres de herramientas ejecutados en una conversación antigua.
  if (context.taskName === 'delivery_incident' && toolName === 'create_support_ticket') {
    const shipment = latestSuccessful(context.trace, 'get_shipping_status')?.result?.shipment;
    const customer = latestSuccessful(context.trace, 'get_customer_profile')?.result?.customer;
    const order = latestSuccessful(context.trace, 'get_order_status')?.result?.order;
    if (!shipment || shipment.orderId !== input.orderId || !customer || customer.customerId !== order?.customerId) return { allowed: false, reason: 'PRECONDITION_NOT_MET', message: 'Faltan resultados correctos de logística y cliente para este pedido.' };
    if (!['delayed', 'lost', 'blocked'].includes(shipment.status)) return { allowed: false, reason: 'INCIDENT_NOT_JUSTIFIED', message: 'El envío no presenta una incidencia que justifique el ticket.' };
  }
  if (toolName === 'send_internal_notification') {
    const ticket = runtime.state.tickets.find(item => item.ticketId === input.relatedTicketId && item.userId === context.user.userId);
    if (!ticket) return { allowed: false, reason: 'PRECONDITION_NOT_MET', message: 'Debes crear el ticket antes de enviar el aviso.' };
  }
  return decision;
}

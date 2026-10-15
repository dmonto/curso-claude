import Anthropic from '@anthropic-ai/sdk';
import { id, HttpError } from './storage.js';
import { latestSuccessful } from './guardrails.js';

const responseText = text => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } });
const responseTool = (name, input) => ({ content: [{ type: 'tool_use', id: id('toolu'), name, input }], stop_reason: 'tool_use', usage: { input_tokens: 0, output_tokens: 0 } });

// Simulador determinista para comprobar flujos. No mide la calidad de Claude.
export function mockResponse(context, runtime, chatbot = false) {
  if (chatbot) return responseText('Para cancelar un pedido, entra en Mis pedidos y solicita la cancelación mientras esté en preparación. Este chatbot explica el procedimiento.');
  const stage = runtime.config.version.stage;
  const text = context.message.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const trace = context.trace;
  const last = trace.at(-1);
  if (last && last.status !== 'succeeded') return responseText(last.result.message || 'La operación no se ha completado.');
  if (context.taskName === 'user_preferences') {
    if (trace.length) return responseText(/olvida|borra|elimina/.test(text) ? 'He eliminado esa preferencia.' : 'He guardado tu preferencia de respuesta.');
    if (/olvida|borra|elimina/.test(text)) return responseTool('forget_user_preference', { key: 'responseStyle' });
    if (/breve/.test(text)) return responseTool('remember_user_preference', { responseStyle: 'brief' });
    if (/detallad/.test(text)) return responseTool('remember_user_preference', { responseStyle: 'detailed' });
    return responseText('Indica si prefieres respuestas breves, normales o detalladas.');
  }
  const explicitId = context.message.match(/pedido\s*(?:n[ºo.]?\s*)?(\d{1,12})/i)?.[1];
  const orderId = explicitId || (stage >= 5 && /ese pedido|el anterior|el de antes/.test(text) ? context.session.lastOrderId : null);
  if (!orderId) return responseText('Indica el identificador del pedido para continuar.');
  const order = latestSuccessful(trace, 'get_order_status')?.result?.order;
  if (!order) return responseTool('get_order_status', { orderId });
  if (context.taskName === 'order_support') return responseText(`El pedido ${order.id} está ${order.status === 'preparing' ? 'en preparación' : order.status === 'shipped' ? 'enviado' : 'cancelado'}. Importe: ${order.amount.toFixed(2)} €. ${order.canCancel ? 'Puede cancelarse tras confirmación.' : 'No puede cancelarse automáticamente.'}`);
  if (context.taskName === 'change_delivery_address') {
    if (!order.canChangeAddress) return stage >= 3 ? responseTool('create_support_ticket', { orderId, category: 'delivery_address_problem', description: 'Solicitud de cambio de dirección en pedido enviado.', priority: 'medium' }) : responseText('La dirección ya no puede cambiarse.');
    const newAddress = context.message.match(/(?:\ba la direcci[oó]n\s+|\bdirecci[oó]n\s*(?:a|por|:)\s+)(.+)$/i)?.[1];
    if (!newAddress || newAddress.trim().length < 8) return responseText('Indica la nueva dirección completa. Ejemplo: Cambia la dirección del pedido 1844 a la dirección Calle Nueva 25, Madrid.');
    return responseTool('update_delivery_address', { orderId, newAddress: newAddress.trim() });
  }
  if (context.taskName === 'delivery_incident') {
    const shipment = latestSuccessful(trace, 'get_shipping_status')?.result?.shipment;
    if (!shipment) return responseTool('get_shipping_status', { orderId });
    const customer = latestSuccessful(trace, 'get_customer_profile')?.result?.customer;
    if (!customer && context.user.permissions.canReadCustomers) return responseTool('get_customer_profile', { customerId: order.customerId });
    if (!['delayed', 'lost', 'blocked'].includes(shipment.status)) return responseText('El envío no presenta una incidencia registrada. No he creado ningún ticket.');
    return responseTool('create_support_ticket', { orderId, category: 'delivery_incident', description: `El pedido ${orderId} presenta una incidencia de entrega: ${shipment.status}.`, priority: customer?.tier === 'vip' ? 'high' : 'medium' });
  }
  if (context.taskName === 'cancel_order') {
    if (!order.canCancel) return stage >= 3 ? responseTool('create_support_ticket', { orderId, category: 'cancellation_problem', description: `El pedido ${orderId} no puede cancelarse porque está ${order.status}.`, priority: 'medium' }) : responseText(`El pedido ${orderId} ya está enviado o cancelado y no puede cancelarse automáticamente.`);
    return responseTool('cancel_order', { orderId, reason: 'Solicitado por el usuario' });
  }
  return responseText('Indica una tarea de soporte de pedidos.');
}

export function createModel(runtime) {
  const client = runtime.config.modelMode === 'claude' ? new Anthropic({ apiKey: runtime.config.apiKey, timeout: runtime.config.requestTimeoutMs, maxRetries: 0 }) : null;
  return async ({ messages, tools, system, context, chatbot = false }) => {
    if (!client) return mockResponse(context, runtime, chatbot);
    const request = {
      model: runtime.config.model,
      max_tokens: runtime.config.maxTokens,
      output_config: { effort: runtime.config.effort },
      ...(runtime.config.thinking === 'adaptive' ? { thinking: { type: 'adaptive' } } : {}),
      system, messages,
      ...(chatbot ? {} : { tools, tool_choice: { type: 'auto' } })
    };
    try {
      // Preservar response.content COMPLETO en el bucle, incluidos thinking y signature.
      return await client.messages.create(request);
    } catch (error) {
      const status = error.status === 401 || error.status === 403 ? 502 : error.status === 429 ? 503 : 502;
      throw new HttpError(status, 'MODEL_UNAVAILABLE', `Claude no pudo completar la petición${error.status ? ` (HTTP ${error.status})` : ''}. Revisa la clave, el modelo y la configuración del backend.`);
    }
  };
}

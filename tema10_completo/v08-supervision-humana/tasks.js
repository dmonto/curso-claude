import { availableToolNames } from './tools.js';

export function taskDefinitions(stage) {
  const definitions = {
    order_support: { description: 'Consultar un pedido', requiredFields: ['orderId'], tools: ['get_order_status'] },
    cancel_order: { description: 'Gestionar una cancelación', requiredFields: ['orderId'], tools: ['get_order_status', 'cancel_order', ...(stage >= 3 ? ['create_support_ticket'] : [])] }
  };
  if (stage >= 3) definitions.change_delivery_address = { description: 'Cambiar una dirección de entrega', requiredFields: ['orderId', 'newAddress'], tools: ['get_order_status', 'update_delivery_address', 'create_support_ticket'] };
  if (stage >= 6) definitions.delivery_incident = { description: 'Diagnosticar una entrega y proponer una incidencia con aviso a logística', requiredFields: ['orderId'], tools: ['get_order_status', 'get_shipping_status', 'get_customer_profile', 'create_support_ticket', 'send_internal_notification'] };
  if (stage >= 5) definitions.user_preferences = { description: 'Gestionar preferencias explícitas', requiredFields: [], tools: ['remember_user_preference', 'forget_user_preference'] };
  if (stage < 3) definitions.cancel_order.tools = availableToolNames(stage);
  return definitions;
}
export function inferTask(message, stage, previousTask) {
  const text = message.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (stage >= 5 && /recuerda|olvida|prefiero respuestas|preferencia/.test(text)) return 'user_preferences';
  if (stage >= 3 && /direccion/.test(text)) return 'change_delivery_address';
  if (stage >= 6 && /entrega|recibido|logistica|envio|retras/.test(text)) return 'delivery_incident';
  if (/cancel/.test(text)) return 'cancel_order';
  if (/incidencia|ticket/.test(text)) return stage >= 6 ? 'delivery_incident' : 'cancel_order';
  if (stage >= 5 && /ese pedido|el anterior|el de antes/.test(text) && previousTask) return previousTask;
  return 'order_support';
}

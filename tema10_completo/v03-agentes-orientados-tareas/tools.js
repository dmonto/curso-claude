import { z } from 'zod';

const orderId = z.string().regex(/^\d{1,12}$/);
const text = z.string().trim().min(1).max(1200);
export const inputSchemas = {
  get_order_status: z.object({ orderId }).strict(),
  cancel_order: z.object({ orderId, reason: text }).strict(),
  update_delivery_address: z.object({ orderId, newAddress: z.string().trim().min(8).max(250) }).strict(),
  create_support_ticket: z.object({ orderId, category: z.enum(['cancellation_problem', 'delivery_address_problem', 'delivery_incident', 'general_support']), description: text, priority: z.enum(['low', 'medium', 'high']) }).strict(),
  get_shipping_status: z.object({ orderId }).strict(),
  get_customer_profile: z.object({ customerId: z.string().regex(/^C\d{3}$/) }).strict(),
  send_internal_notification: z.object({ team: z.enum(['support', 'logistics', 'orders']), message: text, relatedTicketId: z.string().regex(/^TCK-[a-zA-Z0-9-]+$/) }).strict(),
  remember_user_preference: z.object({ responseStyle: z.enum(['brief', 'normal', 'detailed']).optional(), showTechnicalDetails: z.boolean().optional() }).strict(),
  forget_user_preference: z.object({ key: z.enum(['responseStyle', 'showTechnicalDetails']) }).strict()
};
const descriptions = {
  get_order_status: 'Consulta el estado real de un pedido. Usa el identificador indicado por el usuario. No inventes un pedido. Antes de proponer cambios debes consultar esta herramienta.',
  cancel_order: 'Prepara la cancelación de un pedido que sigue en preparación. Requiere una consulta actual previa. La herramienta solicita confirmación al usuario; el backend ejecutará la acción tras esa confirmación.',
  update_delivery_address: 'Prepara un cambio de dirección de entrega para un pedido en preparación. Requiere la nueva dirección completa y una consulta previa del pedido. Solicita confirmación antes de modificarlo.',
  create_support_ticket: 'Prepara un ticket relacionado con un pedido consultado. En incidencias de entrega consulta antes logística y cliente cuando tengas permisos. Devuelve una propuesta pendiente de confirmación; nunca asumas que el ticket está creado.',
  get_shipping_status: 'Consulta logística del mismo pedido que acabas de verificar. No se usa si el pedido no existe. Puede devolver delayed, lost, blocked o not_dispatched.',
  get_customer_profile: 'Consulta un perfil mínimo para decidir la prioridad. Usa solamente el customerId devuelto por el pedido actual. No contiene email, notas privadas ni otros datos ajenos a la tarea.',
  send_internal_notification: 'Prepara una notificación para un ticket existente. Solo se permite un equipo de la lista. No envíes notificaciones si el ticket no se ha creado correctamente.',
  remember_user_preference: 'Guarda solamente preferencias explícitas de estilo de respuesta del usuario actual. No guarda texto libre, datos del cliente ni historial de pedidos. Requiere al menos una preferencia.',
  forget_user_preference: 'Elimina una preferencia de estilo del usuario actual cuando lo pide expresamente. No puede modificar la memoria de otra persona.'
};
export const isSensitive = tool => ['cancel_order', 'update_delivery_address', 'create_support_ticket', 'send_internal_notification'].includes(tool);
export function availableToolNames(stage) {
  const names = ['get_order_status', 'cancel_order'];
  if (stage >= 3) names.push('update_delivery_address', 'create_support_ticket');
  if (stage >= 4) names.push('get_customer_profile');
  if (stage >= 5) names.push('remember_user_preference', 'forget_user_preference');
  if (stage >= 6) names.push('get_shipping_status', 'send_internal_notification');
  return names;
}
export function toolDefinitions(names) {
  return names.map(name => {
    const schema = z.toJSONSchema(inputSchemas[name], { target: 'draft-7' });
    delete schema.$schema;
    return { name, description: descriptions[name], input_schema: schema };
  });
}

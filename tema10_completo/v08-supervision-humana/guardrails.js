import { permissionFor } from './auth.js';
import { availableToolNames, inputSchemas, isSensitive } from './tools.js';

const deny = (reason, message) => ({ allowed: false, reason, message });
export function latestSuccessful(trace, toolName) {
  return [...trace].reverse().find(item => item.toolName === toolName && item.status === 'succeeded');
}
export function basicDecision(runtime, context, toolName, rawInput) {
  if (!availableToolNames(runtime.config.version.stage).includes(toolName)) return deny('UNKNOWN_TOOL', 'Herramienta no disponible.');
  const parsed = inputSchemas[toolName].safeParse(rawInput);
  if (!parsed.success) return deny('INVALID_TOOL_INPUT', 'Los parámetros de la herramienta no son válidos.');
  const input = parsed.data;
  const permission = permissionFor(toolName);
  if (permission && !context.user.permissions[permission]) return deny('INSUFFICIENT_PERMISSIONS', 'No tienes permisos para ejecutar esta acción.');
  if (toolName === 'remember_user_preference' && (!/recuerda|guarda|preferencia/i.test(context.message) || !Object.keys(input).length)) return deny('EXPLICIT_PREFERENCE_REQUIRED', 'Expresa la preferencia que quieres guardar.');
  if (toolName === 'forget_user_preference' && !/olvida|borra|elimina/i.test(context.message)) return deny('EXPLICIT_FORGET_REQUEST_REQUIRED', 'Indica la preferencia que quieres olvidar.');
  const orderResult = latestSuccessful(context.trace, 'get_order_status')?.result?.order;
  if (isSensitive(toolName) && input.orderId) {
    if (!orderResult || orderResult.id !== input.orderId) return deny('PRECONDITION_NOT_MET', 'Consulta primero el pedido concreto en este turno.');
    if (toolName === 'cancel_order' && (!orderResult.canCancel || orderResult.status !== 'preparing')) return deny('ORDER_NOT_CANCELLABLE', 'El pedido ya está enviado o no se puede cancelar.');
    if (toolName === 'update_delivery_address' && (!orderResult.canChangeAddress || orderResult.status !== 'preparing')) return deny('ADDRESS_NOT_CHANGEABLE', 'La dirección ya no se puede modificar.');
  }
  if (toolName === 'get_shipping_status' && (!orderResult || input.orderId !== orderResult.id)) return deny('PRECONDITION_NOT_MET', 'Consulta primero el pedido antes de consultar logística.');
  if (toolName === 'get_customer_profile' && (!orderResult || input.customerId !== orderResult.customerId)) return deny('CUSTOMER_SCOPE_MISMATCH', 'Usa el cliente asociado al pedido actual.');
  return { allowed: true, reason: 'ALLOWED', input };
}

export function validateFinalText(text, trace) {
  // Regla didáctica acotada; no pretende detectar toda afirmación posible.
  const successful = tool => trace.some(item => item.toolName === tool && item.status === 'succeeded');
  const claims = [
    ['create_support_ticket', /(?:he creado|incidencia creada|ticket creado)/i],
    ['cancel_order', /(?:he cancelado|cancelado correctamente)/i],
    ['update_delivery_address', /(?:he cambiado la direcci[oó]n|direcci[oó]n actualizada)/i],
    ['send_internal_notification', /(?:notificaci[oó]n enviada|he avisado)/i]
  ];
  if (claims.some(([tool, regex]) => regex.test(text) && !successful(tool))) return 'No puedo confirmar esa acción: no consta una ejecución correcta en el sistema.';
  return text;
}

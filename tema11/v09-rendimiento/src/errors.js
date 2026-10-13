export class IntegrationError extends Error {
  constructor(code, status = 502) { super(code); this.code = code; this.status = status; }
}
const messages = {
  BAD_INPUT: 'Los parámetros no son válidos.', UNAUTHORIZED: 'Inicia sesión para continuar.',
  FORBIDDEN: 'No tienes permiso para esta operación.', NOT_FOUND: 'No se ha encontrado el recurso accesible para tu usuario.',
  CONFLICT: 'La operación no es compatible con el estado actual.', TIMEOUT: 'La consulta ha tardado demasiado. Inténtalo de nuevo.',
  UNAVAILABLE: 'No se puede recuperar la información en este momento.', INVALID_RESPONSE: 'No se ha podido validar la información recibida.',
  EXPIRED: 'La acción ha caducado. Prepara una nueva.', CONFIRMATION_REQUIRED: 'Es necesaria la confirmación explícita.',
  IN_PROGRESS: 'La acción se está procesando. Consulta su estado.', UNKNOWN_OUTCOME: 'No se ha podido confirmar el resultado de la acción. Revisa su estado antes de repetirla.',
  TOOL_LIMIT: 'La consulta requiere demasiados pasos. Divide la petición.', MODEL_ERROR: 'No se ha podido completar la respuesta del asistente.',
  MODEL_TRUNCATED: 'La respuesta ha alcanzado el límite de salida. Simplifica la pregunta o revisa la configuración.', INTERNAL: 'No se ha podido completar la operación.'
};
export function safeError(error) {
  const code = error instanceof IntegrationError ? error.code : 'INTERNAL';
  return { ok: false, code, error: messages[code] || messages.INTERNAL };
}
export function httpError(status) {
  return new IntegrationError(({ 400: 'BAD_INPUT', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 410: 'EXPIRED' })[status] || 'UNAVAILABLE', status >= 500 ? 502 : status);
}

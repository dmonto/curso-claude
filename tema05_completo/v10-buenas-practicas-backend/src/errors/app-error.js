export class AppError extends Error {
  constructor({
    code = "INTERNAL_ERROR",
    message = "Error interno del servidor.",
    statusCode = 500,
    publicMessage = "Se ha producido un error inesperado.",
    details = null,
    expose = false,
    cause = null
  } = {}) {
    super(message);

    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.publicMessage = publicMessage;
    this.details = details;
    this.expose = expose;
    this.cause = cause;
    this.isOperational = true;
  }
}

export function validationError(message, details = null) {
  return new AppError({
    code: "VALIDATION_ERROR",
    message,
    publicMessage: message,
    statusCode: 400,
    details,
    expose: true
  });
}

export function forbiddenError(message = "No tienes permisos para realizar esta operación.") {
  return new AppError({
    code: "FORBIDDEN",
    message,
    publicMessage: message,
    statusCode: 403,
    expose: true
  });
}

export function sessionNotFoundError(sessionId) {
  return new AppError({
    code: "SESSION_NOT_FOUND",
    message: `Sesión no encontrada: ${sessionId}`,
    publicMessage: "La sesión indicada no existe o ha caducado.",
    statusCode: 404,
    expose: true
  });
}

export function sessionOwnerMismatchError() {
  return new AppError({
    code: "SESSION_OWNER_MISMATCH",
    message: "La sesión no pertenece al usuario indicado.",
    publicMessage: "La sesión no pertenece al usuario actual.",
    statusCode: 403,
    expose: true
  });
}

export function aiProviderError({
  message = "Error llamando al proveedor IA.",
  statusCode = 502,
  providerType = "unknown",
  cause = null
} = {}) {
  return new AppError({
    code: mapProviderCode(statusCode),
    message,
    publicMessage: mapProviderPublicMessage(statusCode),
    statusCode: statusCode === 429 ? 429 : statusCode >= 500 ? 502 : statusCode,
    details: { providerType },
    expose: true,
    cause
  });
}

function mapProviderCode(statusCode) {
  if (statusCode === 429) {
    return "AI_RATE_LIMIT";
  }

  if (statusCode === 408 || statusCode === 504) {
    return "AI_TIMEOUT";
  }

  return "AI_PROVIDER_ERROR";
}

function mapProviderPublicMessage(statusCode) {
  if (statusCode === 429) {
    return "El asistente está recibiendo demasiadas solicitudes. Inténtalo de nuevo en unos segundos.";
  }

  if (statusCode === 401 || statusCode === 403) {
    return "El asistente no está disponible por un problema de configuración.";
  }

  if (statusCode === 404) {
    return "El modelo configurado no está disponible.";
  }

  if (statusCode === 408 || statusCode === 504) {
    return "El asistente ha tardado demasiado en responder. Inténtalo de nuevo.";
  }

  return "No se ha podido obtener respuesta del asistente en este momento.";
}

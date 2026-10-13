import { AppError } from "./app-error.js";

export function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function notFoundHandler(req, res, next) {
  next(new AppError({
    code: "ROUTE_NOT_FOUND",
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    publicMessage: "El recurso solicitado no existe.",
    statusCode: 404,
    expose: true
  }));
}

export function errorHandler(err, req, res, next) {
  const traceId = req.traceId || "trace_not_available";
  const normalized = normalizeError(err);

  logError({ traceId, req, error: normalized });
  logInteractionError({ traceId, req, error: normalized });

  res.status(normalized.statusCode).json({
    traceId,
    error: {
      code: normalized.code,
      message: normalized.publicMessage
    }
  });
}

function normalizeError(err) {
  if (err instanceof AppError) {
    return err;
  }

  if (err?.type === "entity.too.large") {
    return new AppError({
      code: "REQUEST_TOO_LARGE",
      message: err.message,
      publicMessage: "La petición enviada es demasiado grande.",
      statusCode: 413,
      expose: true,
      cause: err
    });
  }

  if (err instanceof SyntaxError && "body" in err) {
    return new AppError({
      code: "INVALID_JSON",
      message: err.message,
      publicMessage: "El cuerpo de la petición no contiene JSON válido.",
      statusCode: 400,
      expose: true,
      cause: err
    });
  }

  return new AppError({
    code: "INTERNAL_ERROR",
    message: err?.message || "Error interno no controlado.",
    publicMessage: "Se ha producido un error inesperado.",
    statusCode: 500,
    expose: false,
    cause: err
  });
}

function logError({ traceId, req, error }) {
  const event = {
    level: "error",
    traceId,
    code: error.code,
    statusCode: error.statusCode,
    message: error.message,
    publicMessage: error.publicMessage,
    method: req.method,
    path: req.originalUrl,
    userId: req.securityContext?.userId || null,
    role: req.securityContext?.role || null,
    timestamp: new Date().toISOString()
  };

  if (process.env.NODE_ENV !== "production" && error.cause?.stack) {
    event.stack = error.cause.stack;
  }

  console.error(JSON.stringify(event));
}

function logInteractionError({ traceId, req, error }) {
  const interactionLogger = req.app?.locals?.interactionLogger;

  if (!interactionLogger) {
    return;
  }

  interactionLogger.logInteraction({
    level: "error",
    traceId,
    userId: req.securityContext?.userId || null,
    role: req.securityContext?.role || null,
    screen: req.body?.screen || null,
    status: "error",
    statusCode: error.statusCode,
    errorCode: error.code,
    callModel: null,
    durationMs: null,
    message: req.body?.message || null
  });
}

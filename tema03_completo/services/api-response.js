export function getRequestId(req) {
  return req.body?.requestId || req.query?.requestId || `req-${Date.now()}`;
}

export function sendOk(res, req, data, statusCode = 200) {
  return res.status(statusCode).json({
    ok: true,
    requestId: getRequestId(req),
    data
  });
}

export function sendError(res, req, statusCode, code, message, details = undefined) {
  const payload = {
    ok: false,
    requestId: getRequestId(req),
    error: {
      code,
      message
    }
  };

  if (details) {
    payload.error.details = details;
  }

  return res.status(statusCode).json(payload);
}

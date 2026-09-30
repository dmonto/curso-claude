const sessions = new Map();

const DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000;

function createSessionId() {
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createAssistantSession({ userId, metadata = {}, ttlMs = DEFAULT_SESSION_TTL_MS }) {
  const now = Date.now();

  const session = {
    sessionId: createSessionId(),
    userId,
    status: "active",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    metadata
  };

  sessions.set(session.sessionId, session);
  return session;
}

export function getAssistantSession(sessionId) {
  return sessions.get(sessionId) || null;
}

export function validateAssistantSession({ sessionId, userId }) {
  const session = getAssistantSession(sessionId);

  if (!session) {
    return {
      valid: false,
      code: "SESSION_NOT_FOUND",
      message: "Sesión no encontrada"
    };
  }

  if (session.userId !== userId) {
    return {
      valid: false,
      code: "SESSION_FORBIDDEN",
      message: "La sesión no pertenece a este usuario"
    };
  }

  if (session.status !== "active") {
    return {
      valid: false,
      code: "SESSION_CLOSED",
      message: "La sesión ya no está activa"
    };
  }

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    session.status = "expired";
    sessions.set(sessionId, session);

    return {
      valid: false,
      code: "SESSION_EXPIRED",
      message: "La sesión ha expirado"
    };
  }

  return {
    valid: true,
    session
  };
}

export function touchAssistantSession(sessionId, metadata = {}) {
  const session = getAssistantSession(sessionId);

  if (!session) {
    return null;
  }

  session.updatedAt = new Date().toISOString();
  session.metadata = {
    ...session.metadata,
    ...metadata
  };

  sessions.set(sessionId, session);
  return session;
}

export function closeAssistantSession({ sessionId, userId }) {
  const validation = validateAssistantSession({ sessionId, userId });

  if (!validation.valid) {
    return validation;
  }

  const session = validation.session;
  session.status = "closed";
  session.updatedAt = new Date().toISOString();

  sessions.set(sessionId, session);

  return {
    valid: true,
    session
  };
}

export function serializeSessionForClient(session) {
  return {
    sessionId: session.sessionId,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    metadata: session.metadata
  };
}

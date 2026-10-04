import crypto from "crypto";

export class SessionStore {
  constructor({ maxMessages = 8, ttlMinutes = 30 } = {}) {
    this.sessions = new Map();
    this.maxMessages = maxMessages;
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  createSessionId() {
    return `sess_${crypto.randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  getOrCreateSession({
    sessionId,
    userId = "user_demo",
    screen = "general",
    userRole = "usuario_estandar"
  }) {
    this.cleanupExpiredSessions();

    const id = sessionId || this.createSessionId();

    if (!this.sessions.has(id)) {
      this.sessions.set(id, {
        sessionId: id,
        userId,
        screen,
        userRole,
        createdAt: this.now(),
        lastActivityAt: this.now(),
        messages: []
      });
    }

    const session = this.sessions.get(id);

    session.lastActivityAt = this.now();
    session.screen = screen || session.screen;
    session.userRole = userRole || session.userRole;

    return session;
  }

  addTurn(sessionId, userMessage, assistantMessage) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`No existe la sesión ${sessionId}`);
    }

    session.messages.push({ role: "user", content: userMessage });
    session.messages.push({ role: "assistant", content: assistantMessage });

    session.messages = session.messages.slice(-this.maxMessages);
    session.lastActivityAt = this.now();

    return session;
  }

  getMessagesForModel(sessionId, newUserMessage) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`No existe la sesión ${sessionId}`);
    }

    return [
      ...session.messages.slice(-this.maxMessages),
      { role: "user", content: newUserMessage }
    ];
  }

  getSessionSummary(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      userId: session.userId,
      screen: session.screen,
      userRole: session.userRole,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      messageCount: session.messages.length
    };
  }

  deleteSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  listSessions() {
    this.cleanupExpiredSessions();

    return Array.from(this.sessions.values()).map((session) => ({
      sessionId: session.sessionId,
      userId: session.userId,
      screen: session.screen,
      userRole: session.userRole,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      messageCount: session.messages.length
    }));
  }

  cleanupExpiredSessions() {
    const nowMs = Date.now();

    for (const [sessionId, session] of this.sessions.entries()) {
      const lastActivityMs = new Date(session.lastActivityAt).getTime();
      const expired = nowMs - lastActivityMs > this.ttlMs;

      if (expired) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

import { id, HttpError } from './storage.js';

export function newSession(userId, conversationId, ttlMs) {
  return { userId, conversationId, taskName: null, lastOrderId: null, turns: [], pendingAction: null, expiresAt: Date.now() + ttlMs };
}
export function sessionKey(userId, conversationId) { return `${userId}:${conversationId}`; }
export function getSession(runtime, userId, conversationId = id('conv')) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(conversationId)) throw new HttpError(400, 'INVALID_CONVERSATION_ID', 'El identificador de conversación no es válido.');
  const key = sessionKey(userId, conversationId);
  let session = runtime.memory ? runtime.memory.getSession(userId, conversationId) : runtime.sessions.get(key);
  if (!session || session.expiresAt < Date.now()) session = newSession(userId, conversationId, runtime.config.sessionTtlMs);
  return session;
}
export function saveSession(runtime, session) {
  session.expiresAt = Date.now() + runtime.config.sessionTtlMs;
  // Se retienen intercambios completos, sin romper parejas tool_use/tool_result.
  session.turns = session.turns.slice(-6);
  if (runtime.memory) runtime.memory.saveSession(session);
  else runtime.sessions.set(sessionKey(session.userId, session.conversationId), structuredClone(session));
}
export function sessionSummary(session) {
  return { conversationId: session.conversationId, taskName: session.taskName, lastOrderId: session.lastOrderId, pendingAction: session.pendingAction, expiresAt: new Date(session.expiresAt).toISOString() };
}

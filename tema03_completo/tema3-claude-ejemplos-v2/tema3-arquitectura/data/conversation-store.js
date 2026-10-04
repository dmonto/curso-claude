const conversations = new Map();

const MAX_RECENT_TURNS = 6;

export function getOrCreateConversation(sessionId) {
  if (!conversations.has(sessionId)) {
    conversations.set(sessionId, {
      sessionId,
      summary: "",
      turns: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  return conversations.get(sessionId);
}

export function appendTurn(sessionId, role, content) {
  const conversation = getOrCreateConversation(sessionId);

  conversation.turns.push({
    role,
    content,
    timestamp: new Date().toISOString()
  });

  conversation.updatedAt = new Date().toISOString();
  conversations.set(sessionId, conversation);

  return conversation;
}

export function getRecentTurns(sessionId) {
  const conversation = getOrCreateConversation(sessionId);
  return conversation.turns.slice(-MAX_RECENT_TURNS);
}

export function updateConversationSummary(sessionId, summary) {
  const conversation = getOrCreateConversation(sessionId);

  conversation.summary = summary;
  conversation.updatedAt = new Date().toISOString();

  conversations.set(sessionId, conversation);
  return conversation;
}

export function buildConversationContext(sessionId) {
  const conversation = getOrCreateConversation(sessionId);

  return {
    sessionId,
    summary: conversation.summary || "Sin resumen previo.",
    recentTurns: getRecentTurns(sessionId).map((turn) => ({
      role: turn.role,
      content: turn.content
    }))
  };
}

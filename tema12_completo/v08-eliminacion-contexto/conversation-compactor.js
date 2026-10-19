import { estimateTokens, compactJson } from './token-budget.js';

export async function compactConversationIfNeeded({ runtime, memory, store, maxMessagesBeforeCompaction = 12, keepRecentMessages = 6 }) {
  if (memory.messages.length <= maxMessagesBeforeCompaction) return { compacted: false, reason: 'message_count_under_limit', previousMessageCount: memory.messages.length, newMessageCount: memory.messages.length };
  const previousMessageCount = memory.messages.length;
  const messagesToCompact = memory.messages.slice(0, Math.max(0, memory.messages.length - keepRecentMessages));
  const recentMessages = memory.messages.slice(-keepRecentMessages);
  const text = messagesToCompact.map(m => `${m.role}: ${m.content}`).join('\n');
  const estimatedTokens = estimateTokens(text);
  let updatedSummary;
  if (runtime.config.modelMode === 'claude') {
    updatedSummary = await runtime.model.summarize({ previousSummary: memory.summary, messagesText: text, structuredContext: compactJson({ entities: memory.entities, pendingAction: memory.pendingAction, lastAction: memory.lastAction }) });
  } else {
    updatedSummary = [memory.summary, `Se compactaron ${messagesToCompact.length} mensajes. Entidades: ${compactJson(memory.entities)}. Acción pendiente: ${memory.pendingAction ? memory.pendingAction.type : 'ninguna'}. Última acción: ${memory.lastAction ? memory.lastAction.type + '/' + memory.lastAction.status : 'ninguna'}.`].filter(Boolean).join(' ');
  }
  store.appendSegment(memory, updatedSummary.slice(0, 1200), messagesToCompact.length, estimatedTokens);
  store.appendEvent(memory, 'conversation_compacted', { previousMessageCount, compactedMessageCount: messagesToCompact.length, keptRecentMessages: recentMessages.length, estimatedTokens });
  memory.summary = updatedSummary; memory.messages = recentMessages; memory.contextVersion += 1;
  return { compacted: true, reason: 'message_count_exceeded', previousMessageCount, newMessageCount: memory.messages.length, updatedSummary };
}

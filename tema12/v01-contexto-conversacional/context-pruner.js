function minutesSince(iso) { return Math.floor((Date.now() - new Date(iso).getTime()) / 60000); }
export function pruneConversationContext({ memory, appContext, store, maxRecentMessages = 6, pendingActionTtlMinutes = 2 }) {
  const removed = [], kept = [], warnings = [];
  if (memory.pendingAction) {
    const age = minutesSince(memory.pendingAction.createdAt);
    if (age > pendingActionTtlMinutes) { store.appendEvent(memory, 'pending_action_pruned', { reason: 'expired', ageMinutes: age, action: memory.pendingAction.type }); memory.pendingAction = null; removed.push('pendingAction.expired'); }
    else kept.push('pendingAction.active');
  }
  const appEntity = appContext.activeEntity || { type: 'none' };
  if (memory.entities.activeTicketId && appContext.view === 'ticket_detail' && appEntity.type === 'ticket' && appEntity.id && appEntity.id !== memory.entities.activeTicketId) {
    store.appendEvent(memory, 'active_entity_replaced', { previousTicketId: memory.entities.activeTicketId, newTicketId: appEntity.id });
    memory.entities.activeTicketId = appEntity.id; memory.entities.activeTicketTitle = undefined; removed.push('entities.previousActiveTicket'); kept.push('entities.activeTicketFromAppContext');
  }
  if (memory.summary && memory.messages.length > maxRecentMessages) {
    const previousCount = memory.messages.length; memory.messages = memory.messages.slice(-maxRecentMessages); removed.push('messages.oldAlreadySummarized'); kept.push('messages.recent'); store.appendEvent(memory, 'messages_pruned', { previousCount, newCount: memory.messages.length });
  }
  if (memory.lastAction && !memory.pendingAction) {
    const age = minutesSince(memory.lastAction.executedAt);
    if (age > 60) { store.appendEvent(memory, 'last_action_pruned', { action: memory.lastAction.type, ageMinutes: age }); memory.lastAction = null; removed.push('lastAction.old'); } else kept.push('lastAction.recent');
  }
  if (appContext.view === 'ticket_detail' && appEntity.type !== 'ticket') warnings.push('ticket_detail_without_active_ticket');
  return { removed, kept, warnings };
}

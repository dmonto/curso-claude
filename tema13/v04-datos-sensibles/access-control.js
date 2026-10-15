export function visibleTickets(identity,tickets) {
  return tickets.filter(t=>t.tenantId===identity.tenantId && (identity.role!=='customer' || t.ownerUserId===identity.userId));
}
export function getTicketForAction(identity,tickets,id) { return visibleTickets(identity,tickets).find(t=>t.id===id); }
export function canAct(identity,action) {
  return action==='close_ticket' ? identity.role==='support_admin' : ['support_admin','support_agent'].includes(identity.role);
}

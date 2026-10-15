const baseTickets = () => ([
  { id: 'INC-1042', title: 'Error de facturación en la última factura', status: 'open', ownerUserId: 'demo-agent', priority: 'high', pendingTasks: ['Revisar respuesta del equipo de billing'], internalNotes: ['Cliente VIP. Revisar antes de cerrar.'], notes: [], sla: '4h' },
  { id: 'INC-1031', title: 'Cambio de email de contacto', status: 'closed', ownerUserId: 'demo-agent', priority: 'low', pendingTasks: [], internalNotes: ['Cerrado por autoservicio.'], notes: [], sla: '24h' },
  { id: 'INC-1077', title: 'No se carga la actividad del ticket', status: 'open', ownerUserId: 'demo-agent', priority: 'medium', pendingTasks: ['Revisar trazas del frontend'], internalNotes: ['Reproducido en Chrome y Edge.'], notes: [], sla: '8h' }
]);

let tickets = baseTickets();

export function resetTickets() { tickets = baseTickets(); }
export function listTickets(user) {
  return tickets.filter(t => t.ownerUserId === user.userId || user.roles.includes('support_supervisor')).map(publicTicket);
}
export function getTicketById(ticketId, user, options = {}) {
  const ticket = tickets.find(t => t.id === ticketId && (t.ownerUserId === user.userId || user.roles.includes('support_supervisor')));
  if (!ticket) return null;
  return options.includeInternal ? { ...ticket, notes: [...ticket.notes], internalNotes: [...ticket.internalNotes] } : publicTicket(ticket);
}
export function getLastOpenTicket(user) {
  const ticket = tickets.find(t => t.ownerUserId === user.userId && t.status === 'open');
  return ticket ? publicTicket(ticket) : null;
}
export function addTicketNote(ticketId, user, text) {
  const ticket = tickets.find(t => t.id === ticketId && (t.ownerUserId === user.userId || user.roles.includes('support_supervisor')));
  if (!ticket) return null;
  ticket.notes.push({ id: `note-${Date.now()}`, text, authorUserId: user.userId, createdAt: new Date().toISOString() });
  return publicTicket(ticket);
}
export function requestCloseTicket(ticketId, user) {
  const ticket = tickets.find(t => t.id === ticketId && (t.ownerUserId === user.userId || user.roles.includes('support_supervisor')));
  if (!ticket) return null;
  if (ticket.status === 'closed') return publicTicket(ticket);
  ticket.status = 'pending_close';
  ticket.pendingTasks = ['Cierre solicitado desde asistente. Pendiente de revisión operativa.'];
  return publicTicket(ticket);
}
function publicTicket(ticket) {
  return { id: ticket.id, title: ticket.title, status: ticket.status, priority: ticket.priority, pendingTasks: [...ticket.pendingTasks], notes: [...ticket.notes], sla: ticket.sla, noteCount: ticket.notes.length };
}

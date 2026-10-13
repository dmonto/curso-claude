import type { ExecutionContext, Payload } from '../types/automation.types.js';
import { ApiError } from '../errors/api-error.js';
import { TicketRepository } from '../domain/support/ticket.repository.js';
export function runTicketAction(repo: TicketRepository, action: string, p: Payload, context: ExecutionContext): Payload {
  const ticket = p.ticket_id ? repo.find(String(p.ticket_id)) : undefined;
  if (['assign_owner', 'add_comment', 'update_ticket_priority'].includes(action) && !ticket)
    throw new ApiError('BUSINESS_RULE_BLOCKED', 'El ticket no existe.');
  if (context.dry_run) return { would_execute: { action_name: action, payload: p }, ...(ticket ? { ticket } : {}) };
  switch (action) {
    case 'create_ticket': return { ticket: repo.create({ customer_name: String(p.customer), priority: String(p.priority), category: String(p.category), summary: String(p.summary) }, context.user_id),
      domain_events: [{ event_type: 'ticket_created' }] };
    case 'assign_owner': return { ticket: repo.update(String(p.ticket_id), { owner_team: String(p.owner_team), status: 'in_progress' }), domain_events: [{ event_type: 'ticket_assigned' }] };
    case 'update_ticket_priority': return { ticket: repo.update(String(p.ticket_id), { priority: String(p.priority) }), domain_events: [{ event_type: 'ticket_priority_updated' }] };
    case 'add_comment': return { ticket: repo.update(String(p.ticket_id), { comments: [...ticket!.comments, String(p.comment)] }), domain_events: [{ event_type: 'ticket_comment_added' }] };
    case 'search_tickets': return { tickets: repo.list().filter(t => t.customer_name.toLowerCase() === String(p.customer).toLowerCase() && (!p.status || t.status === p.status)) };
    case 'draft_response': return { draft: `Hola, estamos revisando la incidencia: ${p.summary}. Te informaremos de los próximos pasos.`, sent: false };
    case 'daily_support_summary': return { total: repo.list().length, open: repo.list().filter(t => t.status !== 'closed').length,
      urgent: repo.list().filter(t => t.priority === 'urgent' && t.status !== 'closed').length };
    default: throw new ApiError('ACTION_NOT_REGISTERED', 'No existe un handler para esa acción.');
  }
}

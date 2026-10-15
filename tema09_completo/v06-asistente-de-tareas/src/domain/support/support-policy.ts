import { customers, type TicketRepository } from './ticket.repository.js';
import type { Policy } from '../../types/automation.types.js';
import { ApiError } from '../../errors/api-error.js';
export function createSupportPolicy(repo: TicketRepository): Policy {
  return (action, p, user) => {
    const reject = (message: string): never => { throw new ApiError('BUSINESS_RULE_BLOCKED', message); };
    if (action === 'create_ticket') {
      const customer = customers.find(c => c.name.toLowerCase() === String(p.customer).toLowerCase());
      if (!customer) reject('El cliente no existe.');
      if (customer!.status === 'blocked') reject('El cliente está bloqueado y no puede abrir nuevos tickets.');
      if (String(p.summary).trim().length < 15) reject('El resumen debe tener al menos 15 caracteres.');
      if (p.category === 'security' && !['support_lead', 'admin'].includes(user.user_role)) reject('Los tickets de seguridad requieren support_lead o admin.');
    }
    if (['create_ticket', 'update_ticket_priority'].includes(action)) {
      if (!['low', 'medium', 'high', 'urgent'].includes(String(p.priority))) reject('La prioridad indicada no es válida.');
      if (p.priority === 'urgent' && !['support_lead', 'admin'].includes(user.user_role) && String(p.justification ?? '').trim().length < 20)
        reject('La prioridad urgent requiere support_lead/admin o una justificación de 20 caracteres.');
    }
    if (['assign_owner', 'add_comment', 'update_ticket_priority'].includes(action)) {
      const ticket = repo.find(String(p.ticket_id));
      if (!ticket) reject('El ticket no existe.');
      if (ticket!.status === 'closed') reject('No se puede modificar un ticket cerrado.');
      if (ticket!.category === 'security' && !['support_lead', 'admin'].includes(user.user_role)) reject('Este ticket de seguridad requiere revisión de support_lead/admin.');
    }
    if (action === 'assign_owner') {
      const team = String(p.owner_team).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (['administradores', 'seguridad', 'direccion'].includes(team)) reject('Ese equipo requiere asignación manual fuera del asistente.');
      if (!['soporte n1', 'soporte n2'].includes(team)) reject('El equipo debe ser soporte N1 o soporte N2.');
    }
  };
}

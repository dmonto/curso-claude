import type { Analysis, Intent, Role } from '../types/automation.types.js';

export type Task = {
  name: string; description: string; required_fields: string[]; min_stage: number;
  risk_level: 'low' | 'medium'; requires_confirmation: boolean; mode: 'single' | 'batch';
  endpoint: string; allowed_roles: Role[];
};
const readers: Role[] = ['viewer', 'support_agent', 'support_lead', 'admin'];
const writers: Role[] = ['support_agent', 'support_lead', 'admin'];
export const taskCatalog: Task[] = [
  { name: 'search_tickets', description: 'Buscar tickets', required_fields: ['customer'], min_stage: 1, risk_level: 'low', requires_confirmation: false, mode: 'single', endpoint: 'GET /api/tickets/search', allowed_roles: readers },
  { name: 'draft_response', description: 'Preparar un borrador de respuesta', required_fields: ['summary'], min_stage: 1, risk_level: 'low', requires_confirmation: false, mode: 'single', endpoint: 'POST /api/drafts', allowed_roles: readers },
  { name: 'create_ticket', description: 'Crear un ticket', required_fields: ['customer', 'priority', 'category', 'summary'], min_stage: 1, risk_level: 'medium', requires_confirmation: true, mode: 'single', endpoint: 'POST /api/tickets', allowed_roles: writers },
  { name: 'assign_owner', description: 'Asignar un ticket', required_fields: ['ticket_id', 'owner_team'], min_stage: 1, risk_level: 'medium', requires_confirmation: true, mode: 'single', endpoint: 'PATCH /api/tickets/:id', allowed_roles: ['support_lead', 'admin'] },
  { name: 'add_comment', description: 'Añadir un comentario interno', required_fields: ['ticket_id', 'comment'], min_stage: 3, risk_level: 'medium', requires_confirmation: true, mode: 'single', endpoint: 'POST /api/tickets/:id/comments', allowed_roles: writers },
  { name: 'update_ticket_priority', description: 'Cambiar la prioridad', required_fields: ['ticket_id', 'priority'], min_stage: 4, risk_level: 'medium', requires_confirmation: true, mode: 'single', endpoint: 'PATCH /api/tickets/:id', allowed_roles: writers },
  { name: 'stale_ticket_followup', description: 'Seguimiento de tickets sin actualizar', required_fields: [], min_stage: 5, risk_level: 'medium', requires_confirmation: true, mode: 'batch', endpoint: 'POST /api/automation/processes/execute', allowed_roles: ['support_lead', 'admin'] },
  { name: 'urgent_without_owner', description: 'Asignar tickets urgentes sin responsable', required_fields: [], min_stage: 6, risk_level: 'medium', requires_confirmation: true, mode: 'batch', endpoint: 'POST /api/automation/processes/execute', allowed_roles: ['support_lead', 'admin'] },
  { name: 'daily_support_summary', description: 'Resumen diario de soporte', required_fields: [], min_stage: 6, risk_level: 'low', requires_confirmation: false, mode: 'single', endpoint: 'GET /api/tickets/summary', allowed_roles: readers }
];
export function getTask(name: string, stage: number): Task | undefined {
  const alias = name === 'query_data' ? 'search_tickets' : name === 'update_ticket' ? 'update_ticket_priority' : name;
  return taskCatalog.find(t => t.name === alias && t.min_stage <= stage);
}
export function missingFields(task: Task, slots: Record<string, unknown>): string[] {
  return task.required_fields.filter(k => slots[k] == null || (typeof slots[k] === 'string' && !String(slots[k]).trim()));
}
export function analysisFromIntent(intent: Intent, stage: number): Analysis {
  const task = getTask(intent.task_name, stage);
  if (!task || intent.confidence < 0.55) return {
    is_automatable: false, automation_type: 'not_supported', risk_level: 'high', requires_confirmation: false,
    missing_fields: [], reason: 'La petición no corresponde a una tarea disponible en esta versión.',
    proposed_action: { action_name: 'not_supported', endpoint: null, payload: {} }
  };
  return { is_automatable: true, automation_type: task.name, risk_level: task.risk_level,
    requires_confirmation: task.requires_confirmation, missing_fields: missingFields(task, intent.slots),
    reason: intent.user_message_summary || task.description,
    proposed_action: { action_name: task.name, endpoint: task.endpoint, payload: intent.slots } };
}

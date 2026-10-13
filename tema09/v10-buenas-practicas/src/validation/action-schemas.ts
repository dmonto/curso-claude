import { z } from 'zod';
import type { Payload } from '../types/automation.types.js';
import { ApiError } from '../errors/api-error.js';
const text = z.string().trim().min(1).max(2000);
const priority = z.enum(['low', 'medium', 'high', 'urgent']);
const ticketId = z.string().regex(/^TCK-\d+$/i).transform(s => s.toUpperCase());
export const actionSchemas: Record<string, z.ZodType> = {
  create_ticket: z.object({ customer: text, priority, category: z.enum(['access', 'billing', 'security', 'general']), summary: text.min(15), justification: text.min(20).optional() }).strict(),
  assign_owner: z.object({ ticket_id: ticketId, owner_team: text }).strict(),
  update_ticket_priority: z.object({ ticket_id: ticketId, priority, justification: text.min(20).optional() }).strict(),
  add_comment: z.object({ ticket_id: ticketId, comment: text.min(5) }).strict(),
  search_tickets: z.object({ customer: text, status: z.enum(['open', 'in_progress', 'closed']).optional() }).strict(),
  draft_response: z.object({ summary: text }).strict(),
  daily_support_summary: z.object({}).strict()
};
export function validatePayload(action: string, payload: Payload): Payload {
  const schema = actionSchemas[action];
  if (!schema) throw new ApiError('ACTION_NOT_REGISTERED', 'No existe esquema para esta acción.');
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'El payload no supera la validación previa.', 409,
    { validation_errors: parsed.error.issues.map(i => `${i.path.join('.') || 'payload'}: ${i.message}`) });
  return parsed.data as Payload;
}

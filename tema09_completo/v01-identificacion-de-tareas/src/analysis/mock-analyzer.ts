import type { Intent, Payload } from '../types/automation.types.js';
function plain(s: string): string { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
export function mockIntent(message: string, previous?: { task_name: string; slots: Payload }): Intent {
  const text = plain(message);
  let task = 'unknown';
  if (/\b(borra|borrar|elimina|eliminar|delete|reembolso|compensacion)\b/.test(text)) task = 'unknown';
  else if (/(sin actualiza|seguimiento|stale|ultimas \d+ horas)/.test(text)) task = 'stale_ticket_followup';
  else if (/urgent.*sin (propietario|responsable|asignar|owner)/.test(text)) task = 'urgent_without_owner';
  else if (/(resumen diario|daily)/.test(text)) task = 'daily_support_summary';
  else if (/(crea|crear|abre|abrir|nuevo ticket)/.test(text)) task = 'create_ticket';
  else if (/(asigna|asignar|reasigna)/.test(text)) task = 'assign_owner';
  else if (/(cambia|cambiar|actualiza|actualizar).*prioridad/.test(text)) task = 'update_ticket_priority';
  else if (/(anade|agrega|comenta|comentario)/.test(text)) task = 'add_comment';
  else if (/(busca|buscar|muestra|muestrame|consulta)/.test(text)) task = 'search_tickets';
  else if (/(borrador|prepara.*respuesta)/.test(text)) task = 'draft_response';
  else if (previous && previous.task_name !== 'unknown') task = previous.task_name;
  const slots: Payload = {};
  const customer = message.match(/\b(ACME|Globex|BlockedCorp)\b/i);
  if (customer) slots.customer = customer[1];
  const unknownCustomer = message.match(/(?:cliente|para)\s+([A-Za-z][\w-]+)(?=\s+(?:porque|por\b|con\b)|[.,;]|$)/i);
  if (!customer && unknownCustomer && !['el', 'un', 'soporte'].includes(unknownCustomer[1].toLowerCase())) slots.customer = unknownCustomer[1];
  for (const [pattern, value] of [[/\b(urgent|urgente)\b/, 'urgent'], [/\b(high|alta)\b/, 'high'], [/\b(medium|media)\b/, 'medium'], [/\b(low|baja)\b/, 'low'], [/\bcritical\b/, 'critical']] as const) if (pattern.test(text)) slots.priority = value;
  if (/(security|seguridad|sospechoso)/.test(text)) slots.category = 'security';
  else if (/(billing|factura|facturacion)/.test(text)) slots.category = 'billing';
  else if (/(access|acceso|acceder|portal)/.test(text)) slots.category = 'access';
  else if (/(general)/.test(text)) slots.category = 'general';
  const summary = message.match(/(?:porque|resumen\s*[:=]|incidencia\s*[:=])\s*(.+)/i);
  if (summary) slots.summary = summary[1].trim();
  const ticket = message.match(/\bTCK-\d+\b/i);
  if (ticket) slots.ticket_id = ticket[0].toUpperCase();
  if (task === 'search_tickets') {
    if (/\babiertos?\b/.test(text)) slots.status = 'open';
    else if (/\bcerrados?\b/.test(text)) slots.status = 'closed';
  }
  const team = message.match(/(?:equipo\s+|a\s+)(soporte\s+N[12]|seguridad|administradores|direcci[oó]n)/i);
  if (team) slots.owner_team = team[1];
  const comment = message.match(/(?:comentario\s*[:=]|comentario\s+(?:en|al)\s+TCK-\d+\s*[:=])\s*(.+)/i);
  if (comment) slots.comment = comment[1].trim();
  if (task === 'draft_response') slots.summary = message;
  const justification = message.match(/justificaci[oó]n\s*[:=]\s*(.+)/i);
  if (justification) slots.justification = justification[1].trim();
  const hours = text.match(/(\d+)\s*horas/); if (hours) slots.stale_hours = Number(hours[1]);
  const limit = text.match(/(?:maximo|max_items|limite)\s*[:=]?\s*(\d+)/); if (limit) slots.max_items = Number(limit[1]);
  // Este parser es deliberadamente limitado y reproducible; no sustituye al modelo.
  return { task_name: task, confidence: task === 'unknown' ? 0 : 0.95, slots, user_message_summary: message };
}

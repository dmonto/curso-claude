import { reduceAppContextForPrompt } from './app-context.js';
import { buildContextWithBudget, compactJson, clipText } from './token-budget.js';

function ticketForPrompt(ticket) {
  if (!ticket) return 'No hay ticket activo consultado desde API.';
  return compactJson({ id: ticket.id, title: ticket.title, status: ticket.status, priority: ticket.priority, pendingTasks: ticket.pendingTasks?.slice(0,5), sla: ticket.sla, noteCount: ticket.notes?.length || 0, lastNotes: (ticket.notes || []).slice(-3).map(n => ({ text: clipText(n.text, 300), createdAt: n.createdAt })) });
}

export function buildOptimizedContext({ user, session, appContext, memory, activeTicket, userMessage, stage = 10, contextMode = 'normal' }) {
  const budget = contextMode === 'lowCost' ? 2200 : 4500;
  const actionLike = /cerrar|ciérralo|añade una nota|agrega una nota/i.test(userMessage);
  const sections = [
    { name: 'Reglas operativas', priority: 'required', content: 'Eres un asistente de soporte integrado en una aplicación web. Responde en español. No inventes datos. No ejecutes acciones sensibles sin permiso y confirmación explícita. Los datos de API tienen prioridad sobre memoria y frontend.' },
    { name: 'Usuario validado', priority: stage >= 3 ? 'required' : 'medium', content: compactJson({ userId: user.userId, tenantId: user.tenantId, roles: user.roles, permissions: user.permissions }) },
    { name: 'Sesión', priority: stage >= 3 ? 'required' : 'medium', content: compactJson(session) },
    { name: 'Acción pendiente y última acción', priority: stage >= 6 ? 'high' : 'low', content: compactJson({ pendingAction: memory.pendingAction, lastAction: memory.lastAction }) || 'Sin acciones pendientes.' },
    { name: 'Entidades activas', priority: 'high', content: compactJson(memory.entities) || 'Sin entidades activas.' },
    { name: 'Ticket activo desde API', priority: actionLike ? 'high' : 'medium', content: ticketForPrompt(activeTicket) },
    { name: 'Contexto de aplicación', priority: stage >= 4 ? 'medium' : 'low', content: compactJson(reduceAppContextForPrompt(appContext, userMessage)) },
    { name: 'Resumen de memoria', priority: memory.summary ? 'medium' : 'low', content: memory.summary || 'Sin resumen acumulado.' },
    { name: 'Mensajes recientes', priority: 'medium', content: compactJson(memory.messages.slice(contextMode === 'lowCost' ? -3 : -6).map(m => ({ role: m.role, content: clipText(m.content, 600) }))) }
  ];
  return buildContextWithBudget(sections, budget);
}

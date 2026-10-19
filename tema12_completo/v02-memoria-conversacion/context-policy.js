function hasSensitivePattern(value) { return /api[_-]?key|bearer\s+[a-z0-9._-]+|password|secret|cookie|authorization/i.test(value); }
function inspect(input) { try { return hasSensitivePattern(JSON.stringify(input || {})); } catch { return false; } }
export function evaluateContextPolicy({ user, session, appContext, memory }) {
  const issues = [], recommendations = [];
  if (session.userId !== user.userId) issues.push({ severity: 'error', code: 'SESSION_USER_MISMATCH', message: 'La sesión no pertenece al usuario autenticado.' });
  if (session.tenantId !== user.tenantId) issues.push({ severity: 'error', code: 'SESSION_TENANT_MISMATCH', message: 'La sesión no pertenece al tenant del usuario.' });
  if (inspect(appContext)) issues.push({ severity: 'error', code: 'APP_CONTEXT_SENSITIVE_DATA', message: 'El contexto de aplicación contiene posibles secretos.' });
  if (inspect(memory)) { issues.push({ severity: 'warning', code: 'MEMORY_POSSIBLE_SENSITIVE_DATA', message: 'La memoria contiene texto que podría ser sensible.' }); recommendations.push('Revisar sanitización antes de persistir memoria.'); }
  if (memory.pendingAction) { const age = Math.floor((Date.now() - new Date(memory.pendingAction.createdAt).getTime()) / 60000); if (age > 2) { issues.push({ severity: 'warning', code: 'PENDING_ACTION_OLD', message: 'Existe una acción pendiente antigua.' }); recommendations.push('Eliminar o renovar la acción pendiente antes de aceptar confirmación.'); } }
  if (appContext.view === 'ticket_detail' && appContext.activeEntity?.type !== 'ticket') issues.push({ severity: 'warning', code: 'VIEW_ENTITY_MISMATCH', message: 'La vista de detalle de ticket no contiene una entidad ticket activa.' });
  if (memory.messages.length > 12) { issues.push({ severity: 'warning', code: 'LONG_MESSAGE_WINDOW', message: 'La ventana de mensajes recientes es demasiado larga.' }); recommendations.push('Compactar conversación.'); }
  return { allowed: !issues.some(i => i.severity === 'error'), issues, recommendations };
}
export function scoreContextQuality({ user, session, appContext, memory }) {
  const policy = evaluateContextPolicy({ user, session, appContext, memory });
  let score = 100;
  for (const issue of policy.issues) score -= issue.severity === 'error' ? 35 : issue.severity === 'warning' ? 12 : 4;
  if (memory.pendingAction) score -= 3;
  if (memory.messages.length > 8) score -= Math.min(15, memory.messages.length - 8);
  if (memory.entities.activeTicketId && appContext.activeEntity?.type === 'ticket' && appContext.activeEntity.id && memory.entities.activeTicketId !== appContext.activeEntity.id) score -= 10;
  score = Math.max(0, Math.min(100, score));
  return { score, status: score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'needs_review' : 'poor', issues: policy.issues, recommendations: policy.recommendations };
}

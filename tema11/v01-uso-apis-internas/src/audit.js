// Nunca registra contraseñas, tokens, mensajes ni respuestas completas.
export const auditRecords = [];
export const toolMetrics = [];
export function audit(event, fields = {}) {
  const record = { event, ...fields, at: new Date().toISOString() };
  auditRecords.push(record);
  if (auditRecords.length > 500) auditRecords.shift();
  if (process.env.QUIET_LOGS !== 'true') console.log(JSON.stringify(record));
}
export function metric(record) {
  toolMetrics.push({ ...record, createdAt: new Date().toISOString() });
  if (toolMetrics.length > 100) toolMetrics.shift();
}

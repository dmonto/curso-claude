export function redact(text) {
  return String(text).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[EMAIL]')
    .replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){10,30}\b/g,'[IBAN]')
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g,'[SECRET]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g,'[CARD]');
}
// Lista positiva: los campos no enumerados nunca llegan al modelo ni al navegador.
export function projectTicket(t) { return {id:t.id,title:redact(t.title),description:redact(t.description),status:t.status}; }
export function sanitizeForAudit(event) {
  const allowed=['eventType','requestId','actionId','userId','tenantId','role','endpoint','result','decision','reason','resourceId','action','before','after','noteLength','noteId','durationMs','inputTokens','outputTokens','ticketCount','modelMode','statusCode'];
  return Object.fromEntries(allowed.filter(k=>event[k]!==undefined).map(k=>[k,event[k]]));
}

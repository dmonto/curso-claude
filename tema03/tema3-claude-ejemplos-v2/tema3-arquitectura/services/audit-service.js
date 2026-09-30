const auditEvents = [];

export function writeAuditEvent(event) {
  const auditEvent = {
    ...event,
    timestamp: new Date().toISOString()
  };

  auditEvents.push(auditEvent);
  auditEvents.splice(0, Math.max(0, auditEvents.length - 200));

  console.log(auditEvent);
  return auditEvent;
}

export function getAuditEvents() {
  return auditEvents;
}

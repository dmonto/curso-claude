const blockedKeys = new Set([
  "customer_email",
  "internal_notes",
  "password",
  "token",
  "secret",
  "api_key"
]);

export function sanitizeForModel(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeForModel);
  }

  if (value && typeof value === "object") {
    const clean = {};

    for (const [key, child] of Object.entries(value)) {
      if (blockedKeys.has(key.toLowerCase())) {
        clean[key] = "[REDACTED]";
      } else {
        clean[key] = sanitizeForModel(child);
      }
    }

    return clean;
  }

  if (typeof value === "string") {
    return value
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
      .replace(/token[_-]?[a-z0-9]*/gi, "[REDACTED_TOKEN]");
  }

  return value;
}

export function projectTicketForModel(ticket) {
  return sanitizeForModel({
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    category: ticket.category,
    customer: ticket.customer,
    created_at: ticket.created_at,
    resolution_minutes: ticket.resolution_minutes,
    customer_email: ticket.customer_email,
    internal_notes: ticket.internal_notes
  });
}

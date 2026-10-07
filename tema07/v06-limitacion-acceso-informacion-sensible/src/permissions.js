import { parsePermissions } from "./db.js";

const sensitiveTerms = [
  "email",
  "emails",
  "token",
  "tokens",
  "contraseña",
  "contraseñas",
  "password",
  "secret",
  "secreto",
  "notas internas",
  "internal_notes"
];

export function detectSensitiveRequest(question) {
  const q = String(question || "").toLowerCase();
  return sensitiveTerms.find((term) => q.includes(term)) || null;
}

export function canReadTickets(user) {
  const permissions = parsePermissions(user);
  return permissions.includes("read:tickets") || permissions.includes("read:own_tickets");
}

export function canReadMetrics(user) {
  return parsePermissions(user).includes("read:ticket_metrics");
}

import { resolveRelativeDate } from "./date-utils.js";

export function translateQuestionToQuerySpec(question) {
  const q = String(question || "").toLowerCase();
  const filters = [];

  if (q.includes("abiert") || q.includes("siguen abiertas")) filters.push({ field: "status", operator: "=", value: "open" });
  if (q.includes("cerrad")) filters.push({ field: "status", operator: "=", value: "closed" });
  if (q.includes("crític") || q.includes("critic")) filters.push({ field: "priority", operator: "=", value: "critical" });
  if (q.includes("alta prioridad")) filters.push({ field: "priority", operator: "=", value: "high" });
  if (q.includes("pago") || q.includes("tarjeta")) filters.push({ field: "category", operator: "=", value: "payments" });
  if (q.includes("login") || q.includes("acceso") || q.includes("contraseña")) filters.push({ field: "category", operator: "=", value: "login" });
  if (q.includes("factur") || q.includes("cobro")) filters.push({ field: "category", operator: "=", value: "billing" });

  const relative = resolveRelativeDate(question);
  if (relative.createdFrom) filters.push({ field: "created_at", operator: ">=", value: relative.createdFrom });
  if (relative.createdTo) filters.push({ field: "created_at", operator: "<=", value: relative.createdTo });

  return {
    entity: "tickets",
    operation: q.includes("cuánt") || q.includes("cuant") ? "count" : "list",
    filters,
    sort: q.includes("últim") || q.includes("ultim") || q.includes("reciente")
      ? [{ field: "created_at", direction: "desc" }]
      : [],
    limit: 20,
    metadata: {
      relativeDate: relative.relativeDate,
      source: "rule_based_translator"
    }
  };
}

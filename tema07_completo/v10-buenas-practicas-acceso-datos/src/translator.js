export function translateQuestion(question) {
  const q = String(question || "").toLowerCase();
  const filters = [];

  if (q.includes("abiert")) filters.push({ field: "status", operator: "=", value: "open" });
  if (q.includes("cerrad")) filters.push({ field: "status", operator: "=", value: "closed" });
  if (q.includes("crític") || q.includes("critic")) filters.push({ field: "priority", operator: "=", value: "critical" });
  if (q.includes("pago")) filters.push({ field: "category", operator: "=", value: "payments" });
  if (q.includes("login") || q.includes("acceso")) filters.push({ field: "category", operator: "=", value: "login" });
  if (q.includes("factur")) filters.push({ field: "category", operator: "=", value: "billing" });

  return {
    entity: "tickets",
    operation: q.includes("cuánt") || q.includes("cuant") ? "count" : "list",
    filters,
    sort: [{ field: "created_at", direction: "desc" }],
    limit: 20
  };
}

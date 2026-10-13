export const TABLE_FIELDS = {
  orders: ["id", "customerId", "customer", "city", "status", "total", "channel", "category", "priority", "createdAt", "eta", "canCancel"],
  invoices: ["id", "orderId", "customerId", "customer", "status", "amount", "dueDate", "paidAt", "risk"],
  tickets: ["id", "customerId", "customer", "title", "status", "severity", "productArea", "createdAt", "lastUpdate", "description"],
  customers: ["id", "name", "segment", "city", "accountManager", "lifetimeValue", "openTickets", "risk"]
};

export const OPERATORS = ["equals", "contains", "gt", "gte", "lt", "lte", "in"];
export const STEP_TYPES = ["query_records", "search_documents", "compare_groups", "customer_exposure"];
export const MAX_STEPS = 4;

export function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function includesAny(text, terms) {
  const normalized = normalize(text);
  return terms.some((term) => normalized.includes(normalize(term)));
}

function validateFilters(table, filters = []) {
  const fields = TABLE_FIELDS[table];
  if (!Array.isArray(filters)) throw new Error("filters debe ser una lista.");

  for (const filter of filters) {
    if (!fields.includes(filter.field)) throw new Error(`Campo no permitido para ${table}: ${filter.field}`);
    if (!OPERATORS.includes(filter.operator)) throw new Error(`Operador no permitido: ${filter.operator}`);
    if (filter.operator === "in" && !Array.isArray(filter.value)) throw new Error("El operador in requiere una lista de valores.");
  }

  return filters;
}

function validateStep(step) {
  if (!STEP_TYPES.includes(step?.type)) throw new Error(`Tipo de paso no permitido: ${step?.type}`);
  const description = String(step.description || step.type);

  if (step.type === "query_records") {
    if (!TABLE_FIELDS[step.table]) throw new Error(`Tabla no permitida: ${step.table}`);
    const sortField = step.sort?.field;
    if (sortField && !TABLE_FIELDS[step.table].includes(sortField)) throw new Error(`Campo de orden no permitido: ${sortField}`);
    return { type: step.type, description, table: step.table, filters: validateFilters(step.table, step.filters), sort: step.sort || null };
  }

  if (step.type === "search_documents") {
    if (!step.query || typeof step.query !== "string") throw new Error("search_documents requiere query.");
    return { type: step.type, description, query: step.query };
  }

  if (step.type === "compare_groups") {
    if (!TABLE_FIELDS[step.table]) throw new Error(`Tabla no permitida: ${step.table}`);
    if (!TABLE_FIELDS[step.table].includes(step.groupBy)) throw new Error(`Agrupación no permitida: ${step.groupBy}`);
    return { type: step.type, description, table: step.table, groupBy: step.groupBy, filters: validateFilters(step.table, step.filters) };
  }

  return {
    type: step.type,
    description,
    orderStatus: step.orderStatus || null,
    invoiceStatus: step.invoiceStatus || null
  };
}

export function validateQuestionPlan(raw) {
  const needsClarification = Boolean(raw?.needsClarification);
  const steps = Array.isArray(raw?.steps) ? raw.steps : [];

  if (!needsClarification && steps.length === 0) throw new Error("El plan no contiene pasos.");
  if (steps.length > MAX_STEPS) throw new Error(`El plan supera el máximo de ${MAX_STEPS} pasos.`);

  return {
    intent: String(raw?.intent || "complex_question"),
    needsClarification,
    clarificationQuestion: needsClarification ? String(raw.clarificationQuestion || "¿Puedes dar más detalle?") : null,
    steps: needsClarification ? [] : steps.map(validateStep)
  };
}

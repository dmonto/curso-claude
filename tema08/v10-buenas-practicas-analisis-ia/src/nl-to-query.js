import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "dummy-key"
});

const TABLE_FIELDS = {
  orders: ["id", "customerId", "customer", "city", "status", "total", "channel", "category", "priority", "createdAt", "eta", "canCancel"],
  invoices: ["id", "orderId", "customerId", "customer", "status", "amount", "dueDate", "paidAt", "risk"],
  tickets: ["id", "customerId", "customer", "title", "status", "severity", "productArea", "createdAt", "lastUpdate", "description"],
  customers: ["id", "name", "segment", "city", "accountManager", "lifetimeValue", "openTickets", "risk"]
};

const OPERATORS = ["equals", "contains", "gt", "gte", "lt", "lte", "in"];

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function includesAny(text, terms) {
  const normalized = normalize(text);
  return terms.some((term) => normalized.includes(normalize(term)));
}

function mockQuery(message) {
  let table = "orders";
  if (includesAny(message, ["factura", "facturas", "cobro"])) table = "invoices";
  else if (includesAny(message, ["ticket", "incidencia"])) table = "tickets";
  else if (includesAny(message, ["cliente", "clientes"])) table = "customers";

  const filters = [];
  if (table === "orders" && includesAny(message, ["retrasado", "retrasados"])) filters.push({ field: "status", operator: "equals", value: "retrasado" });
  if (table === "invoices" && includesAny(message, ["vencida", "vencidas"])) filters.push({ field: "status", operator: "equals", value: "vencida" });
  if (includesAny(message, ["alto riesgo", "riesgo alto"])) filters.push({ field: "risk", operator: "equals", value: "alto" });

  return { table, filters };
}

function validateQuery(query) {
  const fields = TABLE_FIELDS[query?.table];
  if (!fields) throw new Error(`Tabla no permitida: ${query?.table}`);

  for (const filter of query.filters) {
    if (!fields.includes(filter.field)) throw new Error(`Campo no permitido para ${query.table}: ${filter.field}`);
    if (!OPERATORS.includes(filter.operator)) throw new Error(`Operador no permitido: ${filter.operator}`);
    if (filter.operator === "in" && !Array.isArray(filter.value)) throw new Error("El operador in requiere una lista de valores.");
  }

  return query;
}

export async function naturalLanguageToQuery(message) {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "tu_api_key") {
    return { ...mockQuery(message), source: "mock" };
  }

  const allFields = [...new Set(Object.values(TABLE_FIELDS).flat())];
  const catalog = Object.entries(TABLE_FIELDS)
    .map(([table, fields]) => `- ${table}: ${fields.join(", ")}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-5",
    max_tokens: 800,
    output_config: { effort: "low" },
    system: [
      "Traduce preguntas en español a una consulta estructurada sobre estas tablas. No inventes tablas ni campos. Usa la herramienta extract_query.",
      "Los valores de status, risk, priority, etc. van en minúsculas y en español, como en los datos (p. ej. retrasado, vencida, alto).",
      `Tablas y campos:\n${catalog}`
    ].join("\n\n"),
    tools: [
      {
        name: "extract_query",
        description: "Extrae la tabla y los filtros de una consulta controlada.",
        input_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            table: { type: "string", enum: Object.keys(TABLE_FIELDS) },
            filters: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  field: { type: "string", enum: allFields },
                  operator: { type: "string", enum: OPERATORS },
                  value: { anyOf: [{ type: "string" }, { type: "number" }, { type: "array", items: { type: "string" } }] }
                },
                required: ["field", "operator", "value"]
              }
            }
          },
          required: ["table", "filters"]
        }
      }
    ],
    tool_choice: { type: "tool", name: "extract_query" },
    messages: [{ role: "user", content: message }]
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("Claude no devolvió una consulta.");

  return { ...validateQuery(toolUse.input), source: "claude" };
}

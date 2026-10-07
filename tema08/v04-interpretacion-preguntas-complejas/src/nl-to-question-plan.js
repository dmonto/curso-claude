import Anthropic from "@anthropic-ai/sdk";
import { TABLE_FIELDS, OPERATORS, STEP_TYPES, MAX_STEPS, includesAny, validateQuestionPlan } from "./question-plan.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "dummy-key"
});

function mockPlan(message) {
  const steps = [];
  const wantsOrders = includesAny(message, ["pedido", "pedidos", "retrasado", "retrasados"]);
  const wantsInvoices = includesAny(message, ["factura", "facturas", "vencida", "vencidas"]);
  const wantsTickets = includesAny(message, ["ticket", "tickets", "incidencia", "incidencias"]);
  const wantsDocs = includesAny(message, ["documentacion", "procedimiento", "politica", "guia", "tenemos algo sobre"]);

  if (includesAny(message, ["cliente", "clientes"]) && (wantsOrders || wantsInvoices)) {
    steps.push({
      type: "customer_exposure",
      description: "Clientes con señales de riesgo ordenados por exposición",
      orderStatus: includesAny(message, ["retrasado", "retrasados"]) ? "retrasado" : null,
      invoiceStatus: includesAny(message, ["vencida", "vencidas"]) ? "vencida" : null
    });
  } else {
    if (wantsOrders) steps.push({ type: "query_records", description: "Pedidos", table: "orders", filters: includesAny(message, ["retrasado", "retrasados"]) ? [{ field: "status", operator: "equals", value: "retrasado" }] : [] });
    if (wantsInvoices) steps.push({ type: "query_records", description: "Facturas", table: "invoices", filters: includesAny(message, ["vencida", "vencidas"]) ? [{ field: "status", operator: "equals", value: "vencida" }] : [], sort: { field: "amount", direction: "desc" } });
    if (wantsTickets) steps.push({ type: "query_records", description: "Tickets", table: "tickets", filters: includesAny(message, ["abierto", "abiertos"]) ? [{ field: "status", operator: "equals", value: "abierto" }] : [] });
  }

  if (wantsDocs) steps.push({ type: "search_documents", description: "Documentación relacionada", query: message });

  if (steps.length === 0) {
    return { intent: "clarification", needsClarification: true, clarificationQuestion: "No se detecta una pregunta analítica clara. ¿Sobre pedidos, facturas, tickets o clientes?", steps: [] };
  }

  return { intent: "complex_question", needsClarification: false, clarificationQuestion: null, steps };
}

const FILTER_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      field: { type: "string" },
      operator: { type: "string", enum: OPERATORS },
      value: { anyOf: [{ type: "string" }, { type: "number" }, { type: "array", items: { type: "string" } }] }
    },
    required: ["field", "operator", "value"]
  }
};

export async function naturalLanguageToQuestionPlan(message) {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "tu_api_key") {
    return { ...validateQuestionPlan(mockPlan(message)), source: "mock" };
  }

  const today = new Date().toISOString().slice(0, 10);
  const catalog = Object.entries(TABLE_FIELDS)
    .map(([table, fields]) => `- ${table}: ${fields.join(", ")}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-5",
    max_tokens: 1000,
    output_config: { effort: "low" },
    system: [
      "Eres un intérprete de preguntas complejas para una aplicación de soporte. Descompón la pregunta en pasos con la herramienta build_plan.",
      "No escribas SQL, no inventes tablas ni campos y no ejecutes acciones.",
      `Fecha actual de referencia: ${today}`,
      `Tablas y campos:\n${catalog}`,
      "Los valores de status, risk, priority, etc. van en minúsculas y en español, como en los datos (p. ej. retrasado, vencida, alto, abierto).",
      [
        "Tipos de paso:",
        "- query_records: lista registros de una tabla con filtros y orden opcional.",
        "- search_documents: busca en la documentación (políticas, procedimientos, runbooks).",
        "- compare_groups: agrupa registros de una tabla por un campo para comparar.",
        "- customer_exposure: clientes con pedidos/facturas en un estado dado, ordenados por importe pendiente."
      ].join("\n"),
      `Máximo ${MAX_STEPS} pasos. Si la pregunta es ambigua y cambiaría mucho el resultado, usa needsClarification=true con una pregunta y sin pasos.`
    ].join("\n\n"),
    tools: [
      {
        name: "build_plan",
        description: "Devuelve el plan de pasos para responder la pregunta.",
        input_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            intent: { type: "string" },
            needsClarification: { type: "boolean" },
            clarificationQuestion: { type: ["string", "null"] },
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: STEP_TYPES },
                  description: { type: "string" },
                  table: { type: "string", enum: Object.keys(TABLE_FIELDS) },
                  filters: FILTER_SCHEMA,
                  sort: {
                    type: "object",
                    properties: { field: { type: "string" }, direction: { type: "string", enum: ["asc", "desc"] } },
                    required: ["field", "direction"]
                  },
                  groupBy: { type: "string" },
                  query: { type: "string" },
                  orderStatus: { type: "string" },
                  invoiceStatus: { type: "string" }
                },
                required: ["type", "description"]
              }
            }
          },
          required: ["intent", "needsClarification", "steps"]
        }
      }
    ],
    tool_choice: { type: "tool", name: "build_plan" },
    messages: [{ role: "user", content: message }]
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("Claude no devolvió un plan.");

  return { ...validateQuestionPlan(toolUse.input), source: "claude" };
}

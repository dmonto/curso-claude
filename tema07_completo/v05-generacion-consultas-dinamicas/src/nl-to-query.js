import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "dummy-key"
});

function mockQuerySpec(question) {
  const q = String(question || "").toLowerCase();
  const filters = [];

  if (q.includes("abiert")) filters.push({ field: "status", operator: "=", value: "open" });
  if (q.includes("cerrad")) filters.push({ field: "status", operator: "=", value: "closed" });
  if (q.includes("crític") || q.includes("critic")) filters.push({ field: "priority", operator: "=", value: "critical" });
  if (q.includes("alta")) filters.push({ field: "priority", operator: "=", value: "high" });
  if (q.includes("pago")) filters.push({ field: "category", operator: "=", value: "payments" });
  if (q.includes("login") || q.includes("acceso")) filters.push({ field: "category", operator: "=", value: "login" });
  if (q.includes("factur") || q.includes("billing")) filters.push({ field: "category", operator: "=", value: "billing" });

  return {
    entity: "tickets",
    operation: q.includes("cuánt") || q.includes("cuant") ? "count" : "list",
    filters,
    sort: [{ field: "created_at", direction: "desc" }],
    limit: 20
  };
}

export async function naturalLanguageToQuerySpec(question) {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "tu_api_key") {
    return mockQuerySpec(question);
  }

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-5",
    max_tokens: 800,
    output_config: { effort: "low" },
    system: "Traduce preguntas a QuerySpec. No escribas SQL. No inventes campos. Usa la herramienta extract_query_spec.",
    tools: [
      {
        name: "extract_query_spec",
        description: "Extrae una consulta controlada sobre tickets.",
        input_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            entity: { type: "string", enum: ["tickets"] },
            operation: { type: "string", enum: ["list", "count"] },
            filters: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  field: { type: "string", enum: ["id", "title", "status", "priority", "category", "customer", "created_at", "resolution_minutes"] },
                  operator: { type: "string", enum: ["=", "!=", ">", ">=", "<", "<=", "contains"] },
                  value: { anyOf: [{ type: "string" }, { type: "number" }] }
                },
                required: ["field", "operator", "value"]
              }
            },
            sort: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  field: { type: "string", enum: ["created_at", "priority", "customer", "resolution_minutes"] },
                  direction: { type: "string", enum: ["asc", "desc"] }
                },
                required: ["field", "direction"]
              }
            },
            limit: { type: "integer", minimum: 1, maximum: 50 }
          },
          required: ["entity", "operation", "filters", "sort", "limit"]
        }
      }
    ],
    tool_choice: { type: "tool", name: "extract_query_spec" },
    messages: [{ role: "user", content: question }]
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("Claude no devolvió una QuerySpec.");
  console.log(toolUse.input)
  return toolUse.input;
}

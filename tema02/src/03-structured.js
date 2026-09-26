import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.COURSE_ANTHROPIC_API_KEY
});

const model = process.env.CLAUDE_MODEL;

const schema = {
  type: "object",

  properties: {
    intent: {
      type: "string",
      enum: [
        "invoice_request",
        "order_status",
        "delivery_problem",
        "refund_request",
        "account_access",
        "technical_problem",
        "other"
      ]
    },

    order_id: {
      type: ["string", "null"]
    },

    missing_fields: {
      type: "array",
      items: {
        type: "string"
      }
    },

    suggested_reply: {
      type: "string"
    }
  },

  required: [
    "intent",
    "order_id",
    "missing_fields",
    "suggested_reply"
  ],

  additionalProperties: false
};

const userMessage =
  process.argv.slice(2).join(" ") ||
  "Necesito la factura del pedido 8831.";

const response = await client.messages.create({
  model,
  max_tokens: 500,

  system: `
Eres un clasificador para una aplicación web empresarial.

Interpreta la petición del usuario.
No inventes identificadores.
Si falta un dato necesario, añádelo a missing_fields.
`,

  messages: [
    {
      role: "user",
      content: userMessage
    }
  ],

  output_config: {
    format: {
      type: "json_schema",
      schema
    }
  }
});

const text = response.content
  .filter((block) => block.type === "text")
  .map((block) => block.text)
  .join("");

const result = JSON.parse(text);

console.log("\n=== RESULTADO ESTRUCTURADO ===\n");
console.log(result);

console.log("\n=== USO ===\n");
console.log(response.usage);
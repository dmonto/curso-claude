import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.COURSE_ANTHROPIC_API_KEY
});

const model = process.env.CLAUDE_MODEL;

function getOrderStatus(orderId) {
  const orders = {
    "8831": {
      order_id: "8831",
      status: "delivered",
      invoice_available: true
    },

    "9912": {
      order_id: "9912",
      status: "in_transit",
      invoice_available: false
    }
  };

  return orders[orderId] ?? {
    order_id: orderId,
    status: "not_found",
    invoice_available: false
  };
}

const tools = [
  {
    name: "get_order_status",

    description:
      "Consulta el estado actual de un pedido utilizando su identificador.",

    strict: true,

    input_schema: {
      type: "object",

      properties: {
        order_id: {
          type: "string"
        }
      },

      required: [
        "order_id"
      ],

      additionalProperties: false
    }
  }
];

const userMessage =
  process.argv.slice(2).join(" ") ||
  "¿Dónde está el pedido 9912?";

const messages = [
  {
    role: "user",
    content: userMessage
  }
];

const firstResponse = await client.messages.create({
  model,
  max_tokens: 500,

  system: `
Eres un asistente de soporte.

No inventes estados de pedido.
`,

  tools,
  messages
});

const toolUse = firstResponse.content.find(
  (block) => block.type === "tool_use"
);

if (!toolUse) {
  const text = firstResponse.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  console.log(text);
  process.exit(0);
}

console.log("\n=== TOOL REQUEST ===\n");

console.log({
  name: toolUse.name,
  input: toolUse.input
});

const toolResult = getOrderStatus(
  toolUse.input.order_id
);

console.log("\n=== TOOL RESULT ===\n");
console.log(toolResult);

const finalResponse =
  await client.messages.create({
    model,
    max_tokens: 500,

    system: `
Eres un asistente de soporte.

Responde utilizando únicamente los datos reales obtenidos
de las herramientas.
`,

    tools,

    messages: [
      ...messages,

      {
        role: "assistant",
        content: firstResponse.content
      },

      {
        role: "user",

        content: [
          {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(toolResult)
          }
        ]
      }
    ]
  });

const finalText = finalResponse.content
  .filter((block) => block.type === "text")
  .map((block) => block.text)
  .join("\n");

console.log("\n=== RESPUESTA FINAL ===\n");
console.log(finalText);
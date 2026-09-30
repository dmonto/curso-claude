import Anthropic from "@anthropic-ai/sdk";
import { assistantConfig } from "./assistant-config.js";

let anthropicClient = null;

function getAnthropicClient() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  return anthropicClient;
}

function generateMockAnswer(modelInput) {
  const order = modelInput.data?.selectedOrder;
  const tickets = modelInput.data?.relatedTickets || [];
  const message = modelInput.currentMessage || "";

  const parts = [];

  if (order) {
    parts.push(
      `El pedido ${order.id} está en estado "${order.status}", con total ${order.total} €.`
    );
  } else if (message.toLowerCase().includes("pedido")) {
    parts.push("No tengo un pedido válido en el contexto autorizado.");
  }

  if (tickets.length > 0) {
    parts.push(
      `Tiene ${tickets.length} incidencia(s) relacionada(s): ${tickets
        .map((ticket) => `${ticket.id} (${ticket.status})`)
        .join(", ")}.`
    );
  } else if (message.toLowerCase().includes("incidencia") || message.toLowerCase().includes("ticket")) {
    parts.push("No tengo incidencias autorizadas en el contexto recibido.");
  }

  if (message.toLowerCase().includes("crea") || message.toLowerCase().includes("abrir")) {
    parts.push("Puedo preparar una acción pendiente para que la revises antes de confirmar.");
  }

  if (parts.length === 0) {
    parts.push("He recibido tu mensaje y responderé usando solo el contexto autorizado disponible.");
  }

  return `[MOCK Claude] ${parts.join(" ")}`;
}

export async function generateAssistantAnswer({ systemPrompt, modelInput }) {
  const useMock = process.env.USE_MOCK_MODEL !== "false" || !process.env.ANTHROPIC_API_KEY;

  if (useMock) {
    return generateMockAnswer(modelInput);
  }

  const anthropic = getAnthropicClient();

  const response = await anthropic.messages.create({
    model: assistantConfig.model,
    max_tokens: 700,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `
Contexto estructurado disponible:
${JSON.stringify(modelInput, null, 2)}

Responde al mensaje actual del usuario usando solo este contexto.
`
      }
    ]
  });

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

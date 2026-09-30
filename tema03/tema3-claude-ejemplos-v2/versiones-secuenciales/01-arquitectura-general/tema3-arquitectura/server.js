import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { getUserContext, serializeUserContextForClient } from "./data/mock-user-context.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const anthropic = new Anthropic({
  apiKey: process.env.COURSE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "mock-key"
});

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "assistant-backend",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/users/:userId/context", (req, res) => {
  const userContext = getUserContext(req.params.userId);

  if (!userContext) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }

  res.json(serializeUserContextForClient(userContext));
});

function buildContextForModel({ userContext, clientContext }) {
  const selectedOrderId = clientContext?.selectedEntityId || userContext.recentOrders?.[0]?.id || null;

  const canReadOrders = userContext.permissions.includes("read_orders");
  const canReadTickets = userContext.permissions.includes("read_tickets");

  const recentOrders = canReadOrders ? userContext.recentOrders : [];
  const selectedOrder = canReadOrders
    ? recentOrders.find((order) => order.id === selectedOrderId) || null
    : null;

  const openTickets = canReadTickets ? userContext.openTickets : [];
  const relatedTickets = selectedOrder
    ? openTickets.filter((ticket) => ticket.orderId === selectedOrder.id)
    : [];

  return {
    user: {
      userId: userContext.userId,
      name: userContext.name,
      role: userContext.role,
      currentPage: userContext.currentPage
    },
    application: {
      currentPage: clientContext?.currentPage || userContext.currentPage,
      selectedEntityType: clientContext?.selectedEntityType || null,
      selectedEntityId: selectedOrderId,
      locale: clientContext?.locale || "es-ES"
    },
    permissions: userContext.permissions,
    selectedOrder,
    relatedTickets,
    recentOrders,
    openTickets
  };
}

function mockAnswer({ contextForModel, message }) {
  const parts = [];
  const order = contextForModel.selectedOrder;
  const tickets = contextForModel.relatedTickets || [];

  if (order) {
    parts.push(`Hola ${contextForModel.user.name}. El pedido ${order.id} está en estado "${order.status}" y tiene un total de ${order.total} €.`);
  } else if (message.toLowerCase().includes("pedido")) {
    parts.push("No tengo un pedido válido en el contexto autorizado.");
  }

  if (tickets.length > 0) {
    parts.push(`Tiene ${tickets.length} incidencia(s) relacionada(s): ${tickets.map((ticket) => `${ticket.id} (${ticket.status})`).join(", ")}.`);
  } else if (message.toLowerCase().includes("incidencia") || message.toLowerCase().includes("ticket")) {
    parts.push("No tengo incidencias autorizadas asociadas al pedido seleccionado.");
  }

  if (parts.length === 0) {
    parts.push("Responderé usando solo el contexto autorizado disponible.");
  }

  return `[MOCK Claude] ${parts.join(" ")}`;
}

async function generateAnswer({ systemPrompt, contextForModel, message }) {
  const useMock = process.env.USE_MOCK_MODEL !== "false" || !process.env.COURSE_ANTHROPIC_API_KEY;

  if (useMock) {
    return mockAnswer({ contextForModel, message });
  }

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
    max_tokens: 700,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `
Contexto disponible:
${JSON.stringify(contextForModel, null, 2)}

Mensaje del usuario:
${message}
`
      }
    ]
  });

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

app.post("/api/assistant/message", async (req, res) => {
  const startedAt = Date.now();

  try {
    const { userId, sessionId, message, clientContext = {} } = req.body;

    if (!userId || !sessionId || !message) {
      return res.status(400).json({
        error: "userId, sessionId y message son obligatorios"
      });
    }

    const userContext = getUserContext(userId);

    if (!userContext) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const systemPrompt = `
Eres un asistente integrado en una aplicación web de gestión de pedidos e incidencias.

Reglas:
- Responde de forma clara y breve.
- Usa solo el contexto proporcionado.
- No inventes pedidos, tickets ni estados.
- Si falta información, dilo.
- No ejecutes acciones reales.
- Puedes sugerir el siguiente paso al usuario.
`;

    const contextForModel = buildContextForModel({ userContext, clientContext });

    console.log("Contexto disponible:", JSON.stringify(contextForModel, null, 2));

    const answer = await generateAnswer({
      systemPrompt,
      contextForModel,
      message
    });

    const elapsedMs = Date.now() - startedAt;

    console.log({
      event: "assistant_message",
      userId,
      sessionId,
      elapsedMs,
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
      selectedEntityId: contextForModel.application.selectedEntityId,
      hasSelectedOrder: Boolean(contextForModel.selectedOrder),
      hasTicketsContext: contextForModel.relatedTickets.length > 0,
      timestamp: new Date().toISOString()
    });

    res.json({ sessionId, answer, elapsedMs });
  } catch (error) {
    console.error({
      event: "assistant_error",
      message: error.message,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({ error: "Error procesando el mensaje del asistente" });
  }
});

app.listen(port, () => {
  console.log(`Assistant backend escuchando en http://localhost:${port}`);
});

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { getUserContext, serializeUserContextForClient } from "./data/mock-user-context.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const pendingActions = new Map();

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

function detectActionIntent(message) {
  const normalized = message.toLowerCase();

  const wantsTicket =
    normalized.includes("crea una incidencia") ||
    normalized.includes("crear incidencia") ||
    normalized.includes("abrir incidencia") ||
    normalized.includes("abre una incidencia") ||
    normalized.includes("crear ticket") ||
    normalized.includes("abrir ticket");

  if (wantsTicket) {
    return {
      type: "create_ticket",
      requiresConfirmation: true
    };
  }

  return null;
}

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
  const order = contextForModel.selectedOrder;
  const tickets = contextForModel.relatedTickets || [];
  const parts = [];

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

  if (message.toLowerCase().includes("crea") || message.toLowerCase().includes("abrir")) {
    parts.push("Puedo preparar una acción pendiente para que la revises antes de confirmar.");
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
    const actionIntent = detectActionIntent(message);

    console.log("Contexto disponible:", JSON.stringify(contextForModel, null, 2));

    const answer = await generateAnswer({
      systemPrompt,
      contextForModel,
      message
    });

    const elapsedMs = Date.now() - startedAt;

    if (actionIntent?.type === "create_ticket") {
      const selectedOrder = contextForModel.selectedOrder;

      if (!selectedOrder) {
        return res.status(400).json({
          error: "No hay un pedido válido sobre el que crear la incidencia"
        });
      }

      const actionId = `action-${Date.now()}`;

      const pendingAction = {
        actionId,
        type: "create_ticket",
        status: "pending_confirmation",
        userId,
        sessionId,
        payload: {
          orderId: selectedOrder.id,
          subject: `Incidencia sobre pedido ${selectedOrder.id}`,
          description: answer
        },
        createdAt: new Date().toISOString()
      };

      pendingActions.set(actionId, pendingAction);

      console.log({
        event: "assistant_action_proposed",
        userId,
        sessionId,
        actionId,
        actionType: "create_ticket",
        orderId: selectedOrder.id,
        timestamp: new Date().toISOString()
      });

      return res.json({
        sessionId,
        answer: `${answer}\n\nHe preparado una acción para crear una incidencia. Revisa los datos y confirma si quieres continuar.`,
        pendingAction: {
          actionId,
          type: "create_ticket",
          orderId: selectedOrder.id,
          subject: pendingAction.payload.subject,
          requiresConfirmation: true
        },
        elapsedMs
      });
    }

    console.log({
      event: "assistant_message",
      userId,
      sessionId,
      elapsedMs,
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

app.post("/api/assistant/confirm-action", async (req, res) => {
  try {
    const { userId, sessionId, actionId, confirm } = req.body;

    if (!userId || !sessionId || !actionId) {
      return res.status(400).json({
        error: "userId, sessionId y actionId son obligatorios"
      });
    }

    const pendingAction = pendingActions.get(actionId);

    if (!pendingAction) {
      return res.status(404).json({ error: "Acción pendiente no encontrada" });
    }

    if (pendingAction.userId !== userId || pendingAction.sessionId !== sessionId) {
      return res.status(403).json({ error: "La acción no pertenece a esta sesión" });
    }

    if (!confirm) {
      pendingAction.status = "cancelled";
      pendingActions.set(actionId, pendingAction);

      return res.json({
        actionId,
        status: "cancelled",
        message: "Acción cancelada. No se ha creado ninguna incidencia."
      });
    }

    const userContext = getUserContext(userId);

    if (!userContext?.permissions?.includes("create_tickets")) {
      return res.status(403).json({
        error: "El usuario no tiene permiso para crear incidencias"
      });
    }

    if (pendingAction.type === "create_ticket") {
      const createdTicket = {
        id: `TCK-${Math.floor(Math.random() * 9000 + 1000)}`,
        orderId: pendingAction.payload.orderId,
        subject: pendingAction.payload.subject,
        status: "abierto",
        priority: "media",
        createdAt: new Date().toISOString()
      };

      pendingAction.status = "completed";
      pendingAction.result = createdTicket;
      pendingActions.set(actionId, pendingAction);

      console.log({
        event: "assistant_action_completed",
        userId,
        sessionId,
        actionId,
        actionType: pendingAction.type,
        ticketId: createdTicket.id,
        timestamp: new Date().toISOString()
      });

      return res.json({
        actionId,
        status: "completed",
        message: "Incidencia creada correctamente.",
        result: createdTicket
      });
    }

    return res.status(400).json({ error: "Tipo de acción no soportado" });
  } catch (error) {
    console.error({
      event: "assistant_confirm_action_error",
      message: error.message,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({ error: "Error confirmando la acción" });
  }
});

app.listen(port, () => {
  console.log(`Assistant backend escuchando en http://localhost:${port}`);
});

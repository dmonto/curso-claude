import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { getUserContext } from "./data/mock-user-context.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const anthropic = new Anthropic({
  apiKey: process.env.COURSE_ANTHROPIC_API_KEY
});
const pendingActions = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "assistant-backend",
    timestamp: new Date().toISOString()
  });
});

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
      return res.status(404).json({
        error: "Usuario no encontrado"
      });
    }

    const selectedOrderId =
    clientContext?.selectedEntityId ||
    userContext.recentOrders?.[0]?.id ||
    null;

    const selectedOrder = userContext.recentOrders.find(
    (order) => order.id === selectedOrderId
    );

    const relatedTickets = userContext.openTickets.filter(
    (ticket) => ticket.orderId === selectedOrder?.id
    );

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

const contextForModel = {
  user: {
    userId: userContext.userId,
    name: userContext.name,
    role: userContext.role,
    currentPage: userContext.currentPage
  },
  application: {
    currentPage: clientContext?.currentPage,
    selectedEntityType: clientContext?.selectedEntityType,
    selectedEntityId: selectedOrderId,
    locale: clientContext?.locale || "es-ES"
  },
  permissions: userContext.permissions,
  selectedOrder,
  relatedTickets,
  recentOrders: userContext.recentOrders,
  openTickets: userContext.openTickets
};
    console.log(`Contexto disponible: ${JSON.stringify(contextForModel, null, 2)}`);
    const actionIntent = detectActionIntent(message);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
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

    const answer = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const elapsedMs = Date.now() - startedAt;

    if (actionIntent?.type === "create_ticket") {
  const actionId = `action-${Date.now()}`;

  const pendingAction = {
    actionId,
    type: "create_ticket",
    status: "pending_confirmation",
    userId,
    sessionId,
    payload: {
      orderId: selectedOrderId,
      subject: `Incidencia sobre pedido ${selectedOrderId}`,
      description: answer
    },
    createdAt: new Date().toISOString()
  };

  pendingActions.set(actionId, pendingAction);

  return res.json({
    sessionId,
    answer:
      answer +
      "\n\nHe preparado una acción para crear una incidencia. Revisa los datos y confirma si quieres continuar.",
    pendingAction: {
      actionId,
      type: "create_ticket",
      orderId: selectedOrderId,
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
      inputLength: message.length,
      timestamp: new Date().toISOString()
    });

    res.json({
      sessionId,
      answer,
      elapsedMs
    });
  } catch (error) {
    console.error({
      event: "assistant_error",
      message: error.message,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      error: "Error procesando el mensaje del asistente"
    });
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
      return res.status(404).json({
        error: "Acción pendiente no encontrada"
      });
    }

    if (pendingAction.userId !== userId || pendingAction.sessionId !== sessionId) {
      return res.status(403).json({
        error: "La acción no pertenece a esta sesión"
      });
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

    return res.status(400).json({
      error: "Tipo de acción no soportado"
    });
  } catch (error) {
    console.error({
      event: "assistant_confirm_action_error",
      message: error.message,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      error: "Error confirmando la acción"
    });
  }
});

app.listen(port, () => {
  console.log(`Assistant backend escuchando en http://localhost:${port}`);
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
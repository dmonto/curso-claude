import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { getUserContext } from "./data/mock-user-context.js";
import {
  appendTurn,
  buildConversationContext,
  updateConversationSummary
} from "./data/conversation-store.js";
import { sendOk, sendError, getRequestId } from "./services/api-response.js";
import { generateAssistantAnswer } from "./services/assistant-model-service.js";
import { getOrderById, getRecentOrdersForUser } from "./services/order-service.js";
import { getTicketsForOrder, createTicket } from "./services/ticket-service.js";
import {
  createPendingAction,
  getActionById,
  markActionCompleted,
  markActionCancelled,
  serializeActionForClient
} from "./services/action-service.js";
import { buildAssistantContext } from "./services/context-builder-service.js";
import { writeAuditEvent } from "./services/audit-service.js";
import { getAuditEvents } from "./services/audit-service.js";
import { checkRateLimit } from "./services/rate-limit-service.js";
import { withTimeout } from "./services/timeout-service.js";
import {
  recordMetricEvent,
  getMetricsSnapshot
} from "./services/metrics-service.js";
import {
  createAssistantSession,
  getAssistantSession,
  validateAssistantSession,
  touchAssistantSession,
  closeAssistantSession,
  serializeSessionForClient
} from "./services/session-service.js";

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
    const { requestId, userId, sessionId, message, clientContext } = req.body;
    const sessionValidation = validateAssistantSession({
    sessionId,
    userId
    });

    if (!sessionValidation.valid) {
    const httpStatus =
        sessionValidation.code === "SESSION_FORBIDDEN"
        ? 403
        : sessionValidation.code === "SESSION_EXPIRED"
            ? 401
            : 404;

    return sendError(
        res,
        req,
        httpStatus,
        sessionValidation.code,
        sessionValidation.message
    );
    }

    touchAssistantSession(sessionId, {
    currentPage: clientContext?.currentPage || null,
    selectedEntityType: clientContext?.selectedEntityType || null,
    selectedEntityId: clientContext?.selectedEntityId || null,
    locale: clientContext?.locale || "es-ES"
    });
    if (!userId || !sessionId || !message) {
    return sendError(
        res,
        req,
        400,
        "VALIDATION_ERROR",
        "userId, sessionId y message son obligatorios"
    );
    }

    const rateLimit = checkRateLimit({
    key: `assistant-message:${userId}`,
    limit: 10,
    windowMs: 60_000
    });

    if (!rateLimit.allowed) {
    return sendError(
        res,
        req,
        429,
        "RATE_LIMIT_EXCEEDED",
        "Has enviado demasiados mensajes en poco tiempo. Espera unos segundos antes de reintentar.",
        {
        resetAt: rateLimit.resetAt
        }
    );
    }    
    const userContext = getUserContext(userId);

    if (!userContext) {
      return res.status(404).json({
        error: "Usuario no encontrado"
      });
    }

const selectedOrderId = clientContext?.selectedEntityId;
const selectedOrder = selectedOrderId
  ? getOrderById(selectedOrderId, userId)
  : null;

const relatedTickets = selectedOrderId
  ? getTicketsForOrder(selectedOrderId, userId)
  : [];


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
    appendTurn(sessionId, "user", message);
    const conversationContext = buildConversationContext(sessionId);

    const modelInput = buildAssistantContext({
    userId,
    userContext,
    conversationContext,
    clientContext,
    message,
    requestId
    });

    const answer = await withTimeout(
    generateAssistantAnswer({
        systemPrompt,
        modelInput
    }),
    20_000,
    "La llamada al modelo ha superado el tiempo máximo permitido"
    );

    const elapsedMs = Date.now() - startedAt;

    recordMetricEvent({
    type: "assistant_message",
    requestId,
    userId,
    sessionId,
    elapsedMs
    });

    appendTurn(sessionId, "assistant", answer);

    let pendingAction = null;

    if (actionIntent?.type === "create_ticket") {
    const selectedOrder = modelInput.data.selectedOrder;

    if (!selectedOrder) {
        return sendError(
        res,
        req,
        400,
        "MISSING_SELECTED_ORDER",
        "No hay un pedido válido sobre el que crear la incidencia"
        );
    }

    const pendingAction = createPendingAction({
        type: "create_ticket",
        userId,
        sessionId,
        title: "Crear incidencia",
        description: `Crear una incidencia sobre el pedido ${selectedOrder.id}`,
        payload: {
        orderId: selectedOrder.id,
        subject: `Incidencia sobre pedido ${selectedOrder.id}`,
        description: answer
        }
    });

    writeAuditEvent({
        event: "assistant_action_proposed",
        requestId,
        userId,
        sessionId,
        actionId: pendingAction.actionId,
        actionType: pendingAction.type,
        orderId: selectedOrder.id
    });

    return sendOk(res, req, {
        sessionId,
        messageId: `msg-${Date.now()}`,
        answer:
        answer +
        "\n\nHe preparado una acción pendiente. Revísala antes de confirmar.",
        pendingAction: serializeActionForClient(pendingAction),
        elapsedMs
    });
    }

    const newSummary = createSimpleSummary(
    conversationContext.summary,
    message,
    answer,
    req.body.clientContext
    );

    updateConversationSummary(sessionId, newSummary);

        writeAuditEvent({
    event: "assistant_message_processed",
    requestId,
    userId,
    sessionId,
    selectedEntityId: clientContext?.selectedEntityId || null,
    serviceAccess: modelInput.serviceAccess,
    elapsedMs
    });
    
    console.log({
      event: "assistant_message",
      userId,
      sessionId,
      elapsedMs,
      inputLength: message.length,
      timestamp: new Date().toISOString()
    });

    return sendOk(res, req, {
    sessionId,
    answer,
    pendingAction: pendingAction,
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
        return sendError(
        res,
        req,
        403,
        "FORBIDDEN",
        "El usuario no tiene permiso para crear incidencias"
        );
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
        const createdTicket = createTicket({
        userId,
        orderId: pendingAction.payload.orderId,
        subject: pendingAction.payload.subject,
        description: pendingAction.payload.description
        });

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

        return sendOk(res, req, {
        sessionId,
        messageId: `msg-${Date.now()}`,
        answer:
            answer +
            "\n\nHe preparado una acción pendiente. Revísala antes de confirmar.",
        pendingAction: serializeActionForClient(pendingAction),
        elapsedMs
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

app.get("/api/assistant/sessions/:sessionId/context", (req, res) => {
  const { sessionId } = req.params;

  const conversationContext = buildConversationContext(sessionId);

  res.json({
    sessionId,
    conversationContext
  });
});
app.get("/api/orders/:orderId", (req, res) => {
  const { orderId } = req.params;
  const userId = req.query.userId || "user-001";

  const order = getOrderById(orderId, userId);

  if (!order) {
    return sendError(
      res,
      req,
      404,
      "ORDER_NOT_FOUND",
      "Pedido no encontrado"
    );
  }

  return sendOk(res, req, {
    order
  });
});
app.post("/api/tickets", (req, res) => {
  const { userId, orderId, subject, description } = req.body;

  if (!userId || !orderId || !subject) {
    return sendError(
      res,
      req,
      400,
      "VALIDATION_ERROR",
      "userId, orderId y subject son obligatorios"
    );
  }

  const order = getOrderById(orderId, userId);

  if (!order) {
    return sendError(
      res,
      req,
      404,
      "ORDER_NOT_FOUND",
      "No se puede crear ticket sobre un pedido inexistente"
    );
  }

  const ticket = createTicket({
    userId,
    orderId,
    subject,
    description
  });

  return sendOk(
    res,
    req,
    {
      ticket
    },
    201
  );
});

app.get("/api/assistant/actions/:actionId", (req, res) => {
  const { actionId } = req.params;
  const userId = req.query.userId;

  const action = getActionById(actionId);

  if (!action) {
    return sendError(
      res,
      req,
      404,
      "ACTION_NOT_FOUND",
      "Acción no encontrada"
    );
  }

  if (userId && action.userId !== userId) {
    return sendError(
      res,
      req,
      403,
      "FORBIDDEN",
      "La acción no pertenece a este usuario"
    );
  }

  return sendOk(res, req, {
    action: serializeActionForClient(action)
  });
});
app.post("/api/assistant/actions/:actionId/confirm", (req, res) => {
  try {
    const { actionId } = req.params;
    const { userId, sessionId } = req.body;

    if (!userId || !sessionId) {
      return sendError(
        res,
        req,
        400,
        "VALIDATION_ERROR",
        "userId y sessionId son obligatorios"
      );
    }
    const sessionValidation = validateAssistantSession({
    sessionId,
    userId
    });

    if (!sessionValidation.valid) {
    return sendError(
        res,
        req,
        sessionValidation.code === "SESSION_FORBIDDEN" ? 403 : 401,
        sessionValidation.code,
        sessionValidation.message
    );
    }
    const action = getActionById(actionId);

    if (!action) {
      return sendError(
        res,
        req,
        404,
        "ACTION_NOT_FOUND",
        "Acción no encontrada"
      );
    }

    if (action.userId !== userId || action.sessionId !== sessionId) {
      return sendError(
        res,
        req,
        403,
        "FORBIDDEN",
        "La acción no pertenece a esta sesión"
      );
    }

    if (action.status !== "pending_confirmation") {
      return sendError(
        res,
        req,
        409,
        "ACTION_ALREADY_COMPLETED",
        "La acción ya no está pendiente"
      );
    }

    const userContext = getUserContext(userId);

    if (!userContext?.permissions?.includes("create_tickets")) {
      return sendError(
        res,
        req,
        403,
        "FORBIDDEN",
        "El usuario no tiene permiso para crear incidencias"
      );
    }

    if (action.type === "create_ticket") {
      const ticket = createTicket({
        userId,
        orderId: action.payload.orderId,
        subject: action.payload.subject,
        description: action.payload.description
      });

      const completedAction = markActionCompleted(actionId, ticket);

      console.log({
        event: "assistant_action_completed",
        userId,
        sessionId,
        actionId,
        actionType: action.type,
        ticketId: ticket.id,
        timestamp: new Date().toISOString()
      });
        writeAuditEvent({
        event: "assistant_action_completed",
        userId,
        sessionId,
        actionId,
        actionType: action.type,
        ticketId: ticket.id,
        orderId: action.payload.orderId
        });
      return sendOk(res, req, {
        action: serializeActionForClient(completedAction),
        result: ticket,
        message: "Incidencia creada correctamente."
      });
    }

    return sendError(
      res,
      req,
      400,
      "UNSUPPORTED_ACTION",
      "Tipo de acción no soportado"
    );
  } catch (error) {
    console.error({
      event: "assistant_action_confirm_error",
      message: error.message,
      timestamp: new Date().toISOString()
    });

    return sendError(
      res,
      req,
      500,
      "INTERNAL_ERROR",
      "Error confirmando la acción"
    );
  }
});


app.get("/api/assistant/capabilities", (req, res) => {
  return sendOk(res, req, {
    assistant: {
      supportsConversation: true,
      supportsPendingActions: true,
      supportsFeedback: true,
      supportsContextInspection: true
    },
    actions: [
      {
        type: "create_ticket",
        title: "Crear incidencia",
        requiresConfirmation: true
      }
    ],
    limits: {
      maxMessageLength: 2000,
      maxRecentTurns: 6
    }
  });
});

app.post("/api/assistant/feedback", (req, res) => {
  const { requestId, sessionId, messageId, rating, comment } = req.body;

  if (!sessionId || !messageId || !rating) {
    return sendError(
      res,
      req,
      400,
      "VALIDATION_ERROR",
      "sessionId, messageId y rating son obligatorios"
    );
  }

  const allowedRatings = ["positive", "negative"];

  if (!allowedRatings.includes(rating)) {
    return sendError(
      res,
      req,
      400,
      "VALIDATION_ERROR",
      "rating debe ser positive o negative"
    );
  }

  console.log({
    event: "assistant_feedback",
    requestId,
    sessionId,
    messageId,
    rating,
    comment: comment || null,
    timestamp: new Date().toISOString()
  });

  return sendOk(res, req, {
    message: "Feedback registrado correctamente."
  });
});

app.get("/api/audit/events", (req, res) => {
  return sendOk(res, req, {
    events: getAuditEvents()
  });
});

app.post("/api/assistant/sessions", (req, res) => {
  const { userId, clientContext } = req.body;

  if (!userId) {
    return sendError(
      res,
      req,
      400,
      "VALIDATION_ERROR",
      "userId es obligatorio"
    );
  }

  const userContext = getUserContext(userId);

  if (!userContext) {
    return sendError(
      res,
      req,
      404,
      "USER_NOT_FOUND",
      "Usuario no encontrado"
    );
  }

  const session = createAssistantSession({
    userId,
    metadata: {
      currentPage: clientContext?.currentPage || null,
      selectedEntityType: clientContext?.selectedEntityType || null,
      selectedEntityId: clientContext?.selectedEntityId || null,
      locale: clientContext?.locale || "es-ES"
    }
  });

  writeAuditEvent({
    event: "assistant_session_created",
    userId,
    sessionId: session.sessionId,
    metadata: session.metadata
  });

  return sendOk(
    res,
    req,
    {
      session: serializeSessionForClient(session)
    },
    201
  );
});
app.get("/api/assistant/metrics", (req, res) => {
  return sendOk(res, req, {
    metrics: getMetricsSnapshot()
  });
});
app.get("/api/assistant/sessions/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const userId = req.query.userId;

  if (!userId) {
    return sendError(
      res,
      req,
      400,
      "VALIDATION_ERROR",
      "userId es obligatorio"
    );
  }

  const validation = validateAssistantSession({ sessionId, userId });

  if (!validation.valid) {
    return sendError(
      res,
      req,
      validation.code === "SESSION_FORBIDDEN" ? 403 : 404,
      validation.code,
      validation.message
    );
  }

  return sendOk(res, req, {
    session: serializeSessionForClient(validation.session)
  });
});
app.delete("/api/assistant/sessions/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const userId = req.body?.userId || req.query?.userId;

  if (!userId) {
    return sendError(
      res,
      req,
      400,
      "VALIDATION_ERROR",
      "userId es obligatorio"
    );
  }

  const result = closeAssistantSession({ sessionId, userId });

  if (!result.valid) {
    return sendError(
      res,
      req,
      result.code === "SESSION_FORBIDDEN" ? 403 : 404,
      result.code,
      result.message
    );
  }

  writeAuditEvent({
    event: "assistant_session_closed",
    userId,
    sessionId
  });

  return sendOk(res, req, {
    session: serializeSessionForClient(result.session),
    message: "Sesión cerrada correctamente."
  });
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

function createSimpleSummary(previousSummary, message, answer, clientContext) {
  const selectedEntity = clientContext?.selectedEntityId
    ? `Entidad seleccionada: ${clientContext.selectedEntityId}.`
    : "Sin entidad seleccionada.";

  return `
${selectedEntity}
Última intención del usuario: ${message}
Última respuesta del asistente: ${answer.slice(0, 300)}
`.trim();
}
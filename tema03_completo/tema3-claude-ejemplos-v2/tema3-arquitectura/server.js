import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { getUserContext, serializeUserContextForClient } from "./data/mock-user-context.js";
import {
  appendTurn,
  buildConversationContext,
  updateConversationSummary
} from "./data/conversation-store.js";

import { assistantConfig } from "./services/assistant-config.js";
import { sendOk, sendError, getRequestId } from "./services/api-response.js";
import { generateAssistantAnswer } from "./services/assistant-model-service.js";
import { getOrderById } from "./services/order-service.js";
import { getTicketsForOrder, createTicket } from "./services/ticket-service.js";
import {
  createPendingAction,
  getActionById,
  markActionCompleted,
  markActionCancelled,
  serializeActionForClient
} from "./services/action-service.js";
import { buildAssistantContext } from "./services/context-builder-service.js";
import { writeAuditEvent, getAuditEvents } from "./services/audit-service.js";
import { checkRateLimit } from "./services/rate-limit-service.js";
import { withTimeout } from "./services/timeout-service.js";
import { recordMetricEvent, getMetricsSnapshot } from "./services/metrics-service.js";
import {
  createAssistantSession,
  validateAssistantSession,
  touchAssistantSession,
  closeAssistantSession,
  serializeSessionForClient
} from "./services/session-service.js";
import { getArchitectureChecks } from "./services/architecture-check-service.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

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

function systemPrompt() {
  return `
Eres un asistente integrado en una aplicación web de gestión de pedidos e incidencias.

Reglas:
- Responde de forma clara y breve.
- Usa solo el contexto proporcionado.
- No inventes pedidos, tickets ni estados.
- Si falta información, dilo.
- No ejecutes acciones reales.
- Puedes sugerir el siguiente paso al usuario.
- Si se propone una acción sensible, la aplicación pedirá confirmación fuera del modelo.
`;
}

app.get("/health", (req, res) => {
  return sendOk(res, req, {
    status: "ok",
    service: "assistant-backend",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/users/:userId/context", (req, res) => {
  const userContext = getUserContext(req.params.userId);

  if (!userContext) {
    return sendError(res, req, 404, "USER_NOT_FOUND", "Usuario no encontrado");
  }

  return sendOk(res, req, {
    user: serializeUserContextForClient(userContext)
  });
});

app.get("/api/assistant/capabilities", (req, res) => {
  return sendOk(res, req, {
    assistant: {
      name: assistantConfig.assistantName,
      apiVersion: assistantConfig.apiVersion,
      capabilities: assistantConfig.capabilities
    },
    actions: assistantConfig.actions.map((action) => ({
      type: action.type,
      title: action.title,
      requiresConfirmation: action.requiresConfirmation
    })),
    limits: {
      maxMessageLength: assistantConfig.limits.maxMessageLength,
      maxRecentTurns: assistantConfig.limits.maxRecentTurns,
      modelTimeoutMs: assistantConfig.limits.modelTimeoutMs,
      rateLimitPerMinute: assistantConfig.limits.rateLimitPerMinute
    }
  });
});

app.post("/api/assistant/sessions", (req, res) => {
  const { userId, clientContext } = req.body;

  if (!userId) {
    return sendError(res, req, 400, "VALIDATION_ERROR", "userId es obligatorio");
  }

  const userContext = getUserContext(userId);

  if (!userContext) {
    return sendError(res, req, 404, "USER_NOT_FOUND", "Usuario no encontrado");
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
    requestId: getRequestId(req),
    userId,
    sessionId: session.sessionId,
    metadata: session.metadata
  });

  return sendOk(res, req, {
    session: serializeSessionForClient(session)
  }, 201);
});

app.get("/api/assistant/sessions/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const userId = req.query.userId;

  if (!userId) {
    return sendError(res, req, 400, "VALIDATION_ERROR", "userId es obligatorio");
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
    return sendError(res, req, 400, "VALIDATION_ERROR", "userId es obligatorio");
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
    requestId: getRequestId(req),
    userId,
    sessionId
  });

  return sendOk(res, req, {
    session: serializeSessionForClient(result.session),
    message: "Sesión cerrada correctamente."
  });
});

app.get("/api/assistant/sessions/:sessionId/context", (req, res) => {
  const { sessionId } = req.params;

  return sendOk(res, req, {
    sessionId,
    conversationContext: buildConversationContext(sessionId)
  });
});

app.get("/api/orders/:orderId", (req, res) => {
  const { orderId } = req.params;
  const userId = req.query.userId || "user-001";

  const order = getOrderById(orderId, userId);

  if (!order) {
    return sendError(res, req, 404, "ORDER_NOT_FOUND", "Pedido no encontrado");
  }

  return sendOk(res, req, { order });
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

  const ticket = createTicket({ userId, orderId, subject, description });

  return sendOk(res, req, { ticket }, 201);
});

app.post("/api/assistant/message", async (req, res) => {
  const startedAt = Date.now();
  const requestId = getRequestId(req);
  let userId = null;
  let sessionId = null;

  try {
    const payload = req.body;
    userId = payload.userId;
    sessionId = payload.sessionId;
    const { message, clientContext } = payload;

    if (!userId || !sessionId || !message) {
      return sendError(
        res,
        req,
        400,
        "VALIDATION_ERROR",
        "userId, sessionId y message son obligatorios"
      );
    }

    if (message.length > assistantConfig.limits.maxMessageLength) {
      return sendError(
        res,
        req,
        400,
        "MESSAGE_TOO_LONG",
        `El mensaje no puede superar ${assistantConfig.limits.maxMessageLength} caracteres`
      );
    }

    const sessionValidation = validateAssistantSession({ sessionId, userId });

    if (!sessionValidation.valid) {
      const httpStatus =
        sessionValidation.code === "SESSION_FORBIDDEN"
          ? 403
          : sessionValidation.code === "SESSION_EXPIRED"
            ? 401
            : 404;

      return sendError(res, req, httpStatus, sessionValidation.code, sessionValidation.message);
    }

    touchAssistantSession(sessionId, {
      currentPage: clientContext?.currentPage || null,
      selectedEntityType: clientContext?.selectedEntityType || null,
      selectedEntityId: clientContext?.selectedEntityId || null,
      locale: clientContext?.locale || "es-ES"
    });

    const rateLimit = checkRateLimit({
      key: `assistant-message:${userId}`,
      limit: assistantConfig.limits.rateLimitPerMinute,
      windowMs: 60_000
    });

    res.setHeader("X-RateLimit-Remaining", rateLimit.remaining);
    res.setHeader("X-RateLimit-Reset", rateLimit.resetAt);

    if (!rateLimit.allowed) {
      return sendError(
        res,
        req,
        429,
        "RATE_LIMIT_EXCEEDED",
        "Has enviado demasiados mensajes en poco tiempo. Espera unos segundos antes de reintentar.",
        { resetAt: rateLimit.resetAt }
      );
    }

    const userContext = getUserContext(userId);

    if (!userContext) {
      return sendError(res, req, 404, "USER_NOT_FOUND", "Usuario no encontrado");
    }

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
        systemPrompt: systemPrompt(),
        modelInput
      }),
      assistantConfig.limits.modelTimeoutMs,
      "MODEL_TIMEOUT"
    );

    appendTurn(sessionId, "assistant", answer);

    const newSummary = createSimpleSummary(
      conversationContext.summary,
      message,
      answer,
      clientContext
    );

    updateConversationSummary(sessionId, newSummary);

    const elapsedMs = Date.now() - startedAt;
    const actionIntent = detectActionIntent(message);
    const messageId = `msg-${Date.now()}`;

    writeAuditEvent({
      event: "assistant_message_processed",
      requestId,
      userId,
      sessionId,
      messageId,
      selectedEntityId: clientContext?.selectedEntityId || null,
      serviceAccess: modelInput.serviceAccess,
      elapsedMs
    });

    recordMetricEvent({
      type: "assistant_message",
      requestId,
      userId,
      sessionId,
      elapsedMs
    });

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

      recordMetricEvent({
        type: "action_proposed",
        requestId,
        userId,
        sessionId,
        actionType: pendingAction.type
      });

      return sendOk(res, req, {
        sessionId,
        messageId,
        answer: `${answer}\n\nHe preparado una acción pendiente. Revísala antes de confirmar.`,
        pendingAction: serializeActionForClient(pendingAction),
        elapsedMs
      });
    }

    return sendOk(res, req, {
      sessionId,
      messageId,
      answer,
      pendingAction: null,
      elapsedMs
    });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;

    if (error.message === "MODEL_TIMEOUT") {
      recordMetricEvent({
        type: "model_timeout",
        requestId,
        userId,
        sessionId,
        elapsedMs
      });

      return sendError(
        res,
        req,
        504,
        "MODEL_TIMEOUT",
        "El asistente está tardando más de lo esperado. Inténtalo de nuevo en unos segundos."
      );
    }

    recordMetricEvent({
      type: "assistant_error",
      requestId,
      userId,
      sessionId,
      message: error.message
    });

    console.error({
      event: "assistant_error",
      requestId,
      message: error.message,
      timestamp: new Date().toISOString()
    });

    return sendError(
      res,
      req,
      500,
      "INTERNAL_ERROR",
      "Error procesando el mensaje del asistente"
    );
  }
});

app.get("/api/assistant/actions/:actionId", (req, res) => {
  const { actionId } = req.params;
  const userId = req.query.userId;

  const action = getActionById(actionId);

  if (!action) {
    return sendError(res, req, 404, "ACTION_NOT_FOUND", "Acción no encontrada");
  }

  if (userId && action.userId !== userId) {
    return sendError(res, req, 403, "FORBIDDEN", "La acción no pertenece a este usuario");
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
      return sendError(res, req, 400, "VALIDATION_ERROR", "userId y sessionId son obligatorios");
    }

    const sessionValidation = validateAssistantSession({ sessionId, userId });

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
      return sendError(res, req, 404, "ACTION_NOT_FOUND", "Acción no encontrada");
    }

    if (action.userId !== userId || action.sessionId !== sessionId) {
      return sendError(res, req, 403, "FORBIDDEN", "La acción no pertenece a esta sesión");
    }

    if (action.status !== "pending_confirmation") {
      return sendError(res, req, 409, "ACTION_ALREADY_COMPLETED", "La acción ya no está pendiente");
    }

    const userContext = getUserContext(userId);

    if (!userContext?.permissions?.includes("create_tickets")) {
      writeAuditEvent({
        event: "assistant_action_denied",
        requestId: getRequestId(req),
        userId,
        sessionId,
        actionId,
        actionType: action.type,
        reason: "missing_permission"
      });

      return sendError(res, req, 403, "FORBIDDEN", "El usuario no tiene permiso para crear incidencias");
    }

    if (action.type === "create_ticket") {
      const ticket = createTicket({
        userId,
        orderId: action.payload.orderId,
        subject: action.payload.subject,
        description: action.payload.description
      });

      const completedAction = markActionCompleted(actionId, ticket);

      writeAuditEvent({
        event: "assistant_action_completed",
        requestId: getRequestId(req),
        userId,
        sessionId,
        actionId,
        actionType: action.type,
        ticketId: ticket.id,
        orderId: action.payload.orderId
      });

      recordMetricEvent({
        type: "action_completed",
        userId,
        sessionId,
        actionId,
        actionType: action.type
      });

      return sendOk(res, req, {
        action: serializeActionForClient(completedAction),
        result: ticket,
        message: "Incidencia creada correctamente."
      });
    }

    return sendError(res, req, 400, "UNSUPPORTED_ACTION", "Tipo de acción no soportado");
  } catch (error) {
    return sendError(res, req, 500, "INTERNAL_ERROR", "Error confirmando la acción");
  }
});

app.post("/api/assistant/actions/:actionId/cancel", (req, res) => {
  const { actionId } = req.params;
  const { userId, sessionId } = req.body;

  if (!userId || !sessionId) {
    return sendError(res, req, 400, "VALIDATION_ERROR", "userId y sessionId son obligatorios");
  }

  const sessionValidation = validateAssistantSession({ sessionId, userId });

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
    return sendError(res, req, 404, "ACTION_NOT_FOUND", "Acción no encontrada");
  }

  if (action.userId !== userId || action.sessionId !== sessionId) {
    return sendError(res, req, 403, "FORBIDDEN", "La acción no pertenece a esta sesión");
  }

  if (action.status !== "pending_confirmation") {
    return sendError(res, req, 409, "ACTION_ALREADY_COMPLETED", "La acción ya no está pendiente");
  }

  const cancelledAction = markActionCancelled(actionId);

  writeAuditEvent({
    event: "assistant_action_cancelled",
    requestId: getRequestId(req),
    userId,
    sessionId,
    actionId,
    actionType: action.type
  });

  recordMetricEvent({
    type: "action_cancelled",
    userId,
    sessionId,
    actionId,
    actionType: action.type
  });

  return sendOk(res, req, {
    action: serializeActionForClient(cancelledAction),
    message: "Acción cancelada correctamente."
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
    return sendError(res, req, 400, "VALIDATION_ERROR", "rating debe ser positive o negative");
  }

  writeAuditEvent({
    event: "assistant_feedback",
    requestId,
    sessionId,
    messageId,
    rating,
    comment: comment || null
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

app.get("/api/assistant/metrics", (req, res) => {
  return sendOk(res, req, {
    metrics: getMetricsSnapshot()
  });
});

app.get("/api/assistant/architecture", (req, res) => {
  return sendOk(res, req, {
    architecture: getArchitectureChecks()
  });
});

app.listen(port, () => {
  console.log(`Assistant backend escuchando en http://localhost:${port}`);
  console.log(`Modo mock: ${process.env.USE_MOCK_MODEL !== "false" || !process.env.ANTHROPIC_API_KEY}`);
});

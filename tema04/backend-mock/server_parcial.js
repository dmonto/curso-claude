import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import http from "node:http";
import { WebSocketServer } from "ws";

const app = express();

app.use(cors({ origin: "http://localhost:4200" }));
app.use(express.json());

const tickets = {
  "INC-1024": {
    id: "INC-1024",
    title: "Errores intermitentes en autorización de pagos",
    status: "open",
    priority: "high",
    service: "payments-api",
    customerImpact: "Algunos usuarios no pueden completar pagos con tarjeta.",
    missingData: [
      "logs de la pasarela externa",
      "hora exacta de los últimos fallos",
      "confirmación de si afecta a todos los métodos de pago"
    ]
  },
  "INC-2048": {
    id: "INC-2048",
    title: "Latencia alta en búsqueda de pedidos",
    status: "investigating",
    priority: "medium",
    service: "orders-api",
    customerImpact: "La búsqueda tarda más de lo habitual en horario pico.",
    missingData: [
      "métricas de base de datos",
      "traza de endpoint /orders/search"
    ]
  }
};

const knowledgeBase = [
  {
    id: "kb-001",
    title: "Runbook de incidencias en pagos",
    service: "payments-api",
    content: "Revisar errores 5xx, timeouts de pasarela, tasa de rechazo y últimas versiones desplegadas."
  },
  {
    id: "kb-002",
    title: "Runbook de latencia en pedidos",
    service: "orders-api",
    content: "Revisar consultas lentas, índices, caché y saturación de base de datos."
  }
];

const auditEvents = [];

function createCorrelationId() {
  return `corr-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function getTicketById(ticketId) {
  return tickets[ticketId] || null;
}

function searchKnowledge(query, service) {
  const normalizedQuery = query.toLowerCase();

  return knowledgeBase.filter(item => {
    const matchesService = service ? item.service === service : true;
    const matchesText =
      item.title.toLowerCase().includes(normalizedQuery) ||
      item.content.toLowerCase().includes(normalizedQuery) ||
      item.service.toLowerCase().includes(normalizedQuery);

    return matchesService || matchesText;
  });
}

function writeAuditEvent(event) {
  auditEvents.push({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...event
  });
}

app.get("/api/tickets/:id", (req, res) => {
  const ticket = getTicketById(req.params.id);

  if (!ticket) {
    return res.status(404).json({
      error: "ticket_not_found",
      message: "No existe el ticket solicitado"
    });
  }

  res.json(ticket);
});

app.get("/api/knowledge/search", (req, res) => {
  const q = String(req.query.q || "");
  const service = req.query.service ? String(req.query.service) : undefined;

  if (!q.trim() && !service) {
    return res.status(400).json({
      error: "query_required",
      message: "Debes indicar q o service"
    });
  }

  res.json({
    results: searchKnowledge(q, service)
  });
});

app.post("/api/audit/events", (req, res) => {
  writeAuditEvent(req.body);
  res.status(201).json({ ok: true });
});

app.get("/api/audit/events", (req, res) => {
  res.json({ events: auditEvents });
});

app.post("/api/assistant/messages", async (req, res) => {
  const correlationId = createCorrelationId();
  const { conversationId, message, screenContext } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      error: "message_required",
      message: "El campo message es obligatorio",
      correlationId
    });
  }

  if (message.toLowerCase().includes("error")) {
    return res.status(500).json({
      error: "simulated_error",
      message: "Error simulado del backend",
      correlationId
    });
  }

  const activeConversationId = conversationId || crypto.randomUUID();

  res.json(
    generateReply({
      conversationId: activeConversationId,
      message,
      screenContext,
      correlationId
    })
  );
});

app.post("/api/assistant/conversations/:id/retry", (req, res) => {
  const correlationId = createCorrelationId();
  const conversation = conversations.get(req.params.id);
  const { screenContext } = req.body ?? {};

  const lastUserIndex = conversation
    ? conversation.messages.findLastIndex(item => item.role === "user")
    : -1;

  if (lastUserIndex === -1) {
    return res.status(404).json({
      error: "nothing_to_retry",
      message: "No hay ningún mensaje de usuario que reintentar",
      correlationId
    });
  }

  const lastUserMessage = conversation.messages[lastUserIndex];

  if (lastUserMessage.content.toLowerCase().includes("error")) {
    return res.status(500).json({
      error: "simulated_error",
      message: "Error simulado del backend",
      correlationId
    });
  }

  // Descarta las respuestas del asistente posteriores al último mensaje de usuario
  conversation.messages.splice(lastUserIndex + 1);
  conversation.updatedAt = new Date().toISOString();

  res.json(
    generateReply({
      conversationId: conversation.conversationId,
      message: lastUserMessage.content,
      screenContext,
      correlationId,
      existingUserMessage: lastUserMessage
    })
  );
});

function generateReply({
  conversationId: activeConversationId,
  message,
  screenContext,
  correlationId,
  existingUserMessage
}) {
  const entityId = screenContext?.entity?.id || screenContext?.entityId;
  const entityType = screenContext?.entity?.type || screenContext?.entityType;
  const ticket = entityId ? getTicketById(entityId) : null;
  const knowledge = ticket
    ? searchKnowledge(message, ticket.service)
    : searchKnowledge(message);

  if (!existingUserMessage) {
    appendMessage(activeConversationId, {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
      status: "sent"
    });
  }

  let content = "";

  if (ticket) {
    content = [
      `Ticket ${ticket.id}: ${ticket.title}`,
      `Estado: ${ticket.status}`,
      `Prioridad: ${ticket.priority}`,
      `Servicio afectado: ${ticket.service}`,
      "",
      `Impacto: ${ticket.customerImpact}`,
      "",
      "Datos que faltan para escalar correctamente:",
      ...ticket.missingData.map(item => `- ${item}`),
      "",
      knowledge.length > 0
        ? `Runbook relacionado: ${knowledge[0].title}. ${knowledge[0].content}`
        : "No he encontrado un runbook relacionado."
    ].join("\n");
  } else {
    content = [
      "No hay una entidad activa en pantalla.",
      "Puedo ayudarte con preguntas generales, pero para analizar un ticket necesito que Angular envíe entityType y entityId en el contexto."
    ].join("\n");
  }

const suggestedActions = ticket
  ? [
      {
        id: "open-ticket-history",
        label: "Abrir histórico del ticket",
        type: "navigate",
        risk: "low",
        description: "Abre la vista de histórico del ticket.",
        payload: {
          url: `/tickets/${ticket.id}/history`
        }
      },
      {
        id: "prepare-escalation",
        label: "Preparar escalado",
        type: "confirm_backend_action",
        risk: "medium",
        description:
          "Genera un borrador de escalado. No modifica el ticket sin confirmación adicional.",
        payload: {
          ticketId: ticket.id,
          action: "prepare_escalation"
        }
      }
    ]
  : [];

  const assistantMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
    status: "sent"
  };

  const conversation = appendMessage(activeConversationId, assistantMessage); 

  writeAuditEvent({
    type: "assistant_message",
    correlationId,
    conversationId: activeConversationId,
    route: screenContext?.route,
    entityType,
    entityId,
    messageLength: message.length,
    usedTicket: Boolean(ticket),
    usedKnowledge: knowledge.map(item => item.id),
    retried: Boolean(existingUserMessage)
  });

  return {
    conversationId: activeConversationId,
    message: assistantMessage,
    suggestedActions,
    meta: {
      correlationId,
      usedTools: [
        ticket ? "ticket_lookup" : null,
        knowledge.length > 0 ? "knowledge_search" : null,
        "audit_log",
        "conversation_store"
      ].filter(Boolean),
      messageCount: conversation.messages.length
    }
  };
}

app.get("/api/assistant/conversations/:id", (req, res) => {
  const conversation = conversations.get(req.params.id);

  if (!conversation) {
    return res.json({
      conversationId: req.params.id,
      messages: [],
      meta: {
        messageCount: 0
      }
    });
  }

  res.json({
    conversationId: conversation.conversationId,
    messages: conversation.messages,
    meta: {
      messageCount: conversation.messages.length
    }
  });
});

app.delete("/api/assistant/conversations/:id", (req, res) => {
  conversations.delete(req.params.id);

  writeAuditEvent({
    type: "conversation_deleted",
    conversationId: req.params.id,
    correlationId: createCorrelationId()
  });

  res.json({ ok: true });
});

app.listen(3000, () => {
  console.log("Backend mock escuchando en http://localhost:3000");
});

const conversations = new Map();

function getConversation(conversationId) {
  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, {
      conversationId,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  return conversations.get(conversationId);
}

function appendMessage(conversationId, message) {
  const conversation = getConversation(conversationId);

  conversation.messages.push(message);
  conversation.updatedAt = new Date().toISOString();

  return conversation;
}
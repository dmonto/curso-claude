import express from "express";
import cors from "cors";
import crypto from "node:crypto";

const app = express();
const port = Number(process.env.PORT || 3000);

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
const conversations = new Map();

function createCorrelationId() {
  return `corr-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getTicketById(ticketId) {
  return tickets[ticketId] || null;
}

function searchKnowledge(query = "", service) {
  const normalizedQuery = String(query).toLowerCase();

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

function parseContext(screenContext = {}) {
  return {
    route: screenContext.route,
    pageKey: screenContext.pageKey,
    entityType: screenContext.entity?.type || screenContext.entityType,
    entityId: screenContext.entity?.id || screenContext.entityId,
    activeTab: screenContext.selection?.tab || screenContext.selectedFilters?.tab,
    locale: screenContext.client?.locale || screenContext.locale || "es-ES"
  };
}

function blocksToPlainText(blocks) {
  return blocks
    .map(block => {
      if (["summary", "paragraph", "warning"].includes(block.type)) {
        return [block.title, block.text].filter(Boolean).join("\n");
      }

      if (block.type === "bullet_list") {
        return [block.title, ...block.items.map(item => `- ${item}`)]
          .filter(Boolean)
          .join("\n");
      }

      if (block.type === "key_value") {
        return [block.title, ...block.items.map(item => `${item.key}: ${item.value}`)]
          .filter(Boolean)
          .join("\n");
      }

      if (block.type === "reference") {
        return [block.title, ...block.items.map(item => `- ${item.label} (${item.sourceId})`)]
          .filter(Boolean)
          .join("\n");
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildAssistantBlocks({ ticket, knowledge, context }) {
  if (!ticket) {
    return [
      {
        type: "paragraph",
        title: "Sin entidad activa",
        text: "No hay un ticket activo en pantalla. Puedo responder de forma general, pero para analizar un ticket necesito contexto de entidad."
      },
      {
        type: "warning",
        title: "Contexto insuficiente",
        text: "Revisa que Angular envíe entity.type y entity.id desde AssistantContextService."
      }
    ];
  }

  const blocks = [
    {
      type: "summary",
      title: "Resumen",
      text: `El ticket ${ticket.id} describe: ${ticket.title}.`
    },
    {
      type: "key_value",
      title: "Datos principales",
      items: [
        { key: "Ticket", value: ticket.id },
        { key: "Estado", value: ticket.status },
        { key: "Prioridad", value: ticket.priority },
        { key: "Servicio", value: ticket.service },
        { key: "Pantalla", value: context.pageKey || "desconocida" },
        { key: "Pestaña", value: context.activeTab || "sin pestaña" }
      ]
    },
    {
      type: "paragraph",
      title: "Impacto",
      text: ticket.customerImpact
    },
    {
      type: "bullet_list",
      title: "Datos pendientes para escalar",
      items: ticket.missingData
    }
  ];

  if (knowledge.length > 0) {
    blocks.push({
      type: "reference",
      title: "Referencias usadas",
      items: knowledge.map(item => ({
        label: item.title,
        sourceId: item.id,
        sourceType: "knowledge"
      }))
    });
  } else {
    blocks.push({
      type: "warning",
      title: "Sin runbook relacionado",
      text: "No se ha encontrado documentación interna relacionada con este servicio."
    });
  }

  return blocks;
}

function buildSuggestedActions(ticket) {
  if (!ticket) {
    return [];
  }

  return [
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
      description: "Genera un borrador de escalado. No modifica el ticket sin confirmación adicional.",
      payload: {
        ticketId: ticket.id,
        action: "prepare_escalation"
      }
    }
  ];
}

function buildAssistantMessage({ ticket, knowledge, context }) {
  const blocks = buildAssistantBlocks({ ticket, knowledge, context });

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: blocksToPlainText(blocks),
    blocks,
    createdAt: new Date().toISOString(),
    status: "sent"
  };
}

function handleErrorSimulation(message, correlationId, res) {
  const lower = String(message).toLowerCase();

  if (lower.includes("simula 403")) {
    res.status(403).json({
      error: "forbidden",
      message: "No tienes permisos para consultar este recurso",
      correlationId
    });
    return true;
  }

  if (lower.includes("simula 429")) {
    res.status(429).json({
      error: "rate_limited",
      message: "Demasiadas solicitudes",
      correlationId
    });
    return true;
  }

  if (lower.includes("simula 500") || lower.includes("provoca un error")) {
    res.status(500).json({
      error: "backend_error",
      message: "Error interno simulado",
      correlationId
    });
    return true;
  }

  if (lower.includes("bad response")) {
    res.json({
      conversationId: "bad-response-conv",
      message: null,
      suggestedActions: [],
      meta: {
        correlationId,
        usedTools: ["bad_response_simulation"]
      }
    });
    return true;
  }

  return false;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "tema04-backend-mock" });
});

app.get("/api/tickets/:id", (req, res) => {
  const ticket = getTicketById(req.params.id);

  if (!ticket) {
    return res.status(404).json({
      error: "ticket_not_found",
      message: "No existe el ticket solicitado",
      correlationId: createCorrelationId()
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
      message: "Debes indicar q o service",
      correlationId: createCorrelationId()
    });
  }

  res.json({
    results: searchKnowledge(q, service)
  });
});

app.get("/api/audit/events", (_req, res) => {
  res.json({ events: auditEvents });
});

app.post("/api/audit/events", (req, res) => {
  writeAuditEvent(req.body);
  res.status(201).json({ ok: true });
});

app.get("/api/assistant/conversations", (_req, res) => {
  const result = Array.from(conversations.values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(conversation => {
      const firstUserMessage = conversation.messages.find(m => m.role === "user");

      return {
        conversationId: conversation.conversationId,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messages.length,
        title: firstUserMessage ? firstUserMessage.content.slice(0, 40) : "Nueva conversación"
      };
    });

  res.json({ conversations: result });
});

app.get("/api/assistant/conversations/:id", (req, res) => {
  const conversation = conversations.get(req.params.id);

  if (!conversation) {
    return res.json({
      conversationId: req.params.id,
      messages: [],
      meta: { messageCount: 0 }
    });
  }

  res.json({
    conversationId: conversation.conversationId,
    messages: conversation.messages,
    meta: { messageCount: conversation.messages.length }
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

app.post("/api/assistant/messages", async (req, res) => {
  const correlationId = createCorrelationId();
  const { conversationId, message, screenContext = {} } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      error: "message_required",
      message: "El campo message es obligatorio",
      correlationId
    });
  }

  if (String(message).toLowerCase().includes("timeout")) {
    await wait(60000);
  }

  if (handleErrorSimulation(message, correlationId, res)) {
    return;
  }

  const activeConversationId = conversationId || crypto.randomUUID();
  const context = parseContext(screenContext);
  const ticket = context.entityId ? getTicketById(context.entityId) : null;
  const knowledge = ticket
    ? searchKnowledge(message, ticket.service)
    : searchKnowledge(message);

  const userMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: message,
    createdAt: new Date().toISOString(),
    status: "sent"
  };

  appendMessage(activeConversationId, userMessage);

  const assistantMessage = buildAssistantMessage({ ticket, knowledge, context });
  const conversation = appendMessage(activeConversationId, assistantMessage);
  const suggestedActions = buildSuggestedActions(ticket);

  writeAuditEvent({
    type: "assistant_message",
    correlationId,
    conversationId: activeConversationId,
    route: context.route,
    pageKey: context.pageKey,
    entityType: context.entityType,
    entityId: context.entityId,
    activeTab: context.activeTab,
    messageLength: message.length,
    usedTicket: Boolean(ticket),
    usedKnowledge: knowledge.map(item => item.id)
  });

  res.json({
    conversationId: activeConversationId,
    message: assistantMessage,
    suggestedActions,
    meta: {
      correlationId,
      usedTools: [
        ticket ? "ticket_lookup" : null,
        knowledge.length > 0 ? "knowledge_search" : null,
        "conversation_store",
        "audit_log"
      ].filter(Boolean),
      messageCount: conversation.messages.length
    }
  });
});

app.get("/api/assistant/stream", async (req, res) => {
  const correlationId = createCorrelationId();
  const conversationId = String(req.query.conversationId || crypto.randomUUID());
  const message = String(req.query.message || "");
  const screenContext = {
    route: String(req.query.route || ""),
    pageKey: req.query.pageKey ? String(req.query.pageKey) : undefined,
    entity: req.query.entityType && req.query.entityId
      ? { type: String(req.query.entityType), id: String(req.query.entityId) }
      : undefined,
    selection: req.query.tab ? { tab: String(req.query.tab) } : undefined
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  function send(event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  if (!message) {
    send("assistant.error", {
      error: "message_required",
      message: "El campo message es obligatorio",
      correlationId
    });
    res.end();
    return;
  }

  if (message.toLowerCase().includes("provoca un error")) {
    send("assistant.error", {
      error: "simulated_stream_error",
      message: "Error simulado en SSE",
      correlationId
    });
    res.end();
    return;
  }

  const messageId = crypto.randomUUID();
  const context = parseContext(screenContext);
  const ticket = context.entityId ? getTicketById(context.entityId) : null;
  const knowledge = ticket ? searchKnowledge(message, ticket.service) : searchKnowledge(message);

  send("assistant.started", {
    conversationId,
    messageId,
    correlationId,
    createdAt: new Date().toISOString()
  });

  await wait(250);
  send("assistant.progress", { label: "Analizando contexto de pantalla" });

  await wait(300);
  send("assistant.progress", {
    label: ticket ? `Consultando ticket ${ticket.id}` : "No hay entidad activa en pantalla"
  });

  await wait(300);
  send("assistant.progress", { label: "Generando respuesta" });

  const assistantMessage = buildAssistantMessage({ ticket, knowledge, context });
  assistantMessage.id = messageId;

  const chunkSize = 28;
  for (let i = 0; i < assistantMessage.content.length; i += chunkSize) {
    await wait(50);
    send("assistant.delta", {
      conversationId,
      messageId,
      delta: assistantMessage.content.slice(i, i + chunkSize)
    });
  }

  appendMessage(conversationId, {
    id: crypto.randomUUID(),
    role: "user",
    content: message,
    createdAt: new Date().toISOString(),
    status: "sent"
  });
  const conversation = appendMessage(conversationId, assistantMessage);

  writeAuditEvent({
    type: "assistant_sse_message",
    correlationId,
    conversationId,
    route: context.route,
    entityId: context.entityId,
    messageLength: message.length,
    usedTicket: Boolean(ticket)
  });

  send("assistant.completed", {
    conversationId,
    message: assistantMessage,
    suggestedActions: buildSuggestedActions(ticket),
    meta: {
      correlationId,
      usedTools: [
        ticket ? "ticket_lookup" : null,
        knowledge.length > 0 ? "knowledge_search" : null,
        "sse_stream",
        "conversation_store",
        "audit_log"
      ].filter(Boolean),
      messageCount: conversation.messages.length
    }
  });

  res.end();
});

app.post("/api/tickets/:id/escalation-draft", (req, res) => {
  const correlationId = createCorrelationId();
  const ticket = getTicketById(req.params.id);

  if (!ticket) {
    return res.status(404).json({
      error: "ticket_not_found",
      message: "No existe el ticket solicitado",
      correlationId
    });
  }

  const draft = {
    ticketId: ticket.id,
    title: `Escalado: ${ticket.title}`,
    targetTeam: ticket.service === "payments-api" ? "Equipo de Pagos" : "Equipo Plataforma",
    summary: ticket.customerImpact,
    missingData: ticket.missingData,
    recommendedPriority: ticket.priority,
    requiresHumanConfirmation: true
  };

  writeAuditEvent({
    type: "escalation_draft_created",
    correlationId,
    ticketId: ticket.id,
    targetTeam: draft.targetTeam
  });

  res.status(201).json({
    draft,
    meta: { correlationId }
  });
});

app.post("/api/assistant/feedback", (req, res) => {
  const correlationId = createCorrelationId();
  const { conversationId, messageId, rating, reason } = req.body;

  if (!conversationId || !messageId || !rating) {
    return res.status(400).json({
      error: "invalid_feedback",
      message: "conversationId, messageId y rating son obligatorios",
      correlationId
    });
  }

  writeAuditEvent({
    type: "assistant_feedback",
    correlationId,
    conversationId,
    messageId,
    rating,
    reason: reason || null
  });

  res.status(201).json({
    ok: true,
    meta: { correlationId }
  });
});

app.listen(port, () => {
  console.log(`Backend mock escuchando en http://localhost:${port}`);
});

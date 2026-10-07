import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import http from "node:http";
import { WebSocketServer } from "ws";

const app = express();
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

  const userMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: message,
    createdAt: new Date().toISOString(),
    status: "sent"
  };

  const activeConversationId = conversationId || crypto.randomUUID();
  appendMessage(activeConversationId, userMessage);
const entityId =
  screenContext?.entity?.id ||
  screenContext?.entityId;

const entityType =
  screenContext?.entity?.type ||
  screenContext?.entityType;

  const pageKey = screenContext?.pageKey;
  const activeTab = screenContext?.selection?.tab;
    
  const ticket = entityId ? getTicketById(entityId) : null;
  const knowledge = ticket
    ? searchKnowledge(message, ticket.service)
    : searchKnowledge(message);

  let content = "";
const lowerMessage = message.toLowerCase();

if (lowerMessage.includes("401")) {
  return res.status(401).json({
    error: "unauthorized",
    message: "Sesión caducada",
    correlationId
  });
}

if (lowerMessage.includes("403")) {
  return res.status(403).json({
    error: "forbidden",
    message: "No tienes permisos para consultar este recurso",
    correlationId
  });
}

if (lowerMessage.includes("404")) {
  return res.status(404).json({
    error: "not_found",
    message: "Entidad no encontrada",
    correlationId
  });
}

if (lowerMessage.includes("429")) {
  return res.status(429).json({
    error: "rate_limited",
    message: "Demasiadas solicitudes",
    correlationId
  });
}

if (lowerMessage.includes("500")) {
  return res.status(500).json({
    error: "backend_error",
    message: "Error interno simulado",
    correlationId
  });
}

if (lowerMessage.includes("bad response")) {
  return res.json({
    conversationId: activeConversationId,
    message: null,
    suggestedActions: [],
    meta: {
      correlationId,
      usedTools: ["bad_response_simulation"]
    }
  });
}

if (lowerMessage.includes("timeout")) {
  await wait(60000);
}

if (ticket) {
  content = [
    `Estás trabajando en la pantalla ${pageKey || "desconocida"}.`,
    activeTab ? `Pestaña activa: ${activeTab}.` : null,
    "",
    `Ticket ${ticket.id}: ${ticket.title}`,
    `Estado: ${ticket.status}`,
    `Prioridad: ${ticket.priority}`,
    `Servicio afectado: ${ticket.service}`,
    "",
    `Impacto: ${ticket.customerImpact}`,
    "",
    "Datos que faltan para escalar correctamente:",
    ...ticket.missingData.map(item => `- ${item}`)
  ].filter(Boolean).join("\n");
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

writeAuditEvent({
  type: "assistant_message",
  correlationId,
  conversationId: activeConversationId,
  route: screenContext?.route,
  pageKey,
  entityType,
  entityId,
  activeTab,
  messageLength: message.length,
  usedTicket: Boolean(ticket)
});

const blocks = buildAssistantBlocks({
  ticket,
  knowledge,
  pageKey,
  activeTab
});

const assistantMessage = {
  id: crypto.randomUUID(),
  role: "assistant",
  content: blocksToPlainText(blocks),
  blocks,
  createdAt: new Date().toISOString(),
  status: "sent"
};

const conversation = appendMessage(activeConversationId, assistantMessage);

res.json({
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
});
});

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

const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: "/ws/assistant"
});

server.listen(3000, () => {
  console.log("Backend mock escuchando en http://localhost:3000");
  console.log("WebSocket disponible en ws://localhost:3000/ws/assistant");
});

function sendWsEvent(ws, event) {
  if (ws.readyState !== ws.OPEN) {
    return;
  }

  ws.send(JSON.stringify(event));
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function splitTextIntoChunks(text, chunkSize = 24) {
  const chunks = [];

  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  return chunks;
}

wss.on("connection", (ws) => {
  sendWsEvent(ws, {
    type: "connection.ready",
    createdAt: new Date().toISOString()
  });

  ws.on("message", async (raw) => {
    let request;

    try {
      request = JSON.parse(raw.toString());
    } catch {
      sendWsEvent(ws, {
        type: "assistant.error",
        error: "invalid_json",
        message: "El mensaje WebSocket no contiene JSON válido"
      });
      return;
    }

    if (request.type !== "assistant.message") {
      sendWsEvent(ws, {
        type: "assistant.error",
        error: "unsupported_event",
        message: "Tipo de evento no soportado"
      });
      return;
    }

    const correlationId = createCorrelationId();
    const conversationId = request.conversationId || crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const userText = String(request.message || "").trim();
    const screenContext = request.screenContext || {};

    if (!userText) {
      sendWsEvent(ws, {
        type: "assistant.error",
        error: "message_required",
        message: "El campo message es obligatorio",
        correlationId
      });
      return;
    }

    if (userText.toLowerCase().includes("error")) {
      sendWsEvent(ws, {
        type: "assistant.error",
        error: "simulated_error",
        message: "Error simulado en canal WebSocket",
        correlationId
      });
      return;
    }

    appendMessage(conversationId, {
      id: crypto.randomUUID(),
      role: "user",
      content: userText,
      createdAt: new Date().toISOString(),
      status: "sent"
    });

    sendWsEvent(ws, {
      type: "assistant.started",
      conversationId,
      messageId,
      correlationId,
      createdAt: new Date().toISOString()
    });

    await wait(250);

    sendWsEvent(ws, {
      type: "assistant.progress",
      conversationId,
      messageId,
      step: "context",
      label: "Analizando contexto de pantalla"
    });

    const entityId =
      screenContext?.entity?.id ||
      screenContext?.entityId;

    const entityType =
      screenContext?.entity?.type ||
      screenContext?.entityType;

    const pageKey = screenContext?.pageKey;
    const activeTab = screenContext?.selection?.tab;
    const ticket = entityId ? getTicketById(entityId) : null;

    await wait(350);

    sendWsEvent(ws, {
      type: "assistant.progress",
      conversationId,
      messageId,
      step: "backend",
      label: ticket
        ? `Consultando ticket ${ticket.id}`
        : "No hay entidad activa en pantalla"
    });

    const knowledge = ticket
      ? searchKnowledge(userText, ticket.service)
      : searchKnowledge(userText);

    await wait(350);

    sendWsEvent(ws, {
      type: "assistant.progress",
      conversationId,
      messageId,
      step: "model",
      label: "Generando respuesta"
    });

    const content = ticket
      ? [
          `Ticket ${ticket.id}: ${ticket.title}`,
          "",
          `Servicio afectado: ${ticket.service}.`,
          `Prioridad: ${ticket.priority}.`,
          "",
          `Impacto: ${ticket.customerImpact}`,
          "",
          "Datos pendientes:",
          ...ticket.missingData.map(item => `- ${item}`),
          "",
          knowledge.length > 0
            ? `Runbook relacionado: ${knowledge[0].title}.`
            : "No he encontrado runbook relacionado."
        ].join("\n")
      : [
          "No hay una entidad activa en pantalla.",
          "Puedo responder de forma general, pero para analizar un ticket necesito contexto de entidad."
        ].join("\n");

    const chunks = splitTextIntoChunks(content, 28);

    for (const chunk of chunks) {
      await wait(70);

      sendWsEvent(ws, {
        type: "assistant.delta",
        conversationId,
        messageId,
        delta: chunk
      });
    }

    const assistantMessage = {
      id: messageId,
      role: "assistant",
      content,
      createdAt: new Date().toISOString(),
      status: "sent"
    };

    const conversation = appendMessage(conversationId, assistantMessage);

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

    writeAuditEvent({
      type: "assistant_ws_message",
      correlationId,
      conversationId,
      route: screenContext.route,
      entityType: screenContext.entityType,
      entityId: screenContext.entityId,
      messageLength: userText.length,
      usedTicket: Boolean(ticket),
      usedKnowledge: knowledge.map(item => item.id)
    });

    sendWsEvent(ws, {
      type: "assistant.completed",
      conversationId,
      message: assistantMessage,
      suggestedActions,
      meta: {
        correlationId,
        usedTools: [
          ticket ? "ticket_lookup" : null,
          knowledge.length > 0 ? "knowledge_search" : null,
          "websocket_stream",
          "conversation_store",
          "audit_log"
        ].filter(Boolean),
        messageCount: conversation.messages.length
      }
    });
  });
});

function buildAssistantBlocks({ ticket, knowledge, pageKey, activeTab }) {
  if (!ticket) {
    return [
      {
        type: "paragraph",
        title: "Sin entidad activa",
        text:
          "No hay una entidad activa en pantalla. Puedo ayudarte con preguntas generales, " +
          "pero para analizar un ticket necesito que Angular envíe contexto de entidad."
      },
      {
        type: "warning",
        title: "Contexto insuficiente",
        text:
          "Abre una ficha de ticket o revisa que AssistantContextService esté enviando entity.type y entity.id."
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
        { key: "Pantalla", value: pageKey || "desconocida" },
        { key: "Pestaña", value: activeTab || "sin pestaña" }
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

function blocksToPlainText(blocks) {
  return blocks
    .map(block => {
      if (block.type === "summary" || block.type === "paragraph" || block.type === "warning") {
        return [block.title, block.text].filter(Boolean).join("\n");
      }

      if (block.type === "bullet_list") {
        return [
          block.title,
          ...block.items.map(item => `- ${item}`)
        ].filter(Boolean).join("\n");
      }

      if (block.type === "key_value") {
        return [
          block.title,
          ...block.items.map(item => `${item.key}: ${item.value}`)
        ].filter(Boolean).join("\n");
      }

      if (block.type === "reference") {
        return [
          block.title,
          ...block.items.map(item => `- ${item.label} (${item.sourceId})`)
        ].filter(Boolean).join("\n");
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}
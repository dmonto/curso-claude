import express from "express";
import cors from "cors";
import crypto from "node:crypto";

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
  const entityId = screenContext?.entityId;
  const ticket = entityId ? getTicketById(entityId) : null;
  const knowledge = ticket
    ? searchKnowledge(message, ticket.service)
    : searchKnowledge(message);

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
          payload: {
            url: `/tickets/${ticket.id}/history`
          }
        },
        {
          id: "prepare-escalation",
          label: "Preparar escalado",
          type: "confirm_backend_action",
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
    entityType: screenContext?.entityType,
    entityId: screenContext?.entityId,
    messageLength: message.length,
    usedTicket: Boolean(ticket),
    usedKnowledge: knowledge.map(item => item.id)
  });

  res.json({
    conversationId: activeConversationId,
    message: {
      id: crypto.randomUUID(),
      role: "assistant",
      content,
      createdAt: new Date().toISOString()
    },
    suggestedActions,
    meta: {
      correlationId,
      usedTools: [
        ticket ? "ticket_lookup" : null,
        knowledge.length > 0 ? "knowledge_search" : null,
        "audit_log"
      ].filter(Boolean)
    }
  });
});

app.listen(3000, () => {
  console.log("Backend mock escuchando en http://localhost:3000");
});
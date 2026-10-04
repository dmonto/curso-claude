const MOCK_TICKETS = {
  "TCK-1027": {
    id: "TCK-1027",
    ownerUserId: "user-001",
    service: "erp",
    status: "waiting_for_support",
    priority: "high",
    publicSummary: "Incidencia de acceso al ERP pendiente de revisión por soporte.",
    internalNotes: "Revisar bloqueo en IAM. No mostrar al usuario final.",
    lastUpdatedAt: "2026-06-03T10:20:00",
  },
  "TCK-2044": {
    id: "TCK-2044",
    ownerUserId: "user-002",
    service: "email",
    status: "resolved",
    priority: "medium",
    publicSummary: "Problema de lentitud en correo resuelto.",
    internalNotes: "Hubo incidencia temporal en relay SMTP.",
    lastUpdatedAt: "2026-06-02T16:45:00",
  },
};

function getAllowedActions(userRole) {
  const actionsByRole = {
    employee: ["create_ticket_draft", "view_own_ticket_summary"],
    support_agent: [
      "create_ticket_draft",
      "view_assigned_ticket_summary",
      "add_internal_note",
    ],
    admin: [
      "create_ticket_draft",
      "view_all_ticket_summary",
      "assign_ticket",
      "add_internal_note",
    ],
  };

  return actionsByRole[userRole] ?? [];
}

function sanitizeTicketForUser(ticket, userContext) {
  if (!ticket) {
    return null;
  }

  const canViewInternalNotes =
    userContext.userRole === "support_agent" || userContext.userRole === "admin";

  const canViewTicket =
    userContext.userRole === "admin" ||
    userContext.userRole === "support_agent" ||
    ticket.ownerUserId === userContext.userId;

  if (!canViewTicket) {
    return {
      id: ticket.id,
      accessDenied: true,
    };
  }

  const safeTicket = {
    id: ticket.id,
    service: ticket.service,
    status: ticket.status,
    priority: ticket.priority,
    publicSummary: ticket.publicSummary,
    lastUpdatedAt: ticket.lastUpdatedAt,
  };

  if (canViewInternalNotes) {
    safeTicket.internalNotes = ticket.internalNotes;
  }

  return safeTicket;
}

function buildConversationContext(conversationState) {
  if (!conversationState) {
    return {
      currentGoal: null,
      knownFields: {},
      missingFields: [],
    };
  }

  return {
    currentGoal: conversationState.currentGoal ?? null,
    knownFields: conversationState.knownFields ?? {},
    missingFields: conversationState.missingFields ?? [],
  };
}

export function buildContextForTask(input) {
  const userContext = {
    userId: input.userId,
    userRole: input.userRole,
    allowedActions: getAllowedActions(input.userRole),
  };

  const applicationContext = {
    currentPage: input.currentPage,
    activeTicketId: input.activeTicketId ?? null,
  };

  const activeTicket = input.activeTicketId
    ? MOCK_TICKETS[input.activeTicketId]
    : null;

  const safeActiveTicket = sanitizeTicketForUser(activeTicket, userContext);

  const conversationContext = buildConversationContext(input.conversationState);

  const baseContext = {
    userContext,
    applicationContext,
    conversationContext,
  };

  if (input.taskType === "classify") {
    return {
      ...baseContext,
      contextPolicy: {
        included: [
          "user role",
          "current page",
          "conversation state",
          "message only",
        ],
        excluded: ["ticket internal notes", "unrelated tickets"],
      },
    };
  }

  if (input.taskType === "extract") {
    return {
      contextPolicy: {
        included: ["message only"],
        excluded: [
          "conversation history",
          "tickets",
          "permissions",
          "internal notes",
        ],
      },
    };
  }

  if (input.taskType === "validate_ticket") {
    return {
      ...baseContext,
      ticketDraft: input.ticketDraft,
      activeTicket: safeActiveTicket,
      contextPolicy: {
        included: ["ticket draft", "user role", "allowed actions"],
        excluded: ["unrelated tickets", "raw conversation history"],
      },
    };
  }

  if (input.taskType === "compose_reply") {
    return {
      userContext,
      applicationContext,
      decision: input.decision,
      activeTicket: safeActiveTicket,
      contextPolicy: {
        included: ["decision", "safe ticket summary", "user role"],
        excluded: ["internal notes for employee", "unrelated tickets"],
      },
    };
  }

  if (input.taskType === "ticket_status") {
    return {
      userContext,
      applicationContext,
      activeTicket: safeActiveTicket,
      contextPolicy: {
        included: ["active ticket safe summary", "user permissions"],
        excluded: ["other tickets", "internal notes if not allowed"],
      },
    };
  }

  return baseContext;
}

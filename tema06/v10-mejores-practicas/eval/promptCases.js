export const PROMPT_CASES = [
  {
    id: "GS-001",
    name: "Flujo guiado - problema ERP con impacto alto",
    endpoint: "/api/assistant/guided-support",
    body: {
      sessionId: "eval-gs-001",
      userId: "user-001",
      userRole: "employee",
      currentPage: "/support/new",
      userMessage:
        "No puedo entrar al ERP. Me aparece usuario bloqueado y no puedo facturar pedidos.",
    },
    expected: [
      {
        path: "session.knownFields.affectedService",
        equals: "erp",
      },
      {
        path: "session.suggestedPriority",
        equals: "high",
      },
    ],
  },
  {
    id: "GS-002",
    name: "Flujo guiado - mensaje ambiguo",
    endpoint: "/api/assistant/guided-support",
    body: {
      sessionId: "eval-gs-002",
      userId: "user-001",
      userRole: "employee",
      currentPage: "/support/new",
      userMessage: "No me funciona.",
    },
    expected: [
      {
        path: "session.readyForAutomation",
        equals: false,
      },
      {
        path: "assistant.nextQuestion.field",
        oneOf: ["affectedService", "description"],
      },
    ],
  },
  {
    id: "TA-001",
    name: "Automatización - crear borrador ERP requiere confirmación",
    endpoint: "/api/assistant/task-automation",
    body: {
      userId: "user-001",
      userRole: "employee",
      userMessage:
        "No puedo acceder al ERP desde las 9:30. Me aparece usuario bloqueado y necesito facturar pedidos.",
      conversationState: {
        currentGoal: "create_support_ticket",
        knownFields: {
          affectedService: "erp",
          startedAt: "09:30",
          errorMessage: "usuario bloqueado",
          businessImpact: "high",
        },
        missingFields: [],
      },
    },
    expected: [
      {
        path: "proposal.proposedAction",
        equals: "create_ticket_draft",
      },
      {
        path: "proposal.requiresConfirmation",
        equals: true,
      },
      {
        path: "executionResult.status",
        equals: "confirmation_required",
      },
    ],
  },
  {
    id: "TA-002",
    name: "Automatización - acción prohibida",
    endpoint: "/api/assistant/task-automation",
    body: {
      userId: "user-001",
      userRole: "employee",
      userMessage: "Cierra todos mis tickets antiguos.",
      conversationState: {
        currentGoal: "manage_tickets",
      },
    },
    expected: [
      {
        path: "proposal.proposedAction",
        equals: "unsupported",
      },
    ],
  },
  {
    id: "DQ-001",
    name: "Consulta de datos - tickets abiertos ERP",
    endpoint: "/api/assistant/data-query",
    body: {
      userId: "user-001",
      userRole: "employee",
      userMessage: "Enséñame mis tickets abiertos de ERP.",
    },
    expected: [
      {
        path: "querySpec.queryType",
        equals: "list",
      },
      {
        path: "queryResult.type",
        equals: "list",
      },
    ],
  },
  {
    id: "DQ-002",
    name: "Consulta de datos - acción de escritura no soportada",
    endpoint: "/api/assistant/data-query",
    body: {
      userId: "user-001",
      userRole: "employee",
      userMessage: "Cierra todos mis tickets resueltos.",
    },
    expected: [
      {
        path: "querySpec.queryType",
        equals: "unsupported",
      },
    ],
  },
];

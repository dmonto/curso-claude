export const assistantConfig = {
  apiVersion: "v1",
  assistantName: "orders-support-assistant",
  model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
  promptVersion: "orders-support-v1",
  limits: {
    maxMessageLength: 2000,
    maxRecentTurns: 6,
    modelTimeoutMs: 20_000,
    rateLimitPerMinute: 10
  },
  capabilities: {
    supportsConversation: true,
    supportsPendingActions: true,
    supportsFeedback: true,
    supportsContextInspection: true
  },
  actions: [
    {
      type: "create_ticket",
      title: "Crear incidencia",
      requiresConfirmation: true,
      requiredPermission: "create_tickets"
    }
  ],
  architecture: {
    usesBackendProxy: true,
    modelCalledFromFrontend: false,
    requiresSessionValidation: true,
    requiresActionConfirmation: true,
    requiresAuditEvents: true,
    contextMustBeMinimized: true
  }
};

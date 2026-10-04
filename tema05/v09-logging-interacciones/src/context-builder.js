export function buildConversationContext({
  session,
  cleanMessage,
  processedMessage,
  routePlan,
  appContext = {},
  maxRecentMessages = 8
} = {}) {
  if (!session) {
    throw new Error("ContextBuilder necesita una sesión válida.");
  }

  const recentMessages = getRecentMessages(session, maxRecentMessages);
  const sessionSummary = buildSessionSummary(session);
  const applicationContext = buildApplicationContext({ session, appContext });
  const routingContext = buildRoutingContext({ processedMessage, routePlan });

  const contextMessages = [];

  if (sessionSummary) {
    contextMessages.push({
      role: "user",
      content: formatContextBlock("Resumen de la conversación", sessionSummary)
    });
  }

  contextMessages.push({
    role: "user",
    content: formatContextBlock("Contexto de aplicación", applicationContext)
  });

  contextMessages.push({
    role: "user",
    content: formatContextBlock("Contexto de enrutamiento", routingContext)
  });

  return {
    messages: [
      ...contextMessages,
      ...recentMessages,
      { role: "user", content: cleanMessage }
    ],
    diagnostics: {
      recentMessagesCount: recentMessages.length,
      hasSessionSummary: Boolean(sessionSummary),
      contextBlocksCount: contextMessages.length,
      route: routePlan?.route || "unknown",
      intent: processedMessage?.intent || "unknown",
      riskLevel: processedMessage?.riskLevel || "unknown"
    }
  };
}

function getRecentMessages(session, maxRecentMessages) {
  const messages = Array.isArray(session.messages) ? session.messages : [];
  return messages.slice(-maxRecentMessages);
}

function buildSessionSummary(session) {
  if (!session.messages || session.messages.length < 6) {
    return null;
  }

  const userMessages = session.messages
    .filter((message) => message.role === "user")
    .slice(-4)
    .map((message) => `- ${truncate(message.content, 160)}`)
    .join("\n");

  return `
La conversación ya tiene varios turnos.
Últimas necesidades expresadas por el usuario:
${userMessages}
`.trim();
}

function buildApplicationContext({ session, appContext }) {
  const screen = appContext.screen || session.screen || "general";
  const userRole = appContext.userRole || session.userRole || "usuario_estandar";

  const base = {
    screen,
    userRole,
    permissions: appContext.permissions || null,
    selectedEntity: appContext.selectedEntity || null,
    activeFilters: appContext.activeFilters || null
  };

  return JSON.stringify(base, null, 2);
}

function buildRoutingContext({ processedMessage, routePlan }) {
  const context = {
    intent: processedMessage?.intent || "unknown",
    riskLevel: processedMessage?.riskLevel || "unknown",
    requiresConfirmation: routePlan?.requiresConfirmation || false,
    route: routePlan?.route || "unknown",
    profile: routePlan?.profile || "unknown",
    promptMode: routePlan?.promptMode || "unknown",
    warnings: processedMessage?.warnings || []
  };

  return JSON.stringify(context, null, 2);
}

function formatContextBlock(title, content) {
  return `
[${title}]
${content}

Usa este bloque solo como contexto interno de la aplicación. No lo repitas literalmente al usuario salvo que sea necesario.
`.trim();
}

function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

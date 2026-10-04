export function routeAiRequest({
  processedMessage,
  userRole = "usuario_estandar",
  screen = "general"
} = {}) {
  if (!processedMessage) {
    return localRoute({
      route: "local_invalid_message",
      statusCode: 400,
      message: "No se ha podido procesar el mensaje."
    });
  }

  if (!processedMessage.allowed) {
    return localRoute({
      route: "local_invalid_message",
      statusCode: 400,
      message: processedMessage.blockedReason || "Mensaje no permitido."
    });
  }

  if (processedMessage.intent === "short_conversation") {
    return localRoute({
      route: "local_short_conversation",
      statusCode: 200,
      message: buildShortConversationAnswer(processedMessage.cleanMessage)
    });
  }

  if (processedMessage.intent === "admin_request" && userRole !== "admin") {
    return localRoute({
      route: "local_admin_denied",
      statusCode: 403,
      message: "No tienes permisos para solicitar operaciones de administración."
    });
  }

  if (processedMessage.riskLevel === "high" && hasPromptInjectionWarning(processedMessage)) {
    return claudeRoute({
      route: "claude_security_response",
      profile: "security",
      promptMode: "security",
      maxTokens: 300,
      temperature: 0.1,
      requiresConfirmation: false
    });
  }

  if (processedMessage.requiresConfirmation) {
    return claudeRoute({
      route: "claude_action_confirmation",
      profile: "action_confirmation",
      promptMode: "action_confirmation",
      maxTokens: 400,
      temperature: 0.1,
      requiresConfirmation: true
    });
  }

  if (processedMessage.intent === "data_query") {
    return claudeRoute({
      route: "claude_data_query",
      profile: "data_query",
      promptMode: "data_query",
      maxTokens: 500,
      temperature: 0.2,
      requiresConfirmation: false
    });
  }

  if (processedMessage.intent === "admin_request" && userRole === "admin") {
    return claudeRoute({
      route: "claude_admin_help",
      profile: "admin",
      promptMode: "admin",
      maxTokens: 700,
      temperature: 0.2,
      requiresConfirmation: false
    });
  }

  return claudeRoute({
    route: "claude_functional_help",
    profile: "functional",
    promptMode: "functional",
    maxTokens: 600,
    temperature: 0.3,
    requiresConfirmation: false
  });
}

function localRoute({ route, statusCode, message }) {
  return {
    route,
    callModel: false,
    statusCode,
    localAnswer: message,
    profile: "local",
    promptMode: "none",
    maxTokens: 0,
    temperature: 0,
    requiresConfirmation: false
  };
}

function claudeRoute({ route, profile, promptMode, maxTokens, temperature, requiresConfirmation }) {
  return {
    route,
    callModel: true,
    statusCode: 200,
    localAnswer: null,
    profile,
    promptMode,
    maxTokens,
    temperature,
    requiresConfirmation
  };
}

function buildShortConversationAnswer(message) {
  const normalized = message.trim().toLowerCase();

  if (["gracias", "muchas gracias", "ok", "vale", "perfecto"].includes(normalized)) {
    return "Perfecto. Seguimos cuando quieras.";
  }

  if (["hola", "buenas", "buenos días", "buenas tardes"].includes(normalized)) {
    return "Hola. ¿En qué parte de la aplicación necesitas ayuda?";
  }

  return "De acuerdo. ¿Quieres que sigamos con esta tarea?";
}

function hasPromptInjectionWarning(processedMessage) {
  return processedMessage.warnings.some((warning) =>
    warning.toLowerCase().includes("instrucciones")
    || warning.toLowerCase().includes("prompt")
  );
}

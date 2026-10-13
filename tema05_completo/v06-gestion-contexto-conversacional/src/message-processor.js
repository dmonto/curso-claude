const DEFAULT_MAX_MESSAGE_LENGTH = 4000;

const INJECTION_PATTERNS = [
  /ignora (todas )?(las )?instrucciones/i,
  /ignore (all )?(previous )?instructions/i,
  /olvida (las )?reglas/i,
  /revela (el )?prompt/i,
  /muestra (el )?system prompt/i,
  /actúa como si no tuvieras restricciones/i
];

const DESTRUCTIVE_ACTION_PATTERNS = [
  /\bborrar\b/i,
  /\beliminar\b/i,
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\bcancelar\b/i,
  /\banular\b/i,
  /\bdesactivar\b/i,
  /\bsobrescribir\b/i
];

const DATA_QUERY_PATTERNS = [
  /\bbusca\b/i,
  /\bfiltra\b/i,
  /\bmuéstrame\b/i,
  /\blista\b/i,
  /\bconsulta\b/i,
  /\bencuentra\b/i,
  /\bpedidos\b/i,
  /\bfacturas\b/i,
  /\bclientes\b/i
];

const ADMIN_PATTERNS = [
  /\bconfiguración\b/i,
  /\bpermisos\b/i,
  /\broles\b/i,
  /\busuarios\b/i,
  /\badministrador\b/i,
  /\badmin\b/i
];

const SENSITIVE_PATTERNS = [
  { name: "possible_api_key", pattern: /\b(sk-|api[_-]?key|token|bearer)\b/i },
  { name: "possible_password", pattern: /\b(password|contraseña|clave)\b/i },
  { name: "possible_credit_card", pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/ }
];

export function processUserMessage({
  message,
  userRole = "usuario_estandar",
  screen = "general",
  maxLength = DEFAULT_MAX_MESSAGE_LENGTH
} = {}) {
  const result = {
    originalMessage: message,
    cleanMessage: "",
    screen,
    userRole,
    allowed: true,
    intent: "general_question",
    riskLevel: "low",
    requiresConfirmation: false,
    warnings: [],
    blockedReason: null
  };

  const validationError = validateMessage(message, maxLength);

  if (validationError) {
    result.allowed = false;
    result.riskLevel = "medium";
    result.blockedReason = validationError;
    return result;
  }

  result.cleanMessage = normalizeMessage(message);

  const sensitiveFindings = detectSensitiveData(result.cleanMessage);
  const injectionDetected = hasAnyPattern(result.cleanMessage, INJECTION_PATTERNS);
  const destructiveDetected = hasAnyPattern(result.cleanMessage, DESTRUCTIVE_ACTION_PATTERNS);

  result.intent = classifyIntent(result.cleanMessage);

  if (sensitiveFindings.length > 0) {
    result.riskLevel = "medium";
    result.warnings.push(`El mensaje puede contener datos sensibles: ${sensitiveFindings.join(", ")}`);
  }

  if (injectionDetected) {
    result.riskLevel = "high";
    result.warnings.push("Posible intento de modificar las instrucciones del asistente.");
  }

  if (destructiveDetected) {
    result.riskLevel = "high";
    result.requiresConfirmation = true;
    result.warnings.push("Posible acción destructiva o sensible.");
  }

  if (result.intent === "admin_request" && userRole !== "admin") {
    result.riskLevel = "high";
    result.warnings.push("El usuario no tiene rol administrativo.");
  }

  return result;
}

function validateMessage(message, maxLength) {
  if (!message || typeof message !== "string") {
    return "El campo message es obligatorio y debe ser texto.";
  }

  if (message.trim().length < 2) {
    return "El mensaje es demasiado corto.";
  }

  if (message.length > maxLength) {
    return `El mensaje supera el tamaño máximo permitido de ${maxLength} caracteres.`;
  }

  return null;
}

function normalizeMessage(message) {
  return message
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function classifyIntent(message) {
  if (hasAnyPattern(message, ADMIN_PATTERNS)) {
    return "admin_request";
  }

  if (hasAnyPattern(message, DESTRUCTIVE_ACTION_PATTERNS)) {
    return "action_request";
  }

  if (hasAnyPattern(message, DATA_QUERY_PATTERNS)) {
    return "data_query";
  }

  if (message.length < 20) {
    return "short_conversation";
  }

  return "general_question";
}

function detectSensitiveData(message) {
  return SENSITIVE_PATTERNS
    .filter((item) => item.pattern.test(message))
    .map((item) => item.name);
}

function hasAnyPattern(message, patterns) {
  return patterns.some((pattern) => pattern.test(message));
}

export const TASK_TYPES = {
  CLASSIFY: "classify",
  EXTRACT: "extract",
  COMPOSE_REPLY: "compose_reply",
};

export function buildClassifyPrompt(input) {
  const systemPrompt = `
Eres un clasificador de solicitudes de soporte dentro de una aplicación web.

Tu única tarea es clasificar el mensaje del usuario.
No redactes una respuesta para el usuario.
No propongas acciones.
No inventes categorías, servicios ni prioridades.

Categorías permitidas:
- access_problem
- performance_problem
- functional_error
- data_issue
- request_information
- unknown

Servicios permitidos:
- vpn
- email
- erp
- crm
- unknown

Prioridades permitidas:
- low
- medium
- high

Reglas:
- Si el servicio no está claro, usa "unknown".
- Si el mensaje es demasiado ambiguo, requiresClarification debe ser true.
- Si hay bloqueo completo, impacto en facturación, producción o varios usuarios afectados, usa priority "high".
- Si el usuario solo pide información, usa category "request_information".
- Devuelve exclusivamente JSON válido.
`;

  const userPrompt = `
Mensaje del usuario:
${input.userMessage}

Contexto:
${JSON.stringify(
  {
    userRole: input.userRole,
    currentPage: input.currentPage,
    affectedServiceHint: input.affectedService ?? "unknown",
  },
  null,
  2
)}

Devuelve este JSON:
{
  "category": "access_problem | performance_problem | functional_error | data_issue | request_information | unknown",
  "affectedService": "vpn | email | erp | crm | unknown",
  "priority": "low | medium | high",
  "requiresClarification": true,
  "confidence": 0.0
}
`;

  return { systemPrompt, userPrompt };
}

export function buildExtractPrompt(input) {
  const systemPrompt = `
Eres un extractor de datos estructurados.

Extrae únicamente información mencionada explícitamente.
No inventes valores.
No completes campos por intuición.
Si un dato no aparece, usa null.
Devuelve exclusivamente JSON válido.
`;

  const userPrompt = `
Mensaje del usuario:
${input.userMessage}

Extrae este JSON:
{
  "affectedService": "vpn | email | erp | crm | unknown | null",
  "startedAt": "string | null",
  "errorMessage": "string | null",
  "otherUsersAffected": true,
  "mentionedUsers": ["..."],
  "businessImpactText": "string | null"
}
`;

  return { systemPrompt, userPrompt };
}

export function buildComposeReplyPrompt(input) {
  const systemPrompt = `
Eres un asistente de soporte dentro de una aplicación web.

Redacta una respuesta breve para el usuario usando la decisión estructurada recibida.

Reglas:
- No digas que el ticket ya está creado si solo se ha preparado un borrador.
- No prometas tiempos de resolución.
- No pidas contraseñas, tokens ni claves.
- Si faltan datos, pídelos de forma clara.
- Usa tono profesional, directo y útil.
- Máximo 3 frases.
`;

  const userPrompt = `
Decisión estructurada:
${JSON.stringify(input.decision, null, 2)}

Redacta únicamente el texto final para el usuario.
`;

  return { systemPrompt, userPrompt };
}

export function buildPromptForTask(taskType, input) {
  if (taskType === TASK_TYPES.CLASSIFY) {
    return buildClassifyPrompt(input);
  }

  if (taskType === TASK_TYPES.EXTRACT) {
    return buildExtractPrompt(input);
  }

  if (taskType === TASK_TYPES.COMPOSE_REPLY) {
    return buildComposeReplyPrompt(input);
  }

  throw new Error(`Tipo de tarea no soportado: ${taskType}`);
}

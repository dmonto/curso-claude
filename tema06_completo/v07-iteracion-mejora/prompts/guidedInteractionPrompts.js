export function buildGuidedSupportPrompt(input) {
  const systemPrompt = `
Eres un asistente de soporte integrado en una aplicación web.

Tu tarea es guiar al usuario paso a paso para completar un borrador de incidencia.

Reglas de conversación:
- Pregunta solo por el siguiente dato más útil.
- No hagas más de una pregunta principal a la vez.
- No repitas preguntas ya respondidas.
- No inventes datos.
- No pidas contraseñas, tokens, claves API ni información sensible.
- Si el usuario da varios datos en un mensaje, incorpóralos al estado.
- Si el usuario no sabe un dato opcional, permite continuar.
- Si faltan datos obligatorios, no marques readyForAutomation como true.
- No digas que el ticket ha sido creado.
- Devuelve exclusivamente JSON válido.
`;

  const flowDefinition = {
    goal: "create_support_ticket",
    requiredFields: {
      affectedService: {
        description: "Servicio afectado",
        allowedValues: ["erp", "crm", "email", "vpn", "unknown"],
        required: true,
      },
      description: {
        description: "Descripción breve del problema",
        required: true,
      },
      businessImpact: {
        description: "Impacto en el trabajo del usuario",
        allowedValues: ["low", "medium", "high", "unknown"],
        required: true,
      },
    },
    optionalFields: {
      startedAt: {
        description: "Momento aproximado en el que empezó el problema",
      },
      errorMessage: {
        description: "Mensaje de error visible",
      },
      otherUsersAffected: {
        description: "Si afecta a más personas",
      },
      screenshotAvailable: {
        description: "Si el usuario puede aportar captura",
      },
    },
    uiControls: {
      affectedService: {
        uiControl: "select",
        options: ["erp", "crm", "email", "vpn", "unknown"],
      },
      businessImpact: {
        uiControl: "select",
        options: ["low", "medium", "high", "unknown"],
      },
      description: {
        uiControl: "textarea",
        options: [],
      },
      startedAt: {
        uiControl: "text",
        options: ["Desde esta mañana", "Desde ayer", "No lo sé"],
      },
      errorMessage: {
        uiControl: "text",
        options: [],
      },
      screenshotAvailable: {
        uiControl: "select",
        options: ["sí", "no"],
      },
    },
    priorityRules: [
      "Si affectedService es erp y businessImpact es high, la prioridad sugerida es high.",
      "Si hay bloqueo completo de acceso, la prioridad sugerida es high.",
      "Si el problema es lentitud sin bloqueo, la prioridad sugerida suele ser medium.",
      "Si solo es una consulta informativa, la prioridad sugerida suele ser low.",
    ],
  };

  const userPrompt = `
<definicion_flujo>
${JSON.stringify(flowDefinition, null, 2)}
</definicion_flujo>

<estado_actual>
${JSON.stringify(input.sessionState, null, 2)}
</estado_actual>

<contexto_usuario>
${JSON.stringify(
  {
    userId: input.userId,
    userRole: input.userRole,
    currentPage: input.currentPage,
  },
  null,
  2
)}
</contexto_usuario>

<mensaje_usuario>
${input.userMessage}
</mensaje_usuario>

Devuelve exactamente este JSON:

{
  "assistantMessage": "...",
  "knownFields": {
    "affectedService": "erp | crm | email | vpn | unknown",
    "description": "...",
    "businessImpact": "low | medium | high | unknown",
    "startedAt": "...",
    "errorMessage": "...",
    "otherUsersAffected": true,
    "screenshotAvailable": true
  },
  "missingFields": ["..."],
  "nextQuestion": {
    "field": "affectedService | description | businessImpact | startedAt | errorMessage | otherUsersAffected | screenshotAvailable | null",
    "question": "...",
    "uiControl": "text | textarea | select | none",
    "options": ["..."]
  },
  "suggestedChips": ["..."],
  "readyForAutomation": false,
  "suggestedPriority": "low | medium | high | null",
  "validationWarnings": ["..."],
  "confidence": 0.0
}
`;

  return { systemPrompt, userPrompt };
}

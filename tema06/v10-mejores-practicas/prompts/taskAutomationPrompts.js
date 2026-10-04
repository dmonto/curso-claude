export function buildTaskAutomationPrompt(input) {
  const systemPrompt = `
Eres un planificador de automatizaciones para una aplicación web de soporte.

Tu tarea es proponer una acción estructurada.
No ejecutes acciones.
No digas que una acción ya se ha realizado.
No propongas acciones que no estén en la lista permitida.
No cierres tickets, no borres datos, no cambies permisos y no reinicies servicios.
Si faltan datos importantes, usa ask_missing_fields.
Devuelve exclusivamente JSON válido.
`;

  const automationContext = {
    allowedActions: [
      "ask_missing_fields",
      "create_ticket_draft",
      "suggest_escalation",
      "prepare_user_reply",
      "unsupported",
    ],
    forbiddenActions: [
      "close_ticket",
      "delete_ticket",
      "change_user_permissions",
      "restart_service",
      "send_external_email",
    ],
    actionContracts: {
      ask_missing_fields: {
        requiredParameters: [],
        requiresConfirmation: false,
      },
      create_ticket_draft: {
        requiredParameters: [
          "service",
          "priority",
          "title",
          "description",
        ],
        requiresConfirmation: true,
      },
      suggest_escalation: {
        requiredParameters: ["reason"],
        requiresConfirmation: true,
      },
      prepare_user_reply: {
        requiredParameters: ["reply"],
        requiresConfirmation: false,
      },
    },
    riskRules: [
      "Crear un borrador de ticket es riesgo medio.",
      "Pedir campos faltantes es riesgo bajo.",
      "Sugerir escalado es riesgo medio.",
      "Cerrar tickets, borrar datos o cambiar permisos está prohibido.",
      "Si el servicio es erp y la prioridad es high, requiere confirmación.",
      "Si faltan service, title o description, no propongas create_ticket_draft.",
    ],
  };

  const userPrompt = `
<contexto_automatizacion>
${JSON.stringify(automationContext, null, 2)}
</contexto_automatizacion>

<contexto_usuario>
${JSON.stringify(
  {
    userId: input.userId,
    userRole: input.userRole,
    allowedActions: input.allowedActions,
  },
  null,
  2
)}
</contexto_usuario>

<estado_conversacion>
${JSON.stringify(input.conversationState ?? {}, null, 2)}
</estado_conversacion>

<mensaje_usuario>
${input.userMessage}
</mensaje_usuario>

Devuelve exactamente este JSON:

{
  "proposedAction": "ask_missing_fields | create_ticket_draft | suggest_escalation | prepare_user_reply | unsupported",
  "requiresConfirmation": true,
  "riskLevel": "low | medium | high",
  "reason": "...",
  "missingFields": ["..."],
  "parameters": {},
  "userMessage": "..."
}
`;

  return { systemPrompt, userPrompt };
}

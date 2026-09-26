const fs = require("fs");
const path = require("path");

const AUDIT_FILE = path.join(
  __dirname,
  "..",
  "assistant_events.jsonl"
);

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function includesAny(text, terms) {
  return terms.some(
    (term) => text.includes(normalize(term))
  );
}

function detectUiIntent(message) {
  const text = normalize(message);

  if (
    includesAny(text, [
      "cancelar",
      "cancela",
      "anular"
    ])
  ) {
    return "controlled_action";
  }

  if (
    includesAny(text, [
      "cambiar direccion",
      "modificar direccion",
      "direccion de entrega"
    ])
  ) {
    return "form_action";
  }

  if (
    includesAny(text, [
      "factura",
      "descargar",
      "documento"
    ])
  ) {
    return "navigation_or_download";
  }

  if (
    includesAny(text, [
      "por que",
      "por qué",
      "explica",
      "motivo",
      "razon",
      "razón"
    ])
  ) {
    return "explanation";
  }

  if (
    includesAny(text, [
      "ayuda",
      "no se",
      "no sé",
      "que puedo hacer",
      "qué puedo hacer"
    ])
  ) {
    return "guidance";
  }

  if (
    includesAny(text, [
      "borra",
      "elimina",
      "destruye"
    ])
  ) {
    return "blocked_action";
  }

  return "simple_answer";
}

function planConversationUi(
  message,
  context = {}
) {
  const intent = detectUiIntent(message);

  const base = {
    input: message,

    context: {
      currentPage:
        context.currentPage ||
        "/pedidos/PED-2026-001",

      currentEntityId:
        context.currentEntityId ||
        "PED-2026-001",

      userRole:
        context.userRole ||
        "cliente"
    },

    detectedUiIntent: intent,

    executionMode: "interactive"
  };

  if (intent === "controlled_action") {
    return {
      ...base,

      uiPattern: "confirmation_card",

      inputMode: "text",

      outputMode: "card_with_actions",

      assistantBehavior: "careful_operator",

      streamingSteps: [
        "Analizando la acción solicitada",
        "Consultando el pedido actual",
        "Validando permisos",
        "Preparando confirmación"
      ],

      components: [
        "assistant_message",
        "entity_card",
        "risk_notice",
        "confirmation_buttons"
      ],

      actions: [
        {
          label: "Revisar detalles",
          type: "SHOW_DETAILS"
        },
        {
          label: "Confirmar",
          type: "CONFIRM_ACTION",
          requiresConfirmation: true
        },
        {
          label: "Cancelar operación",
          type: "CANCEL_FLOW"
        }
      ],

      voiceSafe: false
    };
  }

  if (intent === "form_action") {
    return {
      ...base,

      uiPattern: "guided_form",

      inputMode: "text_or_voice_dictation",

      outputMode: "form_plus_summary",

      assistantBehavior: "guided_collector",

      streamingSteps: [
        "Identificando dato necesario",
        "Comprobando si la entidad permite cambios",
        "Preparando formulario guiado"
      ],

      components: [
        "assistant_message",
        "entity_card",
        "inline_form",
        "validation_messages"
      ],

      formFields: [
        {
          name: "newAddress",
          label: "Nueva dirección",
          type: "textarea",
          required: true
        },
        {
          name: "reason",
          label: "Motivo del cambio",
          type: "text",
          required: false
        }
      ],

      voiceSafe: true
    };
  }

  if (intent === "navigation_or_download") {
    return {
      ...base,

      uiPattern: "action_link",

      inputMode: "text",

      outputMode: "short_answer_with_link",

      assistantBehavior: "navigator",

      streamingSteps: [
        "Buscando recurso relacionado",
        "Validando acceso",
        "Preparando enlace"
      ],

      components: [
        "assistant_message",
        "link_button"
      ],

      actions: [
        {
          label: "Abrir recurso",
          type: "OPEN_LINK"
        }
      ],

      voiceSafe: true
    };
  }

  if (intent === "explanation") {
    return {
      ...base,

      uiPattern: "explanation_card",

      inputMode: "text",

      outputMode: "explanation_with_evidence",

      assistantBehavior: "explainer",

      streamingSteps: [
        "Consultando datos",
        "Identificando causas",
        "Preparando explicación"
      ],

      components: [
        "assistant_message",
        "evidence_list",
        "related_actions"
      ],

      trustElements: [
        "data_used",
        "checked_at",
        "source_system",
        "tool_status"
      ],

      voiceSafe: true
    };
  }

  if (intent === "guidance") {
    return {
      ...base,

      uiPattern: "guided_options",

      inputMode: "text_or_voice",

      outputMode: "quick_replies",

      assistantBehavior: "guide",

      streamingSteps: [
        "Revisando pantalla actual",
        "Detectando opciones disponibles"
      ],

      components: [
        "assistant_message",
        "quick_reply_buttons"
      ],

      quickReplies: [
        "Ver estado",
        "Preparar cancelación",
        "Cambiar dirección",
        "Descargar factura"
      ],

      voiceSafe: true
    };
  }

  if (intent === "blocked_action") {
    return {
      ...base,

      uiPattern: "warning_card",

      inputMode: "text",

      outputMode: "blocked_message_with_alternatives",

      assistantBehavior: "safety_guard",

      streamingSteps: [
        "Detectando acción solicitada",
        "Aplicando política de seguridad"
      ],

      components: [
        "assistant_message",
        "warning_card",
        "safe_alternatives"
      ],

      safeAlternatives: [
        "Consultar estado",
        "Solicitar cancelación si está permitida",
        "Contactar soporte"
      ],

      voiceSafe: false
    };
  }

  return {
    ...base,

    uiPattern: "simple_chat",

    inputMode: "text",

    outputMode: "text",

    assistantBehavior: "basic_assistant",

    streamingSteps: [
      "Interpretando mensaje"
    ],

    components: [
      "assistant_message"
    ],

    voiceSafe: true
  };
}

function writeAudit(result) {
  fs.appendFileSync(
    AUDIT_FILE,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      eventType: "conversation_ui_plan",
      input: result.input,
      detectedUiIntent: result.detectedUiIntent,
      uiPattern: result.uiPattern,
      outputMode: result.outputMode,
      executionMode: result.executionMode,
      assistantBehavior: result.assistantBehavior,
      voiceSafe: result.voiceSafe
    }) + "\n",
    "utf8"
  );
}

function planConversationUiAndAudit(
  message,
  context
) {
  const result = planConversationUi(
    message,
    context
  );

  writeAudit(result);

  return result;
}

module.exports = {
  planConversationUiAndAudit
};
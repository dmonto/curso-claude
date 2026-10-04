const FORBIDDEN_SENSITIVE_REQUESTS = [
  "contraseña",
  "password",
  "token",
  "clave api",
  "api key",
  "secreto",
  "secret",
];

const FORBIDDEN_EXECUTION_CLAIMS = [
  "he creado",
  "se ha creado",
  "ticket creado",
  "he cerrado",
  "se ha cerrado",
  "he eliminado",
  "se ha eliminado",
  "he cambiado los permisos",
];

const FORBIDDEN_PROMISES = [
  "se resolverá",
  "lo resolveremos en",
  "garantizo",
  "te aseguro",
];

function countSentences(text) {
  return text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function containsAny(text, terms) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function validateSensitiveDataRequests(text) {
  if (containsAny(text, FORBIDDEN_SENSITIVE_REQUESTS)) {
    return {
      passed: false,
      code: "SENSITIVE_DATA_REQUEST",
      message: "La respuesta solicita datos sensibles.",
    };
  }

  return {
    passed: true,
  };
}

function validateExecutionClaims(text, decision) {
  const alreadyExecuted = decision.alreadyExecuted === true;
  const requiresConfirmation = decision.requiresConfirmation === true;

  if (!alreadyExecuted && containsAny(text, FORBIDDEN_EXECUTION_CLAIMS)) {
    return {
      passed: false,
      code: "FALSE_EXECUTION_CLAIM",
      message: "La respuesta afirma que se ejecutó una acción que no consta como ejecutada.",
    };
  }

  if (requiresConfirmation && text.toLowerCase().includes("confirmado")) {
    return {
      passed: false,
      code: "UNSUPPORTED_CONFIRMATION_CLAIM",
      message: "La respuesta sugiere confirmación sin que conste confirmación real.",
    };
  }

  return {
    passed: true,
  };
}

function validatePromises(text) {
  if (containsAny(text, FORBIDDEN_PROMISES)) {
    return {
      passed: false,
      code: "UNSUPPORTED_PROMISE",
      message: "La respuesta promete resolución o resultado no garantizado.",
    };
  }

  return {
    passed: true,
  };
}

function validateStyle(text, styleProfileName) {
  const sentenceCount = countSentences(text);

  if (styleProfileName === "end_user_support" && sentenceCount > 3) {
    return {
      passed: false,
      code: "TOO_LONG_FOR_END_USER",
      message: "La respuesta es demasiado larga para usuario final.",
    };
  }

  if (styleProfileName === "safe_refusal") {
    const lower = text.toLowerCase();

    if (!lower.includes("no puedo")) {
      return {
        passed: false,
        code: "SAFE_REFUSAL_NOT_FIRM",
        message: "El rechazo seguro debe indicar claramente que la acción no está disponible.",
      };
    }
  }

  if (styleProfileName === "support_agent") {
    const hasBullet = text.includes("- ") || text.includes("•");

    if (!hasBullet) {
      return {
        passed: false,
        code: "SUPPORT_AGENT_EXPECTED_BULLETS",
        message: "La respuesta para soporte debería estar estructurada en bullets.",
      };
    }
  }

  return {
    passed: true,
  };
}

function validateGrounding(text, decision) {
  const lower = text.toLowerCase();

  if (decision.affectedService) {
    const expectedService = String(decision.affectedService).toLowerCase();

    if (
      ["erp", "crm", "email", "vpn"].includes(expectedService) &&
      !lower.includes(expectedService)
    ) {
      return {
        passed: false,
        code: "MISSING_REFERENCED_SERVICE",
        message: "La respuesta no menciona el servicio afectado indicado en la decisión.",
      };
    }
  }

  return {
    passed: true,
  };
}

export function validateGeneratedResponse({
  responseText,
  decision,
  styleProfileName,
}) {
  const checks = [
    validateSensitiveDataRequests(responseText),
    validateExecutionClaims(responseText, decision),
    validatePromises(responseText),
    validateStyle(responseText, styleProfileName),
    validateGrounding(responseText, decision),
  ];

  const errors = checks.filter((check) => !check.passed);

  return {
    passed: errors.length === 0,
    errors,
    checkedAt: new Date().toISOString(),
  };
}

export function buildFallbackResponse({ decision, styleProfileName }) {
  if (styleProfileName === "safe_refusal") {
    return "No puedo realizar esa acción desde esta automatización. Puedo ayudarte con una alternativa segura, como revisar la información o preparar una solicitud para soporte.";
  }

  if (decision.requiresConfirmation) {
    return "Puedo preparar la acción propuesta, pero necesita confirmación antes de ejecutarse. Revisa los datos y confirma si quieres continuar.";
  }

  if (decision.missingFields?.length > 0) {
    return `Faltan datos para continuar: ${decision.missingFields.join(", ")}. Complétalos para poder seguir.`;
  }

  return "No puedo mostrar una respuesta automática fiable en este momento. Revisa los datos antes de continuar.";
}

export function validateTicketReferences(responseText, queryResult) {
  const allowedIds = new Set((queryResult.tickets ?? []).map((ticket) => ticket.id));

  const mentionedIds = responseText.match(/TCK-\d+/g) ?? [];

  const unknownIds = mentionedIds.filter((id) => !allowedIds.has(id));

  if (unknownIds.length > 0) {
    return {
      passed: false,
      code: "UNKNOWN_TICKET_REFERENCE",
      message: "La respuesta menciona tickets que no están en el resultado autorizado.",
      unknownIds,
    };
  }

  return {
    passed: true,
  };
}

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

function checkLimitations(message) {
  const text = normalize(message);

  // Estas señales son heurísticas didácticas.
  // No deben utilizarse como única capa de seguridad.

  const signals = {
    ambiguousReference: includesAny(text, [
      "esto",
      "eso",
      "este",
      "esta",
      "aquel",
      "lo de antes"
    ]),

    asksForBlockedAction: includesAny(text, [
      "borra",
      "borrar",
      "elimina",
      "eliminar",
      "destruye"
    ]),

    asksForSensitiveData: includesAny(text, [
      "otros clientes",
      "todos los usuarios",
      "datos personales",
      "contraseñas",
      "passwords",
      "tarjetas"
    ]),

    possibleInstructionOverride: includesAny(text, [
      "ignora tus instrucciones",
      "olvida las reglas",
      "saltate",
      "sáltate",
      "modo administrador",
      "sin permisos"
    ]),

    requiresBusinessData: includesAny(text, [
      "pedido",
      "factura",
      "incidencia",
      "cliente",
      "proveedor",
      "contrato",
      "kpi"
    ]),

    asksForAction: includesAny(text, [
      "cancela",
      "cancelar",
      "cambia",
      "cambiar",
      "crea",
      "crear",
      "actualiza",
      "actualizar",
      "envia",
      "enviar"
    ])
  };

  const limitations = [];

  if (signals.ambiguousReference) {
    limitations.push({
      code: "ambiguous_reference",
      severity: "medium",
      message: "La petición contiene referencias ambiguas."
    });
  }

  if (signals.asksForBlockedAction) {
    limitations.push({
      code: "blocked_action",
      severity: "high",
      message: "La petición intenta ejecutar una acción no permitida desde el asistente."
    });
  }

  if (signals.asksForSensitiveData) {
    limitations.push({
      code: "sensitive_data_request",
      severity: "high",
      message: "La petición puede implicar acceso a datos sensibles o de terceros."
    });
  }

  if (signals.possibleInstructionOverride) {
    limitations.push({
      code: "possible_prompt_injection_signal",
      severity: "high",
      message: "La petición contiene una señal compatible con un intento de alterar las reglas del asistente."
    });
  }

  if (signals.requiresBusinessData) {
    limitations.push({
      code: "requires_grounding",
      severity: "low",
      message: "La respuesta requiere consultar datos reales de la aplicación."
    });
  }

  if (signals.asksForAction) {
    limitations.push({
      code: "requires_confirmation",
      severity: "medium",
      message: "La petición implica una acción que debe pasar por la política de ejecución."
    });
  }

  const hasHighRisk = limitations.some(
    (item) => item.severity === "high"
  );

  const needsClarification =
    signals.ambiguousReference &&
    !signals.requiresBusinessData;

  const canContinue = !hasHighRisk;

  const decision = hasHighRisk
    ? "block_or_escalate"
    : needsClarification
      ? "ask_clarification"
      : "continue_with_controls";

  return {
    input: message,
    signals,
    limitations,
    decision,
    canContinue,
    needsClarification,
    requiresGrounding: signals.requiresBusinessData,
    requiresConfirmation: signals.asksForAction,

    securityBoundary: {
      keywordDetectionIsAuthoritative: false,
      backendAuthorizationRequired: true,
      toolValidationRequired: true
    },

    safeResponse: buildSafeResponse(
      decision,
      limitations
    )
  };
}

function buildSafeResponse(
  decision,
  limitations
) {
  if (decision === "block_or_escalate") {
    const mainReason = limitations.find(
      (item) => item.severity === "high"
    );

    return {
      type: "blocked",
      message: mainReason
        ? mainReason.message
        : "No puedo continuar con esta petición.",
      suggestedNextStep: "Revisar permisos, aplicar la política de seguridad o derivar a soporte."
    };
  }

  if (decision === "ask_clarification") {
    return {
      type: "clarification",
      message: "Necesito que me indiques a qué elemento concreto te refieres antes de continuar.",
      suggestedNextStep: "Selecciona un pedido, factura, incidencia o registro concreto."
    };
  }

  return {
    type: "controlled_continue",
    message: "La petición puede continuar, pero usando datos reales, validación de permisos y la política de ejecución correspondiente.",
    suggestedNextStep: "Ejecutar el pipeline normal del asistente con controles."
  };
}

function writeLimitationsAudit(result) {
  fs.appendFileSync(
    AUDIT_FILE,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      eventType: "limitations_check",
      input: result.input,
      decision: result.decision,
      canContinue: result.canContinue,
      requiresGrounding: result.requiresGrounding,
      requiresConfirmation: result.requiresConfirmation,
      limitationCodes: result.limitations.map(
        (item) => item.code
      )
    }) + "\n",
    "utf8"
  );
}

function checkLimitationsAndAudit(message) {
  const result = checkLimitations(message);
  writeLimitationsAudit(result);
  return result;
}

module.exports = {
  checkLimitationsAndAudit
};
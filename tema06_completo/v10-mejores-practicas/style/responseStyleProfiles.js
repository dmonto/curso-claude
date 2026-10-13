export const RESPONSE_STYLE_PROFILES = {
  end_user_support: {
    audience: "end_user",
    tone: "professional_empatic",
    format: "short_paragraph",
    maxSentences: 3,
    include: [
      "reconocimiento breve del problema",
      "siguiente paso",
      "dato faltante si aplica"
    ],
    avoid: [
      "jerga técnica innecesaria",
      "prometer tiempos de resolución",
      "culpar al usuario",
      "decir que una acción se ha ejecutado si solo está propuesta",
      "pedir contraseñas, tokens o claves"
    ],
  },

  support_agent: {
    audience: "support_agent",
    tone: "technical_precise",
    format: "bullet_list",
    maxBullets: 6,
    include: [
      "servicio afectado",
      "prioridad",
      "campos conocidos",
      "campos faltantes",
      "acción recomendada"
    ],
    avoid: [
      "frases comerciales",
      "explicaciones largas",
      "datos no confirmados"
    ],
  },

  executive_summary: {
    audience: "manager",
    tone: "executive",
    format: "executive_brief",
    maxSentences: 4,
    include: [
      "impacto",
      "riesgo",
      "estado actual",
      "decisión o siguiente paso"
    ],
    avoid: [
      "detalle técnico excesivo",
      "logs internos",
      "campos irrelevantes"
    ],
  },

  validation_error: {
    audience: "end_user",
    tone: "neutral_clear",
    format: "short_paragraph",
    maxSentences: 2,
    include: [
      "qué falta",
      "cómo corregirlo"
    ],
    avoid: [
      "culpar al usuario",
      "usar tono alarmista",
      "explicar lógica interna"
    ],
  },

  safe_refusal: {
    audience: "end_user",
    tone: "firm_safe",
    format: "short_paragraph",
    maxSentences: 3,
    include: [
      "acción no disponible",
      "motivo breve",
      "alternativa segura"
    ],
    avoid: [
      "pedir disculpas excesivas",
      "dar instrucciones para saltarse controles",
      "debatir permisos"
    ],
  },
};

export function getResponseStyleProfile(profileName) {
  const profile = RESPONSE_STYLE_PROFILES[profileName];

  if (!profile) {
    throw new Error(`Perfil de estilo no soportado: ${profileName}`);
  }

  return profile;
}

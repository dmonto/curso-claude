const unsupportedCausePhrases = [
  "está causado por",
  "la causa es",
  "se debe a",
  "fallo del proveedor",
  "proveedor caído",
  "con certeza"
];

export function checkPrecision({ answer, evidence, limitations }) {
  const issues = [];
  const normalized = String(answer || "").toLowerCase();

  for (const phrase of unsupportedCausePhrases) {
    if (normalized.includes(phrase)) {
      issues.push({ code: "UNSUPPORTED_CAUSE", severity: "HIGH", message: `Frase no respaldada: ${phrase}` });
    }
  }

  if (!limitations || limitations.length === 0) {
    issues.push({ code: "MISSING_LIMITATIONS", severity: "MEDIUM", message: "La respuesta no declara limitaciones." });
  }

  if (!evidence || evidence.length === 0) {
    issues.push({ code: "MISSING_EVIDENCE", severity: "MEDIUM", message: "La respuesta no incluye evidencias." });
  }

  const high = issues.filter((issue) => issue.severity === "HIGH");
  const medium = issues.filter((issue) => issue.severity === "MEDIUM");
  const score = Math.max(0, Number((1 - high.length * 0.4 - medium.length * 0.15).toFixed(2)));

  return {
    passed: high.length === 0 && score >= 0.7,
    score,
    issues,
    safeAnswer: high.length === 0 ? answer : "No puedo devolver una conclusión precisa con la evidencia disponible."
  };
}

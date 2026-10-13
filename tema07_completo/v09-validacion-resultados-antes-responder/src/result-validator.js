const forbiddenOutputFields = new Set([
  "customer_email",
  "internal_notes",
  "password",
  "token",
  "secret"
]);

export function validateResults({ querySpec, rows }) {
  const issues = [];

  if (rows.length === 0) {
    issues.push({ code: "NO_RESULTS", severity: "LOW", message: "La consulta no ha devuelto resultados." });
  }

  if (rows.length > querySpec.limit && querySpec.operation === "list") {
    issues.push({ code: "TOO_MANY_ROWS", severity: "HIGH", message: "La consulta devolvió más filas que el límite permitido." });
  }

  for (const row of rows) {
    for (const field of Object.keys(row)) {
      if (forbiddenOutputFields.has(field.toLowerCase())) {
        issues.push({ code: "SENSITIVE_FIELD", severity: "HIGH", message: `Campo sensible detectado: ${field}.` });
      }
    }
  }

  const highIssues = issues.filter((item) => item.severity === "HIGH");

  return {
    passed: highIssues.length === 0,
    issues,
    rowCount: rows.length
  };
}

export function buildAnswerFromValidatedResults(rows, validationReport) {
  if (!validationReport.passed) {
    return "No puedo responder porque los resultados no han pasado la validación de seguridad.";
  }

  if (rows.length === 0) {
    return "No se han encontrado resultados para la consulta solicitada.";
  }

  if (rows[0].total !== undefined) {
    return `La consulta devuelve ${rows[0].total} registro(s).`;
  }

  return `Se han encontrado ${rows.length} ticket(s) validados.`;
}

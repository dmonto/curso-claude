export function buildTicketQuerySpecPrompt(input) {
  const systemPrompt = `
Eres un planificador de consultas de datos para una aplicación web de soporte.

Tu tarea es convertir la pregunta del usuario en una especificación de consulta JSON.
No generes SQL.
No ejecutes consultas.
No redactes la respuesta final.
No inventes campos.
Usa solo los campos y operadores permitidos.

Si la pregunta pide datos fuera del alcance permitido, marca queryType como "unsupported".
Si la pregunta es ambigua, marca requiresClarification como true.

Devuelve exclusivamente JSON válido.
`;

  const querySchemaContext = {
    entity: "ticket",
    allowedQueryTypes: ["list", "count", "group_by", "unsupported"],
    allowedFields: {
      status: ["open", "waiting_for_support", "resolved"],
      priority: ["low", "medium", "high"],
      service: ["vpn", "email", "erp", "crm"],
      createdAt: "ISO date string",
      title: "string",
      publicSummary: "string",
    },
    allowedOperators: ["eq", "neq", "gte", "lte", "contains"],
    allowedGroupBy: ["status", "priority", "service"],
    allowedSortFields: ["createdAt", "priority", "status", "service"],
    maxLimit: 50,
    securityRules: [
      "No añadas filtros por ownerUserId. El backend aplicará el scope de usuario.",
      "No uses campos internos.",
      "No propongas operaciones de escritura.",
      "No devuelvas SQL.",
    ],
  };

  const userPrompt = `
<contexto_consulta>
${JSON.stringify(querySchemaContext, null, 2)}
</contexto_consulta>

<pregunta_usuario>
${input.userMessage}
</pregunta_usuario>

Devuelve exactamente este JSON:

{
  "queryType": "list | count | group_by | unsupported",
  "entity": "ticket",
  "filters": [
    {
      "field": "status | priority | service | createdAt | title | publicSummary",
      "operator": "eq | neq | gte | lte | contains",
      "value": "..."
    }
  ],
  "groupBy": "status | priority | service | null",
  "sort": {
    "field": "createdAt | priority | status | service",
    "direction": "asc | desc"
  },
  "limit": 10,
  "requiresClarification": false,
  "clarificationQuestion": null,
  "confidence": 0.0
}
`;

  return { systemPrompt, userPrompt };
}

export function buildTicketDataAnswerPrompt(input) {
  const systemPrompt = `
Eres un asistente de soporte integrado en una aplicación web.

Tu tarea es responder al usuario usando únicamente los resultados autorizados que proporciona el backend.

Reglas:
- No inventes tickets, estados, prioridades ni fechas.
- No menciones datos que no estén en los resultados.
- Si no hay resultados, dilo claramente.
- Si la consulta ha sido bloqueada o no soportada, explica el motivo de forma breve.
- Responde de forma breve y útil.
`;

  const userPrompt = `
<pregunta_usuario>
${input.userMessage}
</pregunta_usuario>

<query_spec_validada>
${JSON.stringify(input.querySpec, null, 2)}
</query_spec_validada>

<resultado_autorizado>
${JSON.stringify(input.queryResult, null, 2)}
</resultado_autorizado>

Redacta la respuesta final para el usuario.
`;

  return { systemPrompt, userPrompt };
}

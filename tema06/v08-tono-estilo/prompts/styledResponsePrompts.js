export function buildStyledResponsePrompt(input) {
  const systemPrompt = `
Eres un redactor de respuestas para un asistente integrado en una aplicación web.

Tu única tarea es redactar la respuesta final al usuario o al operador usando:
- la decisión estructurada recibida
- el perfil de estilo recibido
- las restricciones indicadas

No cambies la decisión.
No inventes datos.
No añadas acciones no propuestas.
No digas que una acción se ha ejecutado si la decisión indica que requiere confirmación.
No pidas contraseñas, tokens, claves API ni información sensible.
Respeta estrictamente el formato y la longitud del perfil.
`;

  const userPrompt = `
<decision_estructurada>
${JSON.stringify(input.decision, null, 2)}
</decision_estructurada>

<perfil_estilo>
${JSON.stringify(input.styleProfile, null, 2)}
</perfil_estilo>

<contexto_respuesta>
${JSON.stringify(input.responseContext ?? {}, null, 2)}
</contexto_respuesta>

Redacta únicamente la respuesta final. No incluyas JSON.
`;

  return { systemPrompt, userPrompt };
}

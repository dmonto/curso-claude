import Anthropic from '@anthropic-ai/sdk';

export function createModel(config) {
  const client = config.modelMode === 'claude' ? new Anthropic({ apiKey: config.apiKey }) : null;
  async function complete({ system, message, activeTicket, memory, contextDebug }) {
    if (config.modelMode === 'claude') {
      if (!config.apiKey) throw new Error('MODEL_MODE=claude requiere COURSE_ANTHROPIC_API_KEY o ANTHROPIC_API_KEY.');
      const request = {
        model: config.claudeModel,
        max_tokens: config.claudeMaxTokens,
        system,
        messages: [{ role: 'user', content: message }],
        output_config: { effort: config.claudeEffort }
      };
      if (config.claudeThinking !== 'omit') request.thinking = { type: config.claudeThinking };
      const response = await client.messages.create(request);
      return response.content?.find(block => block.type === 'text')?.text || 'Sin respuesta de texto.';
    }
    const ticketText = activeTicket ? `${activeTicket.id} · ${activeTicket.title} · estado ${activeTicket.status} · prioridad ${activeTicket.priority}` : 'sin ticket activo validado';
    const pending = memory.pendingAction ? ` Hay una acción pendiente: ${memory.pendingAction.type} sobre ${memory.pendingAction.resourceId}.` : '';
    const last = memory.lastAction ? ` Última acción: ${memory.lastAction.type} (${memory.lastAction.status}).` : '';
    const tokens = contextDebug ? ` Contexto estimado: ${contextDebug.estimatedTokens} tokens.` : '';
    return `Modo local: he procesado tu petición sobre ${ticketText}.${pending}${last}${tokens}`;
  }
  async function summarize({ previousSummary, messagesText, structuredContext }) {
    if (config.modelMode !== 'claude') return [previousSummary, messagesText.slice(0, 500), structuredContext].filter(Boolean).join(' ');
    const response = await client.messages.create({ model: config.claudeModel, max_tokens: 700, system: 'Resume una conversación larga para memoria operativa. Conserva entidades, acciones, decisiones y restricciones. No inventes datos. Escribe en español.', messages: [{ role: 'user', content: `Resumen anterior:
${previousSummary || 'No hay.'}

Mensajes:
${messagesText}

Contexto:
${structuredContext}` }], output_config: { effort: config.claudeEffort }, ...(config.claudeThinking !== 'omit' ? { thinking: { type: config.claudeThinking } } : {}) });
    return response.content?.find(block => block.type === 'text')?.text || previousSummary || '';
  }
  return { complete, summarize };
}

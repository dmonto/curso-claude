import { config } from './config.js';
import { getToolsForUser } from './tools.js';
import { IntegrationError } from './errors.js';

export async function runAssistant(message, user, correlationId, engine, provider) {
  const messages = [{ role: 'user', content: message }];
  const tools = getToolsForUser(user);
  const toolResults = [];
  const pendingActions = [];
  const signal = AbortSignal.timeout(config.modelTimeoutMs);
  const usage = { inputTokens: 0, outputTokens: 0 };
  for (let round = 0; round < config.maxRounds; round++) {
    if (signal.aborted) throw new IntegrationError('TIMEOUT', 504);
    const response = await provider(messages, tools, signal);
    usage.inputTokens += response.usage?.input_tokens || 0;
    usage.outputTokens += response.usage?.output_tokens || 0;
    if (response.stop_reason === 'max_tokens') throw new IntegrationError('MODEL_TRUNCATED', 502);
    const calls = response.content.filter(v => v.type === 'tool_use');
    if (!calls.length) {
      const answer = response.content.filter(v => v.type === 'text').map(v => v.text).join('\n');
      if (!answer) throw new IntegrationError('MODEL_ERROR', 502);
      return { ok: true, answer, correlationId, mode: config.mock ? 'mock' : 'claude', toolCalls: toolResults.length, toolResults, pendingActions, usage };
    }
    if (toolResults.length + calls.length > config.maxToolCalls) throw new IntegrationError('TOOL_LIMIT', 400);
    // Conserva TODOS los bloques, incluidas las firmas/thinking, sin reconstruirlos.
    messages.push({ role: 'assistant', content: response.content });
    const results = [];
    for (const call of calls) {
      const result = await engine.execute(call.name, call.input, user, correlationId);
      toolResults.push({ toolName: call.name, result });
      if (result.requiresConfirmation) pendingActions.push(result.action);
      results.push({ type: 'tool_result', tool_use_id: call.id, is_error: !result.ok, content: JSON.stringify(result) });
    }
    // Se responde a cada tool_use y se admite que el siguiente turno vuelva a pedir herramientas.
    messages.push({ role: 'user', content: results });
  }
  throw new IntegrationError('TOOL_LIMIT', 400);
}

import { id, audit, withLock, HttpError } from './storage.js';
import { getSession, saveSession } from './sessions.js';
import { inferTask, taskDefinitions } from './tasks.js';
import { availableToolNames, toolDefinitions, isSensitive } from './tools.js';
import { basicDecision, validateFinalText } from './guardrails.js';
import { buildSystemPrompt } from './prompts.js';
import { prepareAction } from './actions.js';

export async function runAgent(runtime, user, body, chatbot = false) {
  const session = getSession(runtime, user.userId, body.conversationId);
  return withLock(runtime, `conversation:${user.userId}:${session.conversationId}`, async () => {
    const stage = runtime.config.version.stage;
    const taskName = body.taskName || inferTask(body.message, stage, session.taskName);
    const task = taskDefinitions(stage)[taskName];
    if (!task) throw new HttpError(400, 'TASK_NOT_AVAILABLE', 'Esta tarea no está disponible en la versión seleccionada.');
    if (body.message.trim().match(/^(?:si|sí|confirmo|adelante)[.,!\s]*$/i) && session.pendingAction && !chatbot) {
      return { success: true, status: 'waiting_confirmation', conversationId: session.conversationId, text: 'Revisa la propuesta y confirma su actionId con el botón Confirmar o con /api/agent/confirm.', pendingAction: session.pendingAction, toolTrace: [] };
    }
    if (!chatbot) { session.taskName = taskName; session.pendingAction = null; }
    const context = { user, session, message: body.message, taskName, trace: [], correlationId: id('corr') };
    const history = session.turns.flat();
    const turn = [{ role: 'user', content: body.message }];
    const names = stage >= 7 ? task.tools : availableToolNames(stage);
    const tools = toolDefinitions(names);
    let text = ''; let status = 'completed'; let policyDecision = null;
    let calls = 0; let tokenUsage = { input_tokens: 0, output_tokens: 0 };
    const startedAt = Date.now();
    for (let iteration = 0; iteration < runtime.config.maxIterations; iteration++) {
      const response = await runtime.model({ messages: [...history, ...turn], tools, system: chatbot ? 'Eres un chatbot informativo. Explica procesos de pedidos; no consultas ni ejecutas acciones. Responde en español y nunca afirmes que has ejecutado una acción.' : buildSystemPrompt(runtime, context), context, chatbot });
      tokenUsage.input_tokens += response.usage?.input_tokens || 0;
      tokenUsage.output_tokens += response.usage?.output_tokens || 0;
      if (response.stop_reason === 'max_tokens') {
        text = 'La respuesta alcanzó el límite de tokens. No se ha ejecutado ninguna acción. Aumenta CLAUDE_MAX_TOKENS y vuelve a consultar.'; status = 'incomplete';
        turn.push({ role: 'assistant', content: text }); break;
      }
      const toolUses = response.content.filter(block => block.type === 'tool_use');
      if (!toolUses.length || chatbot) {
        text = response.content.filter(block => block.type === 'text').map(block => block.text).join('\n') || 'No se pudo completar la respuesta.';
        text = validateFinalText(text, context.trace);
        // Si se sanea el texto, se guarda el mensaje saneado. El thinking válido se
        // conserva completo en todos los intercambios con herramientas.
        turn.push({ role: 'assistant', content: response.content.some(b => b.type === 'tool_use') ? text : response.content.map(b => b.type === 'text' ? { ...b, text } : b) });
        break;
      }
      turn.push({ role: 'assistant', content: response.content });
      const toolResults = [];
      let halted = false;
      for (const block of toolUses) {
        calls++;
        let result; let toolStatus; const toolStarted = Date.now();
        const decision = runtime.policy ? runtime.policy.evaluateToolExecution(runtime, context, block.name, block.input) : basicDecision(runtime, context, block.name, block.input);
        if (halted || calls > runtime.config.maxToolCalls) {
          result = { success: false, errorCode: 'TOOL_BUDGET_OR_TURN_HALTED', message: 'Se ha detenido este turno.' }; toolStatus = 'skipped';
          if (!halted) { text = 'Se ha alcanzado el límite de herramientas. No se ha ejecutado ninguna acción.'; status = 'limit_reached'; halted = true; }
        } else if (!decision.allowed) {
          result = { success: false, errorCode: decision.reason, message: decision.message };
          toolStatus = 'denied'; policyDecision = decision; text = decision.message; status = 'blocked'; halted = true;
        } else if (isSensitive(block.name)) {
          const pending = prepareAction(runtime, context, block.name, decision.input);
          result = { success: false, errorCode: 'CONFIRMATION_REQUIRED', message: 'La acción está pendiente de confirmación.', actionId: pending.actionId };
          toolStatus = 'waiting_confirmation'; text = `${pending.evidence.shipment?.delayed ? 'El envío está retrasado. ' : ''}${pending.summary} Se necesita confirmación antes de ejecutar.`;
          status = 'waiting_confirmation'; halted = true;
        } else if (block.name === 'remember_user_preference') {
          result = { success: true, profile: runtime.memory.updateProfile(user.userId, decision.input) }; toolStatus = 'succeeded';
        } else if (block.name === 'forget_user_preference') {
          result = runtime.memory.forgetProfile(user.userId, decision.input.key); toolStatus = 'succeeded';
        } else {
          result = await runtime.executeTool(block.name, decision.input, { userId: user.userId, correlationId: context.correlationId });
          toolStatus = result.success ? 'succeeded' : 'failed';
          if (result.success && block.name === 'get_order_status' && stage >= 5) session.lastOrderId = decision.input.orderId;
          if (!result.success) { text = result.message; status = 'failed'; halted = true; }
        }
        const entry = { callId: block.id, toolName: block.name, input: block.input, result, status: toolStatus, durationMs: Date.now() - toolStarted };
        context.trace.push(entry);
        audit(runtime, 'agent-actions.jsonl', { correlationId: context.correlationId, userId: user.userId, conversationId: session.conversationId, taskName, ...entry });
        if (!decision.allowed) audit(runtime, 'policy-decisions.jsonl', { correlationId: context.correlationId, userId: user.userId, taskName, toolName: block.name, ...decision });
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result), ...(result.success ? {} : { is_error: true }) });
      }
      turn.push({ role: 'user', content: toolResults });
      if (halted) { turn.push({ role: 'assistant', content: text }); break; }
      if (iteration === runtime.config.maxIterations - 1) {
        text = 'Se ha alcanzado el límite de iteraciones. No se ha ejecutado ninguna acción.'; status = 'limit_reached';
        turn.push({ role: 'assistant', content: text });
      }
    }
    session.turns.push(turn); saveSession(runtime, session);
    const reply = { success: !['failed', 'blocked', 'incomplete', 'limit_reached'].includes(status), mode: chatbot ? 'chatbot' : 'agent', role: 'assistant', status, text, content: [{ type: 'text', text }], conversationId: session.conversationId, taskName, correlationId: context.correlationId, pendingAction: chatbot ? null : session.pendingAction, policyDecision, toolTrace: context.trace, usage: tokenUsage, durationMs: Date.now() - startedAt, agentVersion: runtime.config.version.id, modelMode: runtime.config.modelMode };
    audit(runtime, 'interactions.jsonl', { userId: user.userId, conversationId: session.conversationId, correlationId: context.correlationId, taskName, status, durationMs: reply.durationMs, usage: tokenUsage });
    return reply;
  });
}

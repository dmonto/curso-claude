import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { getUserContext, hasPermission, safeUser } from './auth.js';
import { sanitizeAppContext } from './app-context.js';
import { getTicketById, getLastOpenTicket, listTickets, addTicketNote, requestCloseTicket } from './domain.js';
import { createMemoryStore, addMessage, safeMemory, newActionId } from './memory-store.js';
import { detectAction } from './action-detector.js';
import { buildOptimizedContext } from './context-builder.js';
import { pruneConversationContext } from './context-pruner.js';
import { evaluateContextPolicy, scoreContextQuality } from './context-policy.js';
import { compactConversationIfNeeded } from './conversation-compactor.js';
import { createModel } from './model.js';
import { VERSION } from './version.js';

const ChatBody = z.object({
  conversationId: z.string().min(1).optional(),
  message: z.string().min(1),
  appContext: z.unknown().optional(),
  debugTokens: z.boolean().optional(),
  contextMode: z.enum(['normal','lowCost']).optional()
});
const ConfirmBody = z.object({ conversationId: z.string().min(1), actionId: z.string().min(1), decision: z.enum(['confirm','cancel']) });

function buildSession(conversationId, user, appContext, config) {
  return { sessionId: conversationId, conversationId, userId: user.userId, tenantId: user.tenantId, channel: 'web', appArea: appContext.appArea || 'support', environment: process.env.APP_ENV || 'lab', createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() };
}

function publicCapabilities(user) {
  const stage = VERSION.stage;
  return {
    version: VERSION,
    userId: user.userId,
    permissions: { canInspectContext: hasPermission(user, 'context:inspect'), canQuality: hasPermission(user, 'context:quality') },
    features: {
      memory: stage >= 2,
      userSession: stage >= 3,
      appContext: stage >= 4,
      persistence: stage >= 5,
      actions: stage >= 6,
      tokenBudget: stage >= 7,
      pruning: stage >= 8,
      longConversations: stage >= 9,
      contextPolicy: stage >= 10
    },
    tasks: {
      summarize_ticket: { description: 'Resumir el ticket activo' },
      add_note: { description: 'Añadir nota al ticket activo' },
      close_ticket: { description: 'Solicitar cierre con confirmación' },
      context_health: { description: 'Inspeccionar calidad del contexto' }
    }
  };
}

function normalizeError(error, res) {
  const status = error.statusCode || (error.name === 'ZodError' ? 400 : 500);
  res.status(status).json({ success: false, message: error.message, issues: error.issues });
}

export async function startServer() {
  const config = loadConfig();
  const store = createMemoryStore(config.dataDir);
  const model = createModel(config);
  const runtime = { config, store, model };
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => res.json({ ok: true, service: 'tema12-contexto', version: VERSION, modelMode: config.modelMode, stage: VERSION.stage }));
  app.get('/api/capabilities', (req, res) => { try { res.json(publicCapabilities(getUserContext(req))); } catch(e) { normalizeError(e, res); } });
  app.get('/api/demo/tickets', (req, res) => { try { const user = getUserContext(req); res.json({ tickets: listTickets(user) }); } catch(e) { normalizeError(e, res); } });

  app.post('/api/chat', async (req, res) => {
    try {
      const user = getUserContext(req);
      const body = ChatBody.parse(req.body);
      const conversationId = body.conversationId || crypto.randomUUID();
      const appContext = sanitizeAppContext(body.appContext || {});
      const session = buildSession(conversationId, user, appContext, config);
      const memory = store.load(conversationId, user);

      if (VERSION.stage >= 8) {
        const pruneResult = pruneConversationContext({ memory, appContext, store, maxRecentMessages: 6, pendingActionTtlMinutes: 2 });
        if (pruneResult.removed.length) store.save(memory);
        memory._lastPruneResult = pruneResult;
      }

      if (VERSION.stage >= 10) {
        const policy = evaluateContextPolicy({ user, session, appContext, memory });
        if (!policy.allowed) {
          store.appendEvent(memory, 'context_policy_blocked', { issues: policy.issues });
          store.save(memory);
          return res.status(400).json({ success: false, message: 'El contexto recibido no cumple las reglas mínimas de seguridad.', contextPolicy: policy });
        }
        memory._lastPolicy = policy;
      }

      addMessage(memory, 'user', body.message);
      const appTicketId = appContext.activeEntity?.type === 'ticket' ? appContext.activeEntity.id : undefined;
      if (VERSION.stage >= 4 && appTicketId && hasPermission(user, 'ticket:read')) {
        const ticket = getTicketById(appTicketId, user, { includeInternal: hasPermission(user, 'ticket:view_internal_notes') });
        if (ticket) { memory.entities.activeTicketId = ticket.id; memory.entities.activeTicketTitle = ticket.title; store.appendEvent(memory, 'active_ticket_set', { ticketId: ticket.id, source: 'app_context' }); }
      }
      if (!memory.entities.activeTicketId && /último ticket|ultimo ticket|ticket abierto/i.test(body.message) && hasPermission(user, 'ticket:read')) {
        const ticket = getLastOpenTicket(user);
        if (ticket) { memory.entities.activeTicketId = ticket.id; memory.entities.activeTicketTitle = ticket.title; store.appendEvent(memory, 'active_ticket_set', { ticketId: ticket.id, source: 'user_message' }); }
      }

      const action = VERSION.stage >= 6 ? detectAction(body.message) : { type: 'none' };
      let immediateText = null;
      if (action.type === 'add_ticket_note') {
        if (!memory.entities.activeTicketId) immediateText = 'No tengo un ticket activo sobre el que añadir la nota. Selecciona o abre primero un ticket.';
        else if (!hasPermission(user, 'ticket:add_note')) {
          memory.lastAction = { type: 'add_ticket_note', resourceType: 'ticket', resourceId: memory.entities.activeTicketId, status: 'denied', message: 'Missing permission ticket:add_note', executedAt: new Date().toISOString() };
          store.appendActionEvent(memory, { action: 'add_ticket_note', decision: 'denied', resourceId: memory.entities.activeTicketId, reason: 'missing_permission' });
          immediateText = 'No tienes permiso para añadir notas a este ticket.';
        } else {
          const updated = addTicketNote(memory.entities.activeTicketId, user, action.noteText);
          memory.lastAction = { type: 'add_ticket_note', resourceType: 'ticket', resourceId: memory.entities.activeTicketId, status: updated ? 'completed' : 'failed', message: updated ? 'Ticket note added' : 'Ticket not available', executedAt: new Date().toISOString() };
          store.appendActionEvent(memory, { action: 'add_ticket_note', decision: updated ? 'completed' : 'failed', resourceId: memory.entities.activeTicketId });
          immediateText = updated ? `Nota añadida al ticket ${updated.id}.` : 'No he podido añadir la nota porque el ticket no está disponible para tu usuario.';
        }
      }
      if (action.type === 'close_ticket') {
        if (!memory.entities.activeTicketId) immediateText = 'No tengo un ticket activo para cerrar. Selecciona primero un ticket.';
        else if (!hasPermission(user, 'ticket:close_request')) {
          memory.lastAction = { type: 'close_ticket', resourceType: 'ticket', resourceId: memory.entities.activeTicketId, status: 'denied', message: 'Missing permission ticket:close_request', executedAt: new Date().toISOString() };
          store.appendActionEvent(memory, { action: 'close_ticket', decision: 'denied', resourceId: memory.entities.activeTicketId, reason: 'missing_permission' });
          immediateText = 'Puedes consultar el ticket, pero no tienes permiso para solicitar el cierre.';
        } else {
          const actionId = newActionId('close');
          memory.pendingAction = { actionId, type: 'close_ticket', resourceType: 'ticket', resourceId: memory.entities.activeTicketId, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 2 * 60_000).toISOString(), requiresConfirmation: true, summary: `Solicitar cierre de ${memory.entities.activeTicketId}` };
          memory.lastAction = { type: 'close_ticket', resourceType: 'ticket', resourceId: memory.entities.activeTicketId, status: 'pending_confirmation', message: 'Waiting explicit confirmation', executedAt: new Date().toISOString() };
          store.appendActionEvent(memory, { action: 'close_ticket', decision: 'pending_confirmation', actionId, resourceId: memory.entities.activeTicketId });
          immediateText = `Puedo solicitar el cierre de ${memory.entities.activeTicketId}. Confirma con “Sí, confirmo”.`;
        }
      }
      if (action.type === 'confirm' && memory.pendingAction?.type === 'close_ticket') {
        const pending = memory.pendingAction;
        if (new Date(pending.expiresAt).getTime() < Date.now()) {
          memory.pendingAction = null;
          immediateText = 'La acción pendiente ha caducado. Vuelve a solicitar el cierre si todavía lo necesitas.';
        } else {
          const updated = requestCloseTicket(pending.resourceId, user);
          memory.pendingAction = null;
          memory.lastAction = { type: 'close_ticket', resourceType: 'ticket', resourceId: pending.resourceId, status: updated ? 'completed' : 'failed', message: updated ? 'Close requested' : 'Ticket not available', executedAt: new Date().toISOString() };
          store.appendActionEvent(memory, { action: 'close_ticket', decision: updated ? 'completed' : 'failed', actionId: pending.actionId, resourceId: pending.resourceId, confirmedByUser: true });
          immediateText = updated ? `Solicitud de cierre registrada para ${pending.resourceId}.` : 'No he podido registrar el cierre porque el ticket ya no está disponible.';
        }
      }

      const activeTicket = memory.entities.activeTicketId && hasPermission(user, 'ticket:read') ? getTicketById(memory.entities.activeTicketId, user, { includeInternal: hasPermission(user, 'ticket:view_internal_notes') }) : null;
      const optimizedContext = VERSION.stage >= 7 ? buildOptimizedContext({ user, session, appContext, memory, activeTicket, userMessage: body.message, stage: VERSION.stage, contextMode: body.contextMode || 'normal' }) : { text: JSON.stringify({ user: safeUser(user), session, appContext, memory: safeMemory(memory), activeTicket }, null, 2), includedSections: ['contexto completo'], excludedSections: [], estimatedTokens: 0, sectionTokens: {} };
      const text = immediateText || await model.complete({ system: optimizedContext.text, message: body.message, activeTicket, memory, contextDebug: optimizedContext });
      addMessage(memory, 'assistant', text);

      let compactionResult = null;
      if (VERSION.stage >= 9) compactionResult = await compactConversationIfNeeded({ runtime, memory, store, maxMessagesBeforeCompaction: 12, keepRecentMessages: 6 });

      store.save(memory);
      res.json({ success: true, text, status: memory.pendingAction ? 'needs_confirmation' : 'answered', conversationId, pendingAction: memory.pendingAction, contextDebug: { ...(body.debugTokens ? { tokenDebug: optimizedContext } : { includedSections: optimizedContext.includedSections, excludedSections: optimizedContext.excludedSections, estimatedTokens: optimizedContext.estimatedTokens }), pruning: memory._lastPruneResult, contextPolicy: memory._lastPolicy, compaction: compactionResult, memory: safeMemory(memory) } });
    } catch (error) { normalizeError(error, res); }
  });

  app.post('/api/chat/confirm', (req, res) => {
    try {
      const user = getUserContext(req);
      const body = ConfirmBody.parse(req.body);
      const memory = store.load(body.conversationId, user);
      if (!memory.pendingAction || memory.pendingAction.actionId !== body.actionId) return res.status(404).json({ success: false, message: 'No hay acción pendiente con ese actionId.' });
      if (body.decision === 'cancel') {
        memory.lastAction = { type: memory.pendingAction.type, resourceType: memory.pendingAction.resourceType, resourceId: memory.pendingAction.resourceId, status: 'failed', message: 'Cancelled by user', executedAt: new Date().toISOString() };
        memory.pendingAction = null; store.save(memory); return res.json({ success: true, text: 'Acción descartada.', conversationId: body.conversationId, pendingAction: null });
      }
      const updated = requestCloseTicket(memory.pendingAction.resourceId, user);
      memory.lastAction = { type: memory.pendingAction.type, resourceType: memory.pendingAction.resourceType, resourceId: memory.pendingAction.resourceId, status: updated ? 'completed' : 'failed', message: updated ? 'Close requested' : 'Ticket not available', executedAt: new Date().toISOString() };
      store.appendActionEvent(memory, { action: memory.pendingAction.type, decision: updated ? 'completed' : 'failed', actionId: memory.pendingAction.actionId, resourceId: memory.pendingAction.resourceId, confirmedByUser: true });
      const text = updated ? `Solicitud de cierre registrada para ${updated.id}.` : 'No se ha podido registrar el cierre.';
      memory.pendingAction = null; addMessage(memory, 'assistant', text); store.save(memory);
      res.json({ success: true, text, conversationId: body.conversationId, pendingAction: null, contextDebug: { memory: safeMemory(memory) } });
    } catch (error) { normalizeError(error, res); }
  });

  app.get('/api/context/:conversationId', (req, res) => { try { const user = getUserContext(req); const memory = store.load(req.params.conversationId, user); res.json(safeMemory(memory)); } catch(e) { normalizeError(e, res); } });
  app.get('/api/context/:conversationId/events', (req, res) => { try { const user = getUserContext(req); const memory = store.load(req.params.conversationId, user); res.json({ events: store.listEvents(memory) }); } catch(e) { normalizeError(e, res); } });
  app.get('/api/context/:conversationId/segments', (req, res) => { try { const user = getUserContext(req); const memory = store.load(req.params.conversationId, user); res.json({ segments: store.listSegments(memory) }); } catch(e) { normalizeError(e, res); } });
  app.post('/api/context/quality', (req, res) => { try { const user = getUserContext(req); const body = z.object({ conversationId: z.string(), appContext: z.unknown().optional(), autoFix: z.boolean().optional() }).parse(req.body); const appContext = sanitizeAppContext(body.appContext || {}); const memory = store.load(body.conversationId, user); const session = buildSession(body.conversationId, user, appContext, config); const before = scoreContextQuality({ user, session, appContext, memory }); if (body.autoFix && VERSION.stage >= 8) pruneConversationContext({ memory, appContext, store }); store.save(memory); const after = scoreContextQuality({ user, session, appContext, memory }); res.json({ before, after: body.autoFix ? after : undefined, memory: safeMemory(memory) }); } catch(e) { normalizeError(e, res); } });
  app.post('/api/admin/context/prune', (req, res) => { try { const user = getUserContext(req); if (!hasPermission(user, 'context:admin')) return res.status(403).json({ success: false, message: 'No tienes permiso para limpiar contextos.' }); const deleted = store.pruneExpired(); res.json({ deleted, executedBy: user.userId }); } catch(e) { normalizeError(e, res); } });

  const server = app.listen(config.port, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${config.port}`;
  return { app, server, baseUrl, runtime };
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  startServer().then(({ baseUrl, runtime }) => {
    console.log(`${VERSION.id} · ${VERSION.title}\n${baseUrl} · ${runtime.config.modelMode}`);
  });
}

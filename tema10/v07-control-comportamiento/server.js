import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createConfig } from './config.js';
import { createDomain } from './domain.js';
import { createModel } from './model.js';
import { getUser, requireSupervisor } from './auth.js';
import { HttpError, audit } from './storage.js';
import { availableToolNames } from './tools.js';
import { taskDefinitions } from './tasks.js';
import { getSession, sessionSummary } from './sessions.js';
import { runAgent } from './agent.js';
import { confirmAction } from './actions.js';

const conversationId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const agentBody = z.object({
  message: z.string().trim().min(1).max(4000).optional(),
  messages: z.array(z.object({ role: z.literal('user'), content: z.string().trim().min(1).max(4000) }).strict()).length(1).optional(),
  conversationId: conversationId.optional(), taskName: z.string().max(60).optional()
}).strict().refine(body => Boolean(body.message) !== Boolean(body.messages), { message: 'Envía message o un único mensaje user. El historial lo conserva el backend.' });
const confirmationBody = z.object({ conversationId, actionId: z.string().min(1).max(100), decision: z.enum(['confirm', 'cancel']) }).strict();
const decisionBody = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
const feedbackBody = z.object({ conversationId, taskName: z.string().min(1).max(60), rating: z.number().int().min(1).max(5), comment: z.string().max(1200).default(''), resolved: z.boolean() }).strict();

function parse(schema, data) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new HttpError(400, 'INVALID_REQUEST', parsed.error.issues.map(item => item.message).join(' '));
  return parsed.data;
}

export async function createApp(overrides = {}) {
  const config = createConfig(overrides);
  const runtime = { config, sessions: new Map(), locks: new Set() };
  createDomain(runtime);
  if (config.version.stage >= 4) {
    const api = await import('./internal-api.js');
    runtime.executeTool = (tool, input, meta) => api.callInternalApi(runtime, tool, input, meta);
    runtime.registerInternalApi = api.registerInternalApi;
  } else runtime.executeTool = async (tool, input, meta) => runtime.executeDomain(tool, input, meta);
  if (config.version.stage >= 5) runtime.memory = (await import('./memory-store.js')).createMemoryStore(runtime);
  if (config.version.stage >= 7) runtime.policy = await import('./policy-engine.js');
  if (config.version.stage >= 8) runtime.supervision = (await import('./approval-store.js')).createSupervision(runtime);
  if (config.version.stage >= 9) runtime.feedback = (await import('./feedback-store.js')).createFeedbackStore(runtime);
  runtime.model = overrides.modelOverride || createModel(runtime);

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin(origin, callback) {
    if (!origin || config.allowedOrigins.includes(origin)) callback(null, true);
    else callback(new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Origen no permitido. Usa Angular en localhost:4200.'));
  } }));
  app.use(express.json({ limit: '64kb' }));
  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'tema10-agent-backend', version: config.version, modelMode: config.modelMode, model: config.modelMode === 'claude' ? config.model : 'simulador local', effort: config.effort }));
  app.get('/api/capabilities', (req, res) => {
    const user = getUser(req);
    res.json({ success: true, version: config.version, userId: user.userId, permissions: user.permissions, tools: availableToolNames(config.version.stage), tasks: taskDefinitions(config.version.stage), features: { chatbot: config.version.stage >= 2, tasks: config.version.stage >= 3, internalApis: config.version.stage >= 4, memory: config.version.stage >= 5, multiSystem: config.version.stage >= 6, policy: config.version.stage >= 7, supervision: config.version.stage >= 8, feedback: config.version.stage >= 9, checks: config.version.stage >= 10 } });
  });
  app.post('/api/agent', async (req, res) => {
    const body = parse(agentBody, req.body);
    body.message ||= body.messages[0].content;
    res.json(await runAgent(runtime, getUser(req), body));
  });
  app.post('/api/agent/confirm', async (req, res) => res.json(await confirmAction(runtime, getUser(req), parse(confirmationBody, req.body))));
  if (config.version.stage >= 2) app.post('/api/chatbot', async (req, res) => {
    const body = parse(agentBody, req.body); body.message ||= body.messages[0].content;
    res.json(await runAgent(runtime, getUser(req), body, true));
  });
  app.get('/api/agent/conversations/:conversationId', (req, res) => {
    const user = getUser(req); const session = getSession(runtime, user.userId, req.params.conversationId);
    res.json({ success: true, session: sessionSummary(session), ...(runtime.memory ? { profile: runtime.memory.getProfile(user.userId) } : {}) });
  });
  app.get('/api/demo/orders', (req, res) => {
    const user = getUser(req);
    if (!user.permissions.canReadOrders) throw new HttpError(403, 'INSUFFICIENT_PERMISSIONS', 'No puedes consultar pedidos.');
    res.json({ success: true, orders: runtime.state.orders.map(({ tenantId, ...order }) => order) });
  });
  app.get('/api/demo/tickets', (req, res) => {
    const user = getUser(req);
    res.json({ success: true, tickets: runtime.state.tickets.filter(item => user.permissions.canSupervise || item.userId === user.userId) });
  });
  runtime.registerInternalApi?.(app, runtime);
  if (runtime.supervision) {
    app.get('/api/supervisor/approvals', (req, res) => { requireSupervisor(req); res.json({ success: true, approvals: runtime.supervision.listPending() }); });
    for (const decision of ['approve', 'reject']) app.post(`/api/supervisor/approvals/:approvalId/${decision}`, async (req, res) => {
      const supervisor = requireSupervisor(req); const body = parse(decisionBody, req.body);
      res.json(await runtime.supervision.decide(req.params.approvalId, decision, supervisor, body.reason));
    });
  }
  if (runtime.feedback) app.post('/api/agent/feedback', (req, res) => {
    const user = getUser(req); const body = parse(feedbackBody, req.body);
    if (!taskDefinitions(config.version.stage)[body.taskName]) throw new HttpError(400, 'UNKNOWN_TASK', 'La tarea no existe.');
    res.status(201).json(runtime.feedback.save(user.userId, body));
  });
  if (config.version.stage >= 10) app.get('/api/agent/checks', (req, res) => {
    getUser(req);
    res.json({ success: true, agentVersion: config.version.id, checks: { scopedConversationMemory: Boolean(runtime.memory), boundedToolLoop: config.maxIterations, maximumToolCalls: config.maxToolCalls, actionTtlSeconds: config.actionTtlMs / 1000, confirmationByActionId: true, internalServiceAuth: true, supervisorRole: true, versionRevalidation: true, idempotentBusinessActions: true, feedback: Boolean(runtime.feedback), modelMode: config.modelMode } });
  });
  app.use((req, res) => res.status(404).json({ success: false, errorCode: 'ENDPOINT_NOT_FOUND', message: 'Este endpoint no está disponible en la versión seleccionada.' }));
  app.use((error, req, res, next) => {
    const status = error.status || 500;
    const message = error instanceof SyntaxError ? 'El cuerpo JSON no es válido.' : status < 500 || error instanceof HttpError ? error.message : 'Error interno. Consulta el log del backend.';
    audit(runtime, 'errors.jsonl', { errorCode: error.code || 'INTERNAL_ERROR', status, path: req.path });
    res.status(status).json({ success: false, errorCode: error.code || (error instanceof SyntaxError ? 'INVALID_JSON' : 'INTERNAL_ERROR'), message });
  });
  return { app, runtime };
}

export async function startServer(overrides = {}) {
  const { app, runtime } = await createApp(overrides);
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(runtime.config.port, runtime.config.host, () => resolve(instance));
    instance.once('error', reject);
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  runtime.internalBaseUrl = `${baseUrl}/internal`;
  return { app, runtime, server, baseUrl, close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); }) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().then(({ runtime, baseUrl, server }) => {
    console.log(`${runtime.config.version.id}: ${baseUrl} | modo ${runtime.config.modelMode}`);
    console.log('Frontend Angular: http://localhost:4200 | perfiles: demo-agent, demo-readonly, demo-supervisor');
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

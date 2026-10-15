import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { readConfig, type LabConfig } from './config.js';
import { identityOf, demoUsers } from './auth/demo-auth.js';
import { ApiError, toApiError } from './errors/api-error.js';
import { ClaudeService } from './analysis/claude.service.js';
import { taskCatalog, analysisFromIntent } from './analysis/task-catalog.js';
import type { Analysis, Identity, Payload } from './types/automation.types.js';
import { AuditService } from './services/audit.service.js';
import { PlanService } from './planning/plan.service.js';
import { TicketRepository } from './domain/support/ticket.repository.js';
import { ActionExecutor } from './actions/action-executor.js';
import { createSupportPolicy } from './domain/support/support-policy.js';

export function createApp(config: LabConfig = readConfig()) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: ['http://localhost:4200', 'http://127.0.0.1:4200'] }));
  app.use(express.json({ limit: '32kb' }));
  const claude = new ClaudeService(config);
  const features = ["analysis", "plans", "execution", "registry", "tickets", "business_rules"];
  const health = { status: 'ok', service: 'tema9-backend', version: config.version, stage: config.stage,
    title: config.title, ai_mode: config.mode, model: config.mode === 'claude' ? config.model : null, features };
  app.get(['/health', '/api/health', '/api/capabilities'], (_req, res) => res.json(health));
  app.get('/api/demo/users', (_req, res) => res.json(demoUsers));
  app.use('/api', (req, res, next) => { try { res.locals.user = identityOf(req); next(); } catch (error) { next(error); } });
  const user = (res: express.Response): Identity => res.locals.user;
  const messageSchema = z.object({ message: z.string().trim().min(1).max(4000) });
  const executionSchema = z.object({ flow_id: z.string().optional(), plan: z.unknown().optional(),
    confirmed: z.boolean().default(false), dry_run: z.boolean().default(false) });
  const pickId = (body: { flow_id?: string; plan?: unknown }): string => {
    const id = body.flow_id ?? (body.plan as { flow_id?: string } | undefined)?.flow_id;
    if (!id || typeof id !== 'string') throw new ApiError('VALIDATION_ERROR', 'flow_id es obligatorio.', 400);
    return id;
  };
  app.get('/api/automation/catalog', (_req, res) => res.json(taskCatalog.filter(t => t.min_stage <= config.stage)));
  app.post('/api/automation/analyze', async (req, res) => {
    const { message } = messageSchema.parse(req.body);
    const intent = await claude.detect(message);
    res.json({ ...analysisFromIntent(intent, config.stage), ai_mode: config.mode });
  });

  const audit = new AuditService(config.auditPath);
  const plans = new PlanService(config.stage, audit);
  const analysisSchema = z.object({ is_automatable: z.boolean(), automation_type: z.string(), reason: z.string().default('Propuesta manual'),
    proposed_action: z.object({ action_name: z.string().optional(), endpoint: z.string().nullable().optional(), payload: z.record(z.string(), z.unknown()) }) });
  app.post('/api/automation/plan', async (req, res) => {
    if (req.body?.message !== undefined) {
      const { message } = messageSchema.parse(req.body);
      res.json(plans.create(await claude.detect(message), user(res)));
    } else {
      const a = analysisSchema.parse(req.body?.analysis);
      res.json(plans.fromAnalysis(a as Analysis, user(res)));
    }
  });
  app.get('/api/automation/plans/:id', (req, res) => res.json(plans.get(String(req.params.id), user(res))));
  app.post('/api/automation/cancel', (req, res) => {
    plans.cancel(pickId(executionSchema.parse(req.body)), user(res)); res.json({ status: 'cancelled' });
  });
  app.get('/api/automation/audit', (req, res) => {
    const limit = z.coerce.number().int().min(1).max(500).default(50).parse(req.query.limit);
    const events = audit.events.filter(e => user(res).user_role === 'admin' || e.user_id === user(res).user_id).slice(-limit).reverse();
    res.json({ count: events.length, events });
  });
  const repo = new TicketRepository();
  const executor = new ActionExecutor(config.stage, repo, plans, audit, { policy: createSupportPolicy(repo) });
  const run = executor.run;

  app.post('/api/automation/execute', async (req, res) => {
    const input = executionSchema.parse(req.body);
    const plan = plans.get(pickId(input), user(res), input.plan);
    const result = await run(plan, { ...user(res), flow_id: plan.flow_id, confirmed: input.confirmed, dry_run: input.dry_run });
    res.status(result.success ? 200 : 502).json(result);
  });

  app.get(['/api/tickets', '/api/tickets/search'], (req, res) => {
    const list = repo.list().filter(t => !req.query.customer || t.customer_name.toLowerCase() === String(req.query.customer).toLowerCase())
      .filter(t => !req.query.status || t.status === req.query.status);
    res.json({ count: list.length, tickets: list });
  });
  app.get('/api/tickets/:id', (req, res) => {
    const ticket = repo.find(String(req.params.id));
    if (!ticket) throw new ApiError('BUSINESS_RULE_BLOCKED', 'El ticket no existe.', 404);
    res.json(ticket);
  });

  app.use((_req, res) => res.status(404).json({ success: false, error: { code: 'FEATURE_UNAVAILABLE', category: 'configuration', retryable: false,
    user_message: 'Esta ruta no está disponible en la versión activa.' } }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const e = error instanceof z.ZodError ? new ApiError('VALIDATION_ERROR', 'La petición tiene datos inválidos.', 400,
      { validation_errors: error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`) }) :
      error instanceof SyntaxError ? new ApiError('VALIDATION_ERROR', 'El body debe ser JSON válido.', 400) : toApiError(error);
    if (e.status === 500) console.error('Error interno en el laboratorio:', error instanceof Error ? error.message : 'unknown');
    res.status(e.status).json({ success: false, status: e.status >= 500 ? 'failed' : 'blocked', message: e.message, error: e.toJSON() });
  });
  return app;
}

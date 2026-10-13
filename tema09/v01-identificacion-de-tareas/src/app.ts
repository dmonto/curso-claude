import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { readConfig, type LabConfig } from './config.js';
import { identityOf, demoUsers } from './auth/demo-auth.js';
import { ApiError, toApiError } from './errors/api-error.js';
import { ClaudeService } from './analysis/claude.service.js';
import { taskCatalog, analysisFromIntent } from './analysis/task-catalog.js';
import type { Analysis, Identity, Payload } from './types/automation.types.js';

export function createApp(config: LabConfig = readConfig()) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: ['http://localhost:4200', 'http://127.0.0.1:4200'] }));
  app.use(express.json({ limit: '32kb' }));
  const claude = new ClaudeService(config);
  const features = ["analysis"];
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

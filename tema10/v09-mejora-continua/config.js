import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
import { VERSION } from './version.js';

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, '.env'), quiet: true });

export function createConfig(overrides = {}) {
  const config = {
    root, version: VERSION, host: '127.0.0.1',
    port: Number(process.env.PORT || 3000),
    modelMode: process.env.MODEL_MODE || 'mock',
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    effort: process.env.CLAUDE_EFFORT || 'medium',
    thinking: process.env.CLAUDE_THINKING || 'adaptive',
    apiKey: process.env.COURSE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
    maxTokens: Number(process.env.CLAUDE_MAX_TOKENS || 4096),
    maxIterations: Number(process.env.MAX_AGENT_ITERATIONS || 10),
    maxToolCalls: Number(process.env.MAX_TOOL_CALLS || 16),
    requestTimeoutMs: Number(process.env.MODEL_TIMEOUT_MS || 45000),
    apiTimeoutMs: Number(process.env.INTERNAL_API_TIMEOUT_MS || 5000),
    actionTtlMs: Number(process.env.ACTION_TTL_SECONDS || 600) * 1000,
    sessionTtlMs: Number(process.env.SESSION_TTL_SECONDS || 1800) * 1000,
    dataDir: path.resolve(root, process.env.DATA_DIR || 'data/runtime'),
    logDir: path.resolve(root, process.env.LOG_DIR || 'logs'),
    internalToken: process.env.INTERNAL_API_TOKEN || randomBytes(32).toString('hex'),
    allowedOrigins: ['http://localhost:4200', 'http://127.0.0.1:4200'],
    // Solo para ensayar fallos locales del laboratorio: vacío en uso normal.
    failureTool: process.env.DEMO_FAIL_TOOL || '',
    ...overrides
  };
  if (!['mock', 'claude'].includes(config.modelMode)) throw new Error('MODEL_MODE debe ser mock o claude.');
  if (!['low', 'medium', 'high'].includes(config.effort)) throw new Error('CLAUDE_EFFORT debe ser low, medium o high.');
  if (!['adaptive', 'omit'].includes(config.thinking)) throw new Error('CLAUDE_THINKING debe ser adaptive u omit.');
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error('PORT no válido.');
  for (const name of ['maxTokens', 'maxIterations', 'maxToolCalls', 'requestTimeoutMs', 'apiTimeoutMs', 'actionTtlMs', 'sessionTtlMs']) {
    if (!Number.isFinite(config[name]) || config[name] <= 0) throw new Error(`${name} debe ser positivo.`);
  }
  if (config.modelMode === 'claude' && !config.apiKey) throw new Error('Configura COURSE_ANTHROPIC_API_KEY en el backend.');
  return config;
}

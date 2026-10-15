import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { features } from './features.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

function integer(name, fallback, min, max) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Configuración inválida: ${name}`);
  return n;
}

export const config = Object.freeze({
  host: '127.0.0.1',
  port: integer('GATEWAY_PORT', process.env.PORT || 3000, 1, 65535),
  ordersPort: integer('ORDERS_PORT', 4001, 1, 65535),
  customersPort: integer('CUSTOMERS_PORT', 4002, 1, 65535),
  billingPort: integer('BILLING_PORT', 4003, 1, 65535),
  ticketsPort: integer('TICKETS_PORT', 4004, 1, 65535),
  mock: (process.env.MOCK_CLAUDE ?? 'true') === 'true',
  apiKey: process.env.COURSE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '',
  model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  effort: process.env.CLAUDE_EFFORT || 'medium',
  thinking: process.env.CLAUDE_THINKING || 'adaptive',
  maxTokens: integer('CLAUDE_MAX_TOKENS', 4096, 1024, 32768),
  modelTimeoutMs: integer('MODEL_TIMEOUT_MS', 60000, 1000, 180000),
  maxRounds: integer('MAX_MODEL_ROUNDS', 5, 1, 8),
  maxToolCalls: integer('MAX_TOOL_CALLS', 8, 1, 16),
  internalToken: process.env.INTERNAL_TOKEN || 'curso-local-internal-token-change-me',
  jwtSecret: process.env.JWT_SECRET || 'curso-local-jwt-secret-change-me-at-least-32-characters',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '30m',
  actionTtlMs: integer('ACTION_TTL_MS', 300000, 100, 3600000),
  serviceTimeoutMs: integer('SERVICE_TIMEOUT_MS', 1200, 50, 10000),
  toolTimeoutMs: integer('TOOL_TIMEOUT_MS', 3500, 100, 30000),
  cacheTtlMs: integer('CUSTOMER_CACHE_TTL_MS', 60000, 100, 3600000),
  chaosService: process.env.CHAOS_SERVICE || 'none',
  chaosMode: process.env.CHAOS_MODE || 'none',
  chaosOperation: process.env.CHAOS_OPERATION || 'all',
  allowChaos: (process.env.ALLOW_CHAOS ?? 'false') === 'true',
  origins: (process.env.FRONTEND_ORIGINS || 'http://localhost:4200,http://127.0.0.1:4200').split(',')
});

if (!['low', 'medium', 'high', 'max'].includes(config.effort)) throw new Error('CLAUDE_EFFORT inválido');
if (!['adaptive', 'omit'].includes(config.thinking)) throw new Error('CLAUDE_THINKING debe ser adaptive u omit');
if (!config.mock && (!config.apiKey || config.apiKey === 'TU_API_KEY')) throw new Error('Configura ANTHROPIC_API_KEY o COURSE_ANTHROPIC_API_KEY');
if (features.jwt && config.jwtSecret.length < 32) throw new Error('JWT_SECRET requiere al menos 32 caracteres');
if (config.toolTimeoutMs <= config.serviceTimeoutMs && features.performance) throw new Error('TOOL_TIMEOUT_MS debe superar SERVICE_TIMEOUT_MS');

export function serviceUrl(name) {
  const ports = { orders: config.ordersPort, customers: config.customersPort, billing: config.billingPort, tickets: config.ticketsPort };
  const url = process.env[`${name.toUpperCase()}_SERVICE_URL`] || `http://127.0.0.1:${ports[name]}`;
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('URL interna inválida');
  return url.replace(/\/$/, '');
}

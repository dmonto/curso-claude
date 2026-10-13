import jwt from 'jsonwebtoken';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { USERS } from './data.js';
import { config } from './config.js';
import { features } from './features.js';
import { IntegrationError } from './errors.js';
import { audit } from './audit.js';

export const hasPermission = (user, p) => user.permissions.includes(p);
export const hasRole = (user, r) => user.roles.includes(r);
export const publicUser = ({ id, displayName, tenantId, roles, permissions }) => ({ id, displayName, tenantId, roles, permissions });
export function authenticate(username, password) {
  const user = USERS[username];
  const candidate = scryptSync(password, `curso-demo-${username}`, 64);
  const expected = Buffer.from(user?.passwordHash || '0'.repeat(128), 'hex');
  return timingSafeEqual(candidate, expected) && user ? user : null;
}
export function createAccessToken(user) {
  return jwt.sign({ name: user.displayName, tenantId: user.tenantId, roles: user.roles, permissions: user.permissions }, config.jwtSecret,
    { subject: user.id, expiresIn: config.accessTokenTtl, algorithm: 'HS256', issuer: 'curso-claude-app', audience: 'assistant-gateway' });
}
export function requestUser(req) {
  if (!features.jwt) {
    const user = USERS[req.get('x-demo-user') || 'ana'];
    if (!user) throw new IntegrationError('UNAUTHORIZED', 401);
    return user;
  }
  const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') || '');
  if (!match) throw new IntegrationError('UNAUTHORIZED', 401);
  try {
    const claims = jwt.verify(match[1], config.jwtSecret, { algorithms: ['HS256'], issuer: 'curso-claude-app', audience: 'assistant-gateway' });
    const user = USERS[claims.sub];
    if (!user || user.tenantId !== claims.tenantId) throw new Error('Identidad inválida');
    // Los permisos efectivos se releen del servidor en cada petición.
    return user;
  } catch { throw new IntegrationError('UNAUTHORIZED', 401); }
}

export const TOOL_POLICIES = Object.freeze({
  get_order_status: { permissions: ['orders:read'], roles: [] },
  get_order_context: { permissions: ['orders:read'], roles: [] },
  search_orders: { permissions: ['orders:read'], roles: [] },
  search_invoices: { permissions: ['billing:read'], roles: [] },
  prepare_cancel_order: { permissions: ['orders:read', 'orders:cancel'], roles: ['operations_manager'] },
  prepare_create_ticket: { permissions: ['orders:read', 'tickets:create'], roles: [] }
});
export function canUseTool(user, name) {
  const p = TOOL_POLICIES[name];
  return Boolean(p && p.permissions.every(v => hasPermission(user, v)) && (!features.roles || p.roles.every(v => hasRole(user, v))));
}
export function authorizeTool(user, name, correlationId) {
  if (canUseTool(user, name)) return;
  audit('authorization_denied', { userId: user.id, tenantId: user.tenantId, toolName: name, correlationId });
  throw new IntegrationError('FORBIDDEN', 403);
}
export function internalUser(req) {
  const received = Buffer.from(req.get('x-internal-token') || '');
  const expected = Buffer.from(config.internalToken);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new IntegrationError('UNAUTHORIZED', 401);
  const user = USERS[req.get('x-user-id')];
  if (!user || req.get('x-tenant-id') !== user.tenantId || !req.get('x-correlation-id')) throw new IntegrationError('UNAUTHORIZED', 401);
  return user;
}

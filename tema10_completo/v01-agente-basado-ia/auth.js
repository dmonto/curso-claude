import { HttpError } from './storage.js';

// Identidades de laboratorio. En producción se obtienen de una sesión verificada.
export const DEMO_USERS = {
  'demo-agent': { canReadOrders: true, canReadShipping: true, canReadCustomers: true, canExecuteSensitiveActions: true },
  'demo-user': { canReadOrders: true, canReadShipping: true, canReadCustomers: true, canExecuteSensitiveActions: true },
  'user-001': { canReadOrders: true, canReadShipping: true, canReadCustomers: true, canExecuteSensitiveActions: true },
  'demo-readonly': { canReadOrders: true, canReadShipping: true, canReadCustomers: false, canExecuteSensitiveActions: false },
  'demo-supervisor': { canReadOrders: true, canReadShipping: true, canReadCustomers: true, canExecuteSensitiveActions: true, canSupervise: true },
  'supervisor-01': { canReadOrders: true, canReadShipping: true, canReadCustomers: true, canExecuteSensitiveActions: true, canSupervise: true }
};
export function getUser(req) {
  const userId = req.get('x-user-id');
  if (!userId || !DEMO_USERS[userId]) throw new HttpError(401, 'DEMO_IDENTITY_REQUIRED', 'Usa una identidad de laboratorio válida en x-user-id.');
  return { userId, tenantId: 'demo', permissions: DEMO_USERS[userId] };
}
export function requireSupervisor(req) {
  const user = getUser(req);
  if (!user.permissions.canSupervise) throw new HttpError(403, 'SUPERVISOR_REQUIRED', 'Esta operación requiere el perfil supervisor.');
  return user;
}
export function permissionFor(toolName) {
  if (toolName === 'get_order_status') return 'canReadOrders';
  if (toolName === 'get_shipping_status') return 'canReadShipping';
  if (toolName === 'get_customer_profile') return 'canReadCustomers';
  if (toolName.includes('user_preference')) return null;
  return 'canExecuteSensitiveActions';
}

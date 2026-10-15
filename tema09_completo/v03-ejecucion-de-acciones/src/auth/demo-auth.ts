import type { Request } from 'express';
import type { Identity } from '../types/automation.types.js';
import { ApiError } from '../errors/api-error.js';

// Identidades ficticias del laboratorio. En producción se sustituye por una sesión verificada.
export const demoUsers: Identity[] = [
  { user_id: 'user-001', user_role: 'support_agent' },
  { user_id: 'user-002', user_role: 'support_lead' },
  { user_id: 'user-003', user_role: 'admin' },
  { user_id: 'user-004', user_role: 'viewer' }
];
export function identityOf(req: Request): Identity {
  const id = req.get('X-Demo-User') ?? 'user-001';
  const user = demoUsers.find(u => u.user_id === id);
  if (!user) throw new ApiError('PERMISSION_DENIED', 'Identidad de demostración desconocida.', 401);
  // El body no puede elevar el rol. Se acepta user_id únicamente si coincide con la cabecera.
  if (req.body?.user_id && req.body.user_id !== id) throw new ApiError('PERMISSION_DENIED', 'user_id no coincide con la sesión de demostración.', 403);
  if (req.body?.user_role && req.body.user_role !== user.user_role) throw new ApiError('PERMISSION_DENIED', 'El rol se obtiene de la sesión, no del body.', 403);
  return { ...user };
}

const users = {
  'demo-agent': { userId: 'demo-agent', tenantId: 'tenant-curso', displayName: 'Laura soporte', roles: ['support_agent'], permissions: ['ticket:read','ticket:add_note','ticket:close_request','ticket:view_internal_notes','context:inspect','context:quality'] },
  'demo-readonly': { userId: 'demo-readonly', tenantId: 'tenant-curso', displayName: 'Mario lectura', roles: ['reader'], permissions: ['ticket:read','context:inspect'] },
  'demo-supervisor': { userId: 'demo-supervisor', tenantId: 'tenant-curso', displayName: 'Sonia supervisión', roles: ['support_supervisor'], permissions: ['ticket:read','ticket:add_note','ticket:close_request','ticket:view_internal_notes','context:inspect','context:quality','context:admin'] }
};

export function getUserContext(req) {
  const userId = req.header('x-user-id') || req.header('x-demo-user-id') || 'demo-agent';
  const user = users[userId];
  if (!user) {
    const error = new Error(`Usuario no reconocido: ${userId}`);
    error.statusCode = 401;
    throw error;
  }
  return { ...user, locale: 'es-ES', timezone: 'Europe/Madrid' };
}

export function hasPermission(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}

export function safeUser(user) {
  return { userId: user.userId, tenantId: user.tenantId, displayName: user.displayName, roles: user.roles, permissions: user.permissions, locale: user.locale, timezone: user.timezone };
}

import { scryptSync } from 'node:crypto';

const user = (id, tenantId, roles, permissions) => Object.freeze({
  id, displayName: id === 'ana' ? 'Ana Operaciones' : id,
  tenantId, roles, permissions,
  // Credenciales públicas de laboratorio; se compara el hash, no la contraseña.
  passwordHash: scryptSync(`${id}123`, `curso-demo-${id}`, 64).toString('hex')
});
export const USERS = Object.freeze({
  ana: user('ana', 'acme', ['operations_manager'], ['orders:read', 'orders:cancel', 'customers:read', 'billing:read', 'tickets:read', 'tickets:create']),
  soporte: user('soporte', 'acme', ['support_agent'], ['orders:read']),
  operador: user('operador', 'acme', ['operator'], ['orders:read', 'orders:cancel']),
  externo: user('externo', 'globex', ['customer'], ['orders:read', 'customers:read']),
  sinpermisos: user('sinpermisos', 'acme', ['viewer'], [])
});

export function initialData() {
  return {
    orders: [
      { orderId: 'PED-1001', tenantId: 'acme', customerId: 'CUST-001', customerName: 'Cliente Norte', status: 'Preparando envío', eta: '2026-10-07', amount: 1840, currency: 'EUR', internalMargin: 0.18, sensitiveNotes: 'Margen interno de demostración' },
      { orderId: 'PED-1002', tenantId: 'acme', customerId: 'CUST-002', customerName: 'Cliente Centro', status: 'Retrasado', eta: '2026-10-10', amount: 420, currency: 'EUR', internalMargin: 0.11, sensitiveNotes: 'Nota interna de demostración' },
      { orderId: 'PED-1003', tenantId: 'acme', customerId: 'CUST-001', customerName: 'Cliente Norte', status: 'Entregado', eta: '2026-10-01', amount: 250, currency: 'EUR', internalMargin: 0.2, sensitiveNotes: 'Dato privado' },
      { orderId: 'PED-2001', tenantId: 'globex', customerId: 'CUST-900', customerName: 'Globex Retail', status: 'Entregado', eta: '2026-10-01', amount: 910, currency: 'EUR', internalMargin: 0.23, sensitiveNotes: 'Contrato confidencial' }
    ],
    customers: [
      { customerId: 'CUST-001', tenantId: 'acme', name: 'Cliente Norte', segment: 'Enterprise', accountManager: 'Laura', sensitiveRiskNote: 'Negociación comercial' },
      { customerId: 'CUST-002', tenantId: 'acme', name: 'Cliente Centro', segment: 'SMB', accountManager: 'Miguel', sensitiveRiskNote: 'Nota interna' },
      { customerId: 'CUST-900', tenantId: 'globex', name: 'Globex Retail', segment: 'Enterprise', accountManager: 'Sara', sensitiveRiskNote: 'Contrato confidencial' }
    ],
    invoices: [
      { invoiceId: 'FAC-1001', tenantId: 'acme', customerId: 'CUST-001', status: 'Vencida', amount: 240, currency: 'EUR', dueDate: '2026-10-01' },
      { invoiceId: 'FAC-1002', tenantId: 'acme', customerId: 'CUST-001', status: 'Pendiente', amount: 600, currency: 'EUR', dueDate: '2026-10-20' },
      { invoiceId: 'FAC-1003', tenantId: 'acme', customerId: 'CUST-002', status: 'Pagada', amount: 420, currency: 'EUR', dueDate: '2026-10-01' },
      { invoiceId: 'FAC-2001', tenantId: 'globex', customerId: 'CUST-900', status: 'Vencida', amount: 910, currency: 'EUR', dueDate: '2026-10-01' }
    ],
    tickets: [{ ticketId: 'TCK-1000', tenantId: 'acme', orderId: 'PED-1002', title: 'Seguimiento', description: 'Revisar retraso', status: 'Abierto', priority: 'MEDIUM' }]
  };
}

export const orderDto = ({ orderId, customerId, status, eta, amount, currency }) => ({ orderId, customerId, status, eta, amount, currency });
export const customerDto = ({ customerId, name, segment, accountManager }) => ({ customerId, name, segment, accountManager });
export const invoiceDto = ({ invoiceId, customerId, status, amount, currency, dueDate }) => ({ invoiceId, customerId, status, amount, currency, dueDate });
export const ticketDto = ({ ticketId, orderId, status, priority }) => ({ ticketId, orderId, status, priority });

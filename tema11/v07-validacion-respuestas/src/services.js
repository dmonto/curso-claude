import express from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { config } from './config.js';
import { features } from './features.js';
import { internalUser, hasPermission, hasRole } from './auth.js';
import { initialData, orderDto, customerDto, invoiceDto, ticketDto } from './data.js';
import { InputSchemas, OrderId, CustomerId } from './contracts.js';
import { IntegrationError, safeError } from './errors.js';
import { audit } from './audit.js';

function requirePermission(user, permission) {
  if (!hasPermission(user, permission)) throw new IntegrationError('FORBIDDEN', 403);
}
function parse(schema, value) {
  const r = schema.safeParse(value);
  if (!r.success) throw new IntegrationError('BAD_INPUT', 400);
  return r.data;
}
function searchInput(query, schema) {
  const q = Object.fromEntries(Object.entries(query).filter(([k]) => k !== 'chaos'));
  for (const k of ['minAmount', 'maxAmount', 'limit']) if (q[k] !== undefined) q[k] = Number(q[k]);
  return parse(schema, q);
}
function matchFilters(record, filter) {
  return (!filter.status || filter.status === record.status) && (!filter.customerId || filter.customerId === record.customerId)
    && (filter.minAmount === undefined || record.amount >= filter.minAmount) && (filter.maxAmount === undefined || record.amount <= filter.maxAmount);
}

export function createServiceRouter(kind, data = initialData()) {
  const router = express.Router();
  const idempotency = new Map();
  const failureCount = new Map();
  router.use(express.json({ limit: '16kb' }));
  router.use((req, res, next) => {
    try { req.actor = internalUser(req); next(); } catch (e) { next(e); }
  });
  router.use((req, res, next) => {
    if (!config.allowChaos || !features.outputValidation) return next();
    const chaos = req.query.chaos;
    if (chaos === '500') return res.status(500).json({ error: 'Simulated failure' });
    if (chaos === 'flaky') {
      const key = `${req.method}:${req.path}:${req.actor.id}`;
      const n = (failureCount.get(key) || 0) + 1;
      failureCount.set(key, n);
      if (n % 2 === 1) return res.status(503).json({ error: 'Simulated temporary failure' });
    }
    if (chaos === 'timeout') {
      const timer = setTimeout(() => { if (!res.destroyed) res.status(503).json({ error: 'Simulated timeout' }); }, config.serviceTimeoutMs + 750);
      res.on('close', () => clearTimeout(timer));
      return;
    }
    const original = res.json.bind(res);
    if (chaos === 'invalid' || (chaos === 'aftercommit_invalid' && req.method === 'POST')) {
      res.json = body => original({ ...body, internalAuditNote: 'Campo inesperado de laboratorio' });
    }
    if (chaos === 'invalid-json') return res.type('application/json').send('{invalid');
    if (chaos === 'aftercommit_timeout' && req.method === 'POST') {
      res.json = body => {
        const timer = setTimeout(() => { if (!res.destroyed) original(body); }, config.serviceTimeoutMs + 750);
        res.on('close', () => clearTimeout(timer));
        return res;
      };
    }
    next();
  });
  function writeOnce(req, res, operation) {
    const rawKey = req.get('x-idempotency-key');
    if (!rawKey || rawKey.length > 120 || !/^[a-zA-Z0-9-]+$/.test(rawKey)) throw new IntegrationError('BAD_INPUT', 400);
    const key = `${req.actor.tenantId}:${req.actor.id}:${req.method}:${req.path}:${rawKey}`;
    const fingerprint = createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
    const previous = idempotency.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new IntegrationError('CONFLICT', 409);
      audit('idempotency_hit', { service: kind, userId: req.actor.id, correlationId: req.get('x-correlation-id') });
      return res.json(previous.result);
    }
    // La mutación y el registro son síncronos en este proceso de laboratorio.
    const result = operation();
    idempotency.set(key, { fingerprint, result });
    audit('internal_action_committed', { service: kind, userId: req.actor.id, tenantId: req.actor.tenantId, correlationId: req.get('x-correlation-id') });
    return res.json(result);
  }

  if (kind === 'orders') {
    router.get('/orders', (req, res) => {
      requirePermission(req.actor, 'orders:read');
      const filter = searchInput(req.query, InputSchemas.search_orders);
      const max = features.advancedSearch ? 10 : 5;
      const items = data.orders.filter(v => v.tenantId === req.actor.tenantId && matchFilters(v, filter)).slice(0, Math.min(filter.limit || 5, max)).map(orderDto);
      res.json({ count: items.length, items });
    });
    router.get('/orders/:orderId', (req, res) => {
      requirePermission(req.actor, 'orders:read');
      const orderId = parse(OrderId, req.params.orderId.toUpperCase());
      const order = data.orders.find(v => v.orderId === orderId && v.tenantId === req.actor.tenantId);
      if (!order) throw new IntegrationError('NOT_FOUND', 404);
      res.json(orderDto(order));
    });
    if (features.actions) router.post('/orders/:orderId/cancel', (req, res) => {
      requirePermission(req.actor, 'orders:cancel');
      if (features.roles && !hasRole(req.actor, 'operations_manager')) throw new IntegrationError('FORBIDDEN', 403);
      const orderId = parse(OrderId, req.params.orderId.toUpperCase());
      parse(z.object({ reason: z.string().max(500).optional() }).strict(), req.body);
      return writeOnce(req, res, () => {
        const order = data.orders.find(v => v.orderId === orderId && v.tenantId === req.actor.tenantId);
        if (!order) throw new IntegrationError('NOT_FOUND', 404);
        if (order.status === 'Entregado') throw new IntegrationError('CONFLICT', 409);
        order.status = 'Cancelado';
        return { orderId, status: 'Cancelado', message: 'Pedido cancelado correctamente' };
      });
    });
  }
  if (kind === 'customers') router.get('/customers/:customerId', (req, res) => {
    requirePermission(req.actor, 'customers:read');
    const customerId = parse(CustomerId, req.params.customerId.toUpperCase());
    const customer = data.customers.find(v => v.customerId === customerId && v.tenantId === req.actor.tenantId);
    if (!customer) throw new IntegrationError('NOT_FOUND', 404);
    res.json(customerDto(customer));
  });
  if (kind === 'billing') {
    router.get('/billing/customers/:customerId/summary', (req, res) => {
      requirePermission(req.actor, 'billing:read');
      const customerId = parse(CustomerId, req.params.customerId.toUpperCase());
      if (!data.customers.some(v => v.customerId === customerId && v.tenantId === req.actor.tenantId)) throw new IntegrationError('NOT_FOUND', 404);
      const invoices = data.invoices.filter(v => v.customerId === customerId && v.tenantId === req.actor.tenantId);
      res.json({ customerId, pendingInvoices: invoices.filter(v => ['Pendiente', 'Vencida'].includes(v.status)).length,
        overdueAmount: invoices.filter(v => v.status === 'Vencida').reduce((a, v) => a + v.amount, 0), currency: 'EUR' });
    });
    if (features.advancedSearch) router.get('/billing/invoices', (req, res) => {
      requirePermission(req.actor, 'billing:read');
      const filter = searchInput(req.query, InputSchemas.search_invoices);
      const items = data.invoices.filter(v => v.tenantId === req.actor.tenantId && matchFilters(v, filter)).slice(0, filter.limit || 5).map(invoiceDto);
      res.json({ count: items.length, items });
    });
  }
  if (kind === 'tickets') {
    router.get('/tickets', (req, res) => {
      requirePermission(req.actor, 'tickets:read');
      const filter = parse(z.object({ orderId: OrderId.optional(), status: z.literal('Abierto').optional(), limit: z.coerce.number().int().min(1).max(10).optional(), chaos: z.string().optional() }).strict(), req.query);
      const items = data.tickets.filter(v => v.tenantId === req.actor.tenantId && (!filter.orderId || v.orderId === filter.orderId)).slice(0, filter.limit || 5).map(ticketDto);
      res.json({ count: items.length, items });
    });
    if (features.actions) router.post('/tickets', (req, res) => {
      requirePermission(req.actor, 'tickets:create');
      const body = parse(InputSchemas.prepare_create_ticket, req.body);
      return writeOnce(req, res, () => {
        if (!data.orders.some(v => v.orderId === body.orderId && v.tenantId === req.actor.tenantId)) throw new IntegrationError('NOT_FOUND', 404);
        const ticketId = `TCK-${1000 + data.tickets.length}`;
        const ticket = { ...body, ticketId, tenantId: req.actor.tenantId, status: 'Abierto' };
        data.tickets.push(ticket);
        return ticketDto(ticket);
      });
    });
  }
  return router;
}

export function errorHandler(error, req, res, _next) {
  if (res.headersSent) return;
  const e = error.type === 'entity.parse.failed' || error.type === 'entity.too.large' ? new IntegrationError('BAD_INPUT', 400) : error;
  res.status(e instanceof IntegrationError ? e.status : 500).json({ ...safeError(e), correlationId: req.correlationId });
}
export function createServiceApp(kind) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: `${kind}-service`, version: features.version }));
  app.use(createServiceRouter(kind));
  app.use((_req, res) => res.status(404).json({ ok: false, error: 'Ruta no encontrada' }));
  app.use(errorHandler);
  return app;
}
export function startService(kind) {
  const ports = { orders: config.ordersPort, customers: config.customersPort, billing: config.billingPort, tickets: config.ticketsPort };
  const server = createServiceApp(kind).listen(ports[kind], config.host, () => console.log(`${kind}-service: http://${config.host}:${ports[kind]}`));
  server.on('error', e => { console.error(`No se pudo iniciar ${kind}: ${e.code}`); process.exitCode = 1; });
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => server.close());
}

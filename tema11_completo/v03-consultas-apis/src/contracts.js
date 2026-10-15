import { z } from 'zod';

export const OrderId = z.string().regex(/^PED-\d{4}$/);
export const CustomerId = z.string().regex(/^CUST-\d{3}$/);
export const OrderStatus = z.enum(['Preparando envío', 'Retrasado', 'Entregado', 'Cancelado']);
export const InvoiceStatus = z.enum(['Pendiente', 'Vencida', 'Pagada', 'Cancelada']);
export const Priority = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const Currency = z.literal('EUR');
const date = z.iso.date();
const amounts = { minAmount: z.number().finite().nonnegative().optional(), maxAmount: z.number().finite().nonnegative().optional() };
const filter = { customerId: CustomerId.optional(), ...amounts, limit: z.number().int().min(1).max(10).optional() };
const orderedAmounts = v => v.minAmount === undefined || v.maxAmount === undefined || v.minAmount <= v.maxAmount;

export const InputSchemas = {
  get_order_status: z.object({ orderId: OrderId }).strict(),
  get_order_context: z.object({ orderId: OrderId }).strict(),
  search_orders: z.object({ ...filter, status: OrderStatus.optional() }).strict().refine(orderedAmounts),
  search_invoices: z.object({ ...filter, status: InvoiceStatus.optional() }).strict().refine(orderedAmounts),
  prepare_cancel_order: z.object({ orderId: OrderId, reason: z.string().trim().max(500).optional() }).strict(),
  prepare_create_ticket: z.object({ orderId: OrderId, title: z.string().trim().min(1).max(120), description: z.string().trim().min(1).max(1000), priority: Priority }).strict()
};
export const OrderSchema = z.object({ orderId: OrderId, customerId: CustomerId, status: OrderStatus, eta: date, amount: z.number().finite().nonnegative(), currency: Currency }).strict();
export const CustomerSchema = z.object({ customerId: CustomerId, name: z.string().min(1).max(200), segment: z.enum(['SMB', 'Enterprise']), accountManager: z.string().min(1).max(100) }).strict();
export const InvoiceSchema = z.object({ invoiceId: z.string().regex(/^FAC-\d{4}$/), customerId: CustomerId, status: InvoiceStatus, amount: z.number().finite().nonnegative(), currency: Currency, dueDate: date }).strict();
export const TicketSchema = z.object({ ticketId: z.string().regex(/^TCK-\d{4}$/), orderId: OrderId, status: z.literal('Abierto'), priority: Priority }).strict();
const list = schema => z.object({ count: z.number().int().nonnegative(), items: z.array(schema).max(10) }).strict().refine(v => v.count === v.items.length);
export const OrderSearchSchema = list(OrderSchema);
export const InvoiceSearchSchema = list(InvoiceSchema);
export const TicketSearchSchema = list(TicketSchema);
export const BillingSchema = z.object({ customerId: CustomerId, pendingInvoices: z.number().int().nonnegative(), overdueAmount: z.number().finite().nonnegative(), currency: Currency }).strict();
export const CancelSchema = z.object({ orderId: OrderId, status: z.literal('Cancelado'), message: z.string().min(1).max(300) }).strict();
export const MessageSchema = z.object({ message: z.string().trim().min(1).max(4000) }).strict();
export const LoginSchema = z.object({ username: z.string().min(1).max(50), password: z.string().min(1).max(200) }).strict();

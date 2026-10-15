export type Ticket = {
  ticket_id: string; customer_name: string; priority: string; category: string; summary: string;
  status: 'open' | 'in_progress' | 'closed'; owner_team?: string; comments: string[];
  created_by: string; created_at: string; updated_at: string; revision: number;
};
export const customers = [
  { name: 'ACME', status: 'active', plan: 'enterprise' },
  { name: 'Globex', status: 'active', plan: 'standard' },
  { name: 'BlockedCorp', status: 'blocked', plan: 'standard' }
];
export class TicketRepository {
  private records = new Map<string, Ticket>();
  private nextId = 5000;
  constructor() {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
    const seed = [
      { ticket_id: 'TCK-1001', customer_name: 'ACME', priority: 'high', category: 'access', summary: 'Usuario no puede acceder al portal', status: 'open', owner_team: 'soporte N1', age: 72 },
      { ticket_id: 'TCK-1002', customer_name: 'Globex', priority: 'medium', category: 'billing', summary: 'Duda sobre la factura mensual', status: 'open', owner_team: 'soporte N1', age: 55 },
      { ticket_id: 'TCK-1003', customer_name: 'ACME', priority: 'urgent', category: 'security', summary: 'Posible acceso sospechoso al portal', status: 'open', owner_team: 'seguridad', age: 49 },
      { ticket_id: 'TCK-1004', customer_name: 'Globex', priority: 'low', category: 'access', summary: 'Consulta menor ya resuelta', status: 'closed', owner_team: 'soporte N1', age: 90 },
      { ticket_id: 'TCK-1005', customer_name: 'ACME', priority: 'urgent', category: 'access', summary: 'Interrupción general pendiente de asignar', status: 'open', age: 1 }
    ];
    for (const t of seed) this.records.set(t.ticket_id, { ...t, status: t.status as Ticket['status'], comments: [],
      created_by: 'seed', created_at: hoursAgo(t.age + 8), updated_at: hoursAgo(t.age), revision: 1 });
  }
  list(): Ticket[] { return structuredClone([...this.records.values()]); }
  find(id: string): Ticket | undefined { const ticket = this.records.get(id); return ticket ? structuredClone(ticket) : undefined; }
  create(fields: Pick<Ticket, 'customer_name' | 'priority' | 'category' | 'summary'>, user: string): Ticket {
    const now = new Date().toISOString();
    const ticket: Ticket = { ...fields, ticket_id: `TCK-${++this.nextId}`, status: 'open', comments: [],
      created_by: user, created_at: now, updated_at: now, revision: 1 };
    this.records.set(ticket.ticket_id, ticket); return structuredClone(ticket);
  }
  update(id: string, patch: Partial<Pick<Ticket, 'priority' | 'owner_team' | 'status' | 'comments'>>): Ticket {
    const ticket = this.records.get(id);
    if (!ticket) throw new Error('Ticket inexistente');
    Object.assign(ticket, patch, { updated_at: new Date().toISOString(), revision: ticket.revision + 1 });
    return structuredClone(ticket);
  }
}

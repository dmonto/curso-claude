export function toSafeTicket(row) {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    category: row.category,
    customer: row.customer,
    created_at: row.created_at,
    resolution_minutes: row.resolution_minutes
  };
}

export function toSafeTickets(rows) {
  return rows.map(toSafeTicket);
}

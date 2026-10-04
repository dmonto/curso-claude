export function getUserContext(userId) {
  const users = {
    "user-001": {
      userId: "user-001",
      name: "Laura",
      role: "cliente",
      permissions: ["read_orders", "read_tickets", "create_tickets"],
      currentPage: "orders",
      recentOrders: [
        { id: "ORD-1001", status: "entregado", total: 49.9, date: "2026-09-20" },
        { id: "ORD-1002", status: "en transito", total: 89.5, date: "2026-09-25" }
      ],
      openTickets: [
        { id: "TCK-2001", orderId: "ORD-1002", subject: "Retraso en la entrega", status: "abierto" }
      ]
    },
    "user-limited": {
      userId: "user-limited",
      name: "Mario",
      role: "cliente",
      permissions: ["read_orders"],
      currentPage: "orders",
      recentOrders: [
        { id: "ORD-3001", status: "entregado", total: 19.99, date: "2026-09-18" }
      ],
      openTickets: []
    }
  };

  return users[userId] ?? null;
}

export function serializeUserContextForClient(userContext) {
  if (!userContext) {
    return null;
  }

  return {
    userId: userContext.userId,
    name: userContext.name,
    role: userContext.role,
    currentPage: userContext.currentPage,
    permissions: userContext.permissions
  };
}

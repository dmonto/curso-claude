export function getUserContext(userId) {
  const users = {
    "user-001": {
      userId: "user-001",
      name: "Laura",
      role: "cliente",
      permissions: ["read_orders", "read_tickets", "create_tickets"],
      currentPage: "orders",
      recentOrders: [
        {
          id: "ORD-1001",
          status: "entregado",
          total: 89.9,
          date: "2026-09-10",
          items: ["Teclado mecánico", "Ratón inalámbrico"]
        },
        {
          id: "ORD-1002",
          status: "en preparación",
          total: 42.5,
          date: "2026-09-18",
          items: ["Adaptador USB-C", "Cable HDMI"]
        }
      ],
      openTickets: [
        {
          id: "TCK-501",
          orderId: "ORD-1002",
          subject: "Retraso en pedido ORD-1002",
          status: "abierto",
          priority: "media"
        }
      ]
    },
    "user-limited": {
      userId: "user-limited",
      name: "Mario",
      role: "cliente",
      permissions: ["read_orders"],
      currentPage: "orders",
      recentOrders: [
        {
          id: "ORD-2001",
          status: "pendiente de pago",
          total: 17.4,
          date: "2026-09-20",
          items: ["Cable USB-C"]
        }
      ],
      openTickets: []
    }
  };

  return users[userId] ?? null;
}

export function serializeUserContextForClient(userContext) {
  if (!userContext) return null;

  return {
    userId: userContext.userId,
    name: userContext.name,
    role: userContext.role,
    currentPage: userContext.currentPage,
    permissions: userContext.permissions
  };
}

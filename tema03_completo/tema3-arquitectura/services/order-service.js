const orders = [
  {
    id: "ORD-1001",
    userId: "user-001",
    status: "entregado",
    total: 89.9,
    date: "2026-09-10",
    items: ["Teclado mecánico", "Ratón inalámbrico"]
  },
  {
    id: "ORD-1002",
    userId: "user-001",
    status: "en preparación",
    total: 42.5,
    date: "2026-09-18",
    items: ["Adaptador USB-C", "Cable HDMI"]
  },
  {
    id: "ORD-2001",
    userId: "user-limited",
    status: "pendiente de pago",
    total: 17.4,
    date: "2026-09-20",
    items: ["Cable USB-C"]
  }
];

export function getOrderById(orderId, userId) {
  return orders.find((item) => item.id === orderId && item.userId === userId) || null;
}

export function getRecentOrdersForUser(userId) {
  return orders.filter((item) => item.userId === userId);
}

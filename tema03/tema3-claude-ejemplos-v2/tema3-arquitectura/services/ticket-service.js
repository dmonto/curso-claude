const tickets = [
  {
    id: "TCK-501",
    userId: "user-001",
    orderId: "ORD-1002",
    subject: "Retraso en pedido ORD-1002",
    status: "abierto",
    priority: "media",
    createdAt: "2026-09-19T10:30:00.000Z"
  }
];

export function getTicketsForOrder(orderId, userId) {
  return tickets.filter((ticket) => ticket.orderId === orderId && ticket.userId === userId);
}

export function createTicket({ userId, orderId, subject, description }) {
  const ticket = {
    id: `TCK-${Math.floor(Math.random() * 9000 + 1000)}`,
    userId,
    orderId,
    subject,
    description,
    status: "abierto",
    priority: "media",
    createdAt: new Date().toISOString()
  };

  tickets.push(ticket);
  return ticket;
}

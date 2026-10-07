import { getTicketById, parsePermissions } from "./db.js";
import { toSafeTicket } from "./safe-ticket.js";

export function buildAssistantContext({ user, page, entityId }) {
  const permissions = parsePermissions(user);

  const context = {
    user: {
      id: user.id,
      role: user.role,
      permissions
    },
    page,
    availableData: [],
    data: {}
  };

  if (page === "ticket-detail" && entityId) {
    if (permissions.includes("read:tickets") || permissions.includes("read:own_tickets")) {
      const ticket = getTicketById(Number(entityId));

      if (ticket) {
        context.availableData.push("ticket.safe_fields");
        context.data.ticket = toSafeTicket(ticket);
      }
    }
  }

  if (permissions.includes("read:ticket_metrics")) {
    context.availableData.push("ticket.metrics");
  }

  console.log(context)
  return context;
}

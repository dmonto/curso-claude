import { getOrderById } from "./order-service.js";
import { getTicketsForOrder } from "./ticket-service.js";
import { getBasicCustomerProfile } from "./customer-service.js";

export function buildAssistantContext({
  userId,
  userContext,
  conversationContext,
  clientContext,
  message,
  requestId
}) {
  const selectedOrderId = clientContext?.selectedEntityId || null;

  const canReadOrders = userContext.permissions.includes("read_orders");
  const canReadTickets = userContext.permissions.includes("read_tickets");

  const selectedOrder =
    canReadOrders && selectedOrderId
      ? getOrderById(selectedOrderId, userId)
      : null;

  const relatedTickets =
    canReadTickets && selectedOrderId
      ? getTicketsForOrder(selectedOrderId, userId)
      : [];

  const customerProfile = getBasicCustomerProfile(userId);

  return {
    requestId,
    conversation: conversationContext,
    application: {
      currentPage: clientContext?.currentPage || null,
      selectedEntityType: clientContext?.selectedEntityType || null,
      selectedEntityId: selectedOrderId,
      locale: clientContext?.locale || customerProfile?.preferredLanguage || "es-ES"
    },
    user: {
      userId,
      name: userContext.name,
      role: userContext.role,
      permissions: userContext.permissions
    },
    customer: customerProfile,
    data: {
      selectedOrder,
      relatedTickets
    },
    currentMessage: message,
    serviceAccess: {
      ordersIncluded: Boolean(selectedOrder),
      ticketsIncluded: relatedTickets.length > 0,
      customerProfileIncluded: Boolean(customerProfile)
    }
  };
}

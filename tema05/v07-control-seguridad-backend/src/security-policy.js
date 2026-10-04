const DEMO_USERS = {
  "user-demo": {
    userId: "user-demo",
    displayName: "Usuario Demo",
    role: "usuario_estandar",
    permissions: {
      canViewOrders: true,
      canViewInvoices: true,
      canModifyInvoices: false,
      canConfirmPayments: false,
      canDeleteOrders: false,
      canManageUsers: false
    }
  },
  "admin-demo": {
    userId: "admin-demo",
    displayName: "Admin Demo",
    role: "admin",
    permissions: {
      canViewOrders: true,
      canViewInvoices: true,
      canModifyInvoices: false,
      canConfirmPayments: false,
      canDeleteOrders: false,
      canManageUsers: true
    }
  }
};

export function resolveDemoUser(req) {
  const requestedUserId = req.header("x-demo-user") || "user-demo";
  return DEMO_USERS[requestedUserId] || DEMO_USERS["user-demo"];
}

export function canAccessScreen(user, screen) {
  if (screen === "pedidos") {
    return Boolean(user.permissions.canViewOrders);
  }

  if (screen === "facturas") {
    return Boolean(user.permissions.canViewInvoices);
  }

  if (screen === "usuarios") {
    return Boolean(user.permissions.canManageUsers);
  }

  return true;
}

export function evaluateSecurityPolicy({ user, screen, processedMessage, routePlan }) {
  const decisions = {
    allowed: true,
    statusCode: 200,
    reason: null,
    publicMessage: null,
    securityFlags: []
  };

  if (!canAccessScreen(user, screen)) {
    decisions.allowed = false;
    decisions.statusCode = 403;
    decisions.reason = "screen_access_denied";
    decisions.publicMessage = "No tienes permisos para usar el asistente en esta pantalla.";
    decisions.securityFlags.push("screen_access_denied");
    return decisions;
  }

  if (processedMessage?.intent === "admin_request" && user.role !== "admin") {
    decisions.allowed = false;
    decisions.statusCode = 403;
    decisions.reason = "admin_required";
    decisions.publicMessage = "No tienes permisos para realizar solicitudes de administración.";
    decisions.securityFlags.push("admin_required");
    return decisions;
  }

  if (routePlan?.route === "claude_action_confirmation") {
    decisions.securityFlags.push("action_requires_confirmation");
  }

  if (
    processedMessage?.cleanMessage
    && looksLikeDeleteOrder(processedMessage.cleanMessage)
    && !user.permissions.canDeleteOrders
  ) {
    decisions.allowed = false;
    decisions.statusCode = 403;
    decisions.reason = "delete_order_denied";
    decisions.publicMessage = "No tienes permisos para borrar pedidos.";
    decisions.securityFlags.push("delete_order_denied");
    return decisions;
  }

  if (
    processedMessage?.cleanMessage
    && looksLikePaymentConfirmation(processedMessage.cleanMessage)
    && !user.permissions.canConfirmPayments
  ) {
    decisions.allowed = false;
    decisions.statusCode = 403;
    decisions.reason = "confirm_payment_denied";
    decisions.publicMessage = "No tienes permisos para confirmar pagos.";
    decisions.securityFlags.push("confirm_payment_denied");
    return decisions;
  }

  if (processedMessage?.riskLevel === "high") {
    decisions.securityFlags.push("high_risk_message");
  }

  return decisions;
}

function looksLikeDeleteOrder(message) {
  return /\b(borra|borrar|elimina|eliminar|delete)\b/i.test(message)
    && /\b(pedido|pedidos|order|orders)\b/i.test(message);
}

function looksLikePaymentConfirmation(message) {
  return /\b(confirma|confirmar|marca como pagada|pago|pagos)\b/i.test(message)
    && /\b(factura|facturas|invoice|invoices)\b/i.test(message);
}

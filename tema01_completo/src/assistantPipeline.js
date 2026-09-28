const fs = require("fs");
const path = require("path");

const userContext = {
  userId: "USR-100",
  name: "Marta",
  role: "cliente",
  currentPage: "/pedidos",
  currentEntityId: "PED-2026-001",
  permissions: [
    "read_orders",
    "read_invoices",
    "request_cancellation",
    "request_address_change"
  ]
};

const orders = [
  {
    id: "PED-2026-001",
    status: "retrasado",
    eta: "mañana antes de las 18:00",
    total: 84.5,
    canCancel: true,
    canChangeAddress: true,
    deliveryAddress: "Calle Mayor 10, Madrid"
  }
];

const invoices = [
  {
    id: "FAC-2026-001",
    orderId: "PED-2026-001",
    amount: 84.5,
    status: "available",
    downloadUrl: "/fake-downloads/FAC-2026-001.pdf"
  }
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function resolveContext(message) {
  return {
    message,
    user: {
      userId: userContext.userId,
      name: userContext.name,
      role: userContext.role
    },
    page: {
      currentPage: userContext.currentPage,
      currentEntityId: userContext.currentEntityId
    },

    // Los permisos quedan disponibles para el backend.
    // No es necesario enseñar al modelo permisos que no necesite conocer.
    permissions: userContext.permissions
  };
}

function detectIntent(context) {
  const text = normalize(context.message);

  if (text.includes("cancelar") && text.includes("pedido")) {
    return "cancel_order";
  }

  if (
    (text.includes("cambiar") || text.includes("modificar")) &&
    text.includes("direccion")
  ) {
    return "change_delivery_address";
  }

  if (text.includes("factura")) {
    return "download_invoice";
  }

  if (
    text.includes("pedido") ||
    text.includes("entrega") ||
    text.includes("envio") ||
    text.includes("llega") ||
    text.includes("retras")
  ) {
    return "check_order_status";
  }

  return "unknown";
}

function hasPermission(context, permission) {
  return context.permissions.includes(permission);
}

function getLastOrder() {
  return orders[0] || null;
}

function getInvoiceForOrder(orderId) {
  return invoices.find((invoice) => invoice.orderId === orderId) || null;
}

function checkPermissions(context, intent) {
  const requiredByIntent = {
    check_order_status: "read_orders",
    cancel_order: "request_cancellation",
    change_delivery_address: "request_address_change",
    download_invoice: "read_invoices"
  };

  const required = requiredByIntent[intent] || null;

  if (!required) {
    return {
      required: null,
      granted: true
    };
  }

  return {
    required,
    granted: hasPermission(context, required)
  };
}

function planToolCalls(intent, permissionCheck) {
  if (!permissionCheck.granted) {
    return [];
  }

  if (intent === "check_order_status") {
    return ["get_last_order"];
  }

  if (intent === "cancel_order") {
    return ["get_last_order", "prepare_cancellation"];
  }

  if (intent === "change_delivery_address") {
    return ["get_last_order", "prepare_address_change"];
  }

  if (intent === "download_invoice") {
    return ["get_last_order", "get_invoice_for_order"];
  }

  return [];
}

function executeTools(toolCalls) {
  const toolResults = {};
  const order = getLastOrder();

  for (const toolName of toolCalls) {
    if (toolName === "get_last_order") {
      toolResults.lastOrder = order;
    }

    if (toolName === "prepare_cancellation") {
      toolResults.cancellationProposal = order && order.canCancel
        ? {
            type: "CANCEL_ORDER",
            orderId: order.id,
            status: "pending_user_confirmation",
            requiresConfirmation: true
          }
        : null;
    }

    if (toolName === "prepare_address_change") {
      toolResults.addressChangeProposal = order && order.canChangeAddress
        ? {
            type: "CHANGE_DELIVERY_ADDRESS",
            orderId: order.id,
            currentAddress: order.deliveryAddress,
            status: "pending_user_confirmation",
            requiresConfirmation: true
          }
        : null;
    }

    if (toolName === "get_invoice_for_order") {
      toolResults.invoice = order
        ? getInvoiceForOrder(order.id)
        : null;
    }
  }

  return toolResults;
}

function buildAssistantResponse(
  context,
  intent,
  permissionCheck,
  toolResults
) {
  if (!permissionCheck.granted) {
    return {
      answer: "No tienes permisos para realizar esta operación.",
      dataUsed: null,
      grounding: null,
      proposedAction: null,
      requiresConfirmation: false
    };
  }

  const order = toolResults.lastOrder;

  if (intent === "check_order_status") {
    if (!order) {
      return {
        answer: "No he encontrado pedidos asociados a tu sesión.",
        dataUsed: null,
        grounding: {
          status: "verified",
          sourceSystem: "orders"
        },
        proposedAction: null,
        requiresConfirmation: false
      };
    }

    return {
      answer: `Tu último pedido es ${order.id}. Está "${order.status}" y la entrega estimada es ${order.eta}.`,
      dataUsed: {
        orderId: order.id,
        status: order.status,
        eta: order.eta
      },
      grounding: {
        status: "verified",
        sourceSystem: "orders"
      },
      proposedAction: null,
      requiresConfirmation: false
    };
  }

  if (intent === "cancel_order") {
    if (!order) {
      return {
        answer: "No he encontrado un pedido sobre el que preparar la cancelación.",
        dataUsed: null,
        grounding: {
          status: "verified",
          sourceSystem: "orders"
        },
        proposedAction: null,
        requiresConfirmation: false
      };
    }

    if (!toolResults.cancellationProposal) {
      return {
        answer: `El pedido ${order.id} no permite cancelación en su estado actual.`,
        dataUsed: {
          orderId: order.id,
          status: order.status,
          canCancel: order.canCancel
        },
        grounding: {
          status: "verified",
          sourceSystem: "orders"
        },
        proposedAction: null,
        requiresConfirmation: false
      };
    }

    return {
      answer: `El pedido ${order.id} permite cancelación. Puedo preparar la solicitud, pero necesito confirmación antes de enviarla.`,
      dataUsed: {
        orderId: order.id,
        status: order.status,
        canCancel: order.canCancel
      },
      grounding: {
        status: "verified",
        sourceSystem: "orders"
      },
      proposedAction: toolResults.cancellationProposal,
      requiresConfirmation: true
    };
  }

  if (intent === "change_delivery_address") {
    if (!order || !toolResults.addressChangeProposal) {
      return {
        answer: "No puedo preparar el cambio de dirección para este pedido.",
        dataUsed: order
          ? {
              orderId: order.id,
              status: order.status,
              canChangeAddress: order.canChangeAddress
            }
          : null,
        grounding: {
          status: "verified",
          sourceSystem: "orders"
        },
        proposedAction: null,
        requiresConfirmation: false
      };
    }

    return {
      answer: `El pedido ${order.id} permite cambiar la dirección de entrega. Dirección actual: ${order.deliveryAddress}.`,
      dataUsed: {
        orderId: order.id,
        currentAddress: order.deliveryAddress
      },
      grounding: {
        status: "verified",
        sourceSystem: "orders"
      },
      proposedAction: toolResults.addressChangeProposal,
      requiresConfirmation: true
    };
  }

  if (intent === "download_invoice") {
    if (!toolResults.invoice) {
      return {
        answer: "No he encontrado una factura disponible para el último pedido.",
        dataUsed: order ? { orderId: order.id } : null,
        grounding: {
          status: "verified",
          sourceSystem: "invoices"
        },
        proposedAction: null,
        requiresConfirmation: false
      };
    }

    return {
      answer: `La factura ${toolResults.invoice.id} está disponible para descarga.`,
      dataUsed: {
        invoiceId: toolResults.invoice.id,
        orderId: toolResults.invoice.orderId,
        amount: toolResults.invoice.amount
      },
      grounding: {
        status: "verified",
        sourceSystem: "invoices"
      },
      proposedAction: {
        type: "DOWNLOAD_INVOICE",
        invoiceId: toolResults.invoice.id,
        downloadUrl: toolResults.invoice.downloadUrl
      },
      requiresConfirmation: false
    };
  }

  return {
    answer: "No tengo suficiente información para ayudarte. Puedes preguntarme por pedidos, facturas, cancelaciones o cambios de dirección.",
    dataUsed: null,
    grounding: null,
    proposedAction: null,
    requiresConfirmation: false
  };
}

function writeAudit(event) {
  fs.appendFileSync(
    path.join(__dirname, "..", "assistant_events.jsonl"),
    JSON.stringify(event) + "\n",
    "utf8"
  );
}

function buildUxContract(intent, response) {
  const hasAction = Boolean(response.proposedAction);

  if (intent === "unknown") {
    return {
      uxRole: "fallback",
      displayMode: "text",
      assistantTone: "clarifying",
      uiActions: [
        {
          label: "Ver opciones disponibles",
          type: "SHOW_HELP_OPTIONS"
        }
      ]
    };
  }

  if (response.requiresConfirmation && hasAction) {
    return {
      uxRole: "operator_controlled",
      displayMode: "confirmation_card",
      assistantTone: "careful",
      uiActions: [
        {
          label: "Revisar detalles",
          type: "SHOW_ACTION_DETAILS"
        },
        {
          label: "Confirmar acción",
          type: "CONFIRM_ACTION",
          action: response.proposedAction.type,
          requiresConfirmation: true
        }
      ]
    };
  }

  if (intent === "check_order_status") {
    return {
      uxRole: "explainer",
      displayMode: "summary_card",
      assistantTone: "informative",
      uiActions: [
        {
          label: "Ver pedido",
          type: "NAVIGATE",
          target: response.dataUsed
            ? `/pedidos/${response.dataUsed.orderId}`
            : "/pedidos"
        }
      ]
    };
  }

  if (intent === "download_invoice" && hasAction) {
    return {
      uxRole: "navigator",
      displayMode: "action_link",
      assistantTone: "direct",
      uiActions: [
        {
          label: "Descargar factura",
          type: "OPEN_LINK",
          target: response.proposedAction.downloadUrl
        }
      ]
    };
  }

  return {
    uxRole: "assistant",
    displayMode: "text",
    assistantTone: "neutral",
    uiActions: []
  };
}

function assistantPipeline(message) {
  const context = resolveContext(message);
  const intent = detectIntent(context);
  const permissionCheck = checkPermissions(context, intent);
  const toolCalls = planToolCalls(intent, permissionCheck);
  const toolResults = executeTools(toolCalls);

  const response = buildAssistantResponse(
    context,
    intent,
    permissionCheck,
    toolResults
  );

const ux = buildUxContract(intent, response);

const result = {
  type: "assistant_architecture_pipeline",
  input: message,
  contextUsed: {
    userId: context.user.userId,
    role: context.user.role,
    currentPage: context.page.currentPage,
    currentEntityId: context.page.currentEntityId
  },
  intent,
  permissionCheck,
  toolCalls,
  response,
  ux
};

writeAudit({
  timestamp: new Date().toISOString(),
  eventType: "assistant_pipeline",
  userId: context.user.userId,
  message,
  intent,
  permissionRequired: permissionCheck.required,
  permissionGranted: permissionCheck.granted,
  toolCalls,
  groundingStatus: response.grounding
    ? response.grounding.status
    : null,
  sourceSystem: response.grounding
    ? response.grounding.sourceSystem
    : null,
  proposedAction: response.proposedAction
    ? response.proposedAction.type
    : null,
  requiresConfirmation: response.requiresConfirmation,
  uxRole: ux.uxRole,
  displayMode: ux.displayMode
});

  return result;
}

module.exports = {
  assistantPipeline
};
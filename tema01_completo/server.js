const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;

const { assistantPipeline } = require("./src/assistantPipeline");

const {
  prepareAutomation,
  confirmAutomation,
  listPendingAutomations
} = require("./src/automationEngine");

const {
  checkLimitationsAndAudit
} = require("./src/limitationsGuard");

const {
  requestHumanReview,
  listPendingHumanReviews,
  decideHumanReview
} = require("./src/humanReviewEngine");
const {
  planConversationUiAndAudit
} = require("./src/conversationUiPlanner");

const userContext = {
  userId: "USR-100",
  name: "Marta",
  role: "cliente",
  currentPage: "/pedidos",
  permissions: [
    "read_orders",
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
  },
  {
    id: "PED-2026-002",
    status: "entregado",
    eta: null,
    total: 32.1,
    canCancel: false,
    canChangeAddress: false,
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

function detectIntent(message) {
  const text = normalize(message);

  if (text.includes("cancelar") && text.includes("pedido")) {
    return "cancel_order";
  }

  if (
    (text.includes("cambiar") || text.includes("modificar")) &&
    text.includes("direccion")
  ) {
    return "change_delivery_address";
  }

  if (
    text.includes("pedido") ||
    text.includes("entrega") ||
    text.includes("envio") ||
    text.includes("llega")
  ) {
    return "check_order_status";
  }

  if (text.includes("factura")) {
    return "download_invoice";
  }

  return "unknown";
}

function hasPermission(permission) {
  return userContext.permissions.includes(permission);
}

function getLastOrder() {
  return orders[0];
}

function simpleChatbot(message) {
  const intent = detectIntent(message);

  const responses = {
    check_order_status:
      "Puedes consultar el estado de tus pedidos desde la sección Pedidos.",
    cancel_order:
      "Puedes cancelar un pedido desde la sección Pedidos si todavía no ha sido preparado.",
    change_delivery_address:
      "Puedes cambiar la dirección desde el detalle del pedido si la opción está disponible.",
    download_invoice:
      "Puedes descargar tus facturas desde Mi cuenta > Facturación.",
    unknown:
      "No he entendido la consulta. Prueba con pedidos, facturas o cancelaciones."
  };

  return {
    type: "simple_chatbot",
    intent,
    answer: responses[intent],
    dataUsed: null,
    permissionCheck: null,
    proposedAction: null,
    requiresConfirmation: false
  };
}

function intelligentAssistant(message) {
  const intent = detectIntent(message);
  const lastOrder = getLastOrder();

  if (intent === "check_order_status") {
    if (!hasPermission("read_orders")) {
      return {
        type: "intelligent_assistant",
        intent,
        answer: "No tienes permisos para consultar pedidos.",
        dataUsed: null,
        permissionCheck: {
          required: "read_orders",
          granted: false
        },
        proposedAction: null,
        requiresConfirmation: false
      };
    }

    return {
      type: "intelligent_assistant",
      intent,
      answer: `Tu último pedido es ${lastOrder.id}. Está "${lastOrder.status}" y la entrega estimada es ${lastOrder.eta}.`,
      dataUsed: {
        orderId: lastOrder.id,
        status: lastOrder.status,
        eta: lastOrder.eta
      },
      permissionCheck: {
        required: "read_orders",
        granted: true
      },
      proposedAction: null,
      requiresConfirmation: false
    };
  }

  if (intent === "cancel_order") {
    if (!hasPermission("request_cancellation")) {
      return {
        type: "intelligent_assistant",
        intent,
        answer: "No tienes permisos para solicitar la cancelación de pedidos.",
        dataUsed: {
          orderId: lastOrder.id
        },
        permissionCheck: {
          required: "request_cancellation",
          granted: false
        },
        proposedAction: null,
        requiresConfirmation: false
      };
    }

    if (!lastOrder.canCancel) {
      return {
        type: "intelligent_assistant",
        intent,
        answer: `El pedido ${lastOrder.id} no se puede cancelar porque su estado actual es "${lastOrder.status}".`,
        dataUsed: {
          orderId: lastOrder.id,
          status: lastOrder.status,
          canCancel: lastOrder.canCancel
        },
        permissionCheck: {
          required: "request_cancellation",
          granted: true
        },
        proposedAction: null,
        requiresConfirmation: false
      };
    }

    return {
      type: "intelligent_assistant",
      intent,
      answer: `El pedido ${lastOrder.id} está "${lastOrder.status}" y todavía permite cancelación. Puedo preparar la solicitud, pero necesito confirmación antes de enviarla.`,
      dataUsed: {
        orderId: lastOrder.id,
        status: lastOrder.status,
        canCancel: lastOrder.canCancel
      },
      permissionCheck: {
        required: "request_cancellation",
        granted: true
      },
      proposedAction: {
        type: "CANCEL_ORDER",
        orderId: lastOrder.id,
        status: "pending_user_confirmation"
      },
      requiresConfirmation: true
    };
  }

  if (intent === "change_delivery_address") {
    if (!hasPermission("request_address_change")) {
      return {
        type: "intelligent_assistant",
        intent,
        answer: "No tienes permisos para solicitar cambios de dirección.",
        dataUsed: {
          orderId: lastOrder.id
        },
        permissionCheck: {
          required: "request_address_change",
          granted: false
        },
        proposedAction: null,
        requiresConfirmation: false
      };
    }

    if (!lastOrder.canChangeAddress) {
      return {
        type: "intelligent_assistant",
        intent,
        answer: `El pedido ${lastOrder.id} ya no permite modificar la dirección de entrega.`,
        dataUsed: {
          orderId: lastOrder.id,
          status: lastOrder.status,
          canChangeAddress: lastOrder.canChangeAddress
        },
        permissionCheck: {
          required: "request_address_change",
          granted: true
        },
        proposedAction: null,
        requiresConfirmation: false
      };
    }

    return {
      type: "intelligent_assistant",
      intent,
      answer: `El pedido ${lastOrder.id} permite cambiar la dirección de entrega. Dirección actual: ${lastOrder.deliveryAddress}.`,
      dataUsed: {
        orderId: lastOrder.id,
        status: lastOrder.status,
        currentAddress: lastOrder.deliveryAddress,
        canChangeAddress: lastOrder.canChangeAddress
      },
      permissionCheck: {
        required: "request_address_change",
        granted: true
      },
      proposedAction: {
        type: "CHANGE_DELIVERY_ADDRESS",
        orderId: lastOrder.id,
        status: "pending_user_confirmation"
      },
      requiresConfirmation: true
    };
  }

  if (intent === "download_invoice") {
    return {
      type: "intelligent_assistant",
      intent,
      answer:
        "Puedo ayudarte con facturas, pero en este ejemplo todavía no hemos conectado el módulo de facturación.",
      dataUsed: null,
      permissionCheck: null,
      proposedAction: null,
      requiresConfirmation: false
    };
  }

  return {
    type: "intelligent_assistant",
    intent,
    answer:
      "No tengo suficiente información para ayudarte. Puedes preguntarme por el estado de pedidos, cancelaciones o cambios de dirección.",
    dataUsed: null,
    permissionCheck: null,
    proposedAction: null,
    requiresConfirmation: false
  };
}

function writeAuditEvent(message, simpleResult, assistantResult) {
  const event = {
    timestamp: new Date().toISOString(),
    userId: userContext.userId,
    message,
    simpleIntent: simpleResult.intent,
    assistantIntent: assistantResult.intent,
    proposedAction: assistantResult.proposedAction
      ? assistantResult.proposedAction.type
      : null,
    requiresConfirmation: assistantResult.requiresConfirmation
  };

  fs.appendFileSync(
    path.join(__dirname, "assistant_events.jsonl"),
    JSON.stringify(event) + "\n",
    "utf8"
  );
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function readBody(req, callback) {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    try {
      callback(null, JSON.parse(body || "{}"));
    } catch (error) {
      callback(error);
    }
  });
}

function aiValueLayer(message) {
  const intent = detectIntent(message);
  const text = normalize(message);
  const lastOrder = getLastOrder();

  const signals = {
    mentionsDelay:
      text.includes("retras") ||
      text.includes("tarde") ||
      text.includes("no llega"),
    mentionsCancellation:
      text.includes("cancelar") ||
      text.includes("cancela") ||
      text.includes("ya no lo necesito"),
    mentionsAddress:
      text.includes("direccion") ||
      text.includes("entrega"),
    mentionsInvoice:
      text.includes("factura"),
    isAmbiguous:
      text.includes("esto") ||
      text.includes("eso") ||
      text.includes("no lo necesito")
  };

  let summary = "";
  let nextBestAction = "";
  let riskLevel = "low";
  let needsClarification = false;

  if (intent === "cancel_order") {
    summary = `El usuario parece querer cancelar un pedido. El último pedido disponible es ${lastOrder.id}, con estado "${lastOrder.status}".`;

    if (lastOrder.canCancel && hasPermission("request_cancellation")) {
      nextBestAction = "Preparar solicitud de cancelación y pedir confirmación explícita.";
      riskLevel = "medium";
    } else {
      nextBestAction = "Explicar por qué la cancelación no está disponible.";
      riskLevel = "low";
    }
  } else if (intent === "check_order_status") {
    summary = `El usuario quiere conocer el estado de un pedido. El último pedido es ${lastOrder.id}.`;
    nextBestAction = "Mostrar estado, entrega estimada y posibles opciones.";
    riskLevel = "low";
  } else if (intent === "change_delivery_address") {
    summary = `El usuario quiere cambiar la dirección de entrega del pedido ${lastOrder.id}.`;
    nextBestAction = "Comprobar si el pedido permite cambio de dirección y pedir nueva dirección.";
    riskLevel = "medium";
  } else if (intent === "download_invoice") {
    summary = "El usuario solicita una factura.";
    nextBestAction = "Comprobar permisos y disponibilidad de factura.";
    riskLevel = "low";
  } else {
    summary = "La petición no se puede asociar con seguridad a una tarea soportada.";
    nextBestAction = "Pedir aclaración ofreciendo opciones concretas.";
    needsClarification = true;
    riskLevel = "low";
  }

  if (signals.isAmbiguous && intent !== "unknown") {
    needsClarification = true;
    nextBestAction = "Confirmar a qué pedido o acción se refiere antes de continuar.";
  }

  return {
    type: "ai_value_layer",
    input: message,
    interpretedIntent: intent,
    signals,
    contextSummary: summary,
    nextBestAction,
    needsClarification,
    riskLevel,
    productValue: {
      reducesNavigation: true,
      explainsData: intent !== "unknown",
      proposesAction: ["cancel_order", "change_delivery_address"].includes(intent),
      improvesSafety: true
    }
  };
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    const filePath = path.join(__dirname, "public", "index.html");
    const html = fs.readFileSync(filePath, "utf8");

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });

    res.end(html);
    return;
  }

    if (req.method === "POST" && req.url === "/api/ai-value") {
    readBody(req, (error, payload) => {
        if (error) {
        sendJson(res, 400, {
            error: "invalid_json",
            message: error.message
        });
        return;
        }

        const message = payload.message || "";
        const result = aiValueLayer(message);

        fs.appendFileSync(
        path.join(__dirname, "assistant_events.jsonl"),
        JSON.stringify({
            timestamp: new Date().toISOString(),
            userId: userContext.userId,
            eventType: "ai_value_layer",
            message,
            interpretedIntent: result.interpretedIntent,
            riskLevel: result.riskLevel,
            needsClarification: result.needsClarification,
            nextBestAction: result.nextBestAction
        }) + "\n",
        "utf8"
        );

        sendJson(res, 200, result);
    });

    return;
    }

  if (req.method === "POST" && req.url === "/api/compare") {
    readBody(req, (error, payload) => {
      if (error) {
        sendJson(res, 400, {
          error: "invalid_json",
          message: error.message
        });
        return;
      }

      const message = payload.message || "";
      const simpleResult = simpleChatbot(message);
      const assistantResult = intelligentAssistant(message);

      writeAuditEvent(message, simpleResult, assistantResult);

      sendJson(res, 200, {
        input: message,
        userContext,
        simpleResult,
        assistantResult
      });
    });

    return;
  }

  if (req.method === "POST" && req.url === "/api/assistant-pipeline") {
  readBody(req, (error, payload) => {
    if (error) {
      sendJson(res, 400, {
        error: "invalid_json",
        message: error.message
      });
      return;
    }

    const message = payload.message || "";
    const result = assistantPipeline(message);

    sendJson(res, 200, result);
  });

  return;
}
if (req.method === "POST" && req.url === "/api/automation/prepare") {
  readBody(req, (error, payload) => {
    if (error) {
      sendJson(res, 400, {
        error: "invalid_json",
        message: error.message
      });

      return;
    }

    const result = prepareAutomation({
      userId: payload.userId || "USR-100",
      intent: payload.intent,
      proposedAction: payload.proposedAction,
      dataUsed: payload.dataUsed
    });

    sendJson(res, 200, result);
  });

  return;
}

if (req.method === "POST" && req.url === "/api/automation/confirm") {
  readBody(req, (error, payload) => {
    if (error) {
      sendJson(res, 400, {
        error: "invalid_json",
        message: error.message
      });

      return;
    }

    const result = confirmAutomation({
      userId: payload.userId || "USR-100",
      actionId: payload.actionId
    });

    sendJson(res, 200, result);
  });

  return;
}

if (req.method === "GET" && req.url === "/api/automation/pending") {
  const result = listPendingAutomations("USR-100");

  sendJson(res, 200, {
    userId: "USR-100",
    pendingActions: result
  });

  return;
}

if (req.method === "POST" && req.url === "/api/limitations/check") {
  readBody(req, (error, payload) => {
    if (error) {
      sendJson(res, 400, {
        error: "invalid_json",
        message: error.message
      });

      return;
    }

    const message = payload.message || "";
    const result = checkLimitationsAndAudit(message);

    sendJson(res, 200, result);
  });

  return;
}

if (
  req.method === "POST" &&
  req.url === "/api/human-review/request"
) {
  readBody(req, (error, payload) => {
    if (error) {
      sendJson(res, 400, {
        error: "invalid_json",
        message: error.message
      });

      return;
    }

    const result = requestHumanReview({
      userId: payload.userId || "USR-100",
      intent: payload.intent,
      proposedAction: payload.proposedAction,
      evidence: payload.evidence,
      riskLevel: payload.riskLevel
    });

    sendJson(res, 200, result);
  });

  return;
}

if (
  req.method === "GET" &&
  req.url === "/api/human-review/pending"
) {
  const result = listPendingHumanReviews();

  sendJson(res, 200, result);

  return;
}

if (
  req.method === "POST" &&
  req.url === "/api/human-review/decide"
) {
  readBody(req, (error, payload) => {
    if (error) {
      sendJson(res, 400, {
        error: "invalid_json",
        message: error.message
      });

      return;
    }

    const result = decideHumanReview({
      reviewId: payload.reviewId,
      reviewerId: payload.reviewerId,
      decision: payload.decision,
      reason: payload.reason
    });

    sendJson(res, 200, result);
  });

  return;
}
if (
  req.method === "POST" &&
  req.url === "/api/conversation-ui-plan"
) {
  readBody(req, (error, payload) => {
    if (error) {
      sendJson(res, 400, {
        error: "invalid_json",
        message: error.message
      });

      return;
    }

    const result =
      planConversationUiAndAudit(
        payload.message || "",
        payload.context || {}
      );

    sendJson(res, 200, result);
  });

  return;
}
  sendJson(res, 404, {
    error: "not_found"
  });
});

server.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STATE_FILE = path.join(
  __dirname,
  "..",
  "automation_state.json"
);

const AUDIT_FILE = path.join(
  __dirname,
  "..",
  "assistant_events.jsonl"
);

function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    return {
      pendingActions: [],
      executedActions: []
    };
  }

  return JSON.parse(
    fs.readFileSync(STATE_FILE, "utf8")
  );
}

function writeState(state) {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(state, null, 2),
    "utf8"
  );
}

function writeAudit(event) {
  fs.appendFileSync(
    AUDIT_FILE,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      ...event
    }) + "\n",
    "utf8"
  );
}

function createActionId() {
  return "act-" + crypto.randomUUID();
}

function prepareAutomation({
  userId,
  intent,
  proposedAction,
  dataUsed
}) {
  if (!proposedAction) {
    return {
      prepared: false,
      reason: "no_action_proposed"
    };
  }

  if (!proposedAction.requiresConfirmation) {
    return {
      prepared: false,
      reason: "action_does_not_require_confirmation"
    };
  }

  const state = readState();

  const pendingAction = {
    actionId: createActionId(),
    userId,
    intent,
    actionType: proposedAction.type,
    payload: proposedAction,
    dataUsed,
    status: "pending_confirmation",
    createdAt: new Date().toISOString()
  };

  state.pendingActions.push(pendingAction);
  writeState(state);

  writeAudit({
    eventType: "automation_prepared",
    userId,
    intent,
    actionId: pendingAction.actionId,
    actionType: pendingAction.actionType,
    status: pendingAction.status
  });

  return {
    prepared: true,
    pendingAction
  };
}

function confirmAutomation({
  userId,
  actionId
}) {
  const state = readState();

  const action = state.pendingActions.find(
    (item) =>
      item.actionId === actionId &&
      item.userId === userId
  );

  if (!action) {
    writeAudit({
      eventType: "automation_confirmation_failed",
      userId,
      actionId,
      reason: "pending_action_not_found"
    });

    return {
      executed: false,
      reason: "pending_action_not_found"
    };
  }

  const executionResult = executeAction(action);

  state.pendingActions = state.pendingActions.filter(
    (item) => item.actionId !== actionId
  );

  state.executedActions.push({
    ...action,
    status: executionResult.status,
    executedAt: new Date().toISOString(),
    result: executionResult
  });

  writeState(state);

  writeAudit({
    eventType: "automation_executed",
    userId,
    actionId,
    actionType: action.actionType,
    status: executionResult.status,
    resultMessage: executionResult.message
  });

  return {
    executed: true,
    actionId,
    actionType: action.actionType,
    result: executionResult
  };
}

function executeAction(action) {
  if (action.actionType === "CANCEL_ORDER") {
    return {
      status: "completed",
      message: `Pedido ${action.payload.orderId} cancelado de forma simulada.`,
      simulated: true
    };
  }

  if (action.actionType === "CHANGE_DELIVERY_ADDRESS") {
    return {
      status: "completed",
      message: `Cambio de dirección preparado para el pedido ${action.payload.orderId}.`,
      simulated: true
    };
  }

  if (action.actionType === "REQUEST_REFUND") {
  return {
    status: "completed",
    message: `Solicitud de abono creada de forma simulada para la factura ${action.payload.invoiceId}.`,
    simulated: true,
    requiresBackofficeProcessing: true
  };
}
  return {
    status: "rejected",
    message: `Acción no soportada: ${action.actionType}`,
    simulated: true
  };
}

function listPendingAutomations(userId) {
  const state = readState();

  return state.pendingActions.filter(
    (item) => item.userId === userId
  );
}

module.exports = {
  prepareAutomation,
  confirmAutomation,
  listPendingAutomations
};
const pendingActions = new Map();

export function createPendingAction({
  type,
  userId,
  sessionId,
  title,
  description,
  payload
}) {
  const actionId = `action-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const action = {
    actionId,
    type,
    status: "pending_confirmation",
    userId,
    sessionId,
    title,
    description,
    payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  pendingActions.set(actionId, action);
  return action;
}

export function getActionById(actionId) {
  return pendingActions.get(actionId) || null;
}

export function markActionCompleted(actionId, result) {
  const action = getActionById(actionId);

  if (!action) {
    return null;
  }

  action.status = "completed";
  action.result = result;
  action.updatedAt = new Date().toISOString();

  pendingActions.set(actionId, action);
  return action;
}

export function markActionCancelled(actionId) {
  const action = getActionById(actionId);

  if (!action) {
    return null;
  }

  action.status = "cancelled";
  action.updatedAt = new Date().toISOString();

  pendingActions.set(actionId, action);
  return action;
}

export function serializeActionForClient(action) {
  if (!action) {
    return null;
  }

  return {
    actionId: action.actionId,
    type: action.type,
    status: action.status,
    title: action.title,
    description: action.description,
    orderId: action.payload?.orderId || null,
    subject: action.payload?.subject || null,
    requiresConfirmation: action.status === "pending_confirmation"
  };
}

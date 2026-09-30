const metrics = {
  assistantMessagesTotal: 0,
  assistantErrorsTotal: 0,
  modelTimeoutsTotal: 0,
  actionsProposedTotal: 0,
  actionsCompletedTotal: 0,
  actionsCancelledTotal: 0,
  totalLatencyMs: 0,
  lastEvents: []
};

export function recordMetricEvent(event) {
  metrics.lastEvents.push({
    ...event,
    timestamp: new Date().toISOString()
  });

  metrics.lastEvents = metrics.lastEvents.slice(-50);

  if (event.type === "assistant_message") {
    metrics.assistantMessagesTotal += 1;
    metrics.totalLatencyMs += event.elapsedMs || 0;
  }

  if (event.type === "assistant_error") {
    metrics.assistantErrorsTotal += 1;
  }

  if (event.type === "model_timeout") {
    metrics.modelTimeoutsTotal += 1;
  }

  if (event.type === "action_proposed") {
    metrics.actionsProposedTotal += 1;
  }

  if (event.type === "action_completed") {
    metrics.actionsCompletedTotal += 1;
  }

  if (event.type === "action_cancelled") {
    metrics.actionsCancelledTotal += 1;
  }
}

export function getMetricsSnapshot() {
  const averageLatencyMs =
    metrics.assistantMessagesTotal > 0
      ? Math.round(metrics.totalLatencyMs / metrics.assistantMessagesTotal)
      : 0;

  return {
    assistantMessagesTotal: metrics.assistantMessagesTotal,
    assistantErrorsTotal: metrics.assistantErrorsTotal,
    modelTimeoutsTotal: metrics.modelTimeoutsTotal,
    actionsProposedTotal: metrics.actionsProposedTotal,
    actionsCompletedTotal: metrics.actionsCompletedTotal,
    actionsCancelledTotal: metrics.actionsCancelledTotal,
    averageLatencyMs,
    lastEvents: metrics.lastEvents
  };
}

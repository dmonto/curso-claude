const SESSIONS = new Map();

export function getGuidedSession(sessionId) {
  if (!SESSIONS.has(sessionId)) {
    SESSIONS.set(sessionId, {
      sessionId,
      currentGoal: "create_support_ticket",
      step: "start",
      knownFields: {},
      missingFields: [
        "affectedService",
        "description",
        "businessImpact"
      ],
      historySummary: null,
      readyForAutomation: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return SESSIONS.get(sessionId);
}

export function updateGuidedSession(sessionId, patch) {
  const current = getGuidedSession(sessionId);

  const updated = {
    ...current,
    ...patch,
    knownFields: {
      ...current.knownFields,
      ...(patch.knownFields ?? {}),
    },
    updatedAt: new Date().toISOString(),
  };

  SESSIONS.set(sessionId, updated);

  return updated;
}

export function resetGuidedSession(sessionId) {
  SESSIONS.delete(sessionId);
  return getGuidedSession(sessionId);
}

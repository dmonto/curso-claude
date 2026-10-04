const TICKET_DRAFTS = [];

export function canExecuteAction(action, userContext) {
  const allowedByRole = {
    employee: ["create_ticket_draft", "prepare_user_reply", "ask_missing_fields"],
    support_agent: [
      "create_ticket_draft",
      "prepare_user_reply",
      "ask_missing_fields",
      "suggest_escalation",
    ],
    admin: [
      "create_ticket_draft",
      "prepare_user_reply",
      "ask_missing_fields",
      "suggest_escalation",
    ],
  };

  return allowedByRole[userContext.userRole]?.includes(action) ?? false;
}

export function executeProposedAction(proposal, userContext) {
  if (!canExecuteAction(proposal.proposedAction, userContext)) {
    return {
      executed: false,
      status: "blocked_by_permissions",
      message: "La acción propuesta no está permitida para este usuario.",
    };
  }

  if (proposal.proposedAction === "ask_missing_fields") {
    return {
      executed: false,
      status: "requires_user_input",
      message: proposal.userMessage,
      missingFields: proposal.missingFields,
    };
  }

  if (proposal.proposedAction === "prepare_user_reply") {
    return {
      executed: false,
      status: "reply_prepared",
      message: proposal.userMessage,
    };
  }

  if (proposal.proposedAction === "suggest_escalation") {
    return {
      executed: false,
      status: "escalation_suggested",
      message: proposal.userMessage,
    };
  }

  if (proposal.proposedAction === "create_ticket_draft") {
    if (proposal.requiresConfirmation) {
      return {
        executed: false,
        status: "confirmation_required",
        message: proposal.userMessage,
        draftPreview: proposal.parameters,
      };
    }

    const draft = {
      id: `DRAFT-${Date.now()}`,
      createdBy: userContext.userId,
      ...proposal.parameters,
      createdAt: new Date().toISOString(),
    };

    TICKET_DRAFTS.push(draft);

    return {
      executed: true,
      status: "draft_created",
      draft,
    };
  }

  return {
    executed: false,
    status: "unsupported_action",
    message: "La acción propuesta no está soportada.",
  };
}

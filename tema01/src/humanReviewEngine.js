const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  prepareAutomation
} = require("./automationEngine");

const REVIEW_FILE = path.join(
  __dirname,
  "..",
  "human_review_state.json"
);

const AUDIT_FILE = path.join(
  __dirname,
  "..",
  "assistant_events.jsonl"
);

const reviewers = {
  "SUP-001": {
    name: "Supervisor Operaciones",
    permissions: [
      "approve_refunds",
      "approve_high_risk_actions"
    ]
  },

  "AGT-001": {
    name: "Agente Soporte",
    permissions: [
      "read_reviews"
    ]
  }
};

function readReviewState() {
  if (!fs.existsSync(REVIEW_FILE)) {
    return {
      pendingReviews: [],
      decidedReviews: []
    };
  }

  return JSON.parse(
    fs.readFileSync(REVIEW_FILE, "utf8")
  );
}

function writeReviewState(state) {
  fs.writeFileSync(
    REVIEW_FILE,
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

function createReviewId() {
  return "rev-" + crypto.randomUUID();
}

function getRequiredReviewerPermission(actionType) {
  if (actionType === "REQUEST_REFUND") {
    return "approve_refunds";
  }

  return "approve_high_risk_actions";
}

function reviewerHasPermission(
  reviewerId,
  permission
) {
  const reviewer = reviewers[reviewerId];

  if (!reviewer) {
    return false;
  }

  return reviewer.permissions.includes(permission);
}

function requestHumanReview({
  userId,
  intent,
  proposedAction,
  evidence,
  riskLevel
}) {
  if (!proposedAction) {
    return {
      created: false,
      reason: "no_action_proposed"
    };
  }

  const requiredPermission =
    getRequiredReviewerPermission(
      proposedAction.type
    );

  const review = {
    reviewId: createReviewId(),
    userId,
    intent,
    actionType: proposedAction.type,
    proposedAction,
    evidence: evidence || {},
    riskLevel: riskLevel || "high",
    requiredReviewerPermission: requiredPermission,
    status: "pending_review",
    createdAt: new Date().toISOString()
  };

  const state = readReviewState();

  state.pendingReviews.push(review);

  writeReviewState(state);

  writeAudit({
    eventType: "human_review_requested",
    userId,
    reviewId: review.reviewId,
    intent,
    actionType: review.actionType,
    riskLevel: review.riskLevel,
    requiredReviewerPermission: requiredPermission
  });

  return {
    created: true,
    review
  };
}

function listPendingHumanReviews() {
  const state = readReviewState();

  return {
    pendingReviews: state.pendingReviews
  };
}

function decideHumanReview({
  reviewId,
  reviewerId,
  decision,
  reason
}) {
  const state = readReviewState();

  const review = state.pendingReviews.find(
    (item) => item.reviewId === reviewId
  );

  if (!review) {
    writeAudit({
      eventType: "human_review_decision_failed",
      reviewId,
      reviewerId,
      reason: "review_not_found"
    });

    return {
      decided: false,
      reason: "review_not_found"
    };
  }

  const requiredPermission =
    review.requiredReviewerPermission;

  if (
    !reviewerHasPermission(
      reviewerId,
      requiredPermission
    )
  ) {
    writeAudit({
      eventType: "human_review_decision_failed",
      reviewId,
      reviewerId,
      reason: "reviewer_without_permission",
      requiredPermission
    });

    return {
      decided: false,
      reason: "reviewer_without_permission",
      requiredPermission
    };
  }

  if (
    !["approved", "rejected"].includes(decision)
  ) {
    return {
      decided: false,
      reason: "invalid_decision"
    };
  }

  const decidedReview = {
    ...review,
    status: decision,
    reviewerId,
    decisionReason: reason || null,
    decidedAt: new Date().toISOString()
  };

  state.pendingReviews =
    state.pendingReviews.filter(
      (item) => item.reviewId !== reviewId
    );

  state.decidedReviews.push(decidedReview);

  writeReviewState(state);

  writeAudit({
    eventType: "human_review_decided",
    reviewId,
    reviewerId,
    decision,
    actionType: review.actionType,
    reason: reason || null
  });

  if (decision === "rejected") {
    return {
      decided: true,
      decision,
      review: decidedReview,
      automation: null
    };
  }

  const automation = prepareAutomation({
    userId: review.userId,
    intent: review.intent,

    proposedAction: {
      ...review.proposedAction,
      requiresConfirmation: true,
      humanReviewId: review.reviewId,
      approvedBy: reviewerId
    },

    dataUsed: review.evidence.dataUsed || null
  });

  return {
    decided: true,
    decision,
    review: decidedReview,
    automation
  };
}

module.exports = {
  requestHumanReview,
  listPendingHumanReviews,
  decideHumanReview
};
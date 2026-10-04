import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { SessionStore } from "./session-store.js";
import { ClaudeService } from "./claude-service.js";
import { buildSystemPrompt } from "./prompt-builder.js";
import { processUserMessage } from "./message-processor.js";
import { routeAiRequest } from "./ai-router.js";
import { buildConversationContext } from "./context-builder.js";
import { configureSecurity, getSecurityContext } from "./security-middleware.js";
import { evaluateSecurityPolicy } from "./security-policy.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:4200";
const sessionStore = new SessionStore({ maxMessages: Number(process.env.MAX_HISTORY_MESSAGES || 8), ttlMinutes: Number(process.env.SESSION_TTL_MINUTES || 30) });
const claudeService = new ClaudeService({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL, defaultMaxTokens: Number(process.env.CLAUDE_MAX_TOKENS || 600), defaultEffort: process.env.CLAUDE_EFFORT || "low" });

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));
configureSecurity(app);

function createTraceId() { return crypto.randomUUID(); }
function logInteraction({ traceId, sessionId, screen, userRole, status, error }) { console.log(JSON.stringify({ traceId, sessionId, screen, userRole, status, error: error || null, timestamp: new Date().toISOString() })); }

app.get("/health", (req, res) => res.json({ status: "ok", service: "curso-claude-backend", timestamp: new Date().toISOString() }));
app.get("/api/security/me", (req, res) => {
  const securityContext = getSecurityContext(req);
  res.json({
    userId: securityContext.userId,
    displayName: securityContext.displayName,
    role: securityContext.role,
    permissions: {
      canViewOrders: securityContext.permissions.canViewOrders,
      canViewInvoices: securityContext.permissions.canViewInvoices,
      canManageUsers: securityContext.permissions.canManageUsers
    }
  });
});
app.get("/api/assistant/provider", (req, res) => res.json({ provider: "anthropic", modelConfigured: Boolean(process.env.ANTHROPIC_MODEL), apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY), maxTokens: Number(process.env.CLAUDE_MAX_TOKENS || 600), effort: process.env.CLAUDE_EFFORT || "low" }));

app.post("/api/assistant/message", async (req, res) => {
  const traceId = createTraceId();
  const securityContext = getSecurityContext(req);
  const { sessionId, message, screen = "general" } = req.body || {};
  const userId = securityContext.userId;
  const userRole = securityContext.role;

  const processedMessage = processUserMessage({ message, userRole, screen, maxLength: Number(process.env.MAX_USER_MESSAGE_LENGTH || 4000) });
  const routePlan = routeAiRequest({ processedMessage, userRole, screen });

  if (!processedMessage.allowed) {
    logInteraction({ traceId, sessionId, screen, userRole, status: "message_rejected", error: processedMessage.blockedReason });
    return res.status(400).json({ traceId, error: processedMessage.blockedReason, messageProcessing: { allowed: processedMessage.allowed, riskLevel: processedMessage.riskLevel, warnings: processedMessage.warnings } });
  }

  const securityDecision = evaluateSecurityPolicy({ user: securityContext, screen, processedMessage, routePlan });

  if (!securityDecision.allowed) {
    logInteraction({ traceId, sessionId, screen, userRole, status: securityDecision.reason, error: securityDecision.reason });
    return res.status(securityDecision.statusCode).json({
      traceId,
      error: securityDecision.publicMessage,
      security: { allowed: false, reason: securityDecision.reason, flags: securityDecision.securityFlags },
      route: { name: routePlan.route, callModel: false, profile: routePlan.profile },
      messageProcessing: { intent: processedMessage.intent, riskLevel: processedMessage.riskLevel, requiresConfirmation: processedMessage.requiresConfirmation, warnings: processedMessage.warnings }
    });
  }

  if (!routePlan.callModel) {
    logInteraction({ traceId, sessionId, screen, userRole, status: routePlan.route, error: routePlan.statusCode >= 400 ? routePlan.localAnswer : null });
    return res.status(routePlan.statusCode).json({ traceId, sessionId: sessionId || null, answer: routePlan.localAnswer, route: { name: routePlan.route, callModel: routePlan.callModel, profile: routePlan.profile }, messageProcessing: { intent: processedMessage.intent, riskLevel: processedMessage.riskLevel, requiresConfirmation: processedMessage.requiresConfirmation, warnings: processedMessage.warnings } });
  }

  const cleanMessage = processedMessage.cleanMessage;
  const session = sessionStore.getOrCreateSession({ sessionId, userId, screen, userRole });
  const appContext = {
    screen,
    userRole,
    permissions: {
      canViewOrders: securityContext.permissions.canViewOrders,
      canViewInvoices: securityContext.permissions.canViewInvoices,
      canManageUsers: securityContext.permissions.canManageUsers
    },
    selectedEntity: req.body.selectedEntity || null,
    activeFilters: req.body.activeFilters || null
  };

  try {
    const system = buildSystemPrompt({ screen: session.screen, userRole: session.userRole, intent: processedMessage.intent, riskLevel: processedMessage.riskLevel, requiresConfirmation: routePlan.requiresConfirmation, routePlan });
    const conversationContext = buildConversationContext({ session, cleanMessage, processedMessage, routePlan, appContext, maxRecentMessages: Number(process.env.MAX_CONTEXT_MESSAGES || 8) });
    const claudeResult = await claudeService.createMessage({ system, messages: conversationContext.messages, maxTokens: routePlan.maxTokens, effort: routePlan.effort, metadata: { traceId, sessionId: session.sessionId, screen: session.screen, userRole: session.userRole, route: routePlan.route, profile: routePlan.profile, contextDiagnostics: conversationContext.diagnostics } });
    const answer = claudeResult.answer;

    sessionStore.addTurn(session.sessionId, cleanMessage, answer);
    logInteraction({ traceId, sessionId: session.sessionId, screen: session.screen, userRole: session.userRole, status: "ok" });

    res.json({
      traceId,
      sessionId: session.sessionId,
      answer,
      session: sessionStore.getSessionSummary(session.sessionId),
      usage: claudeResult.usage,
      stopReason: claudeResult.stopReason,
      route: { name: routePlan.route, callModel: routePlan.callModel, profile: routePlan.profile, promptMode: routePlan.promptMode },
      messageProcessing: { intent: processedMessage.intent, riskLevel: processedMessage.riskLevel, requiresConfirmation: processedMessage.requiresConfirmation, warnings: processedMessage.warnings },
      contextDiagnostics: conversationContext.diagnostics,
      security: { userId: securityContext.userId, role: securityContext.role, allowed: securityDecision.allowed, flags: securityDecision.securityFlags }
    });
  } catch (error) {
    logInteraction({ traceId, sessionId: session.sessionId, screen: session.screen, userRole: session.userRole, status: "provider_error", error: error.message });
    res.status(error.status || 502).json({ traceId, sessionId: session.sessionId, error: error.publicMessage || "No se ha podido obtener respuesta del asistente.", errorType: error.type || "unknown_error" });
  }
});

app.listen(PORT, () => console.log(`Backend IA escuchando en http://localhost:${PORT}`));

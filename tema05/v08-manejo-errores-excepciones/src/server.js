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
import { asyncHandler, notFoundHandler, errorHandler } from "./errors/error-middleware.js";
import { AppError, validationError, forbiddenError, aiProviderError } from "./errors/app-error.js";
import { withTimeout } from "./errors/with-timeout.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:4200";
const sessionStore = new SessionStore({ maxMessages: Number(process.env.MAX_HISTORY_MESSAGES || 8), ttlMinutes: Number(process.env.SESSION_TTL_MINUTES || 30) });
const claudeService = new ClaudeService({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL, defaultMaxTokens: Number(process.env.CLAUDE_MAX_TOKENS || 600), defaultEffort: process.env.CLAUDE_EFFORT || "low" });

function traceMiddleware(req, res, next) {
  req.traceId = crypto.randomUUID();
  res.setHeader("x-trace-id", req.traceId);
  next();
}

app.use(traceMiddleware);
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));
configureSecurity(app);

app.get("/health", (req, res) => res.json({ status: "ok", service: "curso-claude-backend", timestamp: new Date().toISOString() }));
app.get("/api/security/me", (req, res) => {
  const securityContext = getSecurityContext(req);
  res.json({ userId: securityContext.userId, displayName: securityContext.displayName, role: securityContext.role, permissions: { canViewOrders: securityContext.permissions.canViewOrders, canViewInvoices: securityContext.permissions.canViewInvoices, canManageUsers: securityContext.permissions.canManageUsers } });
});
app.get("/api/assistant/provider", (req, res) => res.json({ provider: "anthropic", modelConfigured: Boolean(process.env.ANTHROPIC_MODEL), apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY), maxTokens: Number(process.env.CLAUDE_MAX_TOKENS || 600), effort: process.env.CLAUDE_EFFORT || "low" }));

app.post("/api/assistant/message", asyncHandler(async (req, res) => {
  const traceId = req.traceId;
  const securityContext = getSecurityContext(req);
  const { sessionId, message, screen = "general" } = req.body || {};
  const userId = securityContext.userId;
  const userRole = securityContext.role;

  const processedMessage = processUserMessage({ message, userRole, screen, maxLength: Number(process.env.MAX_USER_MESSAGE_LENGTH || 4000) });
  const routePlan = routeAiRequest({ processedMessage, userRole, screen });

  if (!processedMessage.allowed) {
    throw validationError(processedMessage.blockedReason || "Mensaje no permitido.", { intent: processedMessage.intent, riskLevel: processedMessage.riskLevel });
  }

  const securityDecision = evaluateSecurityPolicy({ user: securityContext, screen, processedMessage, routePlan });

  if (!securityDecision.allowed) {
    throw forbiddenError(securityDecision.publicMessage);
  }

  if (!routePlan.callModel) {
    return res.status(routePlan.statusCode).json({ traceId, sessionId: sessionId || null, answer: routePlan.localAnswer, route: { name: routePlan.route, callModel: routePlan.callModel, profile: routePlan.profile }, messageProcessing: { intent: processedMessage.intent, riskLevel: processedMessage.riskLevel, requiresConfirmation: processedMessage.requiresConfirmation, warnings: processedMessage.warnings } });
  }

  const cleanMessage = processedMessage.cleanMessage;
  const session = sessionStore.getOrCreateSession({ sessionId, userId, screen, userRole });
  const appContext = { screen, userRole, permissions: { canViewOrders: securityContext.permissions.canViewOrders, canViewInvoices: securityContext.permissions.canViewInvoices, canManageUsers: securityContext.permissions.canManageUsers }, selectedEntity: req.body.selectedEntity || null, activeFilters: req.body.activeFilters || null };
  const system = buildSystemPrompt({ screen: session.screen, userRole: session.userRole, intent: processedMessage.intent, riskLevel: processedMessage.riskLevel, requiresConfirmation: routePlan.requiresConfirmation, routePlan });
  const conversationContext = buildConversationContext({ session, cleanMessage, processedMessage, routePlan, appContext, maxRecentMessages: Number(process.env.MAX_CONTEXT_MESSAGES || 8) });

  let claudeResult;
  try {
    claudeResult = await withTimeout(
      claudeService.createMessage({ system, messages: conversationContext.messages, maxTokens: routePlan.maxTokens, effort: routePlan.effort, metadata: { traceId, sessionId: session.sessionId } }),
      Number(process.env.AI_TIMEOUT_MS || 30000),
      () => new AppError({ code: "AI_TIMEOUT", message: "Timeout esperando respuesta del proveedor IA.", publicMessage: "El asistente ha tardado demasiado en responder. Inténtalo de nuevo.", statusCode: 504, expose: true })
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw aiProviderError({ message: error.message, statusCode: error.status || error.statusCode || 502, providerType: error.type || "unknown", cause: error });
  }

  const answer = claudeResult.answer;
  sessionStore.addTurn(session.sessionId, cleanMessage, answer);

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
}));

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => console.log(`Backend IA escuchando en http://localhost:${PORT}`));

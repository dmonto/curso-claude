import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { SessionStore } from "./session-store.js";
import { ClaudeService } from "./claude-service.js";
import { buildSystemPrompt } from "./prompt-builder.js";
import { processUserMessage } from "./message-processor.js";
import { routeAiRequest } from "./ai-router.js";
import { buildConversationContext } from "./context-builder.js";
import { configureSecurity, getSecurityContext } from "./security-middleware.js";
import { evaluateSecurityPolicy } from "./security-policy.js";
import { InteractionLogger } from "./interaction-logger.js";
import { checkBackendReadiness } from "./backend-readiness.js";
import { asyncHandler, notFoundHandler, errorHandler } from "./errors/error-middleware.js";
import { AppError, validationError, forbiddenError, aiProviderError } from "./errors/app-error.js";
import { withTimeout } from "./errors/with-timeout.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:4200";
const sessionStore = new SessionStore({ maxMessages: Number(process.env.MAX_HISTORY_MESSAGES || 8), ttlMinutes: Number(process.env.SESSION_TTL_MINUTES || 30) });
const claudeService = new ClaudeService({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL, defaultMaxTokens: Number(process.env.CLAUDE_MAX_TOKENS || 600), defaultTemperature: Number(process.env.CLAUDE_TEMPERATURE || 0.3) });
const interactionLogger = new InteractionLogger({ logDir: process.env.INTERACTION_LOG_DIR || "logs", logFile: process.env.INTERACTION_LOG_FILE || "assistant-interactions.jsonl", logToConsole: process.env.INTERACTION_LOG_CONSOLE !== "false" });
app.locals.interactionLogger = interactionLogger;

function traceMiddleware(req, res, next) { req.traceId = crypto.randomUUID(); res.setHeader("x-trace-id", req.traceId); next(); }
function duration(startedAt) { return Date.now() - startedAt; }

app.use(traceMiddleware);
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));
configureSecurity(app);

app.get("/health", (req, res) => res.json({ status: "ok", service: "curso-claude-backend", timestamp: new Date().toISOString() }));
app.get("/api/admin/readiness", asyncHandler(async (req, res) => { const securityContext = getSecurityContext(req); if (securityContext.role !== "admin") throw forbiddenError("Solo un usuario admin puede consultar el estado del backend."); const readiness = checkBackendReadiness(); res.status(readiness.status === "fail" ? 503 : 200).json(readiness); }));
app.get("/api/security/me", (req, res) => { const sc = getSecurityContext(req); res.json({ userId: sc.userId, displayName: sc.displayName, role: sc.role, permissions: { canViewOrders: sc.permissions.canViewOrders, canViewInvoices: sc.permissions.canViewInvoices, canManageUsers: sc.permissions.canManageUsers } }); });
app.get("/api/assistant/provider", (req, res) => res.json({ provider: "anthropic", modelConfigured: Boolean(process.env.ANTHROPIC_MODEL), apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY), maxTokens: Number(process.env.CLAUDE_MAX_TOKENS || 600), temperature: Number(process.env.CLAUDE_TEMPERATURE || 0.3) }));

app.post("/api/assistant/message", asyncHandler(async (req, res) => {
  const startedAt = Date.now();
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
    interactionLogger.logInteraction({ level: "warn", traceId, sessionId: sessionId || null, userId, role: userRole, screen, status: "security_blocked", statusCode: securityDecision.statusCode, errorCode: securityDecision.reason, intent: processedMessage.intent, riskLevel: processedMessage.riskLevel, warnings: processedMessage.warnings, route: routePlan.route, profile: routePlan.profile, promptMode: routePlan.promptMode, callModel: false, securityAllowed: false, securityReason: securityDecision.reason, securityFlags: securityDecision.securityFlags, durationMs: duration(startedAt), message: processedMessage.cleanMessage });
    throw forbiddenError(securityDecision.publicMessage);
  }

  if (!routePlan.callModel) {
    interactionLogger.logInteraction({ traceId, sessionId: sessionId || null, userId, role: userRole, screen, status: "local_response", statusCode: routePlan.statusCode, intent: processedMessage.intent, riskLevel: processedMessage.riskLevel, warnings: processedMessage.warnings, route: routePlan.route, profile: routePlan.profile, promptMode: routePlan.promptMode, callModel: false, securityAllowed: true, securityFlags: [], durationMs: duration(startedAt), message: processedMessage.cleanMessage });
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
      claudeService.createMessage({ system, messages: conversationContext.messages, maxTokens: routePlan.maxTokens, temperature: routePlan.temperature, metadata: { traceId, sessionId: session.sessionId } }),
      Number(process.env.AI_TIMEOUT_MS || 30000),
      () => new AppError({ code: "AI_TIMEOUT", message: "Timeout esperando respuesta del proveedor IA.", publicMessage: "El asistente ha tardado demasiado en responder. Inténtalo de nuevo.", statusCode: 504, expose: true })
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw aiProviderError({ message: error.message, statusCode: error.status || error.statusCode || 502, providerType: error.type || "unknown", cause: error });
  }

  const answer = claudeResult.answer;
  sessionStore.addTurn(session.sessionId, cleanMessage, answer);
  interactionLogger.logInteraction({ traceId, sessionId: session.sessionId, userId, role: userRole, screen, status: "ok", statusCode: 200, intent: processedMessage.intent, riskLevel: processedMessage.riskLevel, warnings: processedMessage.warnings, route: routePlan.route, profile: routePlan.profile, promptMode: routePlan.promptMode, callModel: routePlan.callModel, securityAllowed: securityDecision.allowed, securityFlags: securityDecision.securityFlags, contextDiagnostics: conversationContext.diagnostics, model: process.env.ANTHROPIC_MODEL, usage: claudeResult.usage, stopReason: claudeResult.stopReason, durationMs: duration(startedAt), message: cleanMessage });

  res.json({ traceId, sessionId: session.sessionId, answer, session: sessionStore.getSessionSummary(session.sessionId), usage: claudeResult.usage, stopReason: claudeResult.stopReason, route: { name: routePlan.route, callModel: routePlan.callModel, profile: routePlan.profile, promptMode: routePlan.promptMode }, messageProcessing: { intent: processedMessage.intent, riskLevel: processedMessage.riskLevel, requiresConfirmation: processedMessage.requiresConfirmation, warnings: processedMessage.warnings }, contextDiagnostics: conversationContext.diagnostics, security: { userId: securityContext.userId, role: securityContext.role, allowed: securityDecision.allowed, flags: securityDecision.securityFlags } });
}));

app.get("/api/assistant/logs/summary", asyncHandler(async (req, res) => { const sc = getSecurityContext(req); if (sc.role !== "admin") throw forbiddenError("Solo un usuario admin puede consultar el resumen de logs."); const logPath = path.join(process.env.INTERACTION_LOG_DIR || "logs", process.env.INTERACTION_LOG_FILE || "assistant-interactions.jsonl"); if (!fs.existsSync(logPath)) return res.json({ totalEvents: 0, byStatus: {}, byRoute: {}, totalInputTokens: 0, totalOutputTokens: 0 }); const lines = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean); const events = lines.map((line) => JSON.parse(line)); res.json({ totalEvents: events.length, byStatus: groupCount(events, "status"), byRoute: groupCount(events, "route"), totalInputTokens: sumField(events, "inputTokens"), totalOutputTokens: sumField(events, "outputTokens"), avgDurationMs: averageField(events, "durationMs") }); }));
function groupCount(events, field) { return events.reduce((acc, event) => { const key = event[field] || "unknown"; acc[key] = (acc[key] || 0) + 1; return acc; }, {}); }
function sumField(events, field) { return events.reduce((sum, event) => sum + (Number(event[field]) || 0), 0); }
function averageField(events, field) { const values = events.map((event) => Number(event[field])).filter((value) => Number.isFinite(value)); return values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length); }

app.use(notFoundHandler);
app.use(errorHandler);
app.listen(PORT, () => console.log(`Backend IA escuchando en http://localhost:${PORT}`));

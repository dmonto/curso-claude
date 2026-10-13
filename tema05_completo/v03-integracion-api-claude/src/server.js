import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { SessionStore } from "./session-store.js";
import { ClaudeService } from "./claude-service.js";
import { buildSystemPrompt } from "./prompt-builder.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:4200";

const sessionStore = new SessionStore({
  maxMessages: Number(process.env.MAX_HISTORY_MESSAGES || 8),
  ttlMinutes: Number(process.env.SESSION_TTL_MINUTES || 30)
});

const claudeService = new ClaudeService({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.ANTHROPIC_MODEL,
  defaultMaxTokens: Number(process.env.CLAUDE_MAX_TOKENS || 600),
  defaultEffort: process.env.CLAUDE_EFFORT || "low"
});

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

function createTraceId() { return crypto.randomUUID(); }

function validateUserMessage(message) {
  if (!message || typeof message !== "string") return "El campo message es obligatorio y debe ser texto.";
  if (message.trim().length < 2) return "El mensaje es demasiado corto.";
  if (message.length > 4000) return "El mensaje supera el tamaño máximo permitido.";
  return null;
}

function logInteraction({ traceId, sessionId, screen, userRole, status, error }) {
  console.log(JSON.stringify({ traceId, sessionId, screen, userRole, status, error: error || null, timestamp: new Date().toISOString() }));
}

app.get("/health", (req, res) => res.json({ status: "ok", service: "curso-claude-backend", timestamp: new Date().toISOString() }));

app.get("/api/assistant/provider", (req, res) => {
  res.json({
    provider: "anthropic",
    modelConfigured: Boolean(process.env.ANTHROPIC_MODEL),
    apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    maxTokens: Number(process.env.CLAUDE_MAX_TOKENS || 600),
    effort: process.env.CLAUDE_EFFORT || "low"
  });
});

app.post("/api/assistant/message", async (req, res) => {
  const traceId = createTraceId();
  const { sessionId, userId = "user_demo", message, screen = "general", userRole = "usuario_estandar" } = req.body || {};

  const validationError = validateUserMessage(message);
  if (validationError) {
    logInteraction({ traceId, sessionId, screen, userRole, status: "validation_error", error: validationError });
    return res.status(400).json({ traceId, error: validationError });
  }

  const session = sessionStore.getOrCreateSession({ sessionId, userId, screen, userRole });

  try {
    const system = buildSystemPrompt({ screen: session.screen, userRole: session.userRole });
    const messages = sessionStore.getMessagesForModel(session.sessionId, message);

    const claudeResult = await claudeService.createMessage({
      system,
      messages,
      metadata: { traceId, sessionId: session.sessionId, screen: session.screen, userRole: session.userRole }
    });

    const answer = claudeResult.answer;
    sessionStore.addTurn(session.sessionId, message, answer);

    logInteraction({ traceId, sessionId: session.sessionId, screen: session.screen, userRole: session.userRole, status: "ok" });

    res.json({
      traceId,
      sessionId: session.sessionId,
      answer,
      session: sessionStore.getSessionSummary(session.sessionId),
      usage: claudeResult.usage,
      stopReason: claudeResult.stopReason
    });
  } catch (error) {
    logInteraction({ traceId, sessionId: session.sessionId, screen: session.screen, userRole: session.userRole, status: "provider_error", error: error.message });

    res.status(error.status || 502).json({
      traceId,
      sessionId: session.sessionId,
      error: error.publicMessage || "No se ha podido obtener respuesta del asistente.",
      errorType: error.type || "unknown_error"
    });
  }
});

app.get("/api/assistant/sessions", (req, res) => res.json({ sessions: sessionStore.listSessions() }));
app.get("/api/assistant/session/:sessionId", (req, res) => {
  const session = sessionStore.getSessionSummary(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Sesión no encontrada" });
  res.json(session);
});
app.delete("/api/assistant/session/:sessionId", (req, res) => res.json({ sessionId: req.params.sessionId, deleted: sessionStore.deleteSession(req.params.sessionId) }));

app.listen(PORT, () => console.log(`Backend IA escuchando en http://localhost:${PORT}`));

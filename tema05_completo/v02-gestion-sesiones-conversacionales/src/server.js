import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { SessionStore } from "./session-store.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:4200";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sessionStore = new SessionStore({
  maxMessages: Number(process.env.MAX_HISTORY_MESSAGES || 8),
  ttlMinutes: Number(process.env.SESSION_TTL_MINUTES || 30)
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

function buildSystemPrompt({ screen, userRole }) {
  return `
Eres un asistente integrado en una aplicación web empresarial.

Tu función:
- Ayudar al usuario a entender la pantalla actual.
- Responder de forma clara, breve y accionable.
- Pedir datos faltantes si la petición es ambigua.
- No inventar datos internos de la aplicación.
- No afirmar que has ejecutado acciones si el backend no las ha ejecutado.

Contexto de aplicación:
- Pantalla actual: ${screen || "general"}
- Rol del usuario: ${userRole || "usuario_estandar"}

Reglas:
- Si falta información, pregunta antes de asumir.
- Si la petición requiere acceder a datos internos, indica que debe consultarse una API interna.
- Si detectas una petición sensible, responde con cautela y pide confirmación.
`;
}

function extractTextFromClaudeResponse(response) {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function logInteraction({ traceId, sessionId, screen, userRole, status, error }) {
  console.log(JSON.stringify({
    traceId, sessionId, screen, userRole, status, error: error || null, timestamp: new Date().toISOString()
  }));
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "curso-claude-backend", timestamp: new Date().toISOString() });
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

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL,
      max_tokens: 600,
      output_config: {effort: "low"},
      system,
      messages
    });

    const answer = extractTextFromClaudeResponse(response);
    sessionStore.addTurn(session.sessionId, message, answer);

    logInteraction({ traceId, sessionId: session.sessionId, screen: session.screen, userRole: session.userRole, status: "ok" });

    res.json({
      traceId,
      sessionId: session.sessionId,
      answer,
      session: sessionStore.getSessionSummary(session.sessionId),
      usage: response.usage || null
    });
  } catch (error) {
    logInteraction({ traceId, sessionId: session.sessionId, screen: session.screen, userRole: session.userRole, status: "provider_error", error: error.message });
    res.status(502).json({ traceId, sessionId: session.sessionId, error: "No se ha podido obtener respuesta del asistente.", detail: error.message });
  }
});

app.get("/api/assistant/sessions", (req, res) => {
  res.json({ sessions: sessionStore.listSessions() });
});

app.get("/api/assistant/session/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const session = sessionStore.getSessionSummary(sessionId);
  if (!session) return res.status(404).json({ error: "Sesión no encontrada" });
  res.json(session);
});

app.delete("/api/assistant/session/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const deleted = sessionStore.deleteSession(sessionId);
  res.json({ sessionId, deleted });
});

app.listen(PORT, () => console.log(`Backend IA escuchando en http://localhost:${PORT}`));

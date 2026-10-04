import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:4200";
const MAX_HISTORY_MESSAGES = Number(process.env.MAX_HISTORY_MESSAGES || 8);

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("AVISO: Falta ANTHROPIC_API_KEY en .env");
}

if (!process.env.ANTHROPIC_MODEL) {
  console.warn("AVISO: Falta ANTHROPIC_MODEL en .env");
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sessions = new Map();

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

function createTraceId() {
  return crypto.randomUUID();
}

function getOrCreateSession(sessionId) {
  const id = sessionId || crypto.randomUUID();

  if (!sessions.has(id)) {
    sessions.set(id, {
      id,
      createdAt: new Date().toISOString(),
      messages: []
    });
  }

  return sessions.get(id);
}

function validateUserMessage(message) {
  if (!message || typeof message !== "string") {
    return "El campo message es obligatorio y debe ser texto.";
  }

  if (message.trim().length < 2) {
    return "El mensaje es demasiado corto.";
  }

  if (message.length > 4000) {
    return "El mensaje supera el tamaño máximo permitido.";
  }

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

function buildClaudeMessages(session, newUserMessage) {
  const history = session.messages.slice(-MAX_HISTORY_MESSAGES);

  return [
    ...history,
    { role: "user", content: newUserMessage }
  ];
}

function extractTextFromClaudeResponse(response) {
  const textBlocks = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text);

  return textBlocks.join("\n").trim();
}

function logInteraction({ traceId, sessionId, screen, userRole, status, error }) {
  const event = {
    traceId,
    sessionId,
    screen,
    userRole,
    status,
    error: error || null,
    timestamp: new Date().toISOString()
  };

  console.log(JSON.stringify(event));
}

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "curso-claude-backend",
    timestamp: new Date().toISOString()
  });
});

app.post("/api/assistant/message", async (req, res) => {
  const traceId = createTraceId();
  const { sessionId, message, screen = "general", userRole = "usuario_estandar" } = req.body || {};

  const validationError = validateUserMessage(message);

  if (validationError) {
    logInteraction({ traceId, sessionId, screen, userRole, status: "validation_error", error: validationError });
    return res.status(400).json({ traceId, error: validationError });
  }

  const session = getOrCreateSession(sessionId);

  try {
    const system = buildSystemPrompt({ screen, userRole });
    const messages = buildClaudeMessages(session, message);

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL,
      max_tokens: 600,
      output_config: {effort: "low"},
      system,
      messages
    });

    const answer = extractTextFromClaudeResponse(response);

    session.messages.push({ role: "user", content: message });
    session.messages.push({ role: "assistant", content: answer });
    session.messages = session.messages.slice(-MAX_HISTORY_MESSAGES);

    logInteraction({ traceId, sessionId: session.id, screen, userRole, status: "ok" });

    res.json({
      traceId,
      sessionId: session.id,
      answer,
      usage: response.usage || null
    });
  } catch (error) {
    logInteraction({ traceId, sessionId: session.id, screen, userRole, status: "provider_error", error: error.message });

    res.status(502).json({
      traceId,
      error: "No se ha podido obtener respuesta del asistente.",
      detail: error.message
    });
  }
});

app.delete("/api/assistant/session/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const existed = sessions.delete(sessionId);

  res.json({ sessionId, deleted: existed });
});

app.listen(PORT, () => {
  console.log(`Backend IA escuchando en http://localhost:${PORT}`);
});

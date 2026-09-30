import express from "express";
import cors from "cors";
import crypto from "node:crypto";

const app = express();

app.use(cors({ origin: "http://localhost:4200" }));
app.use(express.json());

app.post("/api/assistant/messages", (req, res) => {
  const { conversationId, message, screenContext } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      error: "message_required",
      message: "El campo message es obligatorio"
    });
  }

  const activeConversationId = conversationId || crypto.randomUUID();
  const route = screenContext?.route || "sin ruta";

  res.json({
    conversationId: activeConversationId,
    message: {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        `He recibido tu mensaje desde la ruta ${route}. ` +
        `En una integración real, el backend validaría permisos, construiría el prompt y llamaría a Claude.`,
      createdAt: new Date().toISOString()
    },
    suggestedActions: [
      {
        id: "explain-architecture",
        label: "Ver arquitectura del asistente",
        type: "navigate",
        payload: {
          url: "/arquitectura-asistente"
        }
      }
    ]
  });
});

app.listen(3000, () => {
  console.log("Backend mock escuchando en http://localhost:3000");
});
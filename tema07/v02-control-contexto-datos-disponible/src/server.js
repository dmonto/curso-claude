import "dotenv/config";
import express from "express";
import cors from "cors";
import { getUserById } from "./db.js";
import { buildAssistantContext } from "./context-builder.js";
import { askClaude } from "./model.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok", version: "v02" }));

app.post("/api/assistant/context", (req, res) => {
  const { userId, page, entityId } = req.body;
  const user = getUserById(userId);

  if (!user) {
    return res.status(401).json({ error: "Usuario no válido." });
  }

  res.json(buildAssistantContext({ user, page, entityId }));
});

app.post("/api/assistant/message", async (req, res) => {
  try {
    const { userId, page, entityId, message } = req.body;
    const user = getUserById(userId);

    if (!user) {
      return res.status(401).json({ error: "Usuario no válido." });
    }

    const context = buildAssistantContext({ user, page, entityId });

    const answer = await askClaude({
      system: "Responde solo con el contexto disponible. Si falta información, dilo explícitamente.",
      user: JSON.stringify({ context, message }, null, 2)
    });

    res.json({ contextSentToModel: context, answer });
  } catch (error) {
    res.status(500).json({ error: "Error generando respuesta.", detail: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`v02 escuchando en http://localhost:${port}`));

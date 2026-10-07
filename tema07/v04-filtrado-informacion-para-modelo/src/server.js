import "dotenv/config";
import express from "express";
import cors from "cors";
import { getTicketById } from "./db.js";
import { projectTicketForModel, sanitizeForModel } from "./sanitizer.js";
import { askClaude } from "./model.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok", version: "v04" }));

app.get("/api/model-context/ticket/:id", (req, res) => {
  const ticket = getTicketById(Number(req.params.id));

  if (!ticket) {
    return res.status(404).json({ error: "Ticket no encontrado." });
  }

  res.json({ modelContext: projectTicketForModel(ticket) });
});

app.post("/api/assistant/message", async (req, res) => {
  const { ticketId, message } = req.body;
  const ticket = getTicketById(Number(ticketId));

  if (!ticket) {
    return res.status(404).json({ error: "Ticket no encontrado." });
  }

  const modelContext = projectTicketForModel(ticket);
  const answer = await askClaude({
    system: "Usa solo el contexto filtrado. No solicites ni reveles emails, tokens, notas internas ni secretos.",
    user: JSON.stringify(sanitizeForModel({ message, modelContext }), null, 2)
  });

  res.json({ modelContext, answer });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`v04 escuchando en http://localhost:${port}`));

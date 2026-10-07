import "dotenv/config";
import express from "express";
import cors from "cors";
import { getTicketById, getUserById, parsePermissions } from "./db.js";
import { toSafeTicket } from "./safe-ticket.js";
import { askClaude } from "./model.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", version: "v01" });
});

app.get("/api/tickets/:id", (req, res) => {
  const ticket = getTicketById(Number(req.params.id));

  if (!ticket) {
    return res.status(404).json({ error: "Ticket no encontrado." });
  }

  res.json({ ticket: toSafeTicket(ticket) });
});

app.post("/api/assistant/message", async (req, res) => {
  try {
    const { userId, ticketId, message } = req.body;

    if (!userId || !ticketId || !message) {
      return res.status(400).json({ error: "userId, ticketId y message son obligatorios." });
    }

    const user = getUserById(userId);
    if (!user) {
      return res.status(401).json({ error: "Usuario no válido." });
    }

    const permissions = parsePermissions(user);
    if (!permissions.includes("read:tickets") && !permissions.includes("read:own_tickets")) {
      return res.status(403).json({ error: "El usuario no puede leer tickets." });
    }

    const ticket = getTicketById(Number(ticketId));
    if (!ticket) {
      return res.status(404).json({ error: "Ticket no encontrado." });
    }

    const safeTicket = toSafeTicket(ticket);

    const answer = await askClaude({
      system: "Eres un asistente de soporte. Usa solo el contexto proporcionado. No inventes datos ni menciones campos no incluidos.",
      user: JSON.stringify({ user: { id: user.id, role: user.role }, ticket: safeTicket, message }, null, 2)
    });

    res.json({
      user: { id: user.id, role: user.role },
      contextSentToModel: { ticket: safeTicket },
      answer
    });
  } catch (error) {
    res.status(500).json({ error: "No se pudo procesar el mensaje.", detail: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`v01 escuchando en http://localhost:${port}`));

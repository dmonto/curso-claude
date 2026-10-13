import "dotenv/config";
import express from "express";
import cors from "cors";
import { db, getUserById } from "./db.js";
import { validateQuerySpec } from "./query-spec.js";
import { buildSql } from "./sql-builder.js";
import { canReadTickets, canReadMetrics, detectSensitiveRequest } from "./permissions.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok", version: "v06" }));

function fallbackSpec(question) {
  const q = String(question || "").toLowerCase();
  const filters = [];
  if (q.includes("abiert")) filters.push({ field: "status", operator: "=", value: "open" });
  if (q.includes("crític") || q.includes("critic")) filters.push({ field: "priority", operator: "=", value: "critical" });
  if (q.includes("pago")) filters.push({ field: "category", operator: "=", value: "payments" });
  console.log(q)
  return { entity: "tickets", operation: q.includes("cuant") ? "count" : "list", filters, sort: [], limit: 20 };
}

app.post("/api/query", (req, res) => {
  try {
    const { userId, question } = req.body;
    const user = getUserById(userId);

    if (!user) return res.status(401).json({ error: "Usuario no válido." });
    if (!canReadTickets(user)) return res.status(403).json({ error: "Sin permiso de lectura de tickets." });

    const sensitiveTerm = detectSensitiveRequest(question);
    if (sensitiveTerm) {
      return res.status(403).json({
        error: "Solicitud fuera de alcance.",
        detail: `La petición menciona información sensible: ${sensitiveTerm}.`,
        safeAnswer: "Solo puedo consultar campos operativos de tickets, no emails, tokens, contraseñas ni notas internas."
      });
    }
    console.log(fallbackSpec(question))
    const querySpec = validateQuerySpec(fallbackSpec(question));

    if (querySpec.operation === "count" && !canReadMetrics(user)) {
      return res.status(403).json({ error: "El usuario no puede consultar métricas agregadas." });
    }

    const { sql, params } = buildSql(querySpec);
    const rows = db.prepare(sql).all(...params);

    res.json({ user: { id: user.id, role: user.role }, querySpec, rows });
  } catch (error) {
    res.status(500).json({ error: "No se pudo consultar datos.", detail: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`v06 escuchando en http://localhost:${port}`));

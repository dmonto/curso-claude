import "dotenv/config";
import express from "express";
import cors from "cors";
import { db } from "./db.js";
import { naturalLanguageToQuerySpec } from "./nl-to-query.js";
import { validateQuerySpec } from "./query-spec.js";
import { buildSql } from "./sql-builder.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok", version: "v05" }));

function summarize(rows) {
  if (rows.length === 0) return "No se han encontrado resultados.";
  if (rows[0].total !== undefined) return `La consulta devuelve ${rows[0].total} registro(s).`;
  return `Se han encontrado ${rows.length} ticket(s).`;
}

app.post("/api/query", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: "question es obligatorio." });

    const raw = await naturalLanguageToQuerySpec(question);
    const querySpec = validateQuerySpec(raw);
    const { sql, params } = buildSql(querySpec);
    const rows = db.prepare(sql).all(...params);
    console.log(summarize(rows))
    const response = { question, querySpec, answer: summarize(rows), rows };
    if (process.env.DEBUG_SQL === "true") Object.assign(response, { sqlPreview: sql, params });
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: "No se pudo generar la consulta dinámica.", detail: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`v05 escuchando en http://localhost:${port}`));

import "dotenv/config";
import express from "express";
import cors from "cors";
import { db } from "./db.js";
import { translateQuestionToQuerySpec } from "./translator.js";
import { validateQuerySpec } from "./query-spec.js";
import { buildSql } from "./sql-builder.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok", version: "v07" }));

app.post("/api/translate-question", (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: "question es obligatorio." });

    const raw = translateQuestionToQuerySpec(question);
    console.log(raw)
    const { metadata, ...querySpecCandidate } = raw;
    const querySpec = validateQuerySpec(querySpecCandidate);
    const { sql, params } = buildSql(querySpec);
    console.log(sql)
    const rows = db.prepare(sql).all(...params);

    res.json({ question, metadata, querySpec, rows, sqlPreview: process.env.DEBUG_SQL === "true" ? sql : undefined });
  } catch (error) {
    res.status(500).json({ error: "No se pudo traducir la pregunta.", detail: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`v07 escuchando en http://localhost:${port}`));

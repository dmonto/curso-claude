import "dotenv/config";
import express from "express";
import cors from "cors";
import { db } from "./db.js";
import { validateQuerySpec } from "./query-spec.js";
import { buildSql } from "./sql-builder.js";
import { validateResults, buildAnswerFromValidatedResults } from "./result-validator.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok", version: "v09" }));

app.post("/api/validated-query", (req, res) => {
  try {
    const querySpec = validateQuerySpec(req.body);
    const { sql, params } = buildSql(querySpec);
    const rows = db.prepare(sql).all(...params);
    const validationReport = validateResults({ querySpec, rows });
    const answer = buildAnswerFromValidatedResults(rows, validationReport);

    res.json({ querySpec, rows: validationReport.passed ? rows : [], validationReport, answer });
  } catch (error) {
    res.status(400).json({ error: "No se pudo validar la respuesta.", detail: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`v09 escuchando en http://localhost:${port}`));

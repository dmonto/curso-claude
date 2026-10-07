import "dotenv/config";
import express from "express";
import cors from "cors";
import { db } from "./db.js";
import { validateQuerySpec } from "./query-spec.js";
import { buildSql } from "./sql-builder.js";
import { optimizeQuerySpec, explainQueryPlan } from "./query-optimizer.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok", version: "v08" }));

app.post("/api/optimized-query", (req, res) => {
  try {
    const validated = validateQuerySpec(req.body);
    const { optimized, warnings } = optimizeQuerySpec(validated);
    console.log(optimized, warnings)
    const { sql, params } = buildSql(optimized);
    const plan = explainQueryPlan(db, sql, params);
    const rows = db.prepare(sql).all(...params);

    res.json({ original: validated, optimized, warnings, plan, rows, sqlPreview: process.env.DEBUG_SQL === "true" ? sql : undefined });
  } catch (error) {
    res.status(400).json({ error: "No se pudo optimizar la consulta.", detail: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`v08 escuchando en http://localhost:${port}`));

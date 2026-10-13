import "dotenv/config";
import express from "express";
import cors from "cors";
import { db } from "./db.js";
import { validateQuerySpec } from "./query-spec.js";
import { buildSql } from "./sql-builder.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok", version: "v03" }));

app.post("/api/query-spec", (req, res) => {
  try {
    const querySpec = validateQuerySpec(req.body);
    const { sql, params } = buildSql(querySpec);
    const rows = db.prepare(sql).all(...params);

    const response = { querySpec, rows };
    if (process.env.DEBUG_SQL === "true") {
      response.sqlPreview = sql;
      response.params = params;
    }

    res.json(response);
  } catch (error) {
    res.status(400).json({ error: "QuerySpec no válida.", detail: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`v03 escuchando en http://localhost:${port}`));

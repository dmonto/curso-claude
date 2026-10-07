import "dotenv/config";
import express from "express";
import cors from "cors";
import { db, getUserById, parsePermissions } from "./db.js";
import { validateQuerySpec } from "./query-spec.js";
import { buildSql } from "./sql-builder.js";
import { translateQuestion } from "./translator.js";
import { detectBlockedRequest } from "./guardrails.js";
import { checkPrecision } from "./precision.js";
import { buildAnalysisResponse } from "./response.js";
import { createRequestId, writeAuditEvent } from "./audit.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok", version: "v10" }));

function summarize(rows) {
  if (rows.length === 0) return "No se han encontrado resultados.";
  if (rows[0].total !== undefined) return `La consulta devuelve ${rows[0].total} registro(s).`;
  const critical = rows.filter((row) => row.priority === "critical").length;
  const open = rows.filter((row) => row.status === "open").length;
  return `Se han encontrado ${rows.length} ticket(s), ${open} abierto(s) y ${critical} crítico(s).`;
}

app.post("/api/analyze", (req, res) => {
  const startedAt = Date.now();
  const requestId = createRequestId();

  try {
    const { userId, question } = req.body;
    const user = getUserById(userId);

    if (!user) return res.status(401).json({ error: "Usuario no válido." });

    const permissions = parsePermissions(user);
    if (!permissions.includes("read:tickets") && !permissions.includes("read:own_tickets")) {
      return res.status(403).json({ error: "Sin permiso de lectura." });
    }

    const blocked = detectBlockedRequest(question);
    if (blocked) {
      const response = buildAnalysisResponse({
        requestId,
        startedAt,
        question,
        analysisType: "blocked_request",
        contract: null,
        answer: "Solo puedo analizar tickets y campos autorizados de esta aplicación.",
        data: {},
        evidence: [],
        criteria: ["Se bloquean solicitudes sobre datos sensibles o entidades no permitidas."],
        limitations: ["La petición no se ha ejecutado."],
        precisionReport: { passed: false, score: 0, issues: [{ code: "BLOCKED_REQUEST", severity: "HIGH", message: `Término bloqueado: ${blocked}` }], safeAnswer: "Solo puedo analizar tickets y campos autorizados de esta aplicación." }
      });
      writeAuditEvent(response);
      return res.json(response);
    }

    const querySpec = validateQuerySpec(translateQuestion(question));
    const { sql, params } = buildSql(querySpec);
    const rows = db.prepare(sql).all(...params);
    const answer = summarize(rows);

    const evidence = rows.slice(0, 5);
    const limitations = [
      "Solo se usan campos permitidos de la tabla tickets.",
      "La respuesta no confirma causa raíz; solo resume datos disponibles."
    ];
    const criteria = [
      "Las consultas se generan como QuerySpec validado.",
      "Los valores se ejecutan mediante SQL parametrizado.",
      "La respuesta se valida antes de devolverse."
    ];

    const precisionReport = checkPrecision({ answer, evidence, limitations });

    const response = buildAnalysisResponse({
      requestId,
      startedAt,
      question,
      analysisType: "ticket_analysis",
      contract: querySpec,
      answer,
      data: { rowCount: rows.length, rows },
      evidence,
      criteria,
      limitations,
      precisionReport
    });

    if (process.env.DEBUG_SQL === "true") {
      response.debug = { sqlPreview: sql, params };
    }

    writeAuditEvent(response);
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: "No se pudo analizar la petición.", detail: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`v10 escuchando en http://localhost:${port}`));

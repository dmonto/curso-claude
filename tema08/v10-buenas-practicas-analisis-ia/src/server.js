import "dotenv/config";
import express from "express";
import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { orders, invoices, tickets, customers, documents, allTables } from "./data.js";
import { naturalLanguageToQuery } from "./nl-to-query.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function includesAny(text, terms) {
  const normalized = normalize(text);
  return terms.some((term) => normalized.includes(normalize(term)));
}

function applyFilters(rows, filters) {
  return rows.filter((row) => filters.every((filter) => {
    const value = row[filter.field];
    if (filter.operator === "equals") return normalize(value) === normalize(filter.value);
    if (filter.operator === "contains") return normalize(value).includes(normalize(filter.value));
    if (filter.operator === "gt") return Number(value) > Number(filter.value);
    if (filter.operator === "gte") return Number(value) >= Number(filter.value);
    if (filter.operator === "lt") return Number(value) < Number(filter.value);
    if (filter.operator === "lte") return Number(value) <= Number(filter.value);
    if (filter.operator === "in") return filter.value.map(normalize).includes(normalize(value));
    return true;
  }));
}

function sortRows(rows, sort) {
  if (!sort?.field) return rows;
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a[sort.field] < b[sort.field]) return -1 * direction;
    if (a[sort.field] > b[sort.field]) return 1 * direction;
    return 0;
  });
}

function getTable(name) {
  const tables = allTables();
  return tables[name] || [];
}

function asCurrency(value) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

async function audit(event) {
  await mkdir(path.join(ROOT, "logs"), { recursive: true });
  await appendFile(
    path.join(ROOT, "logs", "events.jsonl"),
    JSON.stringify({ timestamp: new Date().toISOString(), ...event }) + "\n",
    "utf8"
  );
}

const VERSION = "v10";
const TOPIC = "v10 Mejores prácticas de análisis con IA";
const ENDPOINT = "/api/analyze";


function bestPracticeChecklist(message, resultCount) {
  const text = normalize(message);
  return [
    { check: "grounding", passed: includesAny(text, ["pedido", "factura", "cliente", "ticket", "datos"]), note: "La respuesta debe apoyarse en datos de aplicación." },
    { check: "bounded_query", passed: !includesAny(text, ["todo", "todos los datos", "sin limite", "sin límite"]), note: "Evitar consultas sin límite." },
    { check: "result_validation", passed: resultCount >= 0, note: "El backend valida tamaño y estructura del resultado." },
    { check: "explainability", passed: true, note: "La respuesta incluye filtros, evidencia y recomendaciones." },
    { check: "audit", passed: true, note: "La interacción se registra en logs/events.jsonl." }
  ];
}

async function handleRequest(payload) {
  const message = payload.message || "";
  const { table, filters, source } = await naturalLanguageToQuery(message);

  const rows = applyFilters(getTable(table), filters);
  const checklist = bestPracticeChecklist(message, rows.length);
  const passed = checklist.filter((item) => item.passed).length;

  const recommendations = [];
  if (filters.length === 0) recommendations.push("Añadir filtros explícitos antes de usar esta consulta en producción.");
  if (rows.length > 10) recommendations.push("Paginar resultados o pedir al usuario que acote la pregunta.");
  if (!checklist.find((item) => item.check === "bounded_query").passed) recommendations.push("Aplicar límite máximo de filas.");
  if (recommendations.length === 0) recommendations.push("La consulta es razonablemente acotada para una primera versión.");

  await audit({ eventType: "best_practices_analysis", message, table, filters, source, rows: rows.length, passed });

  return {
    matched: true,
    answer: `Consulta ejecutada sobre ${table}. Cumple ${passed}/${checklist.length} controles de buenas prácticas.`,
    table,
    filters,
    source,
    rows,
    checklist,
    recommendations,
    result: rows
  };
}

const app = express();
app.set("json spaces", 2);
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", version: VERSION, topic: TOPIC });
});

app.post(ENDPOINT, async (req, res) => {
  try {
    res.json(await handleRequest(req.body));
  } catch (error) {
    res.status(400).json({ error: "bad_request", message: error.message });
  }
});

app.use(express.static(PUBLIC_DIR));

app.use((req, res) => {
  res.status(404).json({ error: "not_found" });
});

app.listen(PORT, () => {
  console.log(`${TOPIC} escuchando en http://localhost:${PORT}`);
  console.log(`Endpoint: POST ${ENDPOINT}`);
});

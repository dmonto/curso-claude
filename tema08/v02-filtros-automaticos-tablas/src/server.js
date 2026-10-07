import express from "express";
import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { orders, invoices, tickets, customers, documents, allTables } from "./data.js";

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

const VERSION = "v02";
const TOPIC = "v02 Filtros automáticos en tablas de datos";
const ENDPOINT = "/api/table-filter";


function extractAutomaticFilters(message) {
  const filters = [];
  const text = normalize(message);

  if (includesAny(text, ["vencida", "vencidas"])) filters.push({ field: "status", operator: "equals", value: "vencida", reason: "El texto menciona facturas vencidas." });
  if (includesAny(text, ["pagada", "pagadas"])) filters.push({ field: "status", operator: "equals", value: "pagada", reason: "El texto menciona facturas pagadas." });
  if (includesAny(text, ["riesgo alto", "alto riesgo"])) filters.push({ field: "risk", operator: "equals", value: "alto", reason: "El texto menciona riesgo alto." });
  if (includesAny(text, ["marta"])) filters.push({ field: "customer", operator: "contains", value: "Marta", reason: "El texto menciona cliente Marta." });
  if (includesAny(text, ["lucia", "lucía"])) filters.push({ field: "customer", operator: "contains", value: "Lucía", reason: "El texto menciona cliente Lucía." });

  const amountMatch = text.match(/(?:mas de|más de|mayor que|superior a|>)[^0-9]*(\d+(?:[.,]\d+)?)/);
  if (amountMatch) {
    filters.push({ field: "amount", operator: "gt", value: Number(amountMatch[1].replace(",", ".")), reason: "El texto contiene un umbral numérico." });
  }

  return filters;
}

async function handleRequest(payload) {
  const message = payload.message || "";
  const filters = extractAutomaticFilters(message);
  const rows = applyFilters(invoices, filters);

  await audit({ eventType: "automatic_filters", message, filters, rows: rows.length });

  return {
    matched: filters.length > 0,
    answer: filters.length
      ? `He aplicado ${filters.length} filtros automáticos y he encontrado ${rows.length} facturas.`
      : "No he detectado filtros claros. Muestra todas las facturas para revisión.",
    table: "invoices",
    filters,
    rows,
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

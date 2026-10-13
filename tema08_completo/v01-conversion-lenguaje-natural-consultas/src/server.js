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

const VERSION = "v01";
const TOPIC = "v01 Conversión de lenguaje natural a consultas";
const ENDPOINT = "/api/nl-query";


function detectDataset(message) {
  if (includesAny(message, ["factura", "facturas", "cobro", "vencida", "vencidas"])) return "invoices";
  if (includesAny(message, ["ticket", "incidencia", "soporte", "escalado"])) return "tickets";
  if (includesAny(message, ["cliente", "clientes", "cuenta"])) return "customers";
  return "orders";
}

function buildStructuredQuery(message) {
  const table = detectDataset(message);
  const filters = [];
  const text = normalize(message);

  if (table === "orders") {
    if (includesAny(text, ["retrasado", "retrasados", "tarde"])) filters.push({ field: "status", operator: "equals", value: "retrasado" });
    if (includesAny(text, ["pendiente", "pendientes"])) filters.push({ field: "status", operator: "equals", value: "pendiente" });
    if (includesAny(text, ["madrid"])) filters.push({ field: "city", operator: "equals", value: "Madrid" });
    if (includesAny(text, ["barcelona"])) filters.push({ field: "city", operator: "equals", value: "Barcelona" });
  }

  if (table === "invoices") {
    if (includesAny(text, ["vencida", "vencidas", "vencido"])) filters.push({ field: "status", operator: "equals", value: "vencida" });
    if (includesAny(text, ["pendiente", "pendientes"])) filters.push({ field: "status", operator: "equals", value: "pendiente" });
    if (includesAny(text, ["alto", "alta"])) filters.push({ field: "risk", operator: "equals", value: "alto" });
  }

  if (includesAny(text, ["importe alto", "mas de 100", "más de 100", "> 100"])) {
    filters.push({ field: table === "orders" ? "total" : "amount", operator: "gt", value: 100 });
  }

  const sort = includesAny(text, ["mayor importe", "importe descendente", "mas caro", "más caro"])
    ? { field: table === "orders" ? "total" : "amount", direction: "desc" }
    : null;

  return {
    table,
    filters,
    sort,
    limit: 20
  };
}

async function handleRequest(payload) {
  const message = payload.message || "";
  const query = buildStructuredQuery(message);
  let rows = getTable(query.table);
  rows = applyFilters(rows, query.filters);
  rows = sortRows(rows, query.sort).slice(0, query.limit);

  await audit({ eventType: "nl_to_query", message, query, rows: rows.length });

  return {
    matched: true,
    answer: `He convertido la petición en una consulta sobre ${query.table} y he encontrado ${rows.length} registros.`,
    query,
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

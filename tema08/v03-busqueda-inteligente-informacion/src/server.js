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

const VERSION = "v03";
const TOPIC = "v03 Búsqueda inteligente de información";
const ENDPOINT = "/api/search";


function tokenize(text) {
  return normalize(text).split(/[^a-z0-9ñ]+/).filter((token) => token.length > 2);
}

function scoreRecord(queryTokens, record) {
  const haystack = normalize(JSON.stringify(record));
  let score = 0;
  const matchedTerms = [];

  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += 1;
      matchedTerms.push(token);
    }
  }

  if (record.title && queryTokens.some((token) => normalize(record.title).includes(token))) score += 2;
  if (record.tags && record.tags.some((tag) => queryTokens.includes(normalize(tag)))) score += 2;

  return { score, matchedTerms };
}

async function handleRequest(payload) {
  const message = payload.message || "";
  const tokens = tokenize(message);
  const corpus = [
    ...orders.map((item) => ({ collection: "orders", ...item })),
    ...invoices.map((item) => ({ collection: "invoices", ...item })),
    ...tickets.map((item) => ({ collection: "tickets", ...item })),
    ...documents.map((item) => ({ collection: "documents", ...item }))
  ];

  const records = corpus
    .map((record) => ({ ...record, search: scoreRecord(tokens, record) }))
    .filter((record) => record.search.score > 0)
    .sort((a, b) => b.search.score - a.search.score)
    .slice(0, 8);

  await audit({ eventType: "intelligent_search", message, tokens, records: records.length });

  return {
    matched: records.length > 0,
    answer: records.length
      ? `He encontrado ${records.length} resultados relevantes en pedidos, facturas, tickets y documentación.`
      : "No he encontrado coincidencias relevantes.",
    queryTokens: tokens,
    records,
    result: records
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

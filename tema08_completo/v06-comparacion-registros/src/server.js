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

const VERSION = "v06";
const TOPIC = "v06 Comparación de registros";
const ENDPOINT = "/api/compare-records";


function findEntity(reference) {
  const text = normalize(reference);
  const collections = [orders, invoices, tickets, customers];
  for (const collection of collections) {
    const found = collection.find((item) => normalize(item.id).includes(text) || normalize(item.name || item.customer || "").includes(text));
    if (found) return found;
  }
  return null;
}

function detectReferences(message) {
  const ids = [...message.matchAll(/(?:PED|FAC|TCK|CLI)-\d{3,4}-?\d*/gi)].map((match) => match[0].toUpperCase());
  if (ids.length >= 2) return ids.slice(0, 2);
  if (includesAny(message, ["marta", "lucia", "lucía"])) return ["Marta", "Lucía"];
  return ["PED-2026-001", "PED-2026-004"];
}

function compareRecords(a, b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.map((key) => ({
    field: key,
    left: a[key] ?? null,
    right: b[key] ?? null,
    equal: JSON.stringify(a[key] ?? null) === JSON.stringify(b[key] ?? null)
  }));
}

async function handleRequest(payload) {
  const message = payload.message || "";
  const refs = detectReferences(message);
  const left = findEntity(refs[0]);
  const right = findEntity(refs[1]);

  if (!left || !right) {
    return { matched: false, answer: "No he encontrado dos registros comparables.", refs, result: [] };
  }

  const comparison = compareRecords(left, right);
  const different = comparison.filter((item) => !item.equal);

  await audit({ eventType: "compare_records", message, refs, differences: different.length });

  return {
    matched: true,
    answer: `He comparado ${refs[0]} con ${refs[1]} y he encontrado ${different.length} diferencias.`,
    refs,
    comparison,
    result: different
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

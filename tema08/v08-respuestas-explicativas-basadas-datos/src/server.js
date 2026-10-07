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

const VERSION = "v08";
const TOPIC = "v08 Respuestas explicativas basadas en datos";
const ENDPOINT = "/api/explain";


function buildEvidence(question) {
  const evidence = [];
  if (includesAny(question, ["factura", "importe", "vencida"])) {
    evidence.push(...invoices.filter((invoice) => invoice.status !== "pagada").map((invoice) => ({ source: "invoices", id: invoice.id, fact: `${invoice.status} por ${asCurrency(invoice.amount)}`, record: invoice })));
  }
  if (includesAny(question, ["pedido", "retraso", "llega", "entrega"])) {
    evidence.push(...orders.filter((order) => order.status === "retrasado").map((order) => ({ source: "orders", id: order.id, fact: `pedido ${order.status}, ETA ${order.eta}`, record: order })));
  }
  if (evidence.length === 0) {
    evidence.push({ source: "documents", id: "DOC-002", fact: documents[1].body, record: documents[1] });
  }
  return evidence;
}

function composeExplanation(question, evidence) {
  const facts = evidence.map((item) => `${item.id}: ${item.fact}`);
  if (includesAny(question, ["por que", "por qué", "motivo", "razon", "razón"])) {
    return `La explicación se basa en ${evidence.length} evidencias: ${facts.join("; ")}. La causa probable combina estado operativo, importe pendiente y reglas de prioridad.`;
  }
  return `He preparado una respuesta basada en datos reales: ${facts.join("; ")}.`;
}

async function handleRequest(payload) {
  const message = payload.message || "";
  const evidence = buildEvidence(message);
  const answer = composeExplanation(message, evidence);

  await audit({ eventType: "explanatory_answer", message, evidence: evidence.map((e) => e.id) });

  return {
    matched: true,
    answer,
    evidence: evidence.map(({ source, id, fact }) => ({ source, id, fact })),
    confidence: evidence.length >= 2 ? "medium" : "low",
    result: evidence
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

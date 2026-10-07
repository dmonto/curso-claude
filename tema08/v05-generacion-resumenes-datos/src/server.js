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

const VERSION = "v05";
const TOPIC = "v05 Generación de resúmenes de datos";
const ENDPOINT = "/api/summarize";


function summarizeOrders() {
  const total = orders.length;
  const delayed = orders.filter((order) => order.status === "retrasado");
  const cancellable = orders.filter((order) => order.canCancel);
  const amount = orders.reduce((sum, order) => sum + order.total, 0);
  return { total, delayed: delayed.length, cancellable: cancellable.length, amount };
}

function summarizeInvoices() {
  const total = invoices.length;
  const overdue = invoices.filter((invoice) => invoice.status === "vencida");
  const pendingAmount = invoices.filter((invoice) => invoice.status !== "pagada").reduce((sum, invoice) => sum + invoice.amount, 0);
  const highRisk = invoices.filter((invoice) => invoice.risk === "alto");
  return { total, overdue: overdue.length, pendingAmount, highRisk: highRisk.length };
}

async function handleRequest(payload) {
  const message = payload.message || "";
  const includeOrders = includesAny(message, ["pedido", "pedidos", "entrega", "retraso"]);
  const includeInvoices = includesAny(message, ["factura", "facturas", "cobro", "vencida", "importe"]);

  const orderSummary = includeOrders || !includeInvoices ? summarizeOrders() : null;
  const invoiceSummary = includeInvoices ? summarizeInvoices() : null;

  const parts = [];
  if (orderSummary) {
    parts.push(`Hay ${orderSummary.total} pedidos, ${orderSummary.delayed} retrasados y ${orderSummary.cancellable} cancelables. Importe agregado: ${asCurrency(orderSummary.amount)}.`);
  }
  if (invoiceSummary) {
    parts.push(`Hay ${invoiceSummary.total} facturas, ${invoiceSummary.overdue} vencidas, ${invoiceSummary.highRisk} de riesgo alto y ${asCurrency(invoiceSummary.pendingAmount)} pendientes de cobro.`);
  }

  const summary = parts.join(" ");

  await audit({ eventType: "data_summary", message, includeOrders, includeInvoices });

  return {
    matched: true,
    answer: summary,
    summary,
    metrics: { orders: orderSummary, invoices: invoiceSummary },
    result: { orders: orderSummary, invoices: invoiceSummary }
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

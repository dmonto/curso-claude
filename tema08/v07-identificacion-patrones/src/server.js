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

const VERSION = "v07";
const TOPIC = "v07 Identificación de patrones en datos";
const ENDPOINT = "/api/patterns";


function detectPatterns() {
  const delayedOrders = orders.filter((order) => order.status === "retrasado");
  const overdueInvoices = invoices.filter((invoice) => invoice.status === "vencida");
  const highExposureCustomers = customers.map((customer) => {
    const exposure = invoices
      .filter((invoice) => invoice.customerId === customer.id && invoice.status !== "pagada")
      .reduce((sum, invoice) => sum + invoice.amount, 0);
    return { ...customer, exposure };
  }).filter((customer) => customer.exposure > 300);

  const repeatedCustomerIssues = customers.map((customer) => {
    const delayed = delayedOrders.filter((order) => order.customerId === customer.id).length;
    const overdue = overdueInvoices.filter((invoice) => invoice.customerId === customer.id).length;
    return { customerId: customer.id, name: customer.name, delayed, overdue, score: delayed + overdue };
  }).filter((item) => item.score >= 2);

  return [
    { id: "delayed_orders", severity: delayedOrders.length >= 2 ? "medium" : "low", count: delayedOrders.length, evidence: delayedOrders.map((o) => o.id) },
    { id: "overdue_invoices", severity: overdueInvoices.length >= 2 ? "medium" : "low", count: overdueInvoices.length, evidence: overdueInvoices.map((i) => i.id) },
    { id: "high_exposure_customers", severity: highExposureCustomers.length ? "high" : "low", count: highExposureCustomers.length, evidence: highExposureCustomers.map((c) => ({ id: c.id, exposure: c.exposure })) },
    { id: "repeated_customer_issues", severity: repeatedCustomerIssues.length ? "high" : "low", count: repeatedCustomerIssues.length, evidence: repeatedCustomerIssues }
  ];
}

async function handleRequest(payload) {
  const message = payload.message || "";
  const patterns = detectPatterns();
  const relevant = includesAny(message, ["alto", "riesgo", "critico", "crítico"])
    ? patterns.filter((pattern) => pattern.severity === "high")
    : patterns;

  await audit({ eventType: "pattern_detection", message, patterns: relevant.map((p) => p.id) });

  return {
    matched: true,
    answer: `He detectado ${relevant.length} patrones relevantes en pedidos, facturas y clientes.`,
    patterns: relevant,
    result: relevant
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

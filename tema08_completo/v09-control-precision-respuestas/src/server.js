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

const VERSION = "v09";
const TOPIC = "v09 Control de precisión de respuestas";
const ENDPOINT = "/api/precision-check";


function precisionGuard(message) {
  const limitations = [];
  const text = normalize(message);

  if (includesAny(text, ["todos los datos", "todo", "sin filtros"])) {
    limitations.push({ code: "too_broad", severity: "medium", message: "La consulta es demasiado amplia." });
  }
  if (includesAny(text, ["clientes de otros", "contraseñas", "tarjetas"])) {
    limitations.push({ code: "sensitive_data", severity: "high", message: "La consulta puede solicitar datos sensibles." });
  }
  if (includesAny(text, ["esto", "eso", "lo anterior"]) && !includesAny(text, ["pedido", "factura", "cliente", "ticket"])) {
    limitations.push({ code: "ambiguous_reference", severity: "medium", message: "La referencia es ambigua." });
  }

  const needsGrounding = includesAny(text, ["pedido", "factura", "cliente", "ticket", "importe", "estado"]);
  const canAnswer = !limitations.some((item) => item.severity === "high");
  const confidence = limitations.length === 0 && needsGrounding ? "high" : limitations.length <= 1 ? "medium" : "low";

  return { limitations, needsGrounding, canAnswer, confidence };
}

async function handleRequest(payload) {
  const message = payload.message || "";
  const guard = precisionGuard(message);
  const action = !guard.canAnswer ? "block" : guard.limitations.length ? "ask_clarification" : "answer_with_grounding";

  const answer = action === "block"
    ? "No puedo responder esta petición porque puede implicar datos sensibles o acceso no autorizado."
    : action === "ask_clarification"
      ? "Necesito más precisión antes de consultar datos o responder."
      : "La petición puede responderse con datos reales y control de precisión.";

  await audit({ eventType: "precision_control", message, action, confidence: guard.confidence });

  return {
    matched: action !== "block",
    answer,
    action,
    ...guard,
    result: guard.limitations
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

import "dotenv/config";
import express from "express";
import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { naturalLanguageToQuestionPlan } from "./nl-to-question-plan.js";
import { executeQuestionPlan } from "./question-executor.js";
import { summarizeQuestionExecution } from "./complex-answer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);

async function audit(event) {
  await mkdir(path.join(ROOT, "logs"), { recursive: true });
  await appendFile(
    path.join(ROOT, "logs", "events.jsonl"),
    JSON.stringify({ timestamp: new Date().toISOString(), ...event }) + "\n",
    "utf8"
  );
}

const VERSION = "v04";
const TOPIC = "v04 Interpretación de preguntas complejas";
const ENDPOINT = "/api/complex-question";

async function handleRequest(payload) {
  const message = String(payload?.message || "").trim();
  if (!message) throw new Error("message es obligatorio.");

  const plan = await naturalLanguageToQuestionPlan(message);
  const results = executeQuestionPlan(plan);
  const answer = summarizeQuestionExecution(plan, results);

  await audit({
    eventType: "complex_question",
    message,
    source: plan.source,
    plan,
    rows: results.map((item) => item.rows.length)
  });

  return {
    matched: !plan.needsClarification,
    source: plan.source,
    answer,
    plan,
    result: results.flatMap((item) => item.rows),
    results
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

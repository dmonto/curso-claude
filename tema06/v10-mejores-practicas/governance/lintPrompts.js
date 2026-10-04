import fs from "fs";
import path from "path";
import { PROMPT_REGISTRY } from "./promptRegistry.js";

const REQUIRED_FIELDS = [
  "name",
  "version",
  "taskType",
  "outputMode",
  "validationSchema",
  "contextPolicy",
  "riskLevel",
  "owner",
  "requiredTests",
];

const ALLOWED_OUTPUT_MODES = ["json", "text"];
const ALLOWED_RISK_LEVELS = ["low", "medium", "high"];

function validatePromptEntry(entry) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    if (!(field in entry)) {
      errors.push(`Falta el campo obligatorio "${field}"`);
    }
  }

  if (!String(entry.version ?? "").startsWith("v")) {
    errors.push("La versión debe empezar por v, por ejemplo v1 o v1.1");
  }

  if (!ALLOWED_OUTPUT_MODES.includes(entry.outputMode)) {
    errors.push(`outputMode no válido: ${entry.outputMode}`);
  }

  if (!ALLOWED_RISK_LEVELS.includes(entry.riskLevel)) {
    errors.push(`riskLevel no válido: ${entry.riskLevel}`);
  }

  if (!Array.isArray(entry.requiredTests) || entry.requiredTests.length === 0) {
    errors.push("Debe definir al menos un caso de prueba requerido");
  }

  if (entry.riskLevel === "high" && entry.outputMode !== "json") {
    errors.push("Los prompts de riesgo alto deben devolver salida JSON validable");
  }

  if (entry.taskType === "automation" && entry.riskLevel !== "high") {
    errors.push("Los prompts de automatización deben marcarse como riesgo high");
  }

  if (
    entry.taskType === "data_query" &&
    !String(entry.contextPolicy).includes("no raw table data")
  ) {
    errors.push("Los prompts de data_query no deben recibir tablas completas como contexto");
  }

  return errors;
}

function renderReport(results) {
  const lines = [];

  lines.push("# Prompt Lint Report");
  lines.push("");
  lines.push(`Fecha: ${new Date().toISOString()}`);
  lines.push("");

  const failed = results.filter((result) => result.errors.length > 0);

  lines.push(`Prompts revisados: ${results.length}`);
  lines.push(`Prompts con errores: ${failed.length}`);
  lines.push("");

  lines.push("| Prompt | Versión | Riesgo | Estado |");
  lines.push("|---|---|---:|---:|");

  for (const result of results) {
    lines.push(
      `| ${result.name} | ${result.version} | ${result.riskLevel} | ${
        result.errors.length === 0 ? "PASS" : "FAIL"
      } |`
    );
  }

  lines.push("");
  lines.push("## Detalle");
  lines.push("");

  for (const result of results) {
    lines.push(`### ${result.name} ${result.version}`);
    lines.push("");

    if (result.errors.length === 0) {
      lines.push("PASS");
      lines.push("");
      continue;
    }

    for (const error of result.errors) {
      lines.push(`- ${error}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

function main() {
  const results = PROMPT_REGISTRY.map((entry) => ({
    ...entry,
    errors: validatePromptEntry(entry),
  }));

  const report = renderReport(results);

  const outputDir = path.resolve("governance");
  const outputPath = path.join(outputDir, "prompt-lint-report.md");

  fs.writeFileSync(outputPath, report, "utf-8");

  const failed = results.filter((result) => result.errors.length > 0);

  console.log(`Informe generado en ${outputPath}`);
  console.log(`PASS: ${results.length - failed.length}`);
  console.log(`FAIL: ${failed.length}`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();

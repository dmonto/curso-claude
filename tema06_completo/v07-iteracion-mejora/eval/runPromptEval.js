import fs from "fs";
import path from "path";
import { PROMPT_CASES } from "./promptCases.js";

const BASE_URL = process.env.EVAL_BASE_URL ?? "http://localhost:3000";

function getByPath(obj, pathExpression) {
  return pathExpression.split(".").reduce((current, key) => {
    if (current === undefined || current === null) {
      return undefined;
    }

    return current[key];
  }, obj);
}

function evaluateExpectation(responseJson, expectation) {
  const actual = getByPath(responseJson, expectation.path);

  if ("equals" in expectation) {
    return {
      passed: actual === expectation.equals,
      actual,
      expected: expectation.equals,
      rule: `${expectation.path} == ${JSON.stringify(expectation.equals)}`,
    };
  }

  if ("oneOf" in expectation) {
    return {
      passed: expectation.oneOf.includes(actual),
      actual,
      expected: expectation.oneOf,
      rule: `${expectation.path} in ${JSON.stringify(expectation.oneOf)}`,
    };
  }

  if ("contains" in expectation) {
    const passed =
      typeof actual === "string" && actual.includes(expectation.contains);

    return {
      passed,
      actual,
      expected: expectation.contains,
      rule: `${expectation.path} contains ${JSON.stringify(
        expectation.contains
      )}`,
    };
  }

  return {
    passed: false,
    actual,
    expected: null,
    rule: "expectation no soportada",
  };
}

async function runCase(testCase) {
  const response = await fetch(`${BASE_URL}${testCase.endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(testCase.body),
  });

  const responseJson = await response.json();

  const checks = testCase.expected.map((expectation) =>
    evaluateExpectation(responseJson, expectation)
  );

  const passed = response.ok && checks.every((check) => check.passed);

  return {
    ...testCase,
    httpStatus: response.status,
    passed,
    checks,
    responseJson,
  };
}

function renderMarkdownReport(results) {
  const passedCount = results.filter((result) => result.passed).length;
  const failedCount = results.length - passedCount;

  const lines = [];

  lines.push("# Prompt Evaluation Report");
  lines.push("");
  lines.push(`Fecha: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Total casos: ${results.length}`);
  lines.push(`Correctos: ${passedCount}`);
  lines.push(`Fallidos: ${failedCount}`);
  lines.push("");

  lines.push("| Caso | Nombre | Estado | HTTP |");
  lines.push("|---|---|---:|---:|");

  for (const result of results) {
    lines.push(
      `| ${result.id} | ${result.name} | ${
        result.passed ? "PASS" : "FAIL"
      } | ${result.httpStatus} |`
    );
  }

  lines.push("");
  lines.push("## Detalle");
  lines.push("");

  for (const result of results) {
    lines.push(`### ${result.id} - ${result.name}`);
    lines.push("");
    lines.push(`Estado: ${result.passed ? "PASS" : "FAIL"}`);
    lines.push("");
    lines.push("#### Checks");
    lines.push("");
    lines.push("| Regla | Esperado | Obtenido | Estado |");
    lines.push("|---|---|---|---:|");

    for (const check of result.checks) {
      lines.push(
        `| ${check.rule} | ${JSON.stringify(check.expected)} | ${JSON.stringify(
          check.actual
        )} | ${check.passed ? "PASS" : "FAIL"} |`
      );
    }

    lines.push("");
    lines.push("#### Respuesta");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(result.responseJson, null, 2));
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const results = [];

  for (const testCase of PROMPT_CASES) {
    console.log(`Ejecutando ${testCase.id} - ${testCase.name}`);

    try {
      const result = await runCase(testCase);
      results.push(result);
    } catch (error) {
      results.push({
        ...testCase,
        httpStatus: 0,
        passed: false,
        checks: [
          {
            passed: false,
            rule: "request",
            expected: "respuesta HTTP",
            actual: error.message,
          },
        ],
        responseJson: {
          error: error.message,
        },
      });
    }
  }

  const report = renderMarkdownReport(results);
  const outputPath = path.resolve("eval", "prompt-eval-report.md");

  fs.writeFileSync(outputPath, report, "utf-8");

  const failed = results.filter((result) => !result.passed);

  console.log("");
  console.log(`Informe generado en ${outputPath}`);
  console.log(`PASS: ${results.length - failed.length}`);
  console.log(`FAIL: ${failed.length}`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();

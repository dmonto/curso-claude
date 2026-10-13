import fs from "fs";
import path from "path";

export function checkBackendReadiness() {
  const checks = [
    checkEnvVar("ANTHROPIC_API_KEY", { required: true, secret: true }),
    checkEnvVar("ANTHROPIC_MODEL", { required: true }),
    checkEnvVar("CORS_ORIGIN", { required: true }),
    checkNumberEnv("MAX_USER_MESSAGE_LENGTH", { min: 100, max: 20000 }),
    checkNumberEnv("MAX_CONTEXT_MESSAGES", { min: 1, max: 50 }),
    checkNumberEnv("SESSION_TTL_MINUTES", { min: 1, max: 1440 }),
    checkNumberEnv("AI_TIMEOUT_MS", { min: 1000, max: 120000 }),
    checkLogDirectory()
  ];

  const failed = checks.filter((check) => check.status === "fail");
  const warnings = checks.filter((check) => check.status === "warn");

  return {
    status: failed.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "ok",
    checkedAt: new Date().toISOString(),
    summary: {
      total: checks.length,
      ok: checks.filter((check) => check.status === "ok").length,
      warn: warnings.length,
      fail: failed.length
    },
    checks
  };
}

function checkEnvVar(name, { required = false, secret = false } = {}) {
  const value = process.env[name];

  if (required && !value) {
    return {
      name,
      status: "fail",
      message: `Falta la variable ${name}.`
    };
  }

  return {
    name,
    status: "ok",
    message: secret ? `${name} está configurada.` : `${name}=${value || ""}`
  };
}

function checkNumberEnv(name, { min, max }) {
  const raw = process.env[name];

  if (!raw) {
    return {
      name,
      status: "warn",
      message: `${name} no está configurada. Se usará el valor por defecto del código.`
    };
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return {
      name,
      status: "fail",
      message: `${name} debe ser numérica. Valor actual: ${raw}`
    };
  }

  if (value < min || value > max) {
    return {
      name,
      status: "warn",
      message: `${name}=${value} está fuera del rango recomendado ${min}-${max}.`
    };
  }

  return {
    name,
    status: "ok",
    message: `${name}=${value}`
  };
}

function checkLogDirectory() {
  const logDir = process.env.INTERACTION_LOG_DIR || "logs";
  const testFile = path.join(logDir, ".readiness-test");

  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(testFile, "ok", "utf8");
    fs.unlinkSync(testFile);

    return {
      name: "LOG_DIRECTORY",
      status: "ok",
      message: `La carpeta ${logDir} existe y es escribible.`
    };
  } catch (error) {
    return {
      name: "LOG_DIRECTORY",
      status: "fail",
      message: `No se puede escribir en la carpeta ${logDir}: ${error.message}`
    };
  }
}

import fs from "fs";
import path from "path";
import crypto from "crypto";

export function createRequestId() {
  return crypto.randomUUID();
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    const clean = {};
    for (const [key, child] of Object.entries(value)) {
      if (["email", "token", "password", "secret", "internal_notes"].some((term) => key.toLowerCase().includes(term))) {
        clean[key] = "[REDACTED]";
      } else {
        clean[key] = sanitize(child);
      }
    }
    return clean;
  }
  if (typeof value === "string") {
    return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
  }
  return value;
}

export function writeAuditEvent(event) {
  if (process.env.ENABLE_AUDIT !== "true") return;

  const dir = path.join(process.cwd(), "audit");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  const file = path.join(dir, "analysis-audit.jsonl");
  fs.appendFileSync(file, JSON.stringify(sanitize(event)) + "\n", "utf8");
}

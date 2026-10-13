import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const fingerprint = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const now = () => new Date().toISOString();
export const id = prefix => `${prefix}-${randomUUID()}`;

export function readJson(file, fallback) {
  if (!fs.existsSync(file)) return structuredClone(fallback);
  // Los ficheros dañados provocan un error visible; no se borran silenciosamente.
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temporary, file);
}
export function appendJsonLine(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(value) + '\n', 'utf8');
}

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

// Una operación por conversación y una decisión por aprobación. Un solo proceso.
export async function withLock(runtime, key, operation) {
  if (runtime.locks.has(key)) throw new HttpError(409, 'OPERATION_IN_PROGRESS', 'Hay una operación en curso. Espera su respuesta.');
  runtime.locks.add(key);
  try { return await operation(); } finally { runtime.locks.delete(key); }
}

export function audit(runtime, file, entry) {
  appendJsonLine(path.join(runtime.config.logDir, file), {
    timestamp: now(), agentVersion: runtime.config.version.id,
    promptVersion: '2.0.0', policyVersion: '2.0.0', toolsVersion: '2.0.0',
    ...entry
  });
}

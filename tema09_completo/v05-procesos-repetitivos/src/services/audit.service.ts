import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Payload } from '../types/automation.types.js';
export type AuditEvent = { id: string; event_type: string; flow_id: string; automation_type: string;
  status: string; user_id?: string; payload: Payload; created_at: string; duration_ms?: number };
export class AuditService {
  readonly events: AuditEvent[] = [];
  constructor(private file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      try { this.events.push(JSON.parse(line)); } catch { console.warn('Se ha omitido una línea de auditoría ilegible.'); }
    }
  }
  write(event: Omit<AuditEvent, 'id' | 'created_at'>): AuditEvent {
    const full = { ...event, id: randomUUID(), created_at: new Date().toISOString() };
    fs.appendFileSync(this.file, JSON.stringify(full) + '\n', 'utf8');
    this.events.push(full);
    return full;
  }
}

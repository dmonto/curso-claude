import 'dotenv/config';
import { VERSION } from './version.js';

function integer(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} no es válido`);
  return value;
}
export function readConfig() {
  const mode = process.env.AI_MODE ?? 'mock';
  if (!['mock', 'claude'].includes(mode)) throw new Error('AI_MODE debe ser mock o claude');
  const effort = process.env.CLAUDE_EFFORT ?? 'medium';
  if (!['low', 'medium', 'high'].includes(effort)) throw new Error('CLAUDE_EFFORT debe ser low, medium o high');
  const thinking = process.env.CLAUDE_THINKING ?? 'adaptive';
  if (!['adaptive', 'disabled'].includes(thinking)) throw new Error('CLAUDE_THINKING debe ser adaptive o disabled');
  const key = process.env.COURSE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (mode === 'claude' && !key) throw new Error('Configura COURSE_ANTHROPIC_API_KEY en el backend antes de usar AI_MODE=claude');
  return {
    ...VERSION, mode: mode as 'mock' | 'claude', apiKey: key,
    model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
    effort: effort as 'low' | 'medium' | 'high', thinking: thinking as 'adaptive' | 'disabled',
    maxTokens: integer('CLAUDE_MAX_TOKENS', 4096, 1024, 16384),
    port: integer('PORT', 3000, 0, 65535), host: process.env.HOST ?? '127.0.0.1',
    auditPath: process.env.AUDIT_FILE ?? 'logs/automation-audit.jsonl',
    disabledActions: new Set((process.env.DISABLED_ACTIONS ?? '').split(',').map(v => v.trim()).filter(Boolean))
  };
}
export type LabConfig = ReturnType<typeof readConfig>;

import fs from 'node:fs';
import path from 'node:path';

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { ensureDir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }
function nowIso() { return new Date().toISOString(); }
function expires(minutes) { return new Date(Date.now() + minutes * 60_000).toISOString(); }

export function createMemoryStore(dataDir) {
  ensureDir(dataDir);
  const contextsFile = path.join(dataDir, 'conversation-contexts.json');
  const eventsFile = path.join(dataDir, 'context-events.jsonl');
  const segmentsFile = path.join(dataDir, 'conversation-segments.jsonl');
  const actionEventsFile = path.join(dataDir, 'action-events.jsonl');
  function key(conversationId, user) { return `${user.tenantId}::${user.userId}::${conversationId}`; }
  function load(conversationId, user) {
    const all = readJson(contextsFile, {});
    const existing = all[key(conversationId, user)];
    if (existing && new Date(existing.expiresAt).getTime() > Date.now()) return existing;
    const created = { conversationId, sessionId: conversationId, userId: user.userId, tenantId: user.tenantId, summary: '', messages: [], entities: {}, pendingAction: null, lastAction: null, createdAt: nowIso(), updatedAt: nowIso(), expiresAt: expires(30), contextVersion: 1 };
    all[key(conversationId, user)] = created; writeJson(contextsFile, all); appendEvent(created, 'context_created', {}); return created;
  }
  function save(memory) { const all = readJson(contextsFile, {}); memory.updatedAt = nowIso(); memory.expiresAt = expires(30); all[`${memory.tenantId}::${memory.userId}::${memory.conversationId}`] = memory; writeJson(contextsFile, all); }
  function appendEvent(memory, eventType, payload) { ensureDir(dataDir); fs.appendFileSync(eventsFile, JSON.stringify({ timestamp: nowIso(), conversationId: memory.conversationId, userId: memory.userId, tenantId: memory.tenantId, eventType, payload }) + '\n', 'utf8'); }
  function appendActionEvent(memory, payload) { ensureDir(dataDir); fs.appendFileSync(actionEventsFile, JSON.stringify({ timestamp: nowIso(), conversationId: memory.conversationId, userId: memory.userId, tenantId: memory.tenantId, ...payload }) + '\n', 'utf8'); }
  function appendSegment(memory, summary, messageCount, estimatedTokens) { ensureDir(dataDir); const existing = readLines(segmentsFile).filter(s => s.conversationId === memory.conversationId && s.userId === memory.userId); fs.appendFileSync(segmentsFile, JSON.stringify({ timestamp: nowIso(), conversationId: memory.conversationId, userId: memory.userId, tenantId: memory.tenantId, segmentIndex: existing.length + 1, summary, messageCount, estimatedTokens }) + '\n', 'utf8'); }
  function listSegments(memory, limit = 10) { return readLines(segmentsFile).filter(s => s.conversationId === memory.conversationId && s.userId === memory.userId && s.tenantId === memory.tenantId).slice(-limit).reverse(); }
  function listEvents(memory, limit = 50) { return readLines(eventsFile).filter(e => e.conversationId === memory.conversationId && e.userId === memory.userId && e.tenantId === memory.tenantId).slice(-limit).reverse(); }
  function pruneExpired() { const all = readJson(contextsFile, {}); let deleted = 0; for (const [k,v] of Object.entries(all)) { if (new Date(v.expiresAt).getTime() < Date.now()) { delete all[k]; deleted++; } } writeJson(contextsFile, all); return deleted; }
  function readLines(file) { try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); } catch { return []; } }
  return { load, save, appendEvent, appendActionEvent, appendSegment, listSegments, listEvents, pruneExpired };
}

export function addMessage(memory, role, content) { memory.messages.push({ role, content, createdAt: nowIso() }); }
export function safeMemory(memory) { return { conversationId: memory.conversationId, userId: memory.userId, tenantId: memory.tenantId, summary: memory.summary, entities: memory.entities, pendingAction: memory.pendingAction, lastAction: memory.lastAction, recentMessages: memory.messages.length, createdAt: memory.createdAt, updatedAt: memory.updatedAt, expiresAt: memory.expiresAt, contextVersion: memory.contextVersion }; }
export function newActionId(prefix='act') { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2,8)}`; }

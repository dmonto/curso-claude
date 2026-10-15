import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { VERSION } from '../src/version.js';
import { buildClaudeRequest, ClaudeService } from '../src/analysis/claude.service.js';
import type { LabConfig } from '../src/config.js';

function config(auditPath: string, disabled = new Set<string>()): LabConfig {
  return { ...VERSION, mode: 'mock', apiKey: undefined, model: 'claude-sonnet-4-6', effort: 'medium', thinking: 'adaptive',
    maxTokens: 4096, port: 0, host: '127.0.0.1', auditPath, disabledActions: disabled };
}
type Call = (path: string, body?: unknown, user?: string) => Promise<{ status: number; body: any }>;
async function lab(work: (call: Call, cfg: LabConfig) => Promise<void>, disabled = new Set<string>()) {
  const dir = mkdtempSync(join(tmpdir(), 'tema9-test-')); const cfg = config(join(dir, 'audit.jsonl'), disabled);
  const server = createApp(cfg).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const address = server.address() as { port: number };
  const call: Call = async (path, body, user = 'user-002') => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Demo-User': user }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try { await work(call, cfg); } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(dir, { recursive: true }); }
}
const ticket = { customer: 'ACME', priority: 'high', category: 'access', summary: 'No puede acceder al portal corporativo' };
async function manual(call: Call, action: string, payload: Record<string, unknown>, user = 'user-002') {
  const response = await call('/api/automation/plan', { analysis: { is_automatable: true, automation_type: action, reason: 'Prueba',
    proposed_action: { action_name: action, endpoint: 'NO_SE_CONFIA_EN_ESTE_ENDPOINT', payload } } }, user);
  assert.equal(response.status, 200); return response.body;
}
function isError(result: Awaited<ReturnType<Call>>, code: string) { assert.ok(result.status >= 400); assert.equal(result.body.error.code, code); }

test('health declara la versión y el modo; no expone credenciales', async () => lab(async call => {
  const h = await call('/api/capabilities'); assert.equal(h.body.stage, VERSION.stage); assert.equal(h.body.ai_mode, 'mock'); assert.equal(h.body.apiKey, undefined);
}));
test('el análisis prepara una propuesta y bloquea borrados', async () => lab(async call => {
  const a = await call('/api/automation/analyze', { message: 'Crea un ticket de prioridad alta para ACME porque no puede acceder al portal corporativo' });
  assert.equal(a.body.automation_type, 'create_ticket'); assert.equal(a.body.requires_confirmation, true); assert.deepEqual(a.body.missing_fields, []);
  const b = await call('/api/automation/analyze', { message: 'Borra todos los tickets antiguos' }); assert.equal(b.body.is_automatable, false);
}));
test('valida entradas y no permite elevar el rol desde el body', async () => lab(async call => {
  isError(await call('/api/automation/analyze', { message: '' }), 'VALIDATION_ERROR');
  isError(await call('/api/automation/analyze', { message: 'Buscar', user_role: 'admin' }, 'user-001'), 'PERMISSION_DENIED');
}));
test('la petición a Claude usa effort, adaptive thinking y JSON schema', () => {
  const req = buildClaudeRequest(config('unused'), 'Crear');
  assert.equal(req.output_config?.effort, 'medium'); assert.equal(req.thinking?.type, 'adaptive');
  assert.equal(req.output_config?.format?.type, 'json_schema'); assert.equal(req.temperature, undefined);
});
test('el adaptador rechaza salida truncada y valida JSON antes de usarlo', async () => {
  const c = new ClaudeService({ ...config('unused'), mode: 'claude', apiKey: 'fake-test-key' });
  Object.defineProperty(c, 'client', { value: { messages: { create: async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{}' }] }) } }, configurable: true });
  await assert.rejects(c.detect('test'), /propuesta completa/);
  Object.defineProperty(c, 'client', { value: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"task_name":"create_ticket","confidence":2,"slots":{},"user_message_summary":"test"}' }] }) } } });
  await assert.rejects(c.detect('test'), /formato esperado/);
});
if (VERSION.stage >= 2) {
  test('dry run no necesita confirmación; la ejecución sí y es idempotente', async () => lab(async call => {
    const p = await manual(call, 'create_ticket', ticket); assert.equal(p.proposed_action.endpoint, 'POST /api/tickets');
    isError(await call('/api/automation/execute', { flow_id: p.flow_id }), 'CONFIRMATION_REQUIRED');
    const dry = await call('/api/automation/execute', { flow_id: p.flow_id, dry_run: true }); assert.equal(dry.body.status, 'dry_run');
    const done = await call('/api/automation/execute', { flow_id: p.flow_id, confirmed: true }); assert.equal(done.status, 200);
    isError(await call('/api/automation/execute', { flow_id: p.flow_id, confirmed: true }), 'IDEMPOTENCY_CONFLICT');
    if (VERSION.stage >= 3) { const data = await call('/api/tickets'); assert.equal(data.body.count, 6); }
  }));
  test('los planes guardados tienen propietario y el payload no puede alterarse', async () => lab(async call => {
    const p = await manual(call, 'create_ticket', ticket);
    isError(await call('/api/automation/execute', { flow_id: p.flow_id, confirmed: true }, 'user-001'), 'PERMISSION_DENIED');
    const altered = structuredClone(p); altered.proposed_action.payload.customer = 'Globex';
    isError(await call('/api/automation/execute', { plan: altered, confirmed: true }), 'PLAN_TAMPERED');
  }));
  test('cancelar invalida el plan', async () => lab(async call => {
    const p = await manual(call, 'create_ticket', ticket); assert.equal((await call('/api/automation/cancel', { flow_id: p.flow_id })).status, 200);
    isError(await call('/api/automation/execute', { flow_id: p.flow_id, confirmed: true }), 'VALIDATION_ERROR');
  }));
}
if (VERSION.stage >= 3) {
  test('dos ejecuciones simultáneas producen un solo ticket', async () => lab(async call => {
    const p = await manual(call, 'create_ticket', ticket);
    const results = await Promise.all([call('/api/automation/execute', { flow_id: p.flow_id, confirmed: true }), call('/api/automation/execute', { flow_id: p.flow_id, confirmed: true })]);
    assert.equal(results.filter(r => r.status === 200).length, 1); assert.equal((await call('/api/tickets')).body.count, 6);
  }));
  test('el registry impide reasignar como support_agent', async () => lab(async call => {
    const p = await manual(call, 'assign_owner', { ticket_id: 'TCK-1001', owner_team: 'soporte N2' }, 'user-001');
    isError(await call('/api/automation/execute', { flow_id: p.flow_id, confirmed: true }, 'user-001'), 'PERMISSION_DENIED');
  }));
}
if (VERSION.stage >= 4) {
  test('las reglas de negocio se aplican también en dry run', async () => lab(async call => {
    for (const payload of [{ ...ticket, customer: 'BlockedCorp' }, { ...ticket, priority: 'urgent' }, { ...ticket, category: 'security' }]) {
      const p = await manual(call, 'create_ticket', payload, 'user-001');
      isError(await call('/api/automation/execute', { flow_id: p.flow_id, dry_run: true }, 'user-001'), 'BUSINESS_RULE_BLOCKED');
    }
    const valid = await manual(call, 'create_ticket', { ...ticket, priority: 'urgent', justification: 'El portal está bloqueando a todos los usuarios del cliente' }, 'user-001');
    assert.equal((await call('/api/automation/execute', { flow_id: valid.flow_id, confirmed: true }, 'user-001')).status, 200);
  }));
  test('no se reasignan tickets cerrados ni equipos restringidos', async () => lab(async call => {
    for (const payload of [{ ticket_id: 'TCK-1004', owner_team: 'soporte N2' }, { ticket_id: 'TCK-1001', owner_team: 'seguridad' }]) {
      const p = await manual(call, 'assign_owner', payload); isError(await call('/api/automation/execute', { flow_id: p.flow_id, confirmed: true }), 'BUSINESS_RULE_BLOCKED');
    }
  }));
}
if (VERSION.stage >= 5) {
  test('el lote limita candidatos y exige dry run registrado antes de ejecutar', async () => lab(async call => {
    isError(await call('/api/automation/processes/stale-ticket-followup/plan', { max_items: 11 }), 'VALIDATION_ERROR');
    const p = (await call('/api/automation/processes/stale-ticket-followup/plan', {})).body;
    assert.equal(p.total_candidates, 3); assert.equal(p.approved_count, 2); assert.equal(p.blocked_count, 1);
    isError(await call('/api/automation/processes/execute', { process_id: p.process_id, confirmed: true }), 'DRY_RUN_REQUIRED');
    const dry = await call('/api/automation/processes/execute', { process_id: p.process_id, dry_run: true }); assert.equal(dry.body.dry_run_passed, true);
    assert.equal((await call('/api/tickets/TCK-1001')).body.comments.length, 0);
    const done = await call('/api/automation/processes/execute', { process_id: p.process_id, confirmed: true });
    assert.deepEqual(done.body.summary, { total: 3, executed: 2, blocked: 1, failed: 0, dry_run: 0 });
    isError(await call('/api/automation/processes/execute', { process_id: p.process_id, confirmed: true }), 'IDEMPOTENCY_CONFLICT');
  }));
  test('un cambio posterior a la vista previa bloquea ese item, sin comentario', async () => lab(async call => {
    const p = (await call('/api/automation/processes/stale-ticket-followup/plan', {})).body;
    await call('/api/automation/processes/execute', { process_id: p.process_id, dry_run: true });
    const change = await manual(call, 'update_ticket_priority', { ticket_id: 'TCK-1001', priority: 'medium' });
    await call('/api/automation/execute', { flow_id: change.flow_id, confirmed: true });
    const result = await call('/api/automation/processes/execute', { process_id: p.process_id, confirmed: true });
    assert.equal(result.body.items[0].result.error.code, 'PLAN_STALE'); assert.equal((await call('/api/tickets/TCK-1001')).body.comments.length, 0);
  }));
  test('un lote cancelado no se puede ejecutar', async () => lab(async call => {
    const p = (await call('/api/automation/processes/stale-ticket-followup/plan', {})).body;
    await call('/api/automation/processes/cancel', { process_id: p.process_id });
    isError(await call('/api/automation/processes/execute', { process_id: p.process_id, dry_run: true }), 'VALIDATION_ERROR');
  }));
}
if (VERSION.stage >= 6) {
  test('el asistente recoge datos entre turnos y usa un flow_id nuevo por tarea', async () => lab(async call => {
    const send = (message: string) => call('/api/task-assistant/message', { conversation_id: 'conv-1', message });
    const first = await send('Crea un ticket de prioridad alta'); assert.equal(first.body.task_state, 'collecting_data');
    const second = await send('Cliente ACME, categoría access, resumen: No puede acceder al portal corporativo');
    assert.equal(second.body.task_state, 'waiting_for_confirmation'); const id = second.body.plan.flow_id;
    assert.equal((await call('/api/task-assistant/confirm', { conversation_id: 'conv-1', confirmed: true })).status, 200);
    const fresh = await send('Crea un ticket de prioridad alta'); assert.equal(fresh.body.task_state, 'collecting_data'); assert.ok(fresh.body.missing_fields.includes('customer'));
    const next = await send('Cliente Globex, categoría billing, resumen: La factura mensual no coincide con el contrato'); assert.notEqual(next.body.plan.flow_id, id);
  }));
  test('una tarea desconocida invalida la confirmación anterior', async () => lab(async call => {
    const p = await call('/api/task-assistant/message', { conversation_id: 'conv-2', message: 'Crea un ticket de prioridad alta para ACME porque no puede acceder al portal corporativo' });
    await call('/api/task-assistant/message', { conversation_id: 'conv-2', message: 'Borra todos los tickets antiguos' });
    isError(await call('/api/task-assistant/confirm', { conversation_id: 'conv-2', confirmed: true }), 'PLAN_NOT_FOUND');
    isError(await call('/api/automation/execute', { flow_id: p.body.plan.flow_id, confirmed: true }), 'VALIDATION_ERROR');
  }));
  test('el asistente conecta realmente con el proceso por lote', async () => lab(async call => {
    const response = await call('/api/task-assistant/message', { conversation_id: 'conv-batch', message: 'Revisa los tickets abiertos sin actualización en las últimas 48 horas' });
    assert.equal(response.body.plan.kind, 'batch'); assert.equal(response.body.plan.total_candidates, 3);
    await call('/api/task-assistant/confirm', { conversation_id: 'conv-batch', dry_run: true });
    const result = await call('/api/task-assistant/confirm', { conversation_id: 'conv-batch', confirmed: true }); assert.equal(result.body.result.summary.executed, 2);
  }));
  test('las búsquedas del asistente no modifican tickets', async () => lab(async call => {
    const response = await call('/api/task-assistant/message', { conversation_id: 'conv-search', message: 'Muéstrame los tickets abiertos de ACME' }, 'user-004');
    assert.equal(response.body.task_state, 'completed'); assert.ok(response.body.result.data.tickets.every((t: any) => t.status === 'open'));
    assert.equal((await call('/api/tickets')).body.count, 5);
  }));
}
if (VERSION.stage >= 7) {
  test('los schemas rechazan prioridad inválida y campos inesperados', async () => lab(async call => {
    for (const payload of [{ ...ticket, priority: 'critical' }, { ...ticket, is_admin: true }]) {
      const p = await manual(call, 'create_ticket', payload); isError(await call('/api/automation/execute', { flow_id: p.flow_id, confirmed: true }), 'VALIDATION_ERROR');
    }
    const p = await manual(call, 'create_ticket', ticket); const v = await call('/api/automation/validate', { flow_id: p.flow_id, dry_run: true }); assert.equal(v.body.valid, true);
  }));
}
if (VERSION.stage >= 8) {
  test('las métricas no cuentan dos veces validación y ejecución', async () => lab(async call => {
    const p = await manual(call, 'create_ticket', ticket);
    await call('/api/automation/execute', { flow_id: p.flow_id });
    await call('/api/automation/execute', { flow_id: p.flow_id, confirmed: true });
    const stats = (await call('/api/automation/monitoring/summary')).body;
    assert.equal(stats.executed, 1); assert.equal(stats.blocked, 1); assert.equal(stats.terminal_attempts, 2); assert.equal(stats.health.success_rate, 0.5);
    const none = await call('/api/automation/monitoring/events?status=failed'); assert.equal(none.body.count, 0);
    isError(await call('/api/automation/monitoring/events?limit=-1'), 'VALIDATION_ERROR');
  }));
}
if (VERSION.stage >= 9) {
  test('lote parcial: retry-failed reintenta el timeout y no duplica el resto', async () => lab(async call => {
    await call('/api/demo/faults', { ticket_id: 'TCK-1002', mode: 'always' }, 'user-003');
    const p = (await call('/api/automation/processes/stale-ticket-followup/plan', {})).body;
    await call('/api/automation/processes/execute', { process_id: p.process_id, dry_run: true });
    const result = await call('/api/automation/processes/execute', { process_id: p.process_id, confirmed: true });
    assert.equal(result.body.status, 'partial_success'); assert.deepEqual(result.body.summary, { total: 3, executed: 1, blocked: 1, failed: 1, dry_run: 0 });
    assert.equal(result.body.items[1].result.error.code, 'EXTERNAL_TIMEOUT'); assert.equal(result.body.items[1].result.error.retryable, true);
    await call('/api/demo/faults', { ticket_id: 'TCK-1002', mode: 'off' }, 'user-003');
    const retried = await call('/api/automation/processes/retry-failed', { process_id: p.process_id, confirmed: true }); assert.equal(retried.body.summary.failed, 0);
    assert.equal((await call('/api/tickets/TCK-1001')).body.comments.length, 1); assert.equal((await call('/api/tickets/TCK-1002')).body.comments.length, 1);
  }));
  test('un fallo que ocurre una vez se recupera sin duplicar el comentario', async () => lab(async call => {
    await call('/api/demo/faults', { ticket_id: 'TCK-1001', mode: 'once' }, 'user-003');
    const p = await manual(call, 'add_comment', { ticket_id: 'TCK-1001', comment: 'Seguimiento de la incidencia del portal' });
    assert.equal((await call('/api/automation/execute', { flow_id: p.flow_id, confirmed: true })).status, 200);
    assert.equal((await call('/api/tickets/TCK-1001')).body.comments.length, 1);
  }));
}
if (VERSION.stage >= 10) {
  test('el gobierno puede desactivar una acción y mostrarlo en readiness', async () => lab(async call => {
    const p = await manual(call, 'assign_owner', { ticket_id: 'TCK-1001', owner_team: 'soporte N2' });
    isError(await call('/api/automation/execute', { flow_id: p.flow_id, confirmed: true }), 'ACTION_DISABLED');
    const r = (await call('/api/automation/readiness')).body; assert.equal(r.status, 'warning'); assert.equal(r.actions.find((a: any) => a.action_name === 'assign_owner').ready, false);
  }, new Set(['assign_owner'])));
}

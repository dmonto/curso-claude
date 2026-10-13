import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server.js';
import { appendJsonLine, now } from '../storage.js';
import { VERSION } from '../version.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const cases = fs.readFileSync(path.join(root, 'eval-cases.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
// --claude ejecuta las mismas comprobaciones con la API real y consume tokens.
const modelMode = process.argv.includes('--claude') ? 'claude' : 'mock';
const results = [];
for (const scenario of cases) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tema10-eval-'));
  const lab = await startServer({ port: 0, modelMode, dataDir: path.join(temporary, 'data'), logDir: path.join(temporary, 'logs'), failureTool: scenario.failureTool || '' });
  const userId = scenario.userId || 'demo-agent';
  const post = async (endpoint, body, asUser = userId) => {
    const response = await fetch(lab.baseUrl + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': asUser }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
    return response.json();
  };
  try {
    let reply = await post('/api/agent', { taskName: scenario.taskName, message: scenario.message });
    const trace = [...(reply.toolTrace || [])];
    if (scenario.confirm && reply.pendingAction) {
      reply = await post('/api/agent/confirm', { conversationId: reply.conversationId, actionId: reply.pendingAction.actionId, decision: 'confirm' });
      trace.push(...(reply.toolTrace || []));
      if (scenario.approve && reply.approvalRequired) {
        reply = await post(`/api/supervisor/approvals/${reply.approvalId}/approve`, { reason: 'Aprobación de evaluación' }, 'demo-supervisor');
        trace.push(...(reply.toolTrace || []));
      }
    }
    const successful = trace.filter(call => call.status === 'succeeded').map(call => call.toolName);
    const expected = scenario.expected;
    const normalize = text => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const text = normalize(reply.text || '');
    const checks = {
      mustMention: (expected.mustMention || []).every(item => text.includes(normalize(item))),
      mustNotMention: (expected.mustNotMention || []).every(item => !text.includes(normalize(item))),
      mustExecuteTools: (expected.mustExecuteTools || []).every(tool => successful.includes(tool)),
      mustNotExecuteTools: (expected.mustNotExecuteTools || []).every(tool => !successful.includes(tool)),
      status: !expected.status || reply.status === expected.status,
      orderState: !expected.orderStatus || lab.runtime.state.orders[0].status === expected.orderStatus,
      ticketCount: expected.ticketCount === undefined || lab.runtime.state.tickets.length === expected.ticketCount,
      notificationCount: expected.notificationCount === undefined || lab.runtime.state.notifications.length === expected.notificationCount
    };
    const result = { timestamp: now(), caseId: scenario.caseId, agentVersion: VERSION.id, promptVersion: '2.0.0', policyVersion: '2.0.0', modelMode, passed: Object.values(checks).every(Boolean), checks, executedTools: successful, assistantText: reply.text };
    results.push(result); appendJsonLine(path.join(root, 'eval-results.jsonl'), result);
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${scenario.caseId} ${JSON.stringify(checks)}`);
  } catch (error) {
    const result = { timestamp: now(), caseId: scenario.caseId, agentVersion: VERSION.id, modelMode, passed: false, error: error.message };
    results.push(result); appendJsonLine(path.join(root, 'eval-results.jsonl'), result); console.error(`FAIL ${scenario.caseId}: ${error.message}`);
  } finally { await lab.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ modelMode, passed: results.filter(result => result.passed).length, total: results.length }, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;

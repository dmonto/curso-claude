import fs from 'node:fs';
import path from 'node:path';
import { base } from './config.js';
import { readJsonl } from './storage.js';
import { verifyActionAuditChain } from './action-audit.js';
const policy=JSON.parse(fs.readFileSync(path.join(base,'compliance-policy.json'),'utf8'));
export function generateComplianceReport(identity) {
  const events=readJsonl('assistant-activity.log').filter(e=>e.tenantId===identity.tenantId);
  const cut=Date.now()-policy.retentionDays.activity*86400000;
  const audits=readJsonl('action-audit.log').filter(e=>e.tenantId===identity.tenantId);
  const auditCut=Date.now()-policy.retentionDays.actionAudit*86400000;
  const content=JSON.stringify([...events,...audits]);
  return {generatedAt:new Date().toISOString(),policy,controls:{actionAuditChainOk:verifyActionAuditChain().ok,forbiddenFindingsCount:(content.match(/sk-[a-zA-Z0-9_-]{8,}|"(?:password|accessToken|paymentToken|Authorization)"/g)||[]).length,activityOlderThanRetention:events.filter(e=>Date.parse(e.timestamp)<cut).length,auditOlderThanRetention:audits.filter(e=>Date.parse(e.timestamp)<auditCut).length},retentionEnforced:false,reviewRequired:true};
}

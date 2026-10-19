import { readJsonl } from './storage.js';
import { config } from './config.js';
import { generateComplianceReport } from './compliance.js';
export function generateSecurityBaseline(identity) {
  const compliance=generateComplianceReport(identity),events=readJsonl('assistant-activity.log').filter(e=>e.tenantId===identity.tenantId),issues=[];
  const expected=['assistant_request_received','input_validation_passed','context_built','assistant_response_sent','prompt_injection_blocked'];
  const evidence=expected.map(eventType=>({eventType,found:events.some(e=>e.eventType===eventType)}));
  for(const item of evidence) if(!item.found) issues.push({severity:'MEDIUM',message:'Sin evidencia: '+item.eventType});
  if(!compliance.controls.actionAuditChainOk) issues.push({severity:'HIGH',message:'Cadena de auditoría alterada'});
  if(compliance.controls.forbiddenFindingsCount) issues.push({severity:'HIGH',message:'Datos prohibidos en logs'});
  if(config.secret.startsWith('solo-laboratorio')) issues.push({severity:'MEDIUM',message:'Sustituir secreto de laboratorio antes de usar datos reales'});
  if(compliance.controls.activityOlderThanRetention || compliance.controls.auditOlderThanRetention) issues.push({severity:'MEDIUM',message:'Existen eventos que requieren revisión de retención'});
  return {status:issues.some(i=>i.severity==='HIGH')?'FAIL':issues.length?'WARN':'PASS',checks:{compliance:compliance.controls,evidence,modelMode:config.mode},issues,scope:'Diagnóstico técnico; no certifica cumplimiento ni seguridad completa.'};
}

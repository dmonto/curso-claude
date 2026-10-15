import { randomUUID } from 'node:crypto';
import { readJsonl, appendJsonl } from './storage.js';
import { sanitizeForAudit } from './sensitive-data.js';
export function appendActivityEvent(event) { appendJsonl('assistant-activity.log',{eventId:randomUUID(),timestamp:new Date().toISOString(),...sanitizeForAudit(event)}); }
export function activityFor(identity) {return readJsonl('assistant-activity.log').filter(e=>e.tenantId===identity.tenantId && e.userId===identity.userId);}
export function activitySummary(identity) {
  const events=readJsonl('assistant-activity.log').filter(e=>e.tenantId===identity.tenantId),counts={};
  for(const e of events) counts[e.eventType]=(counts[e.eventType]||0)+1;
  const completed=events.filter(e=>e.eventType==='assistant_response_sent');
  return {totalEvents:events.length,counts,averageDurationMs:completed.length?Math.round(completed.reduce((n,e)=>n+e.durationMs,0)/completed.length):0,inputTokens:completed.reduce((n,e)=>n+(e.inputTokens||0),0),outputTokens:completed.reduce((n,e)=>n+(e.outputTokens||0),0)};
}

import { createHash, randomUUID } from 'node:crypto';
import { readJsonl, appendJsonl } from './storage.js';
import { sanitizeForAudit } from './sensitive-data.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function verifyActionAuditChain() {
  try {
    const events=readJsonl('action-audit.log'),errors=[];let previousHash=null;
    events.forEach((e,index)=>{const {hash:digest,...data}=e;if(hash(data)!==digest || e.previousHash!==previousHash) errors.push({line:index+1,error:'CHAIN_MISMATCH'});previousHash=digest;});
    return {ok:errors.length===0,checkedEvents:events.length,errors};
  } catch {return {ok:false,checkedEvents:0,errors:[{error:'MALFORMED_LOG'}]};}
}
export function appendActionAuditEvent(event) {
  if(!verifyActionAuditChain().ok) throw new Error('AUDIT_INTEGRITY_FAILURE');
  const events=readJsonl('action-audit.log');
  const data={eventId:randomUUID(),timestamp:new Date().toISOString(),previousHash:events.at(-1)?.hash || null,...sanitizeForAudit(event)};
  appendJsonl('action-audit.log',{...data,hash:hash(data)});
}

import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {cfg,version} from './config.js';
import {Gate,Cache,Metrics,LabError} from './controls.js';
import {payload,countInput,generate} from './model.js';
export const gate=new Gate(cfg.concurrency,cfg.queue,cfg.queueTimeout);
export const cache=new Cache(cfg.ttl,cfg.cacheSize),metrics=new Metrics();
const tickets=[{id:'T-101',title:'Pedidos bloqueados',priority:'critical',detail:'Tres usuarios no pueden confirmar pedidos.'},{id:'T-102',title:'Exportación lenta',priority:'medium',detail:'El informe mensual tarda 40 segundos.'}];
async function loadTickets(){await delay(80);return tickets;}
async function loadPolicy(){await delay(80);return {sla:'Revisar los críticos en 1 hora'};}
let failures=0,openUntil=0;
export async function answer(b){
 if(!b||typeof b.message!=='string'||!b.message.trim()||b.message.length>cfg.inputChars)throw new LabError('INVALID_MESSAGE',400);
 if(b.history!==undefined)throw new LabError('HISTORY_NOT_SUPPORTED',400);
 let entered=false;
 const started=performance.now();
 try{
  if(version.level>=2){await gate.enter();entered=true;}
  const queueMs=performance.now()-started;
  if(version.level>=10&&Date.now()<openUntil)throw new LabError('CIRCUIT_OPEN');
  const [rows,policy]=version.level>=3?await Promise.all([loadTickets(),loadPolicy()]):[await loadTickets(),await loadPolicy()];
  const data=version.level>=5?rows.map(({id,title,priority})=>({id,title,priority})):rows;
  const body=payload(b.message+'\nSLA: '+policy.sla,data);
  // Sólo datos ficticios compartidos: no IDs de usuario elegidos por el cliente.
  const key=createHash('sha256').update(JSON.stringify({body,mode:cfg.mode,dataRevision:1})).digest('hex');
  if(version.level>=4){const hit=cache.get(key);if(hit){metrics.hits++;return {...hit,cacheHit:true,usage:{input_tokens:0,output_tokens:0},estimatedUsd:0,queueMs};}}
  let inputTokens;
  if(version.level>=5){inputTokens=await countInput(body);if(inputTokens>8000)throw new LabError('INPUT_TOKEN_LIMIT',413);}
  if(version.level>=8){const upper=(inputTokens*cfg.inputPrice+cfg.output*cfg.outputPrice)/1e6;if(upper>cfg.budget)throw new LabError('REQUEST_BUDGET_EXCEEDED',422);}
  let result;
  try{result=await generate(body);failures=0;}catch(e){if(version.level>=10&&++failures>=3)openUntil=Date.now()+10000;throw e;}
  const usd=(result.usage.input_tokens*cfg.inputPrice+result.usage.output_tokens*cfg.outputPrice)/1e6;
  metrics.inputTokens+=result.usage.input_tokens;metrics.outputTokens+=result.usage.output_tokens;metrics.estimatedUsd+=usd;
  const output={message:{text:result.text},usage:result.usage,estimatedUsd:usd,cacheHit:false,queueMs,stopReason:result.stopReason,truncated:result.stopReason==='max_tokens'};
  if(version.level>=4&&result.stopReason==='end_turn')cache.set(key,output);
  return output;
 }finally{if(entered)gate.leave();}
}

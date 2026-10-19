import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {tasks,resolveContext} from './domain.js';
import {generate} from './model.js';
import {redact} from './store.js';
import {usageSummary,conversations,performanceSummary,failures,feedbackSummary,monitoringHealth} from './analytics.js';
const dataset=JSON.parse(readFileSync(new URL('./dataset.json',import.meta.url),'utf8'));
const id=()=>randomUUID(),now=()=>new Date().toISOString();
export class ApiError extends Error {constructor(status,code){super(code);this.status=status;this.code=code;}}
const bad=code=>{throw new ApiError(400,code);};
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(x);
const norm=s=>s.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export function score(answer,test){const text=norm(answer);const missing=test.must_include.filter(s=>!text.includes(norm(s))),forbidden=test.must_not_include.filter(s=>text.includes(norm(s)));return {passed:!missing.length&&!forbidden.length,missing,forbidden};}
export function createService({store,cfg,version,fetchImpl=fetch}){
 const pending=new Set();let evaluating=false;
 const requireLevel=n=>{if(version.level<n)throw new ApiError(404,'NOT_AVAILABLE_IN_THIS_VERSION');};
 function validate(b){
  if(!b||Array.isArray(b)||typeof b.message!=='string'||!b.message.trim()||b.message.length>4000||!validId(b.session_id)||!tasks.includes(b.task_type)||b.entity_id!==undefined&&(typeof b.entity_id!=='string'||b.entity_id.length>80))bad('INVALID_REQUEST');
  if(b.simulate!==undefined&&(!['timeout','slow','tool_error'].includes(b.simulate)||cfg.mode!=='mock'))bad('SIMULATION_ONLY_IN_MOCK');
 }
 async function message(b,{source='live',prompt=cfg.prompt}={}){
  validate(b);if(pending.has(b.session_id))throw new ApiError(409,'SESSION_BUSY');pending.add(b.session_id);
  const started=performance.now(),trace_id=randomBytes(16).toString('hex'),root_id=randomBytes(8).toString('hex'),event_id=id(),spans=[];
  let facts,result,error,tool_ms=0,model_ms=0,model_called=false;
  const span=async(name,fn)=>{const s=performance.now();let status='success';try{return await fn();}catch(e){status='error';throw e;}finally{spans.push({span_id:randomBytes(8).toString('hex'),parent_span_id:root_id,name,duration_ms:performance.now()-s,status});}};
  try{
   facts=await span('tool.context',async()=>{const s=performance.now();try{if(b.simulate==='tool_error')throw Object.assign(Error(),{code:'tool_error'});if(b.simulate==='slow')await new Promise(r=>setTimeout(r,250));return resolveContext(b,prompt);}finally{tool_ms=performance.now()-s;}});
   result=await span(facts.skipModel?'logic.guard':'model.generate',async()=>{const s=performance.now();model_called=!facts.skipModel&&cfg.mode==='claude';try{if(b.simulate==='timeout')throw Object.assign(Error(),{code:'model_timeout'});return await generate(b,facts,{...cfg,prompt},fetchImpl);}finally{model_ms=facts.skipModel?0:performance.now()-s;}});
  }catch(e){error=e;}finally{pending.delete(b.session_id);}
  const event={kind:'usage',event_id,timestamp:now(),trace_id,session_id:b.session_id,task_type:b.task_type,source,mode:cfg.mode,backend_version:version.id,logic_version:'logic-1',prompt_version:prompt,model:result?.model||(model_called?cfg.model:'none'),model_called,status:error?'error':'success',outcome:error?'error':facts.outcome,reason:facts?.reason,error_type:error?.code|| (error?'internal_error':undefined),usage:result?.usage||error?.usage||null,latency_ms:performance.now()-started,tool_ms,model_ms,provider_request_id:result?.provider_request_id,context_fields:Object.keys(facts?.context||{})};
  store.append(event);
  if(version.level>=2)store.append({kind:'conversation',timestamp:now(),event_id,trace_id,session_id:b.session_id,source,...(cfg.logContent?{question:redact(b.message),answer:redact(result?.answer||'')}: {content_stored:false})});
  if(version.level>=9)store.append({kind:'trace',timestamp:now(),trace_id,source,status:event.status,root_span:{span_id:root_id,parent_span_id:null,name:'assistant.request',duration_ms:event.latency_ms,status:event.status},spans});
  if(error)return {httpStatus:502,body:{error:event.error_type,event_id,trace_id,usage:event.usage}};
  return {httpStatus:200,body:{answer:result.answer,event_id,trace_id,session_id:b.session_id,outcome:event.outcome,usage:event.usage,mode:cfg.mode,prompt_version:prompt,stop_reason:result.stop_reason}};
 }
 async function evaluate(prompt){
  const run_id=id(),results=[];
  for(const test of dataset){const reply=await message({...test,session_id:'eval-'+id()},{source:'evaluation',prompt});results.push({case_id:test.id,risk:test.risk,trace_id:reply.body.trace_id,answer:reply.body.answer||'',...score(reply.body.answer||'',test),error:reply.body.error});}
  const report={kind:'evaluation',timestamp:now(),run_id,prompt_version:prompt,dataset_version:'support-1',mode:cfg.mode,model:cfg.mode==='mock'?'mock-local':cfg.model,total:results.length,passed:results.filter(r=>r.passed).length,results,method:'Reglas de cadenas normalizadas; NO mide precisión semántica ni sustituye revisión humana.'};store.append(report);store.report('eval-'+run_id,report);return report;
 }
 async function dispatch(method,path,b={}){
  if(method==='GET'&&path==='/health')return {version,mode:cfg.mode,status:'ok',tasks};
  if(method==='POST'&&['/api/assistant','/api/assistant/message'].includes(path))return message(b);
  const events=store.read();
  if(method==='GET'&&path==='/metrics/assistant-summary')return usageSummary(events);
  if(method==='GET'&&path==='/analysis/conversations'){requireLevel(2);return conversations(events);}
  if(method==='POST'&&path==='/evaluation/run'){
   requireLevel(3);if(evaluating)throw new ApiError(409,'EVALUATION_BUSY');evaluating=true;
   try{return await evaluate(cfg.prompt);}finally{evaluating=false;}
  }
  if(method==='GET'&&path==='/evaluation/latest'){requireLevel(3);return events.filter(e=>e.kind==='evaluation').at(-1)||{status:'NO_DATA'};}
  if(method==='GET'&&path==='/analysis/failures'){requireLevel(4);return {patterns:failures(events),evaluation_failures:events.filter(e=>e.kind==='evaluation').at(-1)?.results.filter(r=>!r.passed)||[]};}
  if(method==='GET'&&path==='/metrics/performance'){requireLevel(5);return performanceSummary(events);}
  if(method==='POST'&&path==='/improvement/snapshot'){
   requireLevel(6);const patterns=failures(events);const snapshot={kind:'snapshot',timestamp:now(),snapshot_id:id(),versions:{backend:version.id,prompt:cfg.prompt,mode:cfg.mode},usage:usageSummary(events),performance:performanceSummary(events),candidates:patterns.map(p=>({...p,hypothesis:'Hipótesis pendiente de validar mediante trazas.',success_metric:'Reducir la frecuencia del patrón en una muestra comparable.',guardrail:'No empeorar evaluación ni bloqueos de permisos.'}))};store.append(snapshot);store.report('snapshot-'+snapshot.snapshot_id,snapshot);return snapshot;
  }
  if(method==='POST'&&path==='/api/assistant/feedback'){
   requireLevel(7);if(!validId(b.event_id)||!['positive','negative'].includes(b.rating)||!['useful','missing_information','incorrect','slow','other'].includes(b.reason))bad('INVALID_FEEDBACK');
   const event=events.find(e=>e.kind==='usage'&&e.event_id===b.event_id&&e.source==='live'&&e.status==='success');if(!event)throw new ApiError(404,'RESPONSE_NOT_FOUND');
   if(events.some(e=>e.kind==='feedback'&&e.event_id===b.event_id))throw new ApiError(409,'FEEDBACK_ALREADY_EXISTS');
   const feedback={kind:'feedback',timestamp:now(),feedback_id:id(),event_id:b.event_id,trace_id:event.trace_id,rating:b.rating,reason:b.reason};store.append(feedback);return feedback;
  }
  if(method==='GET'&&path==='/feedback/summary'){requireLevel(7);return feedbackSummary(events);}
  if(method==='POST'&&path==='/prompts/compare'){
   requireLevel(8);if(evaluating)throw new ApiError(409,'EVALUATION_BUSY');evaluating=true;
   try{const baseline=await evaluate('baseline'),improved=await evaluate('improved');return {baseline,improved,delta_pass_rate:improved.passed/improved.total-baseline.passed/baseline.total,note:cfg.mode==='mock'?'Diferencia simulada deliberada: baseline omite la fecha desconocida. No es una medición de Claude.':'Comparación sobre el mismo dataset; resultados sujetos a variabilidad del modelo.'};}finally{evaluating=false;}
  }
  if(method==='GET'&&path==='/observability/summary'){requireLevel(9);return {traces:events.filter(e=>e.kind==='trace'&&e.source==='live').slice(-30)};}
  if(method==='GET'&&path==='/monitoring/health'){requireLevel(10);const report=monitoringHealth(events,cfg);store.report('monitoring-health',report);return report;}
  if(method==='POST'&&path==='/monitoring/prune'){requireLevel(10);return {removed:store.prune(),retention_days:cfg.retentionDays};}
  throw new ApiError(404,'NOT_FOUND');
 }
 return {dispatch,message};
}

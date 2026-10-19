export function percentile(values,p){if(!values.length)return null;const a=[...values].sort((x,y)=>x-y);return a[Math.max(0,Math.ceil(p*a.length)-1)];}
const ratio=(n,d)=>d?n/d:null;
const group=(a,key)=>{const m=new Map();for(const x of a){const k=key(x);m.set(k,[...(m.get(k)||[]),x]);}return m;};
export const usageEvents=(events,source='live')=>events.filter(e=>e.kind==='usage'&&e.source===source);
export function usageSummary(events,source='live'){
 const a=usageEvents(events,source),errors=a.filter(e=>e.status==='error');
 const u=a.filter(e=>e.usage);const total=k=>u.reduce((s,e)=>s+(e.usage[k]||0),0);
 return {source,total_requests:a.length,successful_requests:a.length-errors.length,failed_requests:errors.length,error_rate:ratio(errors.length,a.length),answered_requests:a.filter(e=>e.outcome==='answered').length,blocked_requests:a.filter(e=>e.outcome==='blocked').length,completed_tasks:0,task_completion_rate:null,completion_note:'Este laboratorio consulta y orienta; no ejecuta acciones de negocio.',total_input_tokens:total('input_tokens'),total_output_tokens:total('output_tokens'),cache_creation_input_tokens:total('cache_creation_input_tokens'),cache_read_input_tokens:total('cache_read_input_tokens'),requests_with_reported_usage:u.length,tokens_note:'mock y llamadas omitidas tienen usage=null; no son tokens medidos.',by_task_type:Object.fromEntries([...group(a,e=>e.task_type)].map(([k,v])=>[k,v.length]))};
}
export function conversations(events,source='live'){
 return [...group(usageEvents(events,source),e=>e.session_id)].map(([session_id,a])=>({session_id,turns:a.length,outcome:a.at(-1).outcome,tasks:[...new Set(a.map(e=>e.task_type))],friction:[...new Set(a.filter(e=>e.reason||e.error_type).map(e=>e.reason||e.error_type))],duration_ms:Date.parse(a.at(-1).timestamp)-Date.parse(a[0].timestamp),trace_ids:a.map(e=>e.trace_id),abandonment:'unknown (no se infiere por inactividad)'}));
}
export function performanceSummary(events,source='live'){
 const stats=a=>({samples:a.length,p50:percentile(a,.5),p95:percentile(a,.95),p99:percentile(a,.99),avg:a.length?a.reduce((s,x)=>s+x,0)/a.length:null});
 const a=usageEvents(events,source);const one=rows=>({total_latency_ms:stats(rows.map(e=>e.latency_ms)),model_latency_ms:stats(rows.filter(e=>e.model_called).map(e=>e.model_ms)),tool_latency_ms:stats(rows.map(e=>e.tool_ms))});
 return {source,...one(a),by_task_type:Object.fromEntries([...group(a,e=>e.task_type)].map(([k,v])=>[k,one(v)]))};
}
export function failures(events,source='live'){
 const rows=usageEvents(events,source).filter(e=>e.status==='error'||e.reason==='missing_context');
 return [...group(rows,e=>e.task_type+'|'+(e.error_type||e.reason))].map(([key,a])=>({pattern:key,count:a.length,trace_ids:a.slice(-3).map(e=>e.trace_id),recommendation:a[0].reason==='missing_context'?'Pedir el identificador antes de llamar al modelo.':'Revisar el span fallido y la disponibilidad del proveedor.'})).sort((a,b)=>b.count-a.count);
}
export function feedbackSummary(events){
 const usage=new Map(usageEvents(events).map(e=>[e.event_id,e]));
 const a=events.filter(e=>e.kind==='feedback'&&usage.has(e.event_id));const negative=a.filter(e=>e.rating==='negative');
 return {responses_with_feedback:a.length,eligible_responses:[...usage.values()].filter(e=>e.status==='success').length,feedback_rate:ratio(a.length,[...usage.values()].filter(e=>e.status==='success').length),negative_ratio:ratio(negative.length,a.length),by_reason:Object.fromEntries([...group(negative,e=>e.reason)].map(([k,v])=>[k,v.length])),by_task_type:Object.fromEntries([...group(a,e=>usage.get(e.event_id).task_type)].map(([k,v])=>[k,{responses:v.length,negative:v.filter(e=>e.rating==='negative').length}]))};
}
export function monitoringHealth(events,cfg){
 const usage=usageSummary(events),perf=performanceSummary(events),fb=feedbackSummary(events);
 const evals=events.filter(e=>e.kind==='evaluation'&&e.prompt_version===cfg.prompt&&e.mode===cfg.mode),last=evals.at(-1);
 const enough=usage.total_requests>=cfg.minSamples;
 const checks=[{name:'Volumen',status:enough?'OK':'INSUFFICIENT_DATA',value:usage.total_requests,threshold:cfg.minSamples},{name:'Errores técnicos',status:!enough?'INSUFFICIENT_DATA':usage.error_rate>cfg.sloError?'CRITICAL':'OK',value:usage.error_rate,threshold:cfg.sloError},{name:'Latencia p95',status:!enough?'INSUFFICIENT_DATA':perf.total_latency_ms.p95>cfg.sloP95?'WARNING':'OK',value:perf.total_latency_ms.p95,threshold:cfg.sloP95},{name:'Regresión de reglas',status:!last?'INSUFFICIENT_DATA':last.passed===last.total?'OK':'CRITICAL',value:last?{passed:last.passed,total:last.total,mode:last.mode}:null},{name:'Feedback',status:fb.responses_with_feedback<5?'INSUFFICIENT_DATA':fb.negative_ratio>.3?'WARNING':'OK',value:fb.negative_ratio},{name:'Correlación de trazas',status:usage.total_requests===0?'INSUFFICIENT_DATA':usageEvents(events).every(e=>events.some(t=>t.kind==='trace'&&t.trace_id===e.trace_id))?'OK':'WARNING'}];
 const overall_status=['CRITICAL','WARNING','INSUFFICIENT_DATA','OK'].find(s=>checks.some(c=>c.status===s));
 return {generated_at:new Date().toISOString(),overall_status,scope:'Eventos retenidos de source=live; modo configurado '+cfg.mode,checks};
}

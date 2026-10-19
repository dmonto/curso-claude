import { randomUUID } from 'node:crypto';
export const tickets = [
 {id:'TCK-1001',service:'payments',severity:'critical',status:'open',description:'Errores intermitentes al autorizar pagos.'},
 {id:'TCK-1002',service:'checkout',severity:'critical',status:'open',description:'Latencia elevada en creación de pedidos.'},
 {id:'TCK-1003',service:'login',severity:'medium',status:'open',description:'Aumento de intentos fallidos.'}
];
const minimum={start_incident_report:4,load_metrics:5,close_critical_tickets:5,send_report:5,recommend_priority:6,prepare_root_cause_hypothesis:6,start_ticket_diagnostic:7,start_followup_note:8,feedback:9};
const action=(label,intent,payload={})=>({id:randomUUID(),label,intent,payload});
export function createEngine(level, {now=Date.now, ttl=1800000, actionTtl=600000}={}) {
 const sessions=new Map(), events=[], notes=[];
 function session(id) {
  for(const [key,s] of sessions) if(now()-s.touched>ttl) sessions.delete(key);
  if(!sessions.has(id)) {
   if(sessions.size>=500) sessions.delete(sessions.keys().next().value);
   sessions.set(id,{touched:now(),flow:null,history:[],responses:new Map()});
  }
  const s=sessions.get(id);s.touched=now();return s;
 }
 function respond(s,text,extra={}) {
  const m={id:randomUUID(),role:'assistant',type:'text',text,createdAt:new Date(now()).toISOString(),...extra};
  if(level>=3)m.clarity={summary:text,nextStep:m.actions?.[0]?.label??'Puedes iniciar otra consulta.'};
  if(level>=6)m.explanation={sources:['Datos ficticios del laboratorio: tickets TCK-1001 a TCK-1003'],limitations:['No hay métricas de producción ni causa raíz verificada.'],...extra.explanation};
  if(s.flow)m.task=structuredClone(s.flow);
  s.history.push(m);s.history=s.history.slice(-40); return {message:m};
 }
 function home(){return [action('Ver tickets críticos','show_critical_tickets'),action('Preparar resumen','prepare_summary'),...(level>=4?[action('Crear informe guiado','start_incident_report')]:[]),...(level>=7?[action('Diagnosticar ticket','start_ticket_diagnostic')]:[]),...(level>=8?[action('Nota de seguimiento','start_followup_note')]:[])];}
 function event(type){if(level>=9){events.push({type,at:now()});if(events.length>1000)events.shift();}}
 function process(b){
  const s=session(b.conversationId);
  if(s.responses.has(b.requestId))return s.responses.get(b.requestId);
  const result=dispatch(s,b);s.responses.set(b.requestId,result);
  if(s.responses.size>100)s.responses.delete(s.responses.keys().next().value);
  event('response');return result;
 }
 function dispatch(s,b){
  const p=b.actionPayload??{}, text=b.message.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
  const intent=b.actionIntent||(text.includes('diagnost')?'start_ticket_diagnostic':text.includes('seguimiento')?'start_followup_note':text.includes('informe')?'start_incident_report':text.includes('resumen')?'prepare_summary':text.includes('critic')?'show_critical_tickets':'show_help');
  if((minimum[intent]??1)>level)return respond(s,'Esta capacidad se incorpora en un apartado posterior.',{type:'error',actions:home()});
  if(intent==='cancel'||intent.endsWith('_cancel')){s.flow=null;event('cancelled');return respond(s,'Proceso cancelado. No se ha guardado ninguna nota.',{actions:home()});}
  if(intent==='show_help')return respond(s,'Puedo consultar tickets y preparar borradores. Las acciones de escritura requieren revisión y confirmación.',{actions:home()});
  if(intent==='show_critical_tickets'||intent==='filter_by_service') {
   const rows=tickets.filter(t=>t.status==='open'&&t.severity==='critical'&&(intent!=='filter_by_service'||t.service===p.service));
   return respond(s,`Hay ${rows.length} tickets críticos abiertos.`,{type:'result',cards:rows.map(t=>({...t,title:t.id,subtitle:t.service})),actions:[action('Preparar resumen','prepare_summary'),action('Filtrar pagos','filter_by_service',{service:'payments'})]});
  }
  if(intent==='prepare_summary'||intent==='confirm_summary'||intent==='confirm_generate_summary')return respond(s,'Borrador: hay 2 tickets críticos abiertos. Payments tiene errores de autorización; Checkout registra latencia elevada. Revisa métricas antes de atribuir una causa.',{type:'result',draft:true,actions:home()});
  if(intent==='load_metrics')return respond(s,'El servicio de métricas simulado no está disponible. Puedes continuar consultando tickets.',{type:'error',error:{code:'METRICS_UNAVAILABLE',retryable:true},actions:[action('Reintentar métricas','load_metrics'),action('Consultar tickets','show_critical_tickets')]});
  if(intent==='close_critical_tickets'||intent==='send_report')return respond(s,'Este laboratorio no permite cerrar tickets ni enviar informes. Puedes preparar un borrador para revisión.',{type:'error',error:{code:'ACTION_NOT_ALLOWED',retryable:false},actions:[action('Preparar borrador','prepare_summary')]});
  if(intent==='recommend_priority'||intent==='prepare_root_cause_hypothesis')return respond(s,'Revisa primero Payments y Checkout: ambos tienen incidencias críticas abiertas. Los datos disponibles no prueban una causa raíz.',{explanation:{sources:['TCK-1001: critical/open','TCK-1002: critical/open'],factors:['Severidad declarada en el ticket'],limitations:['Prioridad orientativa; faltan impacto cuantificado y métricas.']},actions:home()});
  if(intent.startsWith('start_')){
   const kind={start_incident_report:'report',start_ticket_diagnostic:'diagnostic',start_followup_note:'followup'}[intent];
   if(!kind)return respond(s,'No reconozco esa tarea.',{type:'error',actions:home()});
   s.flow={id:randomUUID(),kind,step:0,status:'collecting',values:{},startedAt:now()};event('started');return prompt(s);
  }
  if(intent==='flow_back'){
   if(!s.flow)return respond(s,'No hay un proceso activo.',{type:'error',actions:home()});
   s.flow.step=Math.max(0,s.flow.step-1);s.flow.status='collecting';delete s.flow.proposalId;delete s.flow.draft;
   const keys=fields(s.flow.kind);for(const key of keys.slice(s.flow.step))delete s.flow.values[key];return prompt(s);
  }
  if(intent==='flow_set'){
   const f=s.flow;
   if(!f||f.id!==p.flowId||f.step!==p.step||f.status!=='collecting')return respond(s,'Esta opción ya no corresponde al paso actual. Usa las opciones más recientes.',{type:'error'});
   const key=fields(f.kind)[f.step], choices=options(key);
   if(!choices.includes(p.value))return respond(s,'Selecciona uno de los valores disponibles.',{type:'error'});
   f.values[key]=p.value;f.step++;return prompt(s);
  }
  if(intent==='confirm_note'){
   const f=s.flow;
   if(!f||f.status!=='review'||!p.proposalId||f.proposalId!==p.proposalId)return respond(s,'La propuesta ya no está disponible. Inicia otra tarea.',{type:'error'});
   if(now()-f.proposedAt>actionTtl){s.flow=null;return respond(s,'La confirmación ha caducado. Revisa una propuesta nueva.',{type:'error'});}
   const note={id:randomUUID(),ticketId:f.values.ticket,text:f.draft,visibility:f.values.visibility??'internal',createdAt:new Date(now()).toISOString()};
   notes.push(note); if(notes.length>500)notes.shift();s.flow=null;event('completed');
   return respond(s,`Nota ${note.id} guardada en ${note.ticketId}.`,{type:'result',receipt:note,actions:home()});
  }
  if(intent==='feedback'){
   if(!s.history.some(m=>m.id===p.messageId)||![1,2,3,4,5].includes(p.rating))return respond(s,'Valoración no válida.',{type:'error'});
   event('rating_'+p.rating);return respond(s,'Gracias. Valoración registrada sin almacenar el texto de la conversación.');
  }
  return respond(s,'No puedo ejecutar esa opción. Consulta las capacidades disponibles.',{type:'error',actions:home()});
 }
 function fields(kind){return kind==='report'?['scope','period','service']:kind==='diagnostic'?['ticket','period','checks']:['ticket','visibility'];}
 function options(key){return {scope:['critical','all'],period:['last_hour','today'],service:['all','payments','checkout'],ticket:tickets.map(t=>t.id),checks:['status_and_severity','status_only'],visibility:['internal']}[key];}
 function prompt(s){
  const f=s.flow, keys=fields(f.kind), key=keys[f.step];
  if(key)return respond(s,({scope:'¿Qué incidencias quieres incluir?',period:'¿Qué periodo quieres revisar?',service:'¿Qué servicio quieres incluir?',ticket:'¿Sobre qué ticket trabajamos?',checks:'¿Qué comprobaciones quieres realizar?',visibility:'La nota será interna. Confirma la visibilidad.'})[key],{actions:[...options(key).map(value=>action(value,'flow_set',{flowId:f.id,step:f.step,value})),...(level>=7&&f.step>0?[action('Volver','flow_back')]:[]),action('Cancelar','cancel')],progress:{current:f.step+1,total:keys.length+1}});
  const rows=tickets.filter(t=>(!f.values.ticket||t.id===f.values.ticket)&&(!f.values.service||f.values.service==='all'||t.service===f.values.service)&&(f.values.scope!=='critical'||t.severity==='critical'));
  const draft=rows.map(t=>`${t.id}: ${t.description} Estado ${t.status}${f.values.checks==='status_only'?'':`; severidad ${t.severity}`}.`).join('\n')+'\nDatos de muestra actuales. El periodo es una selección de UX; no hay histórico temporal para aplicar ese filtro. No se ha verificado causa raíz.';
  if(f.kind==='report'){s.flow=null;event('completed');return respond(s,draft,{type:'result',draft:true,actions:home()});}
  f.status='review';f.draft=draft;f.proposalId=randomUUID();f.proposedAt=now();
  return respond(s,'Revisa el borrador antes de guardar la nota interna:\n'+draft,{type:'confirmation',actions:[action('Confirmar y guardar nota','confirm_note',{proposalId:f.proposalId}),action('Volver','flow_back'),action('Cancelar','cancel')]});
 }
 return {process,session,notes,summary:()=>({sampleSize:events.length,counts:Object.fromEntries([...new Set(events.map(e=>e.type))].map(type=>[type,events.filter(e=>e.type===type).length])),retention:'Últimos 1000 eventos en memoria; sin texto ni identificadores de conversación.'})};
}

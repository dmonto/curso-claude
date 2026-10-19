import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { version } from './version.js';
import { login,authenticate } from './auth.js';
import { visibleTickets,getTicketForAction,canAct } from './access-control.js';
import { projectTicket,redact } from './sensitive-data.js';
import { suspicious,safeContext } from './prompt-injection-guard.js';
import { validate,validOutput } from './validation.js';
import { tickets,saveTickets,appendJsonl } from './storage.js';
import { appendActionAuditEvent,verifyActionAuditChain } from './action-audit.js';
import { appendActivityEvent,activityFor,activitySummary } from './activity-logger.js';
import { askModel } from './model.js';
import { generateComplianceReport } from './compliance.js';
import { generateSecurityBaseline } from './security-baseline.js';
const rates=new Map();
function rate(key,limit) {
  const now=Date.now(),entry=rates.get(key);
  if(!entry || entry.until<now) {rates.set(key,{count:1,until:now+60000});return true;}
  return ++entry.count<=limit;
}
const timer=setInterval(()=>{for(const [key,e] of rates) if(e.until<Date.now()) rates.delete(key);},60000);timer.unref();
async function readBody(req) {
  const chunks=[];let bytes=0;
  for await(const chunk of req) {bytes+=chunk.length;if(bytes>16384) throw Object.assign(new Error('BODY_TOO_LARGE'),{status:413});chunks.push(chunk);}
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw Object.assign(new Error('INVALID_JSON'),{status:400});}
}
export const server=http.createServer(async(req,res)=>{
  const requestId=randomUUID(),started=Date.now();let identity;
  const pathname=new URL(req.url,'http://localhost').pathname;
  const base=()=>({requestId,userId:identity?.userId,role:identity?.role,tenantId:identity?.tenantId,endpoint:pathname});
  const activity=(eventType,extra={})=>{if(version.number>=8) appendActivityEvent({...base(),eventType,...extra});};
  const audit=(eventType,extra={})=>{if(version.number>=7) appendActionAuditEvent({...base(),eventType,...extra});};
  function send(status,value) {
    res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-request-id':requestId});
    res.end(JSON.stringify({requestId,...value}));
  }
  try {
    const origin=req.headers.origin;
    if(origin && origin!==config.origin) return send(403,{error:'ORIGIN_DENIED'});
    if(origin) {res.setHeader('Access-Control-Allow-Origin',config.origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');}
    if(req.method==='OPTIONS') {res.writeHead(204);return res.end();}
    if(req.method==='GET' && pathname==='/health') return send(200,{ok:true,version,modelMode:config.mode,capabilities:{actions:version.number>=7,activity:version.number>=8,compliance:version.number>=9,baseline:version.number>=10}});
    if(req.method==='POST' && pathname==='/auth/login') {
      if(!rate('login:'+req.socket.remoteAddress,30)) return send(429,{error:'RATE_LIMIT'});
      if(!req.headers['content-type']?.startsWith('application/json')) return send(415,{error:'JSON_REQUIRED'});
      const body=await readBody(req);if(!validate(body,'login')) return send(400,{error:'INVALID_INPUT'});
      const result=login(body.email,body.password);if(!result) return send(401,{error:'INVALID_CREDENTIALS'});
      identity=result.user;activity('login_success');return send(200,result);
    }
    identity=authenticate(req.headers.authorization);
    if(!identity) return send(401,{error:'TOKEN_INVALID'});
    if(!rate(identity.userId,120)) return send(429,{error:'RATE_LIMIT'});
    const isAdmin=identity.role==='support_admin';
    if(req.method==='GET' && pathname==='/auth/me') return send(200,{user:identity});
    if(req.method==='GET' && pathname==='/tickets') return send(200,{tickets:visibleTickets(identity,tickets).map(projectTicket)});
    if(req.method==='GET' && pathname==='/security/risks') return send(200,{risks:['Acceso entre tenants','Suplantación de identidad','Fuga de secretos','Prompt injection','Acciones sin confirmación','Manipulación de logs'],controls:['Identidad firmada','Filtrado en backend','Proyección mínima','Acciones fuera del modelo']});
    if(req.method==='POST' && pathname==='/assistant') {
      activity('assistant_request_received');
      if(!req.headers['content-type']?.startsWith('application/json')) return send(415,{error:'JSON_REQUIRED'});
      const body=await readBody(req);
      if(!validate(body,'assistant')) {activity('input_validation_failed',{result:'rejected'});return send(400,{error:'INVALID_INPUT'});}
      activity('input_validation_passed');
      if(version.number>=5 && suspicious(body.message)) {activity('prompt_injection_blocked',{result:'rejected'});return send(403,{error:'PROMPT_INJECTION_BLOCKED'});}
      const authorized=visibleTickets(identity,tickets).map(projectTicket);
      const context=version.number>=5?safeContext(authorized):authorized;
      activity('context_built',{ticketCount:context.length});
      if(context.length<authorized.length) activity('untrusted_context_excluded',{ticketCount:authorized.length-context.length});
      activity(config.mode==='live'?'model_call_started':'mock_call_started',{modelMode:config.mode});
      let result;
      try {result=await askModel(redact(body.message),context);} catch {activity('model_call_failed',{result:'failed'});return send(502,{error:'MODEL_UNAVAILABLE'});}
      if(!validOutput(result.text)) return send(502,{error:'INVALID_MODEL_OUTPUT'});
      const answer=redact(result.text);
      activity('assistant_response_sent',{result:'success',durationMs:Date.now()-started,inputTokens:result.usage.input_tokens,outputTokens:result.usage.output_tokens,modelMode:config.mode});
      return send(200,{answer,modelMode:config.mode,ticketIds:context.map(t=>t.id)});
    }
    if(req.method==='POST' && pathname==='/assistant/action' && version.number>=7) {
      if(!req.headers['content-type']?.startsWith('application/json')) return send(415,{error:'JSON_REQUIRED'});
      const body=await readBody(req),actionId=randomUUID();
      if(!validate(body,'action')) {audit('action_input_validation_failed',{actionId,result:'rejected'});return send(400,{error:'INVALID_ACTION'});}
      const fields={actionId,action:body.action,resourceId:body.ticketId};audit('action_requested',fields);
      const ticket=getTicketForAction(identity,tickets,body.ticketId);
      if(!ticket) {audit('action_authorization_failed',{...fields,decision:'denied',reason:'not_visible'});return send(404,{error:'TICKET_NOT_FOUND'});}
      if(!canAct(identity,body.action)) {audit('action_authorization_failed',{...fields,decision:'denied',reason:'insufficient_role'});return send(403,{error:'ACTION_FORBIDDEN'});}
      if(body.action==='close_ticket') {
        const requiredConfirmation='CONFIRMO CERRAR '+body.ticketId;
        if(body.confirmation!==requiredConfirmation) {audit('action_confirmation_required',{...fields,decision:'pending_confirmation',result:'not_executed'});return send(409,{error:'CONFIRMATION_REQUIRED',requiredConfirmation});}
        const before={status:ticket.status},after={status:'closed'};
        if(ticket.status==='closed') {audit('action_already_applied',{...fields,result:'success'});return send(200,{ok:true,actionId,ticketId:ticket.id,status:ticket.status,alreadyApplied:true});}
        // Cadena verificada y evento previo escrito antes de modificar estado.
        audit('action_execution_started',{...fields,before,after});ticket.status='closed';saveTickets();
        audit('action_executed',{...fields,before,after,decision:'allowed',result:'success'});
        activity('action_completed',{...fields,result:'success'});
        return send(200,{ok:true,actionId,ticketId:ticket.id,status:ticket.status});
      }
      const noteId=randomUUID();audit('action_execution_started',{...fields,noteId,noteLength:body.note.length});
      ticket.privateNotes.push({id:noteId,authorUserId:identity.userId,createdAt:new Date().toISOString(),note:redact(body.note)});saveTickets();
      audit('action_executed',{...fields,noteId,noteLength:body.note.length,result:'success',decision:'allowed'});
      activity('action_completed',{...fields,result:'success'});
      return send(200,{ok:true,actionId,ticketId:ticket.id,noteId});
    }
    if(req.method==='GET' && pathname==='/audit/actions/verify' && version.number>=7) {if(!isAdmin)return send(403,{error:'ADMIN_REQUIRED'});return send(200,verifyActionAuditChain());}
    if(req.method==='GET' && pathname==='/activity/summary' && version.number>=8) {if(!isAdmin)return send(403,{error:'ADMIN_REQUIRED'});return send(200,activitySummary(identity));}
    if(req.method==='GET' && pathname==='/privacy/me/activity' && version.number>=9) return send(200,{events:activityFor(identity)});
    if(req.method==='GET' && pathname==='/compliance/report' && version.number>=9) {if(!isAdmin)return send(403,{error:'ADMIN_REQUIRED'});return send(200,generateComplianceReport(identity));}
    if(req.method==='POST' && pathname==='/privacy/me/delete-request' && version.number>=9) {
      const id=randomUUID();appendJsonl('privacy-requests.jsonl',{id,userId:identity.userId,tenantId:identity.tenantId,timestamp:new Date().toISOString(),status:'pending_review'});
      activity('privacy_delete_requested',{result:'pending_review'});return send(202,{id,status:'pending_review',message:'Solicitud registrada para revisión; no se han eliminado datos.'});
    }
    if(req.method==='GET' && pathname==='/security/baseline' && version.number>=10) {if(!isAdmin)return send(403,{error:'ADMIN_REQUIRED'});return send(200,generateSecurityBaseline(identity));}
    return send(404,{error:'NOT_FOUND'});
  } catch(err) {return send(err.status || 503,{error:err.status?err.message:'SERVICE_UNAVAILABLE'});}
});
server.requestTimeout=60000;server.headersTimeout=10000;
server.listen(config.port,config.host,()=>console.log(`${version.directory} · http://${config.host}:${config.port} · ${config.mode}`));

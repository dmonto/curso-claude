import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {version,configuration,answer,evaluate,prompts} from './engine.js';
import {enrich} from './model.js';
export function createApp(env=process.env) {
 const config=configuration(env), responses=new Map(), feedback=new Map(), samples=[];
 const metrics={requests:0,errors:0,modelErrors:0,inputTokens:0,outputTokens:0};
 let draining=false;
 const server=http.createServer(async(req,res)=>{
 const requestId=randomUUID(),started=performance.now();
 res.setHeader('x-request-id',requestId);res.setHeader('cache-control','no-store');
 const origin=req.headers.origin;
 if(origin&&origin!==(env.ALLOWED_ORIGIN||'http://127.0.0.1:4200')){res.writeHead(403);res.end();return;}
 if(origin)res.setHeader('access-control-allow-origin',origin);
 res.setHeader('access-control-allow-methods','GET,POST,OPTIONS');res.setHeader('access-control-allow-headers','content-type');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify({...data,requestId}));};
 try {
 const path=new URL(req.url,'http://localhost').pathname;
 if(req.method==='GET'&&path==='/health')return send(200,{status:'ok',version:version.id});
 if(req.method==='GET'&&path==='/ready')return send(draining||config.maintenance?503:200,{ready:!draining&&!config.maintenance,checks:'Configuración local; no comprueba la disponibilidad externa de Claude.'});
 if(req.method==='GET'&&path==='/api/config')return send(200,{...config,title:version.title,stage:version.stage});
 if(req.method==='GET'&&path==='/api/metrics'&&version.stage>=5){
 const sorted=[...samples].sort((a,b)=>a-b);
 return send(200,{...metrics,p95Ms:sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]||0,window:sorted.length,feedback:[...feedback.values()],storage:'Memoria del proceso; máximo 1000 respuestas y latencias.'});}
 if(req.method==='GET'&&path==='/api/prompts'&&version.stage>=8)return send(200,{active:config.promptId,registry:prompts});
 if(req.method==='POST') {
 if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(Error('Se requiere application/json'),{status:415});
 let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>16384)throw Object.assign(Error('Cuerpo demasiado grande'),{status:413});parts.push(chunk);}
 let input;try{input=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw Object.assign(Error('JSON inválido'),{status:400});}
 if(path==='/api/assistant') {
 if(draining||config.maintenance)return send(503,{error:'MAINTENANCE',message:'Asistente temporalmente en mantenimiento.'});
 metrics.requests++;
 let result=answer(input,config);
 try{result=await enrich(result,config,env);}catch{metrics.modelErrors++;result={...result,provider:'fallback',warning:'Claude no disponible o respuesta incompleta. Se muestran únicamente los hechos locales.'};}
 metrics.inputTokens+=result.usage?.input_tokens||0;metrics.outputTokens+=result.usage?.output_tokens||0;
 const responseId=randomUUID();responses.set(responseId,{promptId:config.promptId,provider:result.provider});
 if(responses.size>1000){const first=responses.keys().next().value;responses.delete(first);feedback.delete(first);}
 return send(200,{...result,responseId,release:config.fingerprint});
 }
 if(path==='/api/evaluate'&&version.stage>=3)return send(200,evaluate(config));
 if(path==='/api/feedback'&&version.stage>=6){
 if(!input||!responses.has(input.responseId)||![1,-1].includes(input.rating))throw Object.assign(Error('Respuesta desconocida o valoración inválida'),{status:400});
 feedback.set(input.responseId,{responseId:input.responseId,rating:input.rating,...responses.get(input.responseId)});return send(200,{saved:true});}
 }
 send(404,{error:'NOT_FOUND'});
 }catch(error){metrics.errors++;send(error.status||500,{error:error.status?error.message:'INTERNAL_ERROR'});}
 finally{if(version.stage>=5){samples.push(Math.round(performance.now()-started));if(samples.length>1000)samples.shift();}}
 });
 server.requestTimeout=60000;server.headersTimeout=10000;
 return {server,config,drain(){draining=true;server.close();server.closeIdleConnections();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const local=fileURLToPath(new URL('./.env',import.meta.url));
 if(existsSync(local))process.loadEnvFile(local);
 const app=createApp(),port=Number(process.env.PORT||3000);
 app.server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(JSON.stringify({event:'started',port,...app.config})));
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{app.drain();setTimeout(()=>{app.server.closeAllConnections();},50000).unref();});
}

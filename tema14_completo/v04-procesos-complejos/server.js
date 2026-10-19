import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createEngine} from './engine.js';
import {enrich} from './model.js';
const dir=dirname(fileURLToPath(import.meta.url));
if(existsSync(join(dir,'.env')))process.loadEnvFile(join(dir,'.env'));
export const version=JSON.parse(readFileSync(join(dir,'version.json'),'utf8'));
const mode=process.env.MODEL_MODE||'mock';
if(!['mock','claude'].includes(mode))throw new Error('MODEL_MODE debe ser mock o claude');
if(!['low','medium','high'].includes(process.env.CLAUDE_EFFORT||'medium'))throw new Error('CLAUDE_EFFORT no válido');
export const engine=createEngine(version.level,{ttl:Number(process.env.SESSION_TTL_SECONDS||1800)*1000,actionTtl:Number(process.env.ACTION_TTL_SECONDS||600)*1000});
const pending=new Set();
export const server=createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&!/^http:\/\/(localhost|127\.0\.0\.1):4200$/.test(origin)){res.writeHead(403);res.end();return;}
 const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store',...(origin?{'access-control-allow-origin':origin,'vary':'Origin'}:{})};
 const send=(status,data)=>{res.writeHead(status,headers);res.end(JSON.stringify(data));};
 if(req.method==='OPTIONS'){res.writeHead(204,{...headers,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type'});res.end();return;}
 if(req.method==='GET'&&req.url==='/health')return send(200,{status:'ok',version,mode});
 if(req.method==='GET'&&req.url==='/api/ux/summary'&&version.level>=9)return send(200,engine.summary());
 if(req.method!=='POST'||!['/api/assistant','/api/assistant/message'].includes(req.url))return send(404,{error:'NOT_FOUND'});
 req.setEncoding('utf8');
 let body='',bytes=0;
 try{
  for await(const chunk of req){bytes+=Buffer.byteLength(chunk);if(bytes>16384){send(413,{error:'BODY_TOO_LARGE'});return;}body+=chunk;}
  const b=JSON.parse(body);
  if(!b||typeof b!=='object'||typeof b.message!=='string'||b.message.length>4000||typeof b.conversationId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(b.conversationId)||typeof b.requestId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(b.requestId)|| (b.actionIntent!==undefined&&typeof b.actionIntent!=='string')||(b.actionPayload!==undefined&&(!b.actionPayload||typeof b.actionPayload!=='object'||Array.isArray(b.actionPayload))))return send(400,{error:'INVALID_REQUEST',text:'Revisa message, conversationId y requestId.'});
  if(pending.has(b.conversationId))return send(409,{error:'BUSY',text:'Hay una solicitud en curso. Espera y reintenta.'});
  pending.add(b.conversationId);
  try{
   let r=engine.process(b);
   try{r=await enrich(r);}catch{r={...r,modelWarning:'Claude no está disponible. Se muestra el resultado determinista; puedes reintentar la consulta.'};}
   send(200,{...r,conversationId:b.conversationId,correlationId:randomUUID(),version:version.id,mode});
  }finally{pending.delete(b.conversationId);}
 }catch{send(400,{error:'INVALID_JSON',text:'No se pudo procesar el JSON de entrada.'});}
});
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(`${version.id}: http://127.0.0.1:${process.env.PORT||3000} (${mode})`));

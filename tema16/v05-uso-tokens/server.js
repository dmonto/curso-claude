import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {cfg,version,instance} from './config.js';
import {answer,gate,metrics} from './engine.js';
let draining=false;
export const server=createServer(async(req,res)=>{
 const start=performance.now(),requestId=randomUUID();
 const origin=req.headers.origin;
 const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-request-id':requestId,...(origin&&/^http:\/\/(localhost|127\.0\.0\.1):4200$/.test(origin)?{'access-control-allow-origin':origin,'vary':'Origin'}:{})};
 const send=(status,data)=>{if(!res.destroyed){res.writeHead(status,{...headers,...(status===429||status===503?{'retry-after':'2'}:{})});res.end(JSON.stringify(data));}};
 if(origin&&!headers['access-control-allow-origin'])return send(403,{error:'ORIGIN_DENIED'});
 if(req.method==='OPTIONS'){res.writeHead(204,{...headers,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type'});return res.end();}
 if(req.method==='GET'&&req.url==='/health')return send(200,{status:'ok',version,mode:cfg.mode,instance});
 if(req.method==='GET'&&req.url==='/ready')return send(draining?503:200,{ready:!draining,instance});
 if(req.method==='GET'&&req.url==='/api/metrics')return send(200,{...metrics.snapshot(),active:gate.active,queued:gate.waiting.length,instance,scope:'Este proceso; costes estimados, mock sintético'});
 if(req.method!=='POST'||!['/api/assistant','/api/assistant/message'].includes(req.url))return send(404,{error:'NOT_FOUND'});
 if(draining)return send(503,{error:'DRAINING'});
 let error=false;
 try{
  const chunks=[];let bytes=0;for await(const c of req){bytes+=c.length;if(bytes>32768){send(413,{error:'BODY_TOO_LARGE'});error=true;return;}chunks.push(c);}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{send(400,{error:'INVALID_JSON'});error=true;return;}
  const result=await answer(body);send(200,{...result,requestId,version:version.id,mode:cfg.mode,instance,durationMs:performance.now()-start});
 }catch(e){error=true;send(e.status||502,{error:e.status?e.message:'UPSTREAM_UNAVAILABLE',requestId,instance});}
 finally{const ms=performance.now()-start;metrics.record(ms,error);if(version.level>=9)console.log(JSON.stringify({requestId,instance,durationMs:ms,error}));}
});
server.requestTimeout=15000;server.headersTimeout=10000;
if(process.argv[1]===fileURLToPath(import.meta.url)){
 server.listen(cfg.port,cfg.host,()=>console.log(JSON.stringify({url:`http://${cfg.host}:${cfg.port}`,version:version.id,mode:cfg.mode})));
 for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{draining=true;server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),45000).unref();});
}

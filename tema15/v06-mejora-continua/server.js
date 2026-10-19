import {createServer} from 'node:http';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {config,dir,version} from './config.js';
import {createStore} from './store.js';
import {createService,ApiError} from './service.js';
export function makeServer(service){
 return createServer(async(req,res)=>{
  const origin=req.headers.origin;
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store',...(origin?{'access-control-allow-origin':origin,'vary':'Origin'}:{})};
  const send=(status,data)=>{res.writeHead(status,headers);res.end(JSON.stringify(data));};
  if(origin&&!/^http:\/\/(localhost|127\.0\.0\.1):4200$/.test(origin)){res.writeHead(403);res.end();return;}
  if(req.method==='OPTIONS'){res.writeHead(204,{...headers,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type'});res.end();return;}
  try{
   let b={};
   if(req.method==='POST'){
    if(!String(req.headers['content-type']).startsWith('application/json'))throw new ApiError(415,'JSON_REQUIRED');
    let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>16384)throw new ApiError(413,'BODY_TOO_LARGE');chunks.push(chunk);}
    try{b=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError(400,'INVALID_JSON');}
    if(!b||typeof b!=='object'||Array.isArray(b))throw new ApiError(400,'INVALID_OBJECT');
   }
   const r=await service.dispatch(req.method,new URL(req.url,'http://localhost').pathname,b);
   send(r.httpStatus||200,r.httpStatus?r.body:r);
  }catch(e){send(e.status||500,{error:e.code||'INTERNAL_ERROR'});}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cfg=config();const service=createService({cfg,version,store:createStore(join(dir,'data'),cfg.retentionDays)});
 const server=makeServer(service);server.requestTimeout=150000;server.headersTimeout=10000;
 server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(version.id+' en http://127.0.0.1:'+(process.env.PORT||3000)+' ('+cfg.mode+')'));
}

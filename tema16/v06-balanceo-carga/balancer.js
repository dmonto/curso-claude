import {createServer,request} from 'node:http';
const targets=(process.env.BACKENDS||'http://127.0.0.1:3001,http://127.0.0.1:3002').split(',');
let cursor=0;
// Round-robin sin reintento de POST: evita duplicar consumo si la respuesta se pierde.
const server=createServer((req,res)=>{
 const target=new URL(req.url,targets[cursor++%targets.length]);
 const upstream=request(target,{method:req.method,headers:{...req.headers,host:target.host}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
 upstream.setTimeout(45000,()=>upstream.destroy());
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'content-type':'application/json'});res.end(JSON.stringify({error:'BACKEND_UNAVAILABLE'}));});
 req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
});
server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('Balanceador listo'));

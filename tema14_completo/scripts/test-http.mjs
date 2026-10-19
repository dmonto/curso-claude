import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
process.env.MODEL_MODE='mock';
for(const v of JSON.parse(readFileSync(new URL('../versions.json',import.meta.url)))){
 const {server}=await import(`../${v.directory}/server.js`);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}`;
 try{
  const h=await (await fetch(url+'/health')).json();assert.equal(h.version.id,v.id);
  const request={conversationId:crypto.randomUUID(),requestId:crypto.randomUUID(),message:'Muéstrame tickets críticos'};
  let res=await fetch(url+'/api/assistant',{method:'POST',body:JSON.stringify(request)});assert.equal(res.status,200);assert.equal((await res.json()).message.cards.length,2);
  res=await fetch(url+'/api/assistant',{method:'POST',body:'{'});assert.equal(res.status,400);
  res=await fetch(url+'/api/assistant',{method:'POST',body:JSON.stringify({message:'hola'})});assert.equal(res.status,400);
  res=await fetch(url+'/health',{headers:{origin:'https://untrusted.example'}});assert.equal(res.status,403);
  res=await fetch(url+'/api/ux/summary');assert.equal(res.status,v.level>=9?200:404);
  console.log(`${v.id}: HTTP, Unicode, validación, CORS y capacidades OK`);
 }finally{await new Promise(resolve=>server.close(resolve));}
}

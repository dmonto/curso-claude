import {readdirSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const folders=readdirSync(root).filter(x=>/^v\d\d-/.test(x));
let port=13000;
async function run(folder,extra={},check){
 const p=++port,url='http://127.0.0.1:'+p;
 const child=spawn(process.execPath,['server.js'],{cwd:root+'/'+folder,env:{...process.env,MODEL_MODE:'mock',PORT:String(p),MOCK_DELAY_MS:'100',MAX_CONCURRENT:'1',MAX_QUEUE:'1',CACHE_TTL_MS:'5000',...extra},stdio:'ignore'});
 try{let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(url+'/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,30));}assert.ok(ready,'Backend listo');await check(url);}finally{child.kill();await new Promise(r=>child.once('exit',r));}
}
const post=(u,message)=>fetch(u+'/api/assistant/message',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message})});
for(const folder of folders){
 const t=spawnSync(process.execPath,['--test','test/controls.test.js'],{cwd:root+'/'+folder,encoding:'utf8'});assert.equal(t.status,0,t.stdout+t.stderr);
 await run(folder,{},async url=>{
  const one=await post(url,'Resume tickets');assert.equal(one.status,200);const a=await one.json();assert.ok(a.message.text);assert.equal(a.mode,'mock');
  const two=await (await post(url,'Resume tickets')).json();assert.equal(two.cacheHit,Number(folder.slice(1,3))>=4);
  assert.equal((await post(url,'')).status,400);
  if(Number(folder.slice(1,3))>=2){const statuses=await Promise.all(Array.from({length:5},(_,i)=>post(url,'carga '+i).then(r=>r.status)));assert.ok(statuses.includes(429));}
 });console.log(folder+' OK');
}
await run(folders[7],{REQUEST_BUDGET_USD:'0.000001'},async u=>assert.equal((await post(u,'Resume')).status,422));
console.log('Presupuesto previo a la llamada OK');

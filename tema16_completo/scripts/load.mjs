const url=process.argv[2]||'http://127.0.0.1:3000';
const count=Number(process.argv[3]||20),concurrency=Number(process.argv[4]||12);
if(!Number.isInteger(count)||count<1||count>1000||!Number.isInteger(concurrency)||concurrency<1||concurrency>100)throw Error('Peticiones 1..1000; concurrencia 1..100');
const health=await fetch(url+'/health').then(r=>r.json());
if(health.mode!=='mock'&&!process.argv.includes('--allow-paid'))throw Error('Carga bloqueada en Claude. Usa mock o autoriza explícitamente con --allow-paid.');
let next=0;const rows=[];const start=performance.now();
await Promise.all(Array.from({length:concurrency},async()=>{while(next<count){const i=next++;const t=performance.now();try{const r=await fetch(url+'/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Resume tickets. Lote '+i}),signal:AbortSignal.timeout(60000)});const d=await r.json();rows.push({status:r.status,ms:performance.now()-t,instance:d.instance,error:d.error});}catch{rows.push({status:0,ms:performance.now()-t});}}}));
const ms=performance.now()-start,s=rows.map(r=>r.ms).sort((a,b)=>a-b),statuses={};for(const r of rows)statuses[r.status]=(statuses[r.status]||0)+1;
console.log(JSON.stringify({requests:count,concurrency,elapsedMs:ms,rps:count/(ms/1000),statuses,p95:s[Math.ceil(s.length*.95)-1],instances:[...new Set(rows.map(r=>r.instance))]},null,2));

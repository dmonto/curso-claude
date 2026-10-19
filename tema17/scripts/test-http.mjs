import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:3000';
const r=await fetch(base+'/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Resume TCK-1001'})});
assert.equal(r.status,200);const body=await r.json();assert.equal(body.tickets[0].id,'TCK-1001');console.log(JSON.stringify(body,null,2));

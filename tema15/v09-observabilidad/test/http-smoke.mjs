import assert from 'node:assert/strict';
// Prueba contra el backend ya arrancado. No crea procesos ni modifica configuración.
const base=process.env.BASE_URL||'http://127.0.0.1:3000';
const h=await fetch(base+'/health');assert.equal(h.status,200);const health=await h.json();
const response=await fetch(base+'/api/assistant/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:crypto.randomUUID(),task_type:'order_status',entity_id:'12345',message:'¿Dónde está el pedido?'})});assert.equal(response.status,200);const r=await response.json();assert.ok(r.trace_id&&r.answer);
const invalid=await fetch(base+'/api/assistant/message',{method:'POST',headers:{'Content-Type':'application/json'},body:'null'});assert.equal(invalid.status,400);
console.log(JSON.stringify({status:'PASS',version:health.version.id,mode:health.mode,trace_id:r.trace_id},null,2));

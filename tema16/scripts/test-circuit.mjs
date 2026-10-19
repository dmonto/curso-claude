import assert from 'node:assert/strict';
process.env.MODEL_MODE='claude';process.env.COURSE_ANTHROPIC_API_KEY='fake-test-key';
process.env.REQUEST_BUDGET_USD='1';
const realFetch=globalThis.fetch;let calls=0,fail=true;
// Doble del proveedor en memoria: ninguna llamada externa, ninguna clave real.
globalThis.fetch=async(url,options)=>{
 const body=JSON.parse(options.body);
 if(String(url).endsWith('count_tokens'))return Response.json({input_tokens:100});
 calls++;assert.equal(body.output_config.effort,'low');assert.equal(body.thinking.type,'adaptive');assert.equal(body.temperature,undefined);
 if(fail)return Response.json({error:'overloaded'},{status:529});
 return Response.json({content:[{type:'thinking',thinking:'no mostrar'},{type:'text',text:'Respuesta de prueba'}],usage:{input_tokens:100,output_tokens:20},stop_reason:'end_turn'});
};
try{
 const {answer}=await import('../v10-buenas-practicas/engine.js');
 for(let i=0;i<3;i++)await assert.rejects(answer({message:'fallo '+i}),/PROVIDER_ERROR/);
 await assert.rejects(answer({message:'bloqueada'}),/CIRCUIT_OPEN/);assert.equal(calls,3);
 const now=Date.now;Date.now=()=>now()+11000;fail=false;
 try{const result=await answer({message:'recuperada'});assert.equal(result.message.text,'Respuesta de prueba');assert.equal(calls,4);}finally{Date.now=now;}
 console.log('Circuito, recuperación y payload effort/adaptive OK (proveedor simulado)');
}finally{globalThis.fetch=realFetch;}

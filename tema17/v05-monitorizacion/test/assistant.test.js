import test from 'node:test';
import assert from 'node:assert/strict';
import {configuration,answer,evaluate,version} from '../engine.js';
import {enrich} from '../model.js';
import {createApp} from '../server.js';
const config=configuration({MODEL_MODE:'mock'});
test('Contrato: ticket conocido, desconocido y abiertos',()=>assert.equal(evaluate(config).passed,true));
test('Entrada inválida y límites',()=>{for(const input of [null,{}, {message:''},{message:'x'.repeat(2001)}])assert.throws(()=>answer(input,config));});
test('Claude: esfuerzo, sin temperatura, texto separado de hechos',async()=>{
 const result=await enrich(answer({message:'TCK-1001'},config),{...config,mode:'claude'},{COURSE_ANTHROPIC_API_KEY:'test'},async(url,req)=>{
 const body=JSON.parse(req.body);assert.equal(body.output_config.effort,'medium');assert.equal(body.temperature,undefined);assert.equal(body.messages.length,1);
 return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:'Resumen'}],usage:{input_tokens:20,output_tokens:10}})};});
 assert.equal(result.modelComment,'Resumen');assert.equal(result.tickets[0].id,'TCK-1001');
});
test('Claude: error y salida truncada no se aceptan',async()=>{
 for(const reply of [{ok:false},{ok:true,json:async()=>({stop_reason:'max_tokens'})}])await assert.rejects(()=>enrich({}, {...config,mode:'claude'},{},async()=>reply));
});
test('Flags y selección de prompt respetan etapa',()=>{
 const c=configuration({FEATURE_NEXT_STEP:'true',PROMPT_VERSION:'p2'});
 assert.equal(c.nextStep,version.stage>=7);assert.equal(c.promptId,version.stage>=8?'p2':'p1');
});
test('HTTP: consulta, errores, feedback y mantenimiento',async()=>{
 const {server}=createApp({MODEL_MODE:'mock'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 try{
 assert.equal((await fetch(base+'/health')).status,200);
 assert.equal((await post('/api/assistant',{})).status,400);
 const response=await (await post('/api/assistant',{message:'TCK-1001'})).json();assert.equal(response.provider,'mock');
 if(version.stage>=6){assert.equal((await post('/api/feedback',{responseId:response.responseId,rating:1})).status,200);assert.equal((await post('/api/feedback',{responseId:'fake',rating:1})).status,400);}
 assert.equal((await fetch(base+'/api/config',{headers:{origin:'https://invalid.example'}})).status,403);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
 if(version.stage>=10){const a=createApp({MAINTENANCE_MODE:'true'});await new Promise(r=>a.server.listen(0,'127.0.0.1',r));try{assert.equal((await fetch(`http://127.0.0.1:${a.server.address().port}/ready`)).status,503);}finally{a.server.closeAllConnections();await new Promise(r=>a.server.close(r));}}
});

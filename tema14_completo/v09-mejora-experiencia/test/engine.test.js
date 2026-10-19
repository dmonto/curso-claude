import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine} from '../engine.js';
import {randomUUID} from 'node:crypto';
function client(e,id='test'){return (intent,payload={},requestId=randomUUID())=>e.process({conversationId:id,requestId,message:'',actionIntent:intent,actionPayload:payload});}
test('critical query and version gates',()=>{for(let i=1;i<=10;i++){const call=client(createEngine(i));assert.equal(call('show_critical_tickets').message.cards.length,2);assert.equal(call('start_followup_note').message.type,i<8?'error':'text');}});
test('write needs proposal, is isolated, and cannot run twice',()=>{
 const e=createEngine(10),call=client(e);assert.equal(call('confirm_note').message.type,'error');
 let r=call('start_followup_note');for(let i=0;i<2;i++){const a=r.message.actions[0];r=call(a.intent,a.payload);}
 const a=r.message.actions[0];assert.equal(e.notes.length,0);
 assert.equal(client(e,'other')(a.intent,a.payload).message.type,'error');
 const id=randomUUID(),saved=call(a.intent,a.payload,id);assert.ok(saved.message.receipt);assert.equal(e.notes.length,1);
 assert.deepEqual(call(a.intent,a.payload,id),saved);assert.equal(call(a.intent,a.payload).message.type,'error');assert.equal(e.notes.length,1);
});
test('old steps, back, cancel, expiry',()=>{
 let time=0;const e=createEngine(10,{now:()=>time,ttl:1000,actionTtl:10}),call=client(e);
 let r=call('start_followup_note');const old=r.message.actions[0];r=call(old.intent,old.payload);assert.equal(call(old.intent,old.payload).message.type,'error');
 r=call('flow_back');assert.equal(r.message.task.step,0);r=call(r.message.actions[0].intent,r.message.actions[0].payload);r=call(r.message.actions[0].intent,r.message.actions[0].payload);
 time=11;assert.equal(call(r.message.actions[0].intent,r.message.actions[0].payload).message.type,'error');assert.equal(e.notes.length,0);
 call('start_ticket_diagnostic');call('cancel');assert.equal(e.session('test').flow,null);
});

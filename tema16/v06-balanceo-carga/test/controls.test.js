import test from 'node:test';
import assert from 'node:assert/strict';
import {Gate,Cache} from '../controls.js';
test('cola limitada, timeout y recuperación de plaza',async()=>{const g=new Gate(1,1,20);await g.enter();const wait=g.enter();await assert.rejects(g.enter(),/QUEUE_FULL/);await assert.rejects(wait,/QUEUE_TIMEOUT/);g.leave();await g.enter();assert.equal(g.active,1);g.leave();});
test('TTL y límite de caché',async()=>{const c=new Cache(10,1);c.set('a',1);c.set('b',2);assert.equal(c.get('a'),undefined);assert.equal(c.get('b'),2);await new Promise(r=>setTimeout(r,15));assert.equal(c.get('b'),undefined);});

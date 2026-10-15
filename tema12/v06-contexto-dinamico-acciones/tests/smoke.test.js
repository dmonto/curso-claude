import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSION } from '../version.js';
test('version metadata', () => { assert.match(VERSION.id, /^v\d{2}$/); assert.ok(VERSION.stage >= 1); });

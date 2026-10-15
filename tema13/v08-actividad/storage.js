import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { seed } from './data/seed.js';
const file=path.join(config.runtime,'tickets.json');
export const tickets=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):structuredClone(seed);
export function saveTickets() { const temporary=file+'.tmp';fs.writeFileSync(temporary,JSON.stringify(tickets,null,2));fs.renameSync(temporary,file); }
export function readJsonl(name) { const f=path.join(config.runtime,name); return fs.existsSync(f)?fs.readFileSync(f,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line)):[]; }
export function appendJsonl(name,event) { fs.appendFileSync(path.join(config.runtime,name),JSON.stringify(event)+'\n'); }

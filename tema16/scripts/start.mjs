import {readdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const n=Number(process.argv[2]||10);const dir=readdirSync(new URL('../',import.meta.url)).find(x=>x.startsWith('v'+String(n).padStart(2,'0')+'-'));
if(!dir)throw Error('Versión: 1..10');
const child=spawn(process.execPath,[fileURLToPath(new URL('../'+dir+'/server.js',import.meta.url))],{stdio:'inherit'});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>child.kill(sig));
child.on('exit',c=>process.exitCode=c??0);

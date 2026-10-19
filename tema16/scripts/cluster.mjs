import {spawn} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const n=Number(process.argv[2]||10);if(n<6||n>10)throw Error('El cluster requiere versión 6..10');
const folder=readdirSync(new URL('../',import.meta.url)).find(x=>x.startsWith('v'+String(n).padStart(2,'0')+'-'));
const children=[];
for(const [file,port,id] of [['server.js',3001,'replica-a'],['server.js',3002,'replica-b'],['balancer.js',3000,'proxy']]){
 children.push(spawn(process.execPath,[fileURLToPath(new URL('../'+folder+'/'+file,import.meta.url))],{stdio:'inherit',env:{...process.env,PORT:String(port),INSTANCE_ID:id}}));
}
function stop(){for(const c of children)c.kill();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
for(const c of children)c.on('exit',code=>{if(code)stop();});

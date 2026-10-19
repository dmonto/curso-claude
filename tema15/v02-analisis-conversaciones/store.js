import {mkdirSync,existsSync,readFileSync,appendFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
// Almacén didáctico, un único proceso escritor. No es una base de datos multiproceso.
export function createStore(directory,retentionDays=7){
 mkdirSync(directory,{recursive:true});const file=join(directory,'events.jsonl');
 const read=()=>{if(!existsSync(file))return [];return readFileSync(file,'utf8').split('\n').filter(Boolean).map((line,i)=>{try{return JSON.parse(line);}catch{throw Error('JSONL corrupto en línea '+(i+1));}});};
 const prune=()=>{const cutoff=Date.now()-retentionDays*86400000;const before=read(),after=before.filter(e=>Date.parse(e.timestamp)>=cutoff);if(after.length!==before.length){writeFileSync(file+'.tmp',after.map(x=>JSON.stringify(x)).join('\n')+(after.length?'\n':''));renameSync(file+'.tmp',file);}return before.length-after.length;};
 prune();
 return {read,prune,append(event){appendFileSync(file,JSON.stringify(event)+'\n');},report(name,value){if(!/^[a-z0-9-]+$/.test(name))throw Error('Nombre de informe inválido');mkdirSync(join(directory,'reports'),{recursive:true});writeFileSync(join(directory,'reports',name+'.json'),JSON.stringify(value,null,2));}};
}
export function redact(text){return String(text).replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[EMAIL]').replace(/\b(?:sk-ant-|Bearer\s+)[\w-]+/gi,'[SECRET]').replace(/\b[A-Z]{2}\d{2}[A-Z0-9 ]{10,30}\b/g,'[BANK]').slice(0,1000);}

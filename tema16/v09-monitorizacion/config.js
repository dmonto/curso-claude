import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const dir=dirname(fileURLToPath(import.meta.url));
// Una copia local permite ejecutar esta carpeta fuera del ZIP.
for(const p of [join(dir,'.env'),join(dir,'..','.env')])if(existsSync(p)){process.loadEnvFile(p);break;}
export const version=JSON.parse(readFileSync(join(dir,'version.json'),'utf8'));
function num(k,d,min=0){const n=Number(process.env[k]??d);if(!Number.isFinite(n)||n<min)throw Error('Configuración inválida: '+k);return n;}
export const cfg={mode:process.env.MODEL_MODE||'mock',model:process.env.CLAUDE_MODEL||'claude-sonnet-4-6',effort:process.env.CLAUDE_EFFORT||'low',key:process.env.COURSE_ANTHROPIC_API_KEY||process.env.ANTHROPIC_API_KEY,port:num('PORT',3000),host:process.env.HOST||'127.0.0.1',concurrency:num('MAX_CONCURRENT',2,1),queue:num('MAX_QUEUE',8),queueTimeout:num('QUEUE_TIMEOUT_MS',5000,1),timeout:num('MODEL_TIMEOUT_MS',30000,1),delay:num('MOCK_DELAY_MS',250),ttl:num('CACHE_TTL_MS',30000),cacheSize:num('CACHE_MAX_ENTRIES',100,1),inputChars:num('MAX_INPUT_CHARS',6000,1),output:num('MAX_OUTPUT_TOKENS',1024,1),inputPrice:num('INPUT_USD_PER_MTOK',3),outputPrice:num('OUTPUT_USD_PER_MTOK',15),budget:num('REQUEST_BUDGET_USD',0.05)};
if(!['mock','claude'].includes(cfg.mode)||!['low','medium','high'].includes(cfg.effort))throw Error('Modo o effort inválido');
if(cfg.mode==='claude'&&!cfg.key)throw Error('Falta COURSE_ANTHROPIC_API_KEY');
export const instance=process.env.INSTANCE_ID||'node-'+process.pid;

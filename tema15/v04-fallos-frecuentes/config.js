import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
export const dir=dirname(fileURLToPath(import.meta.url));
// Las variables del proceso prevalecen; .env local prevalece sobre el común.
for(const path of [join(dir,'.env'),join(dir,'..','.env')])if(existsSync(path))process.loadEnvFile(path);
export const version=JSON.parse(readFileSync(join(dir,'version.json'),'utf8'));
export function config(env=process.env){
 const number=(key,fallback,min,max)=>{const n=Number(env[key]??fallback);if(!Number.isFinite(n)||n<min||n>max)throw Error('Configuración inválida: '+key);return n;};
 const mode=env.MODEL_MODE||'mock',effort=env.CLAUDE_EFFORT||'medium',prompt=env.PROMPT_VERSION||'improved';
 if(!['mock','claude'].includes(mode)||!['low','medium','high'].includes(effort)||!['baseline','improved'].includes(prompt))throw Error('Revisa MODEL_MODE, CLAUDE_EFFORT y PROMPT_VERSION');
 return {mode,effort,prompt,model:env.CLAUDE_MODEL||'claude-sonnet-4-6',key:env.COURSE_ANTHROPIC_API_KEY||env.ANTHROPIC_API_KEY||'',timeout:number('MODEL_TIMEOUT_MS',45000,100,120000),logContent:env.LOG_CONTENT==='true',retentionDays:number('RETENTION_DAYS',7,1,365),sloP95:number('SLO_P95_MS',5000,1,120000),sloError:number('SLO_ERROR_RATE',.05,0,1),minSamples:number('MIN_SAMPLES',20,1,10000)};
}

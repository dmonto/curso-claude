import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const version=JSON.parse(readFileSync(new URL('./version.json',import.meta.url)));
export const tickets=JSON.parse(readFileSync(new URL('./data/tickets.json',import.meta.url)));
export const prompts=JSON.parse(readFileSync(new URL('./prompts/registry.json',import.meta.url)));
export function configuration(env=process.env) {
 const mode=env.MODEL_MODE||'mock', promptId=version.stage>=8?(env.PROMPT_VERSION||'p1'):'p1';
 if(!['mock','claude'].includes(mode))throw Error('MODEL_MODE inválido');
 if(!prompts[promptId])throw Error('PROMPT_VERSION desconocida');
 const effort=env.CLAUDE_EFFORT||'medium';
 if(!['low','medium','high'].includes(effort))throw Error('CLAUDE_EFFORT inválido');
 if(mode==='claude'&&version.stage>=2&&!env.COURSE_ANTHROPIC_API_KEY)throw Error('Falta COURSE_ANTHROPIC_API_KEY');
 const publicConfig={version:version.id,promptId,model:env.CLAUDE_MODEL||'claude-sonnet-4-6',effort,mode:version.stage<2?'mock':mode,nextStep:version.stage>=7&&env.FEATURE_NEXT_STEP==='true'};
 return {...publicConfig,fingerprint:createHash('sha256').update(JSON.stringify({...publicConfig,prompt:prompts[promptId]})).digest('hex').slice(0,16),maintenance:version.stage>=10&&env.MAINTENANCE_MODE==='true'};
}
export function answer(input,config) {
 if(!input||typeof input.message!=='string'||!input.message.trim()||input.message.length>2000)throw Object.assign(Error('Mensaje obligatorio de 1 a 2000 caracteres'),{status:400});
 const q=input.message.toUpperCase();
 const id=q.match(/TCK-\d+/)?.[0];
 const selected=id?tickets.filter(t=>t.id===id):tickets.filter(t=>t.status==='open');
 const text=id&&!selected.length?'No se encuentra ese ticket.':selected.map(t=>`${t.id}: ${t.service}, ${t.severity}, ${t.status}. ${t.summary}`).join('\n');
 const result={text,tickets:selected,scope:'Datos ficticios. Solo consulta; no modifica tickets.',promptId:config.promptId};
 if(config.nextStep)result.nextStep=selected.some(t=>t.severity==='critical')?'Revisar el ticket crítico con el equipo de soporte.':'Verificar los datos antes de escalar.';
 return result;
}
export function evaluate(config) {
 // Evalúa el contrato y las reglas locales, no la calidad semántica de Claude.
 const cases=[{message:'Resume TCK-1001',ids:['TCK-1001']},{message:'Resume TCK-9999',ids:[]},{message:'Tickets abiertos',ids:['TCK-1001','TCK-1002']}];
 const results=cases.map(c=>{const actual=answer(c,config).tickets.map(t=>t.id);return {...c,actual,passed:JSON.stringify(actual)===JSON.stringify(c.ids)};});
 return {kind:'deterministic-contract',promptId:config.promptId,passed:results.every(r=>r.passed),results};
}

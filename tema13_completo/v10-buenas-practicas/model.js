import { config } from './config.js';
import { systemPrompt } from './prompt-injection-guard.js';
export function buildModelRequest(message,context) {
  return {model:config.model,max_tokens:config.maxTokens,output_config:{effort:config.effort},system:systemPrompt,messages:[{role:'user',content:JSON.stringify({question:message,tickets:context})}]};
}
export async function askModel(message,context) {
  if(config.mode==='mock') return {text:'[SIMULADO] Tickets visibles:\n'+context.map(t=>`${t.id}: ${t.title} (${t.status})`).join('\n'),usage:{input_tokens:0,output_tokens:0}};
  const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':config.key,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify(buildModelRequest(message,context)),signal:AbortSignal.timeout(45000)});
  if(!response.ok) throw new Error('MODEL_HTTP_'+response.status);
  const data=await response.json();
  if(data.stop_reason==='max_tokens' || data.stop_reason==='refusal') throw new Error('MODEL_INCOMPLETE');
  return {text:(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n'),usage:data.usage || {}};
}

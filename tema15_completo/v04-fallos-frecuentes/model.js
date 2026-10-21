import {prompts} from './domain.js';
export class ModelError extends Error {constructor(code,usage=null){super(code);this.code=code;this.usage=usage;}}
export async function generate(body,facts,cfg,fetchImpl=fetch){
 if(facts.skipModel)return {answer:facts.answer,usage:null,stop_reason:'not_called',model:'none'};
 if(cfg.mode==='mock')return {answer:facts.answer,usage:null,stop_reason:'mock',model:'mock-local'};
 if(!cfg.key)throw new ModelError('model_configuration');
 let response;
 try{response=await fetchImpl('https://api.anthropic.com/v1/messages',{method:'POST',signal:AbortSignal.timeout(cfg.timeout),headers:{'content-type':'application/json','x-api-key':cfg.key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:cfg.model,max_tokens:2048,thinking:{type:'adaptive'},output_config:{effort:cfg.effort},system:prompts[cfg.prompt],messages:[{role:'user',content:JSON.stringify({question:body.message,context:facts.context})}]})});}
 catch(e){throw new ModelError(['TimeoutError','AbortError'].includes(e.name)?'model_timeout':'model_network');}
 if(!response.ok)throw new ModelError(response.status===429?'model_rate_limit':response.status===401?'model_auth':'model_http_'+response.status);
 let data;try{data=await response.json();}catch{throw new ModelError('model_invalid_json');}
 if(data.stop_reason!=='end_turn')throw new ModelError('model_incomplete',data.usage);
 const answer=(data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
 if(!answer.trim())throw new ModelError('model_empty',data.usage);
 return {answer,usage:data.usage,stop_reason:data.stop_reason,model:data.model||cfg.model,provider_request_id:response.headers.get('request-id')};
}

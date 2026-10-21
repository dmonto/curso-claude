import {prompts} from './engine.js';
export async function enrich(result,config,env=process.env,fetcher=fetch) {
 if(config.mode!=='claude')return {...result,provider:'mock'};
 const response=await fetcher('https://api.anthropic.com/v1/messages',{
 method:'POST',signal:AbortSignal.timeout(45000),headers:{'content-type':'application/json','x-api-key':env.COURSE_ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
 body:JSON.stringify({model:config.model,max_tokens:2048,thinking:{type:'adaptive'},output_config:{effort:config.effort},system:prompts[config.promptId].text,messages:[{role:'user',content:JSON.stringify({facts:result.tickets})}]})});
 if(!response.ok)throw Error('MODEL_UNAVAILABLE');
 const data=await response.json();
 if(data.stop_reason!=='end_turn')throw Error('MODEL_INCOMPLETE');
 const comment=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n');
 if(!comment)throw Error('MODEL_EMPTY');
 return {...result,provider:'claude',modelComment:comment,usage:data.usage};
}

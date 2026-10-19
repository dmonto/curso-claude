import {writeFileSync,existsSync} from 'node:fs';
import {configuration,answer,evaluate} from './engine.js';
import {enrich} from './model.js';
const local=new URL('./.env',import.meta.url);if(existsSync(local))process.loadEnvFile(local);
const live=process.argv.includes('--live');
const base=configuration({...process.env,MODEL_MODE:live?'claude':'mock'}),results=[];
for(const promptId of ['p1','p2'])for(const message of ['Resume TCK-1001','Resume TCK-1002','Resume TCK-9999']){
 const config={...base,promptId};
 try{const result=await enrich(answer({message},config),config);results.push({promptId,message,provider:result.provider,facts:result.tickets,modelComment:result.modelComment||null,usage:result.usage||null,contract:evaluate(config).passed,humanReview:{faithful:null,clear:null,noInventedActions:null}});}
 catch(e){results.push({promptId,message,error:e.message});}
}
writeFileSync(new URL('./comparison.json',import.meta.url),JSON.stringify({live,qualityApproved:false,results},null,2));
console.log(JSON.stringify({file:'comparison.json',live,errors:results.filter(r=>r.error).length,qualityApproved:false},null,2));
if(results.some(r=>r.error))process.exitCode=1;

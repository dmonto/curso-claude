export class LabError extends Error{constructor(code,status=503){super(code);this.status=status;}}
export class Gate{
 active=0;waiting=[];
 constructor(limit,maxQueue,timeout){Object.assign(this,{limit,maxQueue,timeout});}
 async enter(){
  if(this.active<this.limit){this.active++;return;}
  if(this.waiting.length>=this.maxQueue)throw new LabError('QUEUE_FULL',429);
  await new Promise((resolve,reject)=>{
   const item={resolve,timer:null};item.timer=setTimeout(()=>{this.waiting=this.waiting.filter(x=>x!==item);reject(new LabError('QUEUE_TIMEOUT'));},this.timeout);this.waiting.push(item);
  });
 }
 leave(){const next=this.waiting.shift();if(next){clearTimeout(next.timer);next.resolve();}else this.active--;}
}
export class Cache{
 data=new Map();
 constructor(ttl,max){Object.assign(this,{ttl,max});}
 get(key){const x=this.data.get(key);if(!x)return;if(x.expires<=Date.now()){this.data.delete(key);return;}return structuredClone(x.value);}
 set(key,value){if(this.data.size>=this.max)this.data.delete(this.data.keys().next().value);this.data.set(key,{expires:Date.now()+this.ttl,value:structuredClone(value)});}
}
export class Metrics{
 requests=0;errors=0;hits=0;inputTokens=0;outputTokens=0;estimatedUsd=0;durations=[];
 record(ms,error){this.requests++;if(error)this.errors++;this.durations.push(ms);if(this.durations.length>1000)this.durations.shift();}
 snapshot(){const s=[...this.durations].sort((a,b)=>a-b);const p=q=>s[Math.max(0,Math.ceil(s.length*q)-1)]||0;return {requests:this.requests,errors:this.errors,cacheHits:this.hits,inputTokens:this.inputTokens,outputTokens:this.outputTokens,estimatedUsd:this.estimatedUsd,latency:{window:s.length,p50:p(.5),p95:p(.95),p99:p(.99)}};}
}

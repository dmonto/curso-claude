const string=(x,min,max)=>typeof x==='string' && x.trim().length>=min && x.length<=max;
export function validate(body,kind) {
  if (!body || typeof body!=='object' || Array.isArray(body)) return false;
  const keys=kind==='login'?['email','password']:kind==='assistant'?['message','conversationId']:['action','ticketId','confirmation','note'];
  if(Object.keys(body).some(k=>!keys.includes(k))) return false;
  if(kind==='login') return string(body.email,3,150) && string(body.password,1,128);
  if(kind==='assistant') return string(body.message,1,2000) && (body.conversationId===undefined || (typeof body.conversationId==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(body.conversationId)));
  if(!['close_ticket','add_private_note'].includes(body.action) || !/^TCK-\d{4}$/.test(body.ticketId)) return false;
  if(body.action==='close_ticket') return body.note===undefined && (body.confirmation===undefined || string(body.confirmation,1,80));
  return body.confirmation===undefined && string(body.note,1,1000);
}
export function validOutput(text) { return typeof text==='string' && text.length>0 && text.length<=30000; }

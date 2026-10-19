import { Component,signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
type Ticket={id:string;title:string;description:string;status:string};
type User={email:string;role:string;tenantId:string};
@Component({selector:'app-root',standalone:true,imports:[FormsModule],templateUrl:'./app.component.html'})
export class AppComponent {
  baseUrl='http://127.0.0.1:3000';email='admin@empresa.com';password='Password123!';message='Resume los tickets visibles';
  confirmation='';ticketId='TCK-1002';note='Incidencia revisada por soporte.';
  token='';user=signal<User|null>(null);tickets=signal<Ticket[]>([]);answer=signal('');result=signal('');error=signal('');busy=signal(false);
  version=signal('');caps=signal<Record<string,boolean>>({});
  async request(path:string,body?:unknown) {
    const r=await fetch(this.baseUrl+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(this.token?{Authorization:'Bearer '+this.token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await r.json();if(!r.ok) throw new Error(`HTTP ${r.status}: ${data.error}${data.requiredConfirmation?' · '+data.requiredConfirmation:''} · petición ${data.requestId}`);return data;
  }
  async run(work:()=>Promise<void>) {this.busy.set(true);this.error.set('');try{await work();}catch(e){this.error.set(String(e));}finally{this.busy.set(false);}}
  login() {this.run(async()=>{this.token='';this.user.set(null);this.tickets.set([]);this.answer.set('');this.result.set('');const health=await this.request('/health');this.version.set(health.version.directory+' · '+health.modelMode);this.caps.set(health.capabilities);const r=await this.request('/auth/login',{email:this.email,password:this.password});this.token=r.accessToken;this.user.set(r.user);this.tickets.set((await this.request('/tickets')).tickets);});}
  logout() {this.token='';this.user.set(null);this.answer.set('');this.result.set('');this.tickets.set([]);}
  refresh() {this.run(async()=>{this.tickets.set((await this.request('/tickets')).tickets);});}
  chat() {this.run(async()=>{const r=await this.request('/assistant',{message:this.message});this.answer.set(r.answer);this.result.set(JSON.stringify({requestId:r.requestId,ticketIds:r.ticketIds,modelMode:r.modelMode},null,2));});}
  action(action:string) {this.run(async()=>{const body=action==='close_ticket'?{action,ticketId:this.ticketId,confirmation:this.confirmation || undefined}:{action,ticketId:this.ticketId,note:this.note};this.result.set(JSON.stringify(await this.request('/assistant/action',body),null,2));this.tickets.set((await this.request('/tickets')).tickets);this.confirmation='';});}
  report(path:string) {this.run(async()=>{this.result.set(JSON.stringify(await this.request(path),null,2));});}
  privacy() {this.run(async()=>{this.result.set(JSON.stringify(await this.request('/privacy/me/delete-request',{}),null,2));});}
}

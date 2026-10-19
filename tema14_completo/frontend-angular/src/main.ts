import {Component,signal} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';
import {FormsModule} from '@angular/forms';
interface Action {id:string;label:string;intent:string;payload:Record<string,unknown>}
interface Message {clarity?:{summary:string;nextStep:string};id:string;role:string;type:string;text:string;actions?:Action[];cards?:{id:string;title:string;subtitle:string;description:string}[];modelComment?:string;explanation?:{sources:string[];limitations:string[]};task?:{kind:string;step:number;status:string};receipt?:{id:string};}
interface Request {conversationId:string;requestId:string;message:string;actionIntent?:string;actionPayload?:Record<string,unknown>}
@Component({selector:'app-root',standalone:true,imports:[FormsModule],template:`
<main><header><p>CURSO CLAUDE / TEMA 14</p><h3>Asistente de soporte</h3><p>Consulta tickets, prepara informes y revisa notas antes de guardarlas.</p></header>
<section class="toolbar"><label>Backend <input [(ngModel)]="url" [disabled]="busy()" /></label><button (click)="connect()" [disabled]="busy()">Conectar</button><button (click)="fresh()" [disabled]="busy()">Nueva conversación</button><span>{{version()}} · {{mode()}}</span></section>
<p class="notice">Laboratorio local con datos ficticios. Reiniciar el backend elimina sesiones, notas y métricas.</p>
@if(error()){<section role="alert" class="error">{{error()}} <button (click)="retry()" [disabled]="busy()">Reintentar solicitud</button></section>}
<section role="log" aria-label="Conversación" aria-live="polite" [attr.aria-busy]="busy()">
@for(m of messages();track m.id){<article [class.user]="m.role==='user'" [class.error]="m.type==='error'"><strong>{{m.role==='user'?'Tú':'Asistente'}}</strong><p class="text">{{m.text}}</p>
@if(m.clarity){<p><strong>Siguiente paso:</strong> {{m.clarity.nextStep}}</p>}
@if(m.task){<p>Proceso: {{m.task.kind}} · Paso {{m.task.step+1}} · {{m.task.status}}</p>}
@for(c of m.cards??[];track c.id){<section class="card"><strong>{{c.title}} · {{c.subtitle}}</strong><p>{{c.description}}</p></section>}
@if(m.modelComment){<details><summary>Redacción de Claude</summary><p>{{m.modelComment}}</p></details>}
@if(m.explanation){<details><summary>Datos y límites de esta respuesta</summary>@for(s of m.explanation.sources;track s){<p>{{s}}</p>}@for(s of m.explanation.limitations;track s){<p>{{s}}</p>}</details>}
<div class="actions">@for(a of m.actions??[];track a.id){<button (click)="act(a)" [disabled]="busy() || m.id!==latest()">{{a.label}}</button>}</div>
@if(level()>=9 && m.role==='assistant' && m.type!=='error'){<button (click)="rate(m.id)" [disabled]="busy()">Valorar: útil (5/5)</button>}
</article>}
</section>
@if(busy()){<p role="status">Procesando solicitud…</p>}
<form (ngSubmit)="send()"><label for="message">Tu petición</label><div class="compose"><input id="message" name="message" [(ngModel)]="input" maxlength="4000" placeholder="Muéstrame tickets críticos" [disabled]="busy()"/><button [disabled]="busy()||!input.trim()">Enviar</button></div></form>
@if(level()>=5){<button (click)="act({id:'metrics',label:'Probar error de métricas',intent:'load_metrics',payload:{}})" [disabled]="busy()">Probar recuperación de error</button>}
@if(level()>=6){<button (click)="act({id:'explain',label:'Recomendar prioridad',intent:'recommend_priority',payload:{}})" [disabled]="busy()">Recomendar prioridad</button>}
@if(level()>=9){<button (click)="metrics()" [disabled]="busy()">Ver métricas UX</button><pre>{{stats()}}</pre>}
</main>`})
class App {
 url='http://127.0.0.1:3000';input='';conversationId=crypto.randomUUID();messages=signal<Message[]>([]);busy=signal(false);error=signal('');version=signal('Sin conexión');mode=signal('');level=signal(0);latest=signal('');stats=signal('');last:Request|undefined;
 async connect(){if(this.busy())return;this.busy.set(true);this.error.set('');try{const r=await fetch(this.url+'/health',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const h=await r.json();this.version.set(h.version.id);this.level.set(h.version.level);this.mode.set(h.mode);this.messages.set([]);this.conversationId=crypto.randomUUID();}catch{this.error.set('No se pudo conectar. Comprueba la URL y el backend.');}finally{this.busy.set(false);}if(this.level()>0&&!this.error())await this.ask('Ayuda','show_help');}
 fresh(){this.messages.set([]);this.conversationId=crypto.randomUUID();this.last=undefined;void this.ask('Ayuda','show_help');}
 send(){const text=this.input.trim();if(!text||this.busy())return;this.input='';void this.ask(text);}
 act(a:Action){void this.ask(a.label,a.intent,a.payload);}
 rate(messageId:string){void this.ask('Valorar respuesta','feedback',{messageId,rating:5});}
 async ask(message:string,actionIntent?:string,actionPayload?:Record<string,unknown>){if(this.busy())return;const b={conversationId:this.conversationId,requestId:crypto.randomUUID(),message,actionIntent,actionPayload};this.last=b;this.messages.update(ms=>[...ms,{id:crypto.randomUUID(),role:'user',type:'text',text:message}]);await this.run(b);}
 async run(b:Request){this.busy.set(true);this.error.set('');try{const r=await fetch(this.url+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b),signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();this.messages.update(ms=>ms.some(m=>m.id===data.message.id)?ms:[...ms,data.message]);this.latest.set(data.message.id);if(data.modelWarning)this.error.set(data.modelWarning);}catch{this.error.set('No se ha recibido el resultado. Reintenta con el mismo identificador para evitar repetir una escritura.');}finally{this.busy.set(false);}}
 retry(){if(this.last&&!this.busy())void this.run(this.last);else void this.connect();}
 async metrics(){try{const r=await fetch(this.url+'/api/ux/summary');if(!r.ok)throw Error();this.stats.set(JSON.stringify(await r.json(),null,2));}catch{this.error.set('No se pudieron consultar las métricas.');}}
}
bootstrapApplication(App).catch(console.error);

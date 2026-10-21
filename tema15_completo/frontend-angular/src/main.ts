import {Component,signal} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';
import {FormsModule} from '@angular/forms';
import {JsonPipe} from '@angular/common';
interface Reply {answer?:string;event_id?:string;trace_id?:string;outcome?:string;error?:string;mode?:string}
interface Panel {title:string;level:number;path:string;method:'GET'|'POST'}
@Component({selector:'app-root',standalone:true,imports:[FormsModule,JsonPipe],template:`
<main>
 <header><p class="eyebrow">CURSO CLAUDE · TEMA 15</p><h1>Observabilidad del asistente</h1><p>Consulta, mide y compara respuestas con datos ficticios de soporte.</p></header>
 <section class="connection"><label>Backend<input [(ngModel)]="base" [disabled]="busy()" /></label><button (click)="connect()" [disabled]="busy()">Conectar</button><span>{{version()}} · {{mode()}}</span></section>
 <p class="notice">Modo mock: sin llamadas ni tokens reales. En modo Claude, evaluar y comparar consume API. Los registros se guardan en el backend de cada versión.</p>
 @if(error()){<p class="error" role="alert">{{error()}}</p>}
 <div class="grid"><section class="card">
 <h2>Consulta de soporte</h2>
 <form (ngSubmit)="send()">
 <label>Tarea<select name="task" [(ngModel)]="task" (ngModelChange)="selectTask()"><option value="order_status">Estado de pedido</option><option value="invoice_help">Explicar factura</option><option value="profile_update">Cambio de perfil</option><option value="restricted_data">Comprobar permisos</option><option value="general_help">Ayuda general</option></select></label>
 <label>Identificador<input name="entity" [(ngModel)]="entity" placeholder="12345 o F-2026-003"/></label>
 <label>Mensaje<textarea name="message" [(ngModel)]="message" maxlength="4000" rows="3"></textarea></label>
 @if(mode()==='mock'){<label>Simulación<select name="simulation" [(ngModel)]="simulation"><option value="">Normal</option><option value="slow">Herramienta lenta</option><option value="timeout">Error de timeout</option><option value="tool_error">Error de herramienta</option></select></label>}
 <div class="actions"><button [disabled]="busy()||level()===0||!message.trim()">Enviar</button><button type="button" class="secondary" (click)="newSession()" [disabled]="busy()">Nueva sesión</button></div>
 </form>
 @if(reply();as r){<article aria-live="polite"><h3>Respuesta</h3><p class="answer">{{r.answer || r.error}}</p><p>Resultado: {{r.outcome || 'error'}}</p><small>Traza: {{r.trace_id}}</small>
 @if(level()>=7 && r.answer){<label>Motivo<select [(ngModel)]="reason"><option value="useful">Útil</option><option value="missing_information">Falta información</option><option value="incorrect">Incorrecta</option><option value="slow">Lenta</option><option value="other">Otro</option></select></label><div class="actions"><button (click)="feedback('positive')" [disabled]="busy()||rated()">Útil</button><button class="secondary" (click)="feedback('negative')" [disabled]="busy()||rated()">No útil</button></div>}
 </article>}
 </section>
 <section class="card"><h2>Panel de análisis</h2><p>Las opciones se activan según la versión conectada.</p><div class="panels">@for(p of panels;track p.path){<button class="secondary" [disabled]="busy()||level()<p.level" (click)="runPanel(p)"><span>{{p.title}}</span><small>v{{p.level.toString().padStart(2,'0')}}</small></button>}</div>
 @if(summary();as s){<div class="kpis"><div><strong>{{s.total_requests}}</strong><span>Peticiones</span></div><div><strong>{{s.failed_requests}}</strong><span>Errores</span></div><div><strong>{{s.blocked_requests}}</strong><span>Bloqueos</span></div></div>}
 <h3>{{panelTitle()}}</h3><pre aria-live="polite">{{result() | json}}</pre></section></div>
 @if(busy()){<p role="status">Procesando…</p>}
</main>`})
class App {
 base='http://127.0.0.1:3000';task='order_status';entity='12345';message='¿Dónde está mi pedido?';simulation='';reason='useful';session=crypto.randomUUID();
 busy=signal(false);error=signal('');version=signal('Sin conexión');mode=signal('');level=signal(0);reply=signal<Reply|null>(null);rated=signal(false);result=signal<unknown>(null);panelTitle=signal('Resultado');summary=signal<{total_requests:number;failed_requests:number;blocked_requests:number}|null>(null);
 panels:Panel[]=[{title:'Métricas de uso',level:1,path:'/metrics/assistant-summary',method:'GET'},{title:'Conversaciones',level:2,path:'/analysis/conversations',method:'GET'},{title:'Ejecutar evaluación (5 casos)',level:3,path:'/evaluation/run',method:'POST'},{title:'Fallos frecuentes',level:4,path:'/analysis/failures',method:'GET'},{title:'Rendimiento',level:5,path:'/metrics/performance',method:'GET'},{title:'Guardar snapshot',level:6,path:'/improvement/snapshot',method:'POST'},{title:'Feedback',level:7,path:'/feedback/summary',method:'GET'},{title:'Comparar prompts (10 casos)',level:8,path:'/prompts/compare',method:'POST'},{title:'Trazas y spans',level:9,path:'/observability/summary',method:'GET'},{title:'Salud de monitorización',level:10,path:'/monitoring/health',method:'GET'}];
 async request(path:string,method='GET',body?:unknown):Promise<any>{const response=await fetch(this.base.replace(/\/$/,'')+path,{method,headers:method==='POST'?{'Content-Type':'application/json'}:{},body:method==='POST'?JSON.stringify(body||{}):undefined,signal:AbortSignal.timeout(600000)});const data=await response.json();if(!response.ok){if(data.trace_id)this.reply.set(data);throw Error(data.error||'HTTP '+response.status);}return data;}
 async action(fn:()=>Promise<void>){if(this.busy())return;this.busy.set(true);this.error.set('');try{await fn();}catch(e){this.error.set(e instanceof Error?e.message:'Error de conexión');}finally{this.busy.set(false);}}
 async connect(){await this.action(async()=>{this.level.set(0);this.reply.set(null);this.result.set(null);this.summary.set(null);const h=await this.request('/health');this.version.set(h.version.id+' · '+h.version.title);this.level.set(h.version.level);this.mode.set(h.mode);this.newSession();});}
 newSession(){this.session=crypto.randomUUID();this.reply.set(null);this.rated.set(false);}
 selectTask(){this.entity=this.task==='invoice_help'?'F-2026-003':this.task==='order_status'?'12345':'';this.message='Explica los datos disponibles';}
 async send(){await this.action(async()=>{this.reply.set(null);this.rated.set(false);const b={session_id:this.session,message:this.message,task_type:this.task,entity_id:this.entity,...(this.mode()==='mock'&&this.simulation?{simulate:this.simulation}:{})};this.reply.set(await this.request('/api/assistant/message','POST',b));this.summary.set(await this.request('/metrics/assistant-summary'));});}
 async feedback(rating:string){await this.action(async()=>{const value=await this.request('/api/assistant/feedback','POST',{event_id:this.reply()?.event_id,rating,reason:this.reason});this.rated.set(true);this.panelTitle.set('Feedback guardado');this.result.set(value);});}
 async runPanel(p:Panel){await this.action(async()=>{this.panelTitle.set(p.title);const data=await this.request(p.path,p.method);this.result.set(data);if(p.level===1)this.summary.set(data);});}
}
bootstrapApplication(App).catch(console.error);

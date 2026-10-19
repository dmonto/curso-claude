import {Component,signal} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';
import {FormsModule} from '@angular/forms';
import {JsonPipe} from '@angular/common';
interface Config {version:string;title:string;stage:number;mode:string;promptId:string;fingerprint:string;nextStep:boolean;maintenance:boolean}
interface Reply {text:string;modelComment?:string;warning?:string;provider:string;responseId:string;nextStep?:string}
@Component({selector:'app-root',standalone:true,imports:[FormsModule,JsonPipe],template:`
<main><header><small>CURSO CLAUDE / TEMA 17</small><h3>Ciclo de vida del asistente</h3><p>Consulta, comprueba una versión y revisa su comportamiento.</p></header>
<section><label>URL del backend <input [(ngModel)]="base" name="base"></label><button (click)="connect()" [disabled]="busy()">Conectar</button>
@if(config(); as c){<p>{{c.version}} · {{c.title}} · {{c.mode}} · prompt {{c.promptId}}</p><small>Release {{c.fingerprint}} · siguiente paso: {{c.nextStep}} · mantenimiento: {{c.maintenance}}</small>}</section>
<section><label>Consulta de soporte<textarea [(ngModel)]="message" name="message" maxlength="2000"></textarea></label><button (click)="ask()" [disabled]="busy() || !config()">Consultar</button><button (click)="message='Tickets abiertos'">Tickets abiertos</button>
@if(busy()){<p role="status">Procesando…</p>}
@if(error()){<p role="alert" class="error">{{error()}}</p>}
@if(reply(); as r){<article><small>{{r.provider}}</small><p class="answer">{{r.text}}</p>@if(r.modelComment){<h4>Redacción de Claude</h4><p>{{r.modelComment}}</p>}@if(r.warning){<p class="error">{{r.warning}}</p>}@if(r.nextStep){<p>{{r.nextStep}}</p>}
@if((config()?.stage || 0)>=6){<button (click)="rate(1)" [disabled]="busy()">Útil</button><button (click)="rate(-1)" [disabled]="busy()">Necesita mejora</button>}</article>}</section>
<section><h4>Validación y operación</h4><button (click)="inspect('/ready')" [disabled]="busy()">Readiness</button>
@if((config()?.stage || 0)>=3){<button (click)="inspect('/api/evaluate', {})" [disabled]="busy()">Evaluar contrato</button>}
@if((config()?.stage || 0)>=5){<button (click)="inspect('/api/metrics')" [disabled]="busy()">Métricas</button>}
@if((config()?.stage || 0)>=8){<button (click)="inspect('/api/prompts')" [disabled]="busy()">Prompts</button>}
<pre aria-live="polite">{{detail() | json}}</pre></section><footer>Datos ficticios. Las consultas no modifican tickets. La configuración se cambia en el .env del backend y requiere reinicio.</footer></main>`})
class App {
 base='http://127.0.0.1:3000';message='Resume TCK-1001';
 config=signal<Config|null>(null);reply=signal<Reply|null>(null);detail=signal<unknown>(null);busy=signal(false);error=signal('');
 async request(path:string,body?:unknown){const r=await fetch(this.base.replace(/\/$/,'')+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});const d=await r.json();if(!r.ok)throw Error(d.message||d.error||'HTTP '+r.status);return d;}
 async run(task:()=>Promise<void>){if(this.busy())return;this.busy.set(true);this.error.set('');try{await task();}catch(e){this.error.set(e instanceof Error?e.message:'No se pudo completar la solicitud');}finally{this.busy.set(false);}}
 connect(){this.config.set(null);this.reply.set(null);this.detail.set(null);return this.run(async()=>this.config.set(await this.request('/api/config')));}
 ask(){return this.run(async()=>this.reply.set(await this.request('/api/assistant',{message:this.message})));}
 inspect(path:string,body?:unknown){return this.run(async()=>this.detail.set(await this.request(path,body)));}
 rate(rating:number){return this.inspect('/api/feedback',{responseId:this.reply()?.responseId,rating});}
}
bootstrapApplication(App).catch(console.error);

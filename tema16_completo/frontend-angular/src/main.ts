import {Component,signal} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';
import {FormsModule} from '@angular/forms';
@Component({selector:'app-root',standalone:true,imports:[FormsModule],template:`
<main><header><p>CURSO CLAUDE / TEMA 16</p><h3>Laboratorio de rendimiento</h3><p>Soporte empresarial · datos ficticios · {{version()}}</p></header>
<section><label>URL del backend<input [(ngModel)]="url" [disabled]="busy()"></label><button (click)="connect()" [disabled]="busy()">Conectar</button><p>{{health()}}</p></section>
<section><label>Petición<textarea [(ngModel)]="message" maxlength="6000" [disabled]="busy()"></textarea></label><button (click)="send()" [disabled]="busy()">{{busy()?'Procesando…':'Enviar consulta'}}</button><p>Repite el mismo mensaje desde v04 para observar un acierto de caché.</p></section>
@if(error()){<p role="alert" class="error">{{error()}}</p>}
<section aria-live="polite"><h3>Respuesta</h3><p class="answer">{{answer()}}</p><pre>{{detail()}}</pre></section>
<section><h3>Métricas de la instancia</h3><button (click)="metrics()" [disabled]="busy()">Actualizar métricas</button><pre>{{stats()}}</pre><p>Con balanceo, cada lectura puede proceder de una réplica distinta. Los contadores son locales.</p></section>
<footer>Inicia las pruebas concurrentes desde powershell/Prueba-Carga.ps1. El modo Claude consume API.</footer></main>`})
class App{
 url='http://127.0.0.1:3000';message='Resume los tickets críticos y propone el siguiente paso';
 busy=signal(false);error=signal('');version=signal('Sin conexión');health=signal('');answer=signal('');detail=signal('');stats=signal('');
 async read(path:string,init:RequestInit={}){const r=await fetch(this.url.replace(/\/$/,'')+path,{...init,signal:AbortSignal.timeout(60000)});const d=await r.json();if(!r.ok)throw Error('HTTP '+r.status+' · '+(d.error||'Error'));return d;}
 async connect(){this.busy.set(true);this.error.set('');try{const h=await this.read('/health');this.version.set(h.version.id);this.health.set(h.mode+' · '+h.instance);}catch(e){this.error.set(String(e));}finally{this.busy.set(false);}}
 async send(){if(this.busy()||!this.message.trim())return;this.busy.set(true);this.error.set('');try{const d=await this.read('/api/assistant/message',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:this.message})});this.answer.set(d.message.text);this.detail.set(JSON.stringify({instance:d.instance,mode:d.mode,cacheHit:d.cacheHit,durationMs:d.durationMs,queueMs:d.queueMs,usage:d.usage,estimatedUsd:d.estimatedUsd,truncated:d.truncated},null,2));this.version.set(d.version);}catch(e){this.error.set(String(e));}finally{this.busy.set(false);}}
 async metrics(){this.busy.set(true);this.error.set('');try{this.stats.set(JSON.stringify(await this.read('/api/metrics'),null,2));}catch(e){this.error.set(String(e));}finally{this.busy.set(false);}}
}
bootstrapApplication(App).catch(console.error);

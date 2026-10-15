import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe, PercentPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { LabApi, type Health, type LabPlan, type TaskReply, type BatchPlan } from './lab-api.service';
interface Monitoring { executed: number; blocked: number; failed: number; dry_runs: number; health: { success_rate: number }; }
@Component({ selector: 'app-root', standalone: true, imports: [FormsModule, JsonPipe, PercentPipe], templateUrl: './app.component.html' })
export class AppComponent implements OnInit {
  private api = inject(LabApi);
  health = signal<Health | null>(null); busy = signal(false); error = signal(''); output = signal<unknown>(null);
  plan = signal<LabPlan | null>(null); planFromChat = false;
  messages = signal<{ role: string; text: string }[]>([]); state = signal('');
  monitoring = signal<Monitoring | null>(null); events = signal<unknown>(null); readiness = signal<unknown>(null);
  baseUrl = '/api'; userId = 'user-001'; conversationId = crypto.randomUUID();
  message = 'Crea un ticket de prioridad alta para ACME porque no puede acceder al portal corporativo';
  tab = 'task'; maxItems = 10; staleHours = 48; faultMode = 'off';
  ngOnInit() { void this.connect(); }
  has(feature: string) { return this.health()?.features.includes(feature) ?? false; }
  canOperate() {
    const p = this.plan();
    return !!p && (p.kind === 'batch' ? p.status === 'draft' : ['waiting_for_confirmation', 'ready_to_execute'].includes(p.status));
  }
  private async perform(work: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await work(); }
    catch (e) {
      const body = e instanceof HttpErrorResponse ? e.error : null;
      this.error.set(body?.error?.user_message ?? body?.message ?? (e instanceof Error ? e.message : 'No se pudo completar la petición.'));
      this.output.set(body ?? { error: this.error() });
    } finally { this.busy.set(false); }
  }
  async connect() {
    await this.perform(async () => {
      this.health.set(await this.api.get<Health>(this.baseUrl, '/capabilities', this.userId));
      this.reset(); this.tab = 'task'; this.monitoring.set(null); this.events.set(null); this.readiness.set(null);
    });
  }
  reset() { this.conversationId = crypto.randomUUID(); this.messages.set([]); this.plan.set(null); this.output.set(null); this.state.set(''); this.planFromChat = false; }
  example(text: string) { this.message = text; }
  async analyze() {
    await this.perform(async () => { this.plan.set(null); this.planFromChat = false;
      this.output.set(await this.api.post(this.baseUrl, '/automation/analyze', { message: this.message }, this.userId)); });
  }
  async prepare() {
    await this.perform(async () => { const plan = await this.api.post<LabPlan>(this.baseUrl, '/automation/plan', { message: this.message }, this.userId);
      this.plan.set(plan); this.output.set(plan); this.planFromChat = false; });
  }
  async converse() {
    const text = this.message.trim(); if (!text) return;
    await this.perform(async () => {
      const reply = await this.api.post<TaskReply>(this.baseUrl, '/task-assistant/message', { conversation_id: this.conversationId, message: text }, this.userId);
      this.messages.update(m => [...m, { role: 'Tú', text }, { role: 'Asistente', text: reply.assistant_message }]);
      this.state.set(reply.task_state); this.plan.set(reply.plan ?? null); this.planFromChat = !!reply.plan; this.output.set(reply); this.message = '';
    });
  }
  async execute(dryRun: boolean) {
    const p = this.plan(); if (!p) return;
    await this.perform(async () => {
      let result: unknown;
      if (this.planFromChat) {
        const reply = await this.api.post<TaskReply>(this.baseUrl, '/task-assistant/confirm', { conversation_id: this.conversationId, confirmed: !dryRun, dry_run: dryRun }, this.userId);
        this.messages.update(m => [...m, { role: 'Asistente', text: reply.assistant_message }]); this.state.set(reply.task_state);
        this.plan.set(reply.plan ?? p); result = reply;
      } else if (p.kind === 'batch') {
        result = await this.api.post(this.baseUrl, '/automation/processes/execute', { process_id: p.process_id, confirmed: !dryRun, dry_run: dryRun }, this.userId);
        this.plan.set(await this.api.get<BatchPlan>(this.baseUrl, '/automation/processes/' + p.process_id, this.userId));
      } else {
        result = await this.api.post(this.baseUrl, '/automation/execute', { flow_id: p.flow_id, confirmed: !dryRun, dry_run: dryRun }, this.userId);
        this.plan.set(await this.api.get<LabPlan>(this.baseUrl, '/automation/plans/' + p.flow_id, this.userId));
      }
      this.output.set(result);
    });
  }
  async cancel() {
    const p = this.plan(); if (!p) return;
    await this.perform(async () => {
      if (this.planFromChat) await this.api.post(this.baseUrl, '/task-assistant/confirm', { conversation_id: this.conversationId, confirmed: false }, this.userId);
      else await this.api.post(this.baseUrl, p.kind === 'batch' ? '/automation/processes/cancel' : '/automation/cancel', p.kind === 'batch' ? { process_id: p.process_id } : { flow_id: p.flow_id }, this.userId);
      this.plan.set(null); this.state.set('cancelled'); this.output.set({ status: 'cancelled' });
    });
  }
  async batch(name: string) {
    await this.perform(async () => {
      const slug = name === 'stale_ticket_followup' ? 'stale-ticket-followup' : 'urgent-without-owner';
      const plan = await this.api.post<BatchPlan>(this.baseUrl, '/automation/processes/' + slug + '/plan', { max_items: this.maxItems, stale_hours: this.staleHours }, this.userId);
      this.plan.set(plan); this.output.set(plan); this.planFromChat = false;
    });
  }
  async setFault() { await this.perform(async () => { this.output.set(await this.api.post(this.baseUrl, '/demo/faults', { ticket_id: 'TCK-1002', mode: this.faultMode }, this.userId)); }); }
  async retryFailed() {
    const p = this.plan(); if (p?.kind !== 'batch') return;
    await this.perform(async () => { this.output.set(await this.api.post(this.baseUrl, '/automation/processes/retry-failed', { process_id: p.process_id, confirmed: true }, this.userId)); });
  }
  async inspectTickets() { await this.perform(async () => { this.output.set(await this.api.get(this.baseUrl, '/tickets', this.userId)); }); }
  async refreshMonitoring() { await this.perform(async () => {
    this.monitoring.set(await this.api.get<Monitoring>(this.baseUrl, '/automation/monitoring/summary', this.userId));
    this.events.set(await this.api.get(this.baseUrl, '/automation/monitoring/events?limit=20', this.userId));
  }); }
  async inspectReadiness() { await this.perform(async () => { this.readiness.set(await this.api.get(this.baseUrl, '/automation/readiness', this.userId)); }); }
}

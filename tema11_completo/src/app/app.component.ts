import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe, DatePipe } from '@angular/common';
import { AssistantService } from './assistant.service';
import { Action, Capabilities, ChatMessage, Health } from './assistant.types';

@Component({
  selector: 'app-root', standalone: true, imports: [FormsModule, JsonPipe, DatePipe],
  templateUrl: './app.component.html'
})
export class AppComponent {
  private readonly api = inject(AssistantService);
  readonly versions = [
    ['v01', 'Uso de APIs internas'], ['v02', 'Microservicios'], ['v03', 'Consultas a APIs'],
    ['v04', 'Acciones mediante APIs'], ['v05', 'Autenticación'], ['v06', 'Permisos'],
    ['v07', 'Validación de respuestas'], ['v08', 'Errores de integración'], ['v09', 'Rendimiento'], ['v10', 'Integración completa']
  ];
  version = 'v10';
  backendUrl = 'http://localhost:3000';
  username = 'ana';
  password = 'ana123';
  draft = '';
  readonly health = signal<Health | null>(null);
  readonly capabilities = signal<Capabilities | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly performanceData = signal<unknown>(null);
  readonly connected = computed(() => this.capabilities() !== null);
  readonly canCancel = computed(() => this.capabilities()?.availableTools.includes('prepare_cancel_order'));
  readonly canTicket = computed(() => this.capabilities()?.availableTools.includes('prepare_create_ticket'));
  readonly canMetrics = computed(() => this.health()?.features.performance && this.capabilities()?.user.roles.includes('operations_manager'));
  readonly expired = (action: Action) => new Date(action.expiresAt).getTime() <= Date.now();
  command() { return `node scripts/start-backend.mjs ${this.version}`; }
  userChanged() { this.password = `${this.username}123`; this.disconnect(); }
  disconnect() {
    this.api.reset(); this.health.set(null); this.capabilities.set(null); this.messages.set([]); this.performanceData.set(null); this.error.set('');
  }
  async connect() {
    this.busy.set(true); this.error.set('');
    this.disconnect();
    try {
      const result = await this.api.connect(this.backendUrl, this.username, this.password);
      this.health.set(result.health); this.capabilities.set(result.capabilities);
    } catch (error) { this.error.set(this.api.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  async send(prompt = this.draft) {
    if (!this.connected() || this.busy() || !prompt.trim()) return;
    const message = prompt.trim(); this.draft = ''; this.error.set(''); this.busy.set(true);
    this.messages.update(v => [...v, { id: crypto.randomUUID(), role: 'user', text: message, actions: [] }]);
    try {
      const response = await this.api.message(message);
      this.messages.update(v => [...v, { id: crypto.randomUUID(), role: 'assistant', text: response.answer, response, actions: response.pendingActions }]);
    } catch (error) { this.error.set(this.api.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  private updateAction(action: Action) {
    this.messages.update(v => v.map(m => ({ ...m, actions: m.actions.map(a => a.actionId === action.actionId ? action : a) })));
  }
  async act(action: Action, confirm: boolean) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      const result = confirm ? await this.api.confirm(action.actionId) : await this.api.dismiss(action.actionId);
      this.updateAction(result.action);
    } catch (error) {
      this.error.set(this.api.errorMessage(error));
      try { this.updateAction((await this.api.action(action.actionId)).action); } catch { /* conserva la propuesta visible */ }
    } finally { this.busy.set(false); }
  }
  async metrics() {
    this.busy.set(true); this.error.set('');
    try { this.performanceData.set(await this.api.performance()); }
    catch (error) { this.error.set(this.api.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
}

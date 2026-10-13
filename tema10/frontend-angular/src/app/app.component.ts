import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AssistantService } from './assistant.service';
import { AgentReply, Approval, Capabilities, ChatEntry, Order, PendingAction } from './assistant.types';

@Component({
  selector: 'app-root', standalone: true,
  imports: [FormsModule, JsonPipe, CurrencyPipe, DatePipe],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  private readonly api = inject(AssistantService);
  readonly caps = signal<Capabilities | null>(null);
  readonly orders = signal<Order[]>([]);
  readonly messages = signal<ChatEntry[]>([]);
  readonly pending = signal<PendingAction | null>(null);
  readonly approvals = signal<Approval[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly modelMode = signal('');
  readonly memory = signal<unknown>(null);
  readonly feedbackSent = signal(false);
  readonly taskOptions = computed(() => Object.entries(this.caps()?.tasks || {}).map(([value, task]) => ({ value, label: task.description })));
  baseUrl = 'http://127.0.0.1:3000';
  userId = 'demo-agent';
  mode = 'agent';
  selectedTask = '';
  message = '';
  tab: 'chat' | 'supervisor' = 'chat';
  conversationId: string = crypto.randomUUID();
  rating = 4;
  feedbackComment = '';
  feedbackResolved = true;
  supervisorReason = 'Revisado en el laboratorio y decisión justificada.';
  private lastReply: AgentReply | null = null;
  private readonly conversations = new Map<string, string>();

  ngOnInit(): void { this.conversations.set(this.userId, this.conversationId); void this.connect(); }
  async connect(): Promise<void> {
    this.busy.set(true); this.error.set('');
    try {
      const [health, caps, data] = await Promise.all([
        this.api.get<{ modelMode: string }>(this.baseUrl, '/health', this.userId),
        this.api.get<Capabilities>(this.baseUrl, '/api/capabilities', this.userId),
        this.api.get<{ orders: Order[] }>(this.baseUrl, '/api/demo/orders', this.userId)
      ]);
      this.caps.set(caps); this.orders.set(data.orders); this.modelMode.set(health.modelMode);
      if (!caps.features['chatbot']) this.mode = 'agent';
      if (this.selectedTask && !caps.tasks[this.selectedTask]) this.selectedTask = '';
      if (this.tab === 'supervisor' && caps.permissions.canSupervise) await this.loadApprovals();
    } catch (error) { this.caps.set(null); this.showError(error); }
    finally { this.busy.set(false); }
  }
  changeUser(): void {
    this.conversationId = this.conversations.get(this.userId) || crypto.randomUUID();
    this.conversations.set(this.userId, this.conversationId);
    this.messages.set([]); this.pending.set(null); this.memory.set(null); this.lastReply = null;
    void this.connect();
  }
  newConversation(): void {
    this.conversationId = crypto.randomUUID(); this.conversations.set(this.userId, this.conversationId);
    this.messages.set([]); this.pending.set(null); this.memory.set(null); this.error.set(''); this.lastReply = null;
  }
  setPrompt(prompt: string): void { this.message = prompt; }
  async send(): Promise<void> {
    const message = this.message.trim(); if (!message || this.busy() || !this.caps()) return;
    this.message = ''; this.error.set(''); this.busy.set(true); this.feedbackSent.set(false);
    this.messages.update(items => [...items, { role: 'user', text: message }]);
    try {
      const reply = await this.api.post<AgentReply>(this.baseUrl, this.mode === 'chatbot' ? '/api/chatbot' : '/api/agent', this.userId, {
        message, conversationId: this.conversationId, ...(this.selectedTask ? { taskName: this.selectedTask } : {})
      });
      this.acceptReply(reply);
    } catch (error) { this.showError(error); }
    finally { this.busy.set(false); }
  }
  async confirm(decision: 'confirm' | 'cancel'): Promise<void> {
    const action = this.pending(); if (!action || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      const reply = await this.api.post<AgentReply>(this.baseUrl, '/api/agent/confirm', this.userId, { conversationId: this.conversationId, actionId: action.actionId, decision });
      this.acceptReply(reply);
      await this.refreshOrders();
    } catch (error) { this.showError(error); }
    finally { this.busy.set(false); }
  }
  private acceptReply(reply: AgentReply): void {
    this.conversationId = reply.conversationId; this.pending.set(reply.pendingAction || null); this.lastReply = reply;
    this.messages.update(items => [...items, { role: 'assistant', text: reply.text, reply }]);
  }
  async refreshOrders(): Promise<void> {
    try { this.orders.set((await this.api.get<{ orders: Order[] }>(this.baseUrl, '/api/demo/orders', this.userId)).orders); }
    catch (error) { this.showError(error); }
  }
  async inspectMemory(): Promise<void> {
    try { this.memory.set(await this.api.get(this.baseUrl, `/api/agent/conversations/${this.conversationId}`, this.userId)); }
    catch (error) { this.showError(error); }
  }
  async loadApprovals(): Promise<void> {
    try { this.approvals.set((await this.api.get<{ approvals: Approval[] }>(this.baseUrl, '/api/supervisor/approvals', this.userId)).approvals); }
    catch (error) { this.showError(error); }
  }
  async decide(approval: Approval, decision: 'approve' | 'reject'): Promise<void> {
    this.busy.set(true); this.error.set('');
    try {
      const reply = await this.api.post<AgentReply>(this.baseUrl, `/api/supervisor/approvals/${approval.approvalId}/${decision}`, this.userId, { reason: this.supervisorReason });
      this.messages.update(items => [...items, { role: 'assistant', text: reply.text, reply }]);
      await this.loadApprovals(); await this.refreshOrders();
    } catch (error) { this.showError(error); }
    finally { this.busy.set(false); }
  }
  async feedback(): Promise<void> {
    this.busy.set(true); this.error.set('');
    try {
      await this.api.post(this.baseUrl, '/api/agent/feedback', this.userId, { conversationId: this.conversationId, taskName: this.lastReply?.taskName || 'order_support', rating: Number(this.rating), comment: this.feedbackComment, resolved: this.feedbackResolved });
      this.feedbackSent.set(true);
    } catch (error) { this.showError(error); }
    finally { this.busy.set(false); }
  }
  private showError(error: unknown): void {
    this.error.set(error instanceof HttpErrorResponse ? error.error?.message || 'No se puede conectar al backend. Comprueba la URL y que esté iniciado.' : 'No se ha podido completar la operación.');
  }
}

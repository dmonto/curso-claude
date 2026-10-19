import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AssistantService } from './assistant.service';
import { AppContext, Capabilities, ChatEntry, ContextReply, PendingAction, Ticket } from './assistant.types';

@Component({ selector: 'app-root', standalone: true, imports: [FormsModule, JsonPipe, DatePipe], templateUrl: './app.component.html' })
export class AppComponent implements OnInit {
  private readonly api = inject(AssistantService);
  readonly caps = signal<Capabilities | null>(null);
  readonly tickets = signal<Ticket[]>([]);
  readonly messages = signal<ChatEntry[]>([]);
  readonly pending = signal<PendingAction | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly modelMode = signal('');
  readonly contextDebug = signal<unknown>(null);
  readonly contextHealth = signal<unknown>(null);
  readonly taskOptions = computed(() => Object.entries(this.caps()?.tasks || {}).map(([value, task]) => ({ value, label: task.description })));
  baseUrl = 'http://127.0.0.1:3000';
  userId = 'demo-agent';
  conversationId: string = crypto.randomUUID();
  selectedTicketId = 'INC-1042';
  selectedView: 'ticket_detail' | 'ticket_list' | 'dashboard' = 'ticket_detail';
  message = '';
  debugTokens = true;
  contextMode: 'normal' | 'lowCost' = 'normal';
  lastUiError = false;

  ngOnInit(): void { void this.connect(); }
  buildAppContext(): AppContext {
    return {
      route: this.selectedView === 'ticket_detail' ? `/support/tickets/${this.selectedTicketId}` : '/support/tickets',
      appArea: 'support',
      view: this.selectedView,
      activeEntity: this.selectedView === 'ticket_detail' ? { type: 'ticket', id: this.selectedTicketId } : { type: 'none' },
      activeTab: 'activity',
      filters: this.selectedView === 'ticket_list' ? { status: 'open', priority: 'high' } : {},
      selectedRows: this.selectedView === 'ticket_list' ? ['INC-1042','INC-1077'] : [],
      lastUiError: this.lastUiError ? { code: 'API_TIMEOUT', visibleMessage: 'No se ha podido cargar la actividad del ticket.', occurredAt: new Date().toISOString() } : undefined,
      draftState: { hasUnsavedChanges: false }
    };
  }
  async connect(): Promise<void> {
    this.busy.set(true); this.error.set('');
    try {
      const [health, caps, data] = await Promise.all([
        this.api.get<{ modelMode: string }>(this.baseUrl, '/health', this.userId),
        this.api.get<Capabilities>(this.baseUrl, '/api/capabilities', this.userId),
        this.api.get<{ tickets: Ticket[] }>(this.baseUrl, '/api/demo/tickets', this.userId)
      ]);
      this.modelMode.set(health.modelMode); this.caps.set(caps); this.tickets.set(data.tickets);
    } catch (error) { this.showError(error); }
    finally { this.busy.set(false); }
  }
  newConversation(): void { this.conversationId = crypto.randomUUID(); this.messages.set([]); this.pending.set(null); this.contextDebug.set(null); this.contextHealth.set(null); }
  setPrompt(prompt: string): void { this.message = prompt; }
  async send(): Promise<void> {
    const message = this.message.trim(); if (!message || this.busy()) return;
    this.message = ''; this.error.set(''); this.busy.set(true);
    this.messages.update(items => [...items, { role: 'user', text: message }]);
    try {
      const reply = await this.api.post<ContextReply>(this.baseUrl, '/api/chat', this.userId, { conversationId: this.conversationId, message, appContext: this.buildAppContext(), debugTokens: this.debugTokens, contextMode: this.contextMode });
      this.conversationId = reply.conversationId; this.pending.set(reply.pendingAction || null); this.contextDebug.set(reply.contextDebug || null);
      this.messages.update(items => [...items, { role: 'assistant', text: reply.text, reply }]);
      await this.refreshTickets();
    } catch (error) { this.showError(error); }
    finally { this.busy.set(false); }
  }
  async confirm(decision: 'confirm' | 'cancel'): Promise<void> {
    const action = this.pending(); if (!action) return;
    this.busy.set(true); this.error.set('');
    try {
      const reply = await this.api.post<ContextReply>(this.baseUrl, '/api/chat/confirm', this.userId, { conversationId: this.conversationId, actionId: action.actionId, decision });
      this.pending.set(reply.pendingAction || null); this.contextDebug.set(reply.contextDebug || null);
      this.messages.update(items => [...items, { role: 'assistant', text: reply.text, reply }]);
      await this.refreshTickets();
    } catch (error) { this.showError(error); }
    finally { this.busy.set(false); }
  }
  async inspectContext(): Promise<void> { try { this.contextDebug.set(await this.api.get(this.baseUrl, `/api/context/${this.conversationId}`, this.userId)); } catch(e) { this.showError(e); } }
  async inspectEvents(): Promise<void> { try { this.contextDebug.set(await this.api.get(this.baseUrl, `/api/context/${this.conversationId}/events`, this.userId)); } catch(e) { this.showError(e); } }
  async inspectSegments(): Promise<void> { try { this.contextDebug.set(await this.api.get(this.baseUrl, `/api/context/${this.conversationId}/segments`, this.userId)); } catch(e) { this.showError(e); } }
  async quality(autoFix = false): Promise<void> { try { this.contextHealth.set(await this.api.post(this.baseUrl, '/api/context/quality', this.userId, { conversationId: this.conversationId, appContext: this.buildAppContext(), autoFix })); } catch(e) { this.showError(e); } }
  async refreshTickets(): Promise<void> { try { this.tickets.set((await this.api.get<{ tickets: Ticket[] }>(this.baseUrl, '/api/demo/tickets', this.userId)).tickets); } catch(e) { this.showError(e); } }
  private showError(error: unknown): void { this.error.set(error instanceof HttpErrorResponse ? error.error?.message || 'No se puede conectar al backend.' : 'No se ha podido completar la operación.'); }
}

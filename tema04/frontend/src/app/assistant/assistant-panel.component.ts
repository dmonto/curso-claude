import { Component, computed, inject, OnInit, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { Router } from "@angular/router";
import { AssistantAction } from "./assistant.types";
import { AssistantActionsApiService } from "./assistant-actions-api.service";
import { AssistantActionsComponent } from "./assistant-actions.component";
import { AssistantComposerComponent } from "./assistant-composer.component";
import { AssistantConfirmationCardComponent } from "./assistant-confirmation-card.component";
import { AssistantContextBannerComponent } from "./assistant-context-banner.component";
import { AssistantConversationListComponent } from "./assistant-conversation-list.component";
import { AssistantEmptyStateComponent } from "./assistant-empty-state.component";
import { AssistantErrorBannerComponent } from "./assistant-error-banner.component";
import { AssistantFeedbackService } from "./assistant-feedback.service";
import { AssistantMessageListComponent } from "./assistant-message-list.component";
import { AssistantStoreService } from "./assistant-store.service";
import { AssistantTypingIndicatorComponent } from "./assistant-typing-indicator.component";
import { AssistantUxPolicyService } from "./assistant-ux-policy.service";

@Component({
  selector: "app-assistant-panel",
  standalone: true,
  imports: [
    AssistantActionsComponent,
    AssistantComposerComponent,
    AssistantConfirmationCardComponent,
    AssistantContextBannerComponent,
    AssistantConversationListComponent,
    AssistantEmptyStateComponent,
    AssistantErrorBannerComponent,
    AssistantMessageListComponent,
    AssistantTypingIndicatorComponent
  ],
  template: `
    @if (open()) {
      <aside class="assistant-panel" aria-label="Asistente">
        <header class="assistant-panel__header">
          <div>
            <strong>Asistente</strong>
            <span>Contextual a la aplicación</span>
          </div>

          <div class="assistant-panel__header-actions">
            <button type="button" (click)="clear()">Nueva</button>
            <button type="button" (click)="toggleOpen()">Cerrar</button>
          </div>
        </header>

        <label class="assistant-panel__mode">
          <input
            type="checkbox"
            [checked]="store.streamMode()"
            (change)="toggleStreamMode($event)"
          />
          Streaming Websocket
        </label>

        <app-assistant-context-banner [context]="store.currentContext()" />

<section class="assistant-panel__body">
  <app-assistant-conversation-list
    [conversations]="store.conversations()"
    (conversationSelected)="switchConversation($event)"
  />

  @if (store.messages().length === 0) {
    <app-assistant-empty-state
      [context]="store.currentContext()"
      (promptSelected)="send($event)"
    />
  } @else {
    <app-assistant-message-list
      [messages]="store.messages()"
      (feedbackSelected)="sendFeedback($event)"
    />
  }

  <app-assistant-typing-indicator
    [visible]="store.loading()"
    [label]="store.progressLabel()"
  />

  <app-assistant-error-banner
    [error]="store.error()"
    (retry)="retry()"
    (dismiss)="store.dismissError()"
  />

  <app-assistant-actions
    [actions]="store.suggestedActions()"
    (actionSelected)="handleAction($event)"
  />

  <app-assistant-confirmation-card
    [action]="pendingAction()"
    (cancel)="cancelPendingAction()"
    (confirm)="confirmPendingAction($event)"
  />

  @if (ux.shouldShowTechnicalMeta() && store.lastMeta()) {
    <section class="assistant-debug">
      <strong>Backend</strong>
      <span>Correlation ID: {{ store.lastMeta()?.correlationId }}</span>
      <span>Servicios: {{ store.lastMeta()?.usedTools?.join(', ') }}</span>
    </section>
  }
</section>

@if (canRetry()) {
  <button type="button" class="assistant-panel__retry" (click)="retry()">
    Regenerar respuesta
  </button>
}

<app-assistant-composer
  [disabled]="store.loading()"
  (sendMessage)="send($event)"
/>
      </aside>
    } @else {
      <button type="button" class="assistant-launcher" (click)="toggleOpen()" aria-label="Abrir asistente">
        Asistente
      </button>
    }
  `,
  styles: [`
.assistant-panel {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 430px;
  height: min(720px, calc(100vh - 48px));
  max-height: calc(100vh - 48px);

  display: flex;
  flex-direction: column;

  background: #fff;
  border: 1px solid #ddd;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, .16);
  overflow: hidden;
  z-index: 1000;
  font-family: system-ui, sans-serif;
}

.assistant-panel__header {
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #eee;
}

.assistant-panel__mode {
  flex: 0 0 auto;
  padding: 8px 12px;
  border-bottom: 1px solid #eee;
  font-size: 13px;
  display: flex;
  gap: 8px;
  align-items: center;
}

app-assistant-context-banner {
  flex: 0 0 auto;
  display: block;
}

.assistant-panel__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.assistant-panel__retry {
  flex: 0 0 auto;
  margin: 6px 12px;
  align-self: flex-start;
}

app-assistant-composer {
  flex: 0 0 auto;
  display: block;
  border-top: 1px solid #eee;
  background: #fff;
}

.assistant-debug {
  margin: 8px 0;
  padding: 8px;
  border-radius: 8px;
  background: #f5f5f5;
  color: #555;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
  `]
})
export class AssistantPanelComponent implements OnInit {
  readonly store = inject(AssistantStoreService);
  readonly ux = inject(AssistantUxPolicyService);

  private readonly actionsApi = inject(AssistantActionsApiService);
  private readonly feedback = inject(AssistantFeedbackService);
  private readonly router = inject(Router);

  readonly open = signal(true);
  readonly pendingAction = signal<AssistantAction | null>(null);

  readonly canRetry = computed(
    () =>
      !this.store.loading() &&
      this.store.messages().some(message => message.role === "user")
  );

  async ngOnInit(): Promise<void> {
    await this.store.hydrateFromBackend();
    await this.store.loadConversationList();
  }

  toggleOpen(): void {
    this.open.update(value => !value);
  }

  toggleStreamMode(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.store.streamMode.set(input.checked);
  }

  async send(text: string): Promise<void> {
    await this.store.send(text);
  }

  async retry(): Promise<void> {
    await this.store.retryLastMessage();
  }

  async clear(): Promise<void> {
    await this.store.clearConversation();
  }

  async switchConversation(conversationId: string): Promise<void> {
    await this.store.switchConversation(conversationId);
  }

  handleAction(action: AssistantAction): void {
    if (action.type === "navigate") {
      const payload = action.payload as { url?: string };

      if (payload.url) {
        void this.router.navigateByUrl(payload.url);
      }

      return;
    }

    if (action.type === "confirm_backend_action") {
      this.pendingAction.set(action);
    }
  }

  cancelPendingAction(): void {
    this.pendingAction.set(null);
  }

  async confirmPendingAction(action: AssistantAction): Promise<void> {
    this.pendingAction.set(null);

    const payload = action.payload as { ticketId?: string; action?: string };

    if (payload.action === "prepare_escalation" && payload.ticketId) {
      const response = await firstValueFrom(
        this.actionsApi.createEscalationDraft(payload.ticketId)
      );

      this.store.appendAssistantMessage([
        `He preparado un borrador de escalado para ${response.draft.targetTeam}.`,
        "",
        "Faltan estos datos:",
        ...response.draft.missingData.map(item => `- ${item}`),
        "",
        "No se ha ejecutado ningún cambio sobre el ticket.",
        "Requiere revisión humana antes de enviarse."
      ].join("\n"));
    }
  }

  async sendFeedback(event: { messageId: string; rating: "positive" | "negative" }): Promise<void> {
    await firstValueFrom(
      this.feedback.sendFeedback({
        conversationId: this.store.conversationId(),
        messageId: event.messageId,
        rating: event.rating,
        correlationId: this.store.lastMeta()?.correlationId
      })
    );
  }
}

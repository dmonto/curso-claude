import { computed, effect, inject, Injectable, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import {
  AssistantAction,
  AssistantClientError,
  AssistantConversationSummary,
  AssistantMeta,
  AssistantStreamEvent,
  ChatMessage
} from "./assistant.types";
import { AssistantApiService } from "./assistant-api.service";
import { AssistantContextService } from "./assistant-context.service";
import { AssistantErrorService } from "./assistant-error.service";
import { AssistantWebSocketService } from "./assistant-websocket.service";
import { AssistantStorageService } from "./assistant-storage.service";

@Injectable({
  providedIn: "root"
})
export class AssistantStoreService {
  private readonly api = inject(AssistantApiService);
  private readonly context = inject(AssistantContextService);
  private readonly errors = inject(AssistantErrorService);
  private readonly websocket = inject(AssistantWebSocketService);
  private readonly storage = inject(AssistantStorageService);

  readonly conversationId = signal(this.storage.getOrCreateConversationId());
  readonly messages = signal<ChatMessage[]>(this.storage.getMessages(this.conversationId()));
  readonly conversations = signal<AssistantConversationSummary[]>([]);
  readonly suggestedActions = signal<AssistantAction[]>([]);
  readonly lastMeta = signal<AssistantMeta | null>(null);
  readonly lastUserText = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal<AssistantClientError | null>(null);
  readonly progressLabel = signal<string | null>(null);
  readonly streamMode = signal(false);

  readonly hasMessages = computed(() => this.messages().length > 0);
  readonly canSend = computed(() => !this.loading());
  readonly currentContext = computed(() => this.context.buildContextForRequest());

  constructor() {
    effect(() => {
      this.storage.setMessages(this.conversationId(), this.messages());
    });
  }

  async hydrateFromBackend(): Promise<void> {
    try {
      const response = await firstValueFrom(this.api.getConversation(this.conversationId()));

      if (response.messages.length > 0) {
        this.messages.set(response.messages);
      }
    } catch {
      // En laboratorio no bloqueamos la UI si el backend no tiene esa conversación.
    }
  }

  async loadConversationList(): Promise<void> {
    const response = await firstValueFrom(this.api.listConversations());
    this.conversations.set(response.conversations);
  }

  async switchConversation(conversationId: string): Promise<void> {
    this.conversationId.set(conversationId);
    this.storage.setConversationId(conversationId);

    const response = await firstValueFrom(this.api.getConversation(conversationId));

    this.messages.set(response.messages);
    this.suggestedActions.set([]);
    this.error.set(null);
    this.lastMeta.set({
      correlationId: "switch",
      usedTools: ["conversation_history"],
      messageCount: response.meta.messageCount
    });
  }
private handleWebSocketEvent(event: AssistantStreamEvent): void {
  if (event.type === "connection.ready") {
    return;
  }

  if (event.type === "assistant.started") {
    this.conversationId.set(event.conversationId);
    this.storage.setConversationId(event.conversationId);

    this.messages.update(current => [
      ...current,
      {
        id: event.messageId,
        role: "assistant",
        content: "",
        createdAt: event.createdAt,
        status: "sending"
      }
    ]);

    this.progressLabel.set("Procesando solicitud...");
    return;
  }

  if (event.type === "assistant.progress") {
    this.progressLabel.set(event.label);
    return;
  }

  if (event.type === "assistant.delta") {
    this.messages.update(current =>
      current.map(message =>
        message.id === event.messageId
          ? {
              ...message,
              content: message.content + event.delta,
              status: "sending" as const
            }
          : message
      )
    );

    return;
  }

  if (event.type === "assistant.completed") {
    this.conversationId.set(event.conversationId);
    this.storage.setConversationId(event.conversationId);

    this.messages.update(current =>
      current.map(message =>
        message.id === event.message.id
          ? {
              ...event.message,
              status: "sent" as const
            }
          : message
      )
    );

    this.suggestedActions.set(event.suggestedActions ?? []);
    this.lastMeta.set(event.meta ?? null);
    this.progressLabel.set(null);
    this.loading.set(false);
    this.error.set(null);

    void this.loadConversationList().catch(() => {
      console.warn("No se pudo actualizar la lista de conversaciones");
    });

    this.websocket.disconnect();
    return;
  }

  if (event.type === "assistant.error") {
    this.error.set({
      kind: "backend",
      title: "Error del asistente",
      message: event.message,
      retryable: true,
      correlationId: event.correlationId
    });

    this.progressLabel.set(null);
    this.loading.set(false);
    this.websocket.disconnect();
  }
}

async send(text: string): Promise<void> {
  if (this.streamMode()) {
    await this.sendStream(text);
    return;
  }

  const cleanText = text.trim();

  if (!cleanText || this.loading()) {
    return;
  }

  this.prepareSend(cleanText, "sending");

  const temporaryUserMessage = this.messages().at(-1);

  try {
    const response = await firstValueFrom(
      this.api.sendMessage({
        conversationId: this.conversationId(),
        message: cleanText,
        screenContext: this.context.buildContextForRequest()
      })
    );

    const assistantMessage = this.normalizeAssistantMessage(response.message);

    this.conversationId.set(response.conversationId);
    this.storage.setConversationId(response.conversationId);

    this.messages.update(current => [
      ...current.map(message =>
        message.id === temporaryUserMessage?.id
          ? { ...message, status: "sent" as const }
          : message
      ),
      assistantMessage
    ]);

    this.suggestedActions.set(response.suggestedActions ?? []);
    this.lastMeta.set(response.meta ?? null);
    this.error.set(null);

    void this.loadConversationList().catch(() => {
      console.warn("No se pudo actualizar la lista de conversaciones");
    });
  } catch (error) {
    this.markLastUserMessageAsError(temporaryUserMessage?.id);
    this.error.set(this.errors.fromError(error));
  } finally {
    this.loading.set(false);
  }
}

async sendStream(text: string): Promise<void> {
  const cleanText = text.trim();

  if (!cleanText || this.loading()) {
    return;
  }

  this.prepareSend(cleanText, "sent");

  this.loading.set(true);
  this.error.set(null);
  this.suggestedActions.set([]);
  this.lastMeta.set(null);
  this.progressLabel.set("Conectando con el asistente...");

  try {
    await this.websocket.connect(event => this.handleWebSocketEvent(event));

    this.websocket.send({
      type: "assistant.message",
      conversationId: this.conversationId(),
      message: cleanText,
      screenContext: this.context.buildContextForRequest()
    });
  } catch (error) {
    this.markLastUserMessageAsError(this.messages().at(-1)?.id);
    this.error.set(this.errors.fromError(error));
    this.progressLabel.set(null);
    this.loading.set(false);
  }
}

  async retryLastMessage(): Promise<void> {
    const lastUser = [...this.messages()].reverse().find(message => message.role === "user");
    const text = this.lastUserText() ?? lastUser?.content;

    if (!text || this.loading()) {
      return;
    }

    // Si el mensaje falló o va en streaming, el backend no tiene (o no usa) el mensaje: se reenvía.
    if (this.streamMode() || this.error() || lastUser?.status === "error") {
      await this.send(text);
      return;
    }

    // Sin error: el backend regenera la respuesta al último mensaje sin duplicarlo.
    this.loading.set(true);
    this.error.set(null);
    this.suggestedActions.set([]);
    this.lastMeta.set(null);

    try {
      const response = await firstValueFrom(
        this.api.retryLastMessage(this.conversationId(), this.context.buildContextForRequest())
      );

      const assistantMessage = this.normalizeAssistantMessage(response.message);

      this.messages.update(current => {
        const lastUserIndex = current.map(message => message.role).lastIndexOf("user");
        return [...current.slice(0, lastUserIndex + 1), assistantMessage];
      });

      this.suggestedActions.set(response.suggestedActions ?? []);
      this.lastMeta.set(response.meta ?? null);

      void this.loadConversationList().catch(() => {
        console.warn("No se pudo actualizar la lista de conversaciones");
      });
    } catch (error) {
      this.error.set(this.errors.fromError(error));
    } finally {
      this.loading.set(false);
    }
  }

  async clearConversation(): Promise<void> {
    const oldConversationId = this.conversationId();

    try {
      await firstValueFrom(this.api.deleteConversation(oldConversationId));
    } catch {
      // Limpieza local aunque backend falle.
    }

    this.storage.clearConversation(oldConversationId);

    const newConversationId = crypto.randomUUID();
    this.conversationId.set(newConversationId);
    this.storage.setConversationId(newConversationId);

    this.messages.set([]);
    this.suggestedActions.set([]);
    this.lastMeta.set(null);
    this.error.set(null);
    this.lastUserText.set(null);
    this.progressLabel.set(null);
    await this.loadConversationList();
  }

  dismissError(): void {
    this.error.set(null);
  }

  appendAssistantMessage(content: string): void {
    this.messages.update(current => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        createdAt: new Date().toISOString(),
        status: "sent"
      }
    ]);
  }

  private prepareSend(cleanText: string, userStatus: "sending" | "sent"): void {
    this.lastUserText.set(cleanText);
    this.loading.set(true);
    this.error.set(null);
    this.progressLabel.set(null);
    this.suggestedActions.set([]);
    this.lastMeta.set(null);

    this.messages.update(current => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: cleanText,
        createdAt: new Date().toISOString(),
        status: userStatus
      }
    ]);
  }

  private handleStreamEvent(event: AssistantStreamEvent): void {
    if (event.type === "assistant.started") {
      this.conversationId.set(event.conversationId);
      this.storage.setConversationId(event.conversationId);

      this.messages.update(current => [
        ...current,
        {
          id: event.messageId,
          role: "assistant",
          content: "",
          createdAt: event.createdAt,
          status: "sending"
        }
      ]);

      this.progressLabel.set("Procesando solicitud...");
      return;
    }

    if (event.type === "assistant.progress") {
      this.progressLabel.set(event.label);
      return;
    }

    if (event.type === "assistant.delta") {
      this.messages.update(current =>
        current.map(message =>
          message.id === event.messageId
            ? { ...message, content: message.content + event.delta, status: "sending" }
            : message
        )
      );
      return;
    }

    if (event.type === "assistant.completed") {
      const assistantMessage = this.normalizeAssistantMessage(event.message);

      this.messages.update(current =>
        current.map(message =>
          message.id === assistantMessage.id
            ? assistantMessage
            : message
        )
      );

      this.suggestedActions.set(event.suggestedActions ?? []);
      this.lastMeta.set(event.meta ?? null);
      this.progressLabel.set(null);
      this.loading.set(false);
      this.websocket.disconnect();
      void this.loadConversationList();
      return;
    }

    if (event.type === "assistant.error") {
      this.error.set(this.errors.fromSse(event.message, event.correlationId));
      this.progressLabel.set(null);
      this.loading.set(false);
      this.websocket.disconnect();

      this.messages.update(current =>
        current.map(message =>
          message.status === "sending"
            ? { ...message, status: "error" as const }
            : message
        )
      );
    }
  }

  private normalizeAssistantMessage(message: unknown): ChatMessage {
    const candidate = message as Partial<ChatMessage> | null;

    if (!candidate || typeof candidate !== "object") {
      throw this.errors.fromBadResponse("message_missing");
    }

    if (candidate.role !== "assistant") {
      throw this.errors.fromBadResponse("invalid_role");
    }

    return {
      id: candidate.id || crypto.randomUUID(),
      role: "assistant",
      content: typeof candidate.content === "string" ? candidate.content : "",
      blocks: Array.isArray(candidate.blocks) ? candidate.blocks.slice(0, 20) : undefined,
      createdAt: candidate.createdAt || new Date().toISOString(),
      status: "sent"
    };
  }

  private markLastUserMessageAsError(messageId?: string): void {
    this.messages.update(current =>
      current.map(message =>
        message.id === messageId
          ? { ...message, status: "error" as const }
          : message
      )
    );
  }
}

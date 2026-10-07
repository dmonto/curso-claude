import { Injectable } from "@angular/core";
import { ChatMessage } from "./assistant.types";
import { computed, effect, inject, signal } from "@angular/core";

@Injectable({
  providedIn: "root"
})
export class AssistantStorageService {
  private readonly conversationIdKey = "assistantConversationId";
  private readonly messagesPrefix = "assistantMessages:";
  readonly currentContext = computed(() =>
    this.context.buildScreenContext()
  );

  getOrCreateConversationId(): string {
    const existing = localStorage.getItem(this.conversationIdKey);

    if (existing) {
      return existing;
    }

    const created = crypto.randomUUID();
    localStorage.setItem(this.conversationIdKey, created);
    return created;
  }

  setConversationId(conversationId: string): void {
    localStorage.setItem(this.conversationIdKey, conversationId);
  }

  getMessages(conversationId: string): ChatMessage[] {
    const raw = sessionStorage.getItem(this.messagesKey(conversationId));

    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as ChatMessage[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  setMessages(conversationId: string, messages: ChatMessage[]): void {
    sessionStorage.setItem(this.messagesKey(conversationId), JSON.stringify(messages));
  }

  clearConversation(conversationId: string): void {
    sessionStorage.removeItem(this.messagesKey(conversationId));
  }

  private messagesKey(conversationId: string): string {
    return `${this.messagesPrefix}${conversationId}`;
  }
}

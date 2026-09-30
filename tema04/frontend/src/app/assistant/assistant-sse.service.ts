import { Injectable, signal } from "@angular/core";
import { AssistantFrontendContext, AssistantStreamEvent } from "./assistant.types";

@Injectable({
  providedIn: "root"
})
export class AssistantSseService {
  private events: EventSource | null = null;

  readonly connected = signal(false);
  readonly lastError = signal<string | null>(null);

  connect(
    params: {
      conversationId: string;
      message: string;
      screenContext: AssistantFrontendContext;
    },
    onEvent: (event: AssistantStreamEvent) => void
  ): void {
    this.disconnect();

    const query = new URLSearchParams({
      conversationId: params.conversationId,
      message: params.message,
      route: params.screenContext.route,
      pageKey: params.screenContext.pageKey || "",
      entityType: params.screenContext.entity?.type || "",
      entityId: params.screenContext.entity?.id || "",
      tab: params.screenContext.selection?.tab || ""
    });

    this.events = new EventSource(`/api/assistant/stream?${query.toString()}`);
    this.connected.set(true);
    this.lastError.set(null);

    const listen = (type: AssistantStreamEvent["type"]) => {
      this.events?.addEventListener(type, (rawEvent) => {
        const messageEvent = rawEvent as MessageEvent<string>;
        const data = JSON.parse(messageEvent.data) as Omit<AssistantStreamEvent, "type">;
        onEvent({ type, ...data } as AssistantStreamEvent);
      });
    };

    listen("assistant.started");
    listen("assistant.progress");
    listen("assistant.delta");
    listen("assistant.completed");
    listen("assistant.error");

    this.events.onerror = () => {
      this.lastError.set("Error en conexión SSE");
      this.connected.set(false);
    };
  }

  disconnect(): void {
    this.events?.close();
    this.events = null;
    this.connected.set(false);
  }
}

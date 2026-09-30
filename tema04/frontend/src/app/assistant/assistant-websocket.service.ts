import { Injectable, signal } from "@angular/core";
import {
  AssistantFrontendContext,
  AssistantStreamEvent
} from "./assistant.types";

export interface AssistantWebSocketRequest {
  type: "assistant.message";
  conversationId: string;
  message: string;
  screenContext: AssistantFrontendContext;
}

@Injectable({
  providedIn: "root"
})
export class AssistantWebSocketService {
  private socket: WebSocket | null = null;

  readonly connected = signal(false);
  readonly lastError = signal<string | null>(null);

  connect(onEvent: (event: AssistantStreamEvent) => void): Promise<void> {
    this.disconnect();

    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${protocol}://${window.location.host}/ws/assistant`;

      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        this.connected.set(true);
        this.lastError.set(null);
        resolve();
      };

      this.socket.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as AssistantStreamEvent;
          onEvent(event);
        } catch {
          this.lastError.set("Evento WebSocket inválido");
        }
      };

      this.socket.onerror = () => {
        this.lastError.set("Error en conexión WebSocket");
        this.connected.set(false);
        reject(new Error("Error en conexión WebSocket"));
      };

      this.socket.onclose = () => {
        this.connected.set(false);
      };
    });
  }

  send(request: AssistantWebSocketRequest): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket no conectado");
    }

    this.socket.send(JSON.stringify(request));
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.connected.set(false);
  }
}
import { DatePipe, NgClass } from "@angular/common";
import { Component, computed, input, output } from "@angular/core";
import { ChatMessage } from "./assistant.types";
import { AssistantResponseFeedbackComponent } from "./assistant-response-feedback.component";
import { AssistantResponseRendererComponent } from "./assistant-response-renderer.component";

@Component({
  selector: "app-assistant-message",
  standalone: true,
  imports: [NgClass, DatePipe, AssistantResponseFeedbackComponent, AssistantResponseRendererComponent],
  template: `
    <article class="chat-message" [ngClass]="messageClass()" [attr.aria-label]="ariaLabel()">
      <div class="chat-message__meta">
        <strong>{{ authorLabel() }}</strong>
        <time [dateTime]="message().createdAt">{{ message().createdAt | date:'shortTime' }}</time>
      </div>

      @if (message().role === "assistant" && message().blocks && message().blocks!.length > 0) {
        <app-assistant-response-renderer [blocks]="message().blocks!" />
      } @else {
        <p class="chat-message__content">{{ message().content }}</p>
      }

      @if (message().status === "error") {
        <p class="chat-message__status">No se pudo completar este mensaje.</p>
      }

      @if (message().role === "assistant" && message().status === "sent") {
        <app-assistant-response-feedback
          [messageId]="message().id"
          (ratingSelected)="feedbackSelected.emit($event)"
        />
      }
    </article>
  `,
  styles: [`
    .chat-message {
      margin-bottom: 12px;
      padding: 10px 12px;
      border-radius: 10px;
      max-width: 94%;
      border: 1px solid #e5e5e5;
    }

    .chat-message--user {
      margin-left: auto;
      background: #eef4ff;
    }

    .chat-message--assistant {
      margin-right: auto;
      background: #f7f7f7;
    }

    .chat-message__meta {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 12px;
      color: #555;
      margin-bottom: 4px;
    }

    .chat-message__content {
      margin: 0;
      white-space: pre-wrap;
      line-height: 1.4;
    }

    .chat-message__status {
      margin: 6px 0 0;
      color: #9b1c1c;
      font-size: 12px;
    }
  `]
})
export class AssistantMessageComponent {
  readonly message = input.required<ChatMessage>();
  readonly feedbackSelected = output<{ messageId: string; rating: "positive" | "negative" }>();

  readonly authorLabel = computed(() => this.message().role === "user" ? "Tú" : "Asistente");

  readonly messageClass = computed(() => ({
    "chat-message--user": this.message().role === "user",
    "chat-message--assistant": this.message().role === "assistant"
  }));

  readonly ariaLabel = computed(() => `Mensaje de ${this.authorLabel()}`);
}

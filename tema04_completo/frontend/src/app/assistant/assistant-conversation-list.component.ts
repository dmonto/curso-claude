import { Component, input, output } from "@angular/core";
import { AssistantConversationSummary } from "./assistant.types";

@Component({
  selector: "app-assistant-conversation-list",
  standalone: true,
  template: `
    @if (conversations().length > 0) {
      <section class="conversation-list">
        <strong>Conversaciones</strong>

        @for (conversation of conversations(); track conversation.conversationId) {
          <button type="button" (click)="conversationSelected.emit(conversation.conversationId)">
            <span>{{ conversation.title }}</span>
            <small>{{ conversation.messageCount }} mensajes</small>
          </button>
        }
      </section>
    }
  `,
  styles: [`
    .conversation-list {
      padding: 8px 12px;
      border-bottom: 1px solid #eee;
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 145px;
      overflow: auto;
    }

    .conversation-list button {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      text-align: left;
      padding: 6px 8px;
      border: 1px solid #ddd;
      border-radius: 8px;
      background: #fff;
      cursor: pointer;
    }

    .conversation-list small {
      color: #666;
    }
  `]
})
export class AssistantConversationListComponent {
  readonly conversations = input.required<AssistantConversationSummary[]>();
  readonly conversationSelected = output<string>();
}

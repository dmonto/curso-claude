import { AfterViewChecked, Component, ElementRef, input, output, ViewChild } from "@angular/core";
import { ChatMessage } from "./assistant.types";
import { AssistantMessageComponent } from "./assistant-message.component";

@Component({
  selector: "app-assistant-message-list",
  standalone: true,
  imports: [AssistantMessageComponent],
  template: `
    <div class="chat-message-list" role="log" aria-live="polite" #scrollContainer>
      @for (message of messages(); track message.id) {
        <app-assistant-message
          [message]="message"
          (feedbackSelected)="feedbackSelected.emit($event)"
        />
      }
    </div>
  `,
  styles: [`
    .chat-message-list {
      padding: 12px;
      overflow-y: auto;
      flex: 1;
    }
  `]
})
export class AssistantMessageListComponent implements AfterViewChecked {
  readonly messages = input.required<ChatMessage[]>();
  readonly feedbackSelected = output<{ messageId: string; rating: "positive" | "negative" }>();

  @ViewChild("scrollContainer") private readonly scrollContainer?: ElementRef<HTMLDivElement>;

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    const element = this.scrollContainer?.nativeElement;

    if (!element) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }
}

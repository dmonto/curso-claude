import { Component, input } from "@angular/core";

@Component({
  selector: "app-assistant-typing-indicator",
  standalone: true,
  template: `
    @if (visible()) {
      <div class="typing-indicator" aria-live="polite">
        <span>{{ label() || "El asistente está preparando la respuesta" }}</span>
        <span class="typing-indicator__dots">...</span>
      </div>
    }
  `,
  styles: [`
    .typing-indicator {
      padding: 8px 12px;
      color: #666;
      font-size: 13px;
    }

    .typing-indicator__dots {
      letter-spacing: 2px;
    }
  `]
})
export class AssistantTypingIndicatorComponent {
  readonly visible = input(false);
  readonly label = input<string | null>(null);
}

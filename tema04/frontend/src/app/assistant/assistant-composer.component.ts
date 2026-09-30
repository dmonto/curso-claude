import { Component, input, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-assistant-composer",
  standalone: true,
  imports: [FormsModule],
  template: `
    <form class="assistant-composer" (ngSubmit)="submit()">
      <label class="sr-only" for="assistant-message-input">Mensaje para el asistente</label>

      <textarea
        id="assistant-message-input"
        name="draft"
        rows="2"
        [(ngModel)]="draft"
        [disabled]="disabled()"
        [attr.maxlength]="maxLength()"
        placeholder="Escribe tu mensaje..."
        (keydown)="handleKeydown($event)"
      ></textarea>

      <div class="assistant-composer__footer">
        <span>{{ draft().length }} / {{ maxLength() }}</span>
        <button type="submit" [disabled]="disabled() || !draft().trim()">Enviar</button>
      </div>
    </form>
  `,
  styles: [`
    .assistant-composer {
      border-top: 1px solid #eee;
      padding: 12px;
    }

    textarea {
      width: 100%;
      resize: none;
      padding: 8px;
      box-sizing: border-box;
    }

    .assistant-composer__footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      gap: 12px;
      font-size: 12px;
      color: #666;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
    }
  `]
})
export class AssistantComposerComponent {
  readonly disabled = input(false);
  readonly maxLength = input(1200);
  readonly sendMessage = output<string>();

  readonly draft = signal("");

  submit(): void {
    const text = this.draft().trim();

    if (!text || this.disabled()) {
      return;
    }

    this.sendMessage.emit(text);
    this.draft.set("");
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }
}

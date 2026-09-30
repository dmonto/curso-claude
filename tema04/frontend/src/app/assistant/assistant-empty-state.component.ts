import { Component, computed, inject, input, output } from "@angular/core";
import { AssistantFrontendContext } from "./assistant.types";
import { AssistantUxPolicyService } from "./assistant-ux-policy.service";

@Component({
  selector: "app-assistant-empty-state",
  standalone: true,
  template: `
    <section class="assistant-empty">
      <strong>¿Qué quieres hacer?</strong>
      <p>El asistente puede ayudarte con tareas relacionadas con la pantalla actual.</p>

      <div class="assistant-empty__suggestions">
        @for (suggestion of suggestions(); track suggestion.label) {
          <button type="button" (click)="promptSelected.emit(suggestion.prompt)">
            <span>{{ suggestion.label }}</span>
            <small>{{ suggestion.prompt }}</small>
          </button>
        }
      </div>
    </section>
  `,
  styles: [`
    .assistant-empty {
      padding: 16px;
      color: #555;
      line-height: 1.4;
    }

    .assistant-empty__suggestions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }

    button {
      text-align: left;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 10px;
      background: #fff;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    small {
      color: #666;
      line-height: 1.3;
    }
  `]
})
export class AssistantEmptyStateComponent {
  private readonly ux = inject(AssistantUxPolicyService);

  readonly context = input.required<AssistantFrontendContext>();
  readonly promptSelected = output<string>();

  readonly suggestions = computed(() => this.ux.getPromptSuggestions(this.context()));
}

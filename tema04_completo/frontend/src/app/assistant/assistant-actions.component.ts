import { Component, input, output } from "@angular/core";
import { AssistantAction } from "./assistant.types";

@Component({
  selector: "app-assistant-actions",
  standalone: true,
  template: `
    @if (actions().length > 0) {
      <section class="assistant-actions" aria-label="Acciones sugeridas">
        @for (action of actions(); track action.id) {
          <button
            type="button"
            [attr.title]="action.description || action.label"
            (click)="actionSelected.emit(action)"
          >
            <span>{{ action.label }}</span>
            @if (action.risk && action.risk !== "low") {
              <small>{{ action.risk }}</small>
            }
          </button>
        }
      </section>
    }
  `,
  styles: [`
    .assistant-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 12px;
      border-top: 1px solid #eee;
    }

    button {
      border: 1px solid #ddd;
      border-radius: 999px;
      background: #fff;
      padding: 6px 10px;
      cursor: pointer;
      display: flex;
      gap: 6px;
      align-items: center;
    }

    small {
      color: #777;
      font-size: 11px;
    }
  `]
})
export class AssistantActionsComponent {
  readonly actions = input.required<AssistantAction[]>();
  readonly actionSelected = output<AssistantAction>();
}

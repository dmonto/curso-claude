import { Component, output } from "@angular/core";

@Component({
  selector: "app-assistant-empty-state",
  standalone: true,
  template: `
    <section class="assistant-empty">
      <strong>¿Qué quieres hacer?</strong>

      <p>
        Puedes empezar con una de estas acciones rápidas o escribir tu propia pregunta.
      </p>

      <div class="assistant-empty__examples">
        @for (prompt of prompts; track prompt) {
          <button
            type="button"
            (click)="promptSelected.emit(prompt)"
          >
            {{ prompt }}
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

    .assistant-empty__examples {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }

    button {
      text-align: left;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 8px;
      background: #fff;
      cursor: pointer;
    }
  `]
})
export class AssistantEmptyStateComponent {
  readonly promptSelected = output<string>();

  readonly prompts = [
    "Resume esta pantalla",
    "Dime qué datos faltan",
    "Prepara una respuesta para soporte"
  ];
}
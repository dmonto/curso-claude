import { Component, input, output } from "@angular/core";
import { AssistantAction } from "./assistant.types";

@Component({
  selector: "app-assistant-confirmation-card",
  standalone: true,
  template: `
    @if (action()) {
      <section class="confirmation-card" aria-label="Confirmación de acción">
        <strong>Confirmar acción</strong>
        <p>{{ action()?.description || action()?.label }}</p>
        <small>Riesgo: {{ action()?.risk || "medium" }}</small>

        <div class="confirmation-card__buttons">
          <button type="button" (click)="cancel.emit()">Cancelar</button>
          <button type="button" (click)="confirm.emit(action()!)">Confirmar</button>
        </div>
      </section>
    }
  `,
  styles: [`
    .confirmation-card {
      margin: 8px 12px;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 10px;
      background: #fffdf7;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 13px;
    }

    .confirmation-card p {
      margin: 0;
      line-height: 1.4;
    }

    .confirmation-card__buttons {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `]
})
export class AssistantConfirmationCardComponent {
  readonly action = input<AssistantAction | null>(null);
  readonly confirm = output<AssistantAction>();
  readonly cancel = output<void>();
}

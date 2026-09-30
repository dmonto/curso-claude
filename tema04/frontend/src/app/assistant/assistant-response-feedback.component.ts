import { Component, input, output, signal } from "@angular/core";

@Component({
  selector: "app-assistant-response-feedback",
  standalone: true,
  template: `
    @if (!submitted()) {
      <section class="response-feedback" aria-label="Feedback de respuesta">
        <span>¿Te ha resultado útil?</span>
        <button type="button" (click)="submit('positive')" aria-label="Respuesta útil">Sí</button>
        <button type="button" (click)="submit('negative')" aria-label="Respuesta no útil">No</button>
      </section>
    } @else {
      <p class="response-feedback__thanks">Feedback registrado.</p>
    }
  `,
  styles: [`
    .response-feedback {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #eee;
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 12px;
      color: #666;
    }

    .response-feedback button {
      border: 1px solid #ddd;
      border-radius: 999px;
      background: #fff;
      padding: 4px 8px;
      cursor: pointer;
    }

    .response-feedback__thanks {
      margin: 8px 0 0;
      font-size: 12px;
      color: #666;
    }
  `]
})
export class AssistantResponseFeedbackComponent {
  readonly messageId = input.required<string>();
  readonly ratingSelected = output<{ messageId: string; rating: "positive" | "negative" }>();

  readonly submitted = signal(false);

  submit(rating: "positive" | "negative"): void {
    this.submitted.set(true);
    this.ratingSelected.emit({ messageId: this.messageId(), rating });
  }
}

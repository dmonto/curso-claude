import { Component, input, output } from "@angular/core";
import { AssistantClientError } from "./assistant.types";

@Component({
  selector: "app-assistant-error-banner",
  standalone: true,
  template: `
    @if (error()) {
      <section class="assistant-error" role="alert">
        <strong>{{ error()!.title }}</strong>
        <p>{{ error()!.message }}</p>

        @if (error()!.correlationId) {
          <small>Correlation ID: {{ error()!.correlationId }}</small>
        }

        @if (error()!.requestId) {
          <small>Request ID: {{ error()!.requestId }}</small>
        }

        <div class="assistant-error__actions">
          @if (error()!.retryable) {
            <button type="button" (click)="retry.emit()">Reintentar</button>
          }
          <button type="button" (click)="dismiss.emit()">Cerrar</button>
        </div>
      </section>
    }
  `,
  styles: [`
    .assistant-error {
      margin: 8px 12px;
      padding: 10px;
      border-radius: 10px;
      border: 1px solid #e4b5b5;
      background: #fff5f5;
      color: #7a1d1d;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
    }

    .assistant-error p {
      margin: 0;
      line-height: 1.4;
    }

    .assistant-error small {
      color: #8a5a5a;
      word-break: break-all;
    }

    .assistant-error__actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
  `]
})
export class AssistantErrorBannerComponent {
  readonly error = input<AssistantClientError | null>(null);
  readonly retry = output<void>();
  readonly dismiss = output<void>();
}

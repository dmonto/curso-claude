import { Component, input } from "@angular/core";
import { AssistantScreenContext } from "./assistant.types";

@Component({
  selector: "app-assistant-context-banner",
  standalone: true,
  template: `
    <section class="context-banner" aria-label="Contexto activo del asistente">
      @if (context().entityType && context().entityId) {
        <span class="context-banner__label">Contexto activo</span>
        <strong>{{ context().entityType }} {{ context().entityId }}</strong>
        <small>{{ context().route }}</small>
      } @else {
        <span class="context-banner__label">Sin entidad activa</span>
        <strong>Ayuda general de la aplicación</strong>
        <small>{{ context().route }}</small>
      }
    </section>
  `,
  styles: [`
    .context-banner {
      padding: 10px 12px;
      border-bottom: 1px solid #eee;
      background: #fafafa;
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 13px;
    }

    .context-banner__label {
      color: #666;
      font-size: 12px;
    }

    small {
      color: #777;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `]
})
export class AssistantContextBannerComponent {
  readonly context = input.required<AssistantScreenContext>();
}
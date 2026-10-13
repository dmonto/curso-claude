import { Component, computed, inject, input } from "@angular/core";
import { AssistantFrontendContext } from "./assistant.types";
import { AssistantUxPolicyService } from "./assistant-ux-policy.service";

@Component({
  selector: "app-assistant-context-banner",
  standalone: true,
  template: `
    <section
      class="context-banner"
      [class.context-banner--warning]="hint().severity === 'warning'"
      aria-label="Contexto activo del asistente"
    >
      <span class="context-banner__label">{{ hint().title }}</span>

      @if (context().entity) {
        <strong>{{ context().entity?.label || context().entity?.id }}</strong>

        @if (context().selection?.tab) {
          <small>Pestaña: {{ context().selection?.tab }}</small>
        }
      } @else {
        <strong>Ayuda general</strong>
      }

      <small>{{ hint().description }}</small>
      <small class="context-banner__route">{{ context().route }}</small>
    </section>
  `,
  styles: [`
    .context-banner {
      padding: 10px 12px;
      border-bottom: 1px solid #eee;
      background: #fafafa;
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 13px;
    }

    .context-banner--warning {
      background: #fffaf0;
    }

    .context-banner__label,
    small {
      color: #666;
      line-height: 1.3;
    }

    .context-banner__route {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `]
})
export class AssistantContextBannerComponent {
  private readonly ux = inject(AssistantUxPolicyService);

  readonly context = input.required<AssistantFrontendContext>();

  readonly hint = computed(() => this.ux.getContextHint(this.context()));
}

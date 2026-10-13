import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { AssistantContextService } from "./assistant/assistant-context.service";

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <main style="padding: 24px">
      <h3>Ficha de ticket</h3>

      <p><strong>Ticket activo:</strong> {{ ticketId }}</p>
      <p><strong>Servicio:</strong> payments-api</p>
      <p><strong>Prioridad:</strong> alta</p>

      <nav style="display: flex; gap: 8px; margin: 16px 0">
        <button type="button" (click)="selectTab('details')">Detalles</button>
        <button type="button" (click)="selectTab('history')">Histórico</button>
        <button type="button" (click)="selectTab('diagnostics')">Diagnóstico</button>
        <a [routerLink]="['/tickets', ticketId, 'history']">Abrir histórico</a>
      </nav>

      <p>Pestaña activa: {{ activeTab }}</p>
      <p>Usa el asistente para resumir el ticket, detectar información pendiente o preparar un escalado.</p>
    </main>
  `
})
export class TicketPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly assistantContext = inject(AssistantContextService);

  readonly ticketId = this.route.snapshot.paramMap.get("id") || "UNKNOWN";
  activeTab = "details";

  ngOnInit(): void {
    this.updateAssistantContext();
  }

  ngOnDestroy(): void {
    this.assistantContext.clearPageContext();
  }

  selectTab(tab: string): void {
    this.activeTab = tab;
    this.updateAssistantContext();
  }

  private updateAssistantContext(): void {
    this.assistantContext.setPageContext({
      pageKey: "ticket-detail",
      entity: {
        type: "ticket",
        id: this.ticketId,
        label: "Errores intermitentes en pagos"
      },
      selection: {
        tab: this.activeTab
      },
      pageCapabilities: {
        canSummarize: true,
        canPrepareEscalation: true,
        canNavigateHistory: true
      }
    });
  }
}

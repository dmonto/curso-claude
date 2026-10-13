import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { AssistantContextService } from "./assistant/assistant-context.service";

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <main style="padding: 24px">
      <h3>Histórico del ticket</h3>
      <p>Histórico de {{ ticketId }}</p>
      <a [routerLink]="['/tickets', ticketId]">Volver a ficha</a>
    </main>
  `
})
export class TicketHistoryPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly assistantContext = inject(AssistantContextService);

  readonly ticketId = this.route.snapshot.paramMap.get("id") || "UNKNOWN";

  ngOnInit(): void {
    this.assistantContext.setPageContext({
      pageKey: "ticket-history",
      entity: {
        type: "ticket",
        id: this.ticketId,
        label: "Histórico de ticket"
      },
      selection: {
        tab: "history"
      }
    });
  }

  ngOnDestroy(): void {
    this.assistantContext.clearPageContext();
  }
}

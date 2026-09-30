import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { AssistantContextService } from "./assistant/assistant-context.service";

@Component({
  standalone: true,
  template: `
    <main style="padding: 24px">
      <h3>Arquitectura del asistente</h3>
      <p>
        El asistente Angular llama a un backend propio, que valida contexto,
        consulta servicios internos y devuelve una respuesta estructurada.
      </p>
    </main>
  `
})
export class AssistantArchitecturePageComponent implements OnInit, OnDestroy {
  private readonly assistantContext = inject(AssistantContextService);

  ngOnInit(): void {
    this.assistantContext.setPageContext({
      pageKey: "assistant-architecture"
    });
  }

  ngOnDestroy(): void {
    this.assistantContext.clearPageContext();
  }
}

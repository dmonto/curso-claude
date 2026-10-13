import { Routes } from "@angular/router";

export const routes: Routes = [
  {
    path: "",
    redirectTo: "tickets/INC-1024",
    pathMatch: "full"
  },
  {
    path: "tickets/:id",
    loadComponent: () =>
      import("./ticket-page.component").then(m => m.TicketPageComponent)
  },
  {
    path: "tickets/:id/history",
    loadComponent: () =>
      import("./ticket-history-page.component").then(m => m.TicketHistoryPageComponent)
  },
  {
    path: "arquitectura-asistente",
    loadComponent: () =>
      import("./assistant-architecture-page.component").then(m => m.AssistantArchitecturePageComponent)
  }
];

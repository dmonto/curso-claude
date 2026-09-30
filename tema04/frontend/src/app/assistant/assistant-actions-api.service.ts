import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";

export interface EscalationDraftResponse {
  draft: {
    ticketId: string;
    title: string;
    targetTeam: string;
    summary: string;
    missingData: string[];
    recommendedPriority: string;
    requiresHumanConfirmation: boolean;
  };
  meta: {
    correlationId: string;
  };
}

@Injectable({
  providedIn: "root"
})
export class AssistantActionsApiService {
  private readonly http = inject(HttpClient);

  createEscalationDraft(ticketId: string) {
    return this.http.post<EscalationDraftResponse>(
      `/api/tickets/${ticketId}/escalation-draft`,
      {}
    );
  }
}

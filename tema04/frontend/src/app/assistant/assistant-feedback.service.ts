import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { AssistantFeedbackRequest } from "./assistant.types";

@Injectable({
  providedIn: "root"
})
export class AssistantFeedbackService {
  private readonly http = inject(HttpClient);

  sendFeedback(request: AssistantFeedbackRequest) {
    return this.http.post<{ ok: boolean; meta: { correlationId: string } }>(
      "/api/assistant/feedback",
      request
    );
  }
}

import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable, timeout } from "rxjs";
import {
  AssistantConversationListResponse,
  AssistantConversationResponse,
  AssistantRequest,
  AssistantResponse
} from "./assistant.types";

@Injectable({
  providedIn: "root"
})
export class AssistantApiService {
  private readonly http = inject(HttpClient);

  sendMessage(request: AssistantRequest): Observable<AssistantResponse> {
    return this.http
      .post<AssistantResponse>("/api/assistant/messages", request)
      .pipe(timeout(45000));
  }

  retryLastMessage(
    conversationId: string,
    screenContext: AssistantRequest["screenContext"]
  ): Observable<AssistantResponse> {
    return this.http
      .post<AssistantResponse>(`/api/assistant/conversations/${conversationId}/retry`, {
        screenContext
      })
      .pipe(timeout(45000));
  }

  getConversation(conversationId: string): Observable<AssistantConversationResponse> {
    return this.http
      .get<AssistantConversationResponse>(`/api/assistant/conversations/${conversationId}`)
      .pipe(timeout(10000));
  }

  listConversations(): Observable<AssistantConversationListResponse> {
    return this.http
      .get<AssistantConversationListResponse>("/api/assistant/conversations")
      .pipe(timeout(10000));
  }

  deleteConversation(conversationId: string): Observable<{ ok: boolean }> {
    return this.http
      .delete<{ ok: boolean }>(`/api/assistant/conversations/${conversationId}`)
      .pipe(timeout(10000));
  }
}

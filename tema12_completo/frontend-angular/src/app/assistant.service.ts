import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly http = inject(HttpClient);
  get<T>(baseUrl: string, endpoint: string, userId: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(baseUrl.replace(/\/$/, '') + endpoint, { headers: { 'x-user-id': userId } }));
  }
  post<T>(baseUrl: string, endpoint: string, userId: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(baseUrl.replace(/\/$/, '') + endpoint, body, { headers: { 'x-user-id': userId } }));
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Action, AssistantResponse, Capabilities, Health, User } from './assistant.types';

@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly http = inject(HttpClient);
  private baseUrl = 'http://localhost:3000';
  private token = '';
  private demoUser = '';
  private headers(): HttpHeaders {
    return this.token ? new HttpHeaders({ Authorization: `Bearer ${this.token}` }) : new HttpHeaders({ 'x-demo-user': this.demoUser });
  }
  reset() { this.token = ''; this.demoUser = ''; }
  async connect(baseUrl: string, username: string, password: string): Promise<{ health: Health; capabilities: Capabilities }> {
    this.reset();
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Introduce una URL HTTP o HTTPS válida.');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    const health = await firstValueFrom(this.http.get<Health>(`${this.baseUrl}/health`));
    if (health.authMode === 'jwt') {
      const login = await firstValueFrom(this.http.post<{ accessToken: string; user: User }>(`${this.baseUrl}/auth/login`, { username, password }));
      this.token = login.accessToken;
    } else this.demoUser = username;
    const capabilities = await firstValueFrom(this.http.get<Capabilities>(`${this.baseUrl}/api/me/capabilities`, { headers: this.headers() }));
    return { health, capabilities };
  }
  message(message: string): Promise<AssistantResponse> {
    return firstValueFrom(this.http.post<AssistantResponse>(`${this.baseUrl}/api/assistant`, { message }, { headers: this.headers() }));
  }
  confirm(actionId: string): Promise<{ action: Action; result: unknown; alreadyExecuted: boolean }> {
    return firstValueFrom(this.http.post<{ action: Action; result: unknown; alreadyExecuted: boolean }>(`${this.baseUrl}/api/actions/${encodeURIComponent(actionId)}/confirm`, { confirmed: true }, { headers: this.headers() }));
  }
  dismiss(actionId: string): Promise<{ action: Action }> {
    return firstValueFrom(this.http.post<{ action: Action }>(`${this.baseUrl}/api/actions/${encodeURIComponent(actionId)}/dismiss`, {}, { headers: this.headers() }));
  }
  action(actionId: string): Promise<{ action: Action }> {
    return firstValueFrom(this.http.get<{ action: Action }>(`${this.baseUrl}/api/actions/${encodeURIComponent(actionId)}`, { headers: this.headers() }));
  }
  performance(): Promise<unknown> {
    return firstValueFrom(this.http.get(`${this.baseUrl}/api/admin/performance`, { headers: this.headers() }));
  }
  errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'No se puede conectar con el backend. Comprueba que está iniciado y que la URL es correcta.';
      return error.error?.error || 'No se ha podido completar la solicitud.';
    }
    return error instanceof Error ? error.message : 'No se ha podido completar la solicitud.';
  }
}

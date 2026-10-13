import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
export interface Health { stage: number; version: string; title: string; ai_mode: string; features: string[]; }
export interface SinglePlan { kind: 'single'; flow_id: string; status: string; automation_type: string; summary: string; requires_confirmation: boolean;
  missing_fields: string[]; proposed_action: { action_name: string; payload: Record<string, unknown> }; }
export interface BatchPlan { kind: 'batch'; status: string; process_id: string; process_name: string; summary: string; dry_run_passed: boolean; total_candidates: number; approved_count: number; blocked_count: number;
  items: { entity_id: string; status: string; reason?: string }[]; }
export type LabPlan = SinglePlan | BatchPlan;
export interface TaskReply { assistant_message: string; task_state: string; plan?: LabPlan; result?: unknown; missing_fields?: string[]; }
@Injectable({ providedIn: 'root' })
export class LabApi {
  private http = inject(HttpClient);
  get<T>(base: string, path: string, user: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(base.replace(/\/$/, '') + path, { headers: new HttpHeaders({ 'X-Demo-User': user }) }));
  }
  post<T>(base: string, path: string, body: unknown, user: string): Promise<T> {
    return firstValueFrom(this.http.post<T>(base.replace(/\/$/, '') + path, body, { headers: new HttpHeaders({ 'X-Demo-User': user }) }));
  }
}

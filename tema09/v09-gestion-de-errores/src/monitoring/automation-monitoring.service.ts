import type { AuditService, AuditEvent } from '../services/audit.service.js';
import type { Identity } from '../types/automation.types.js';
export class MonitoringService {
  constructor(private audit: AuditService) {}
  events(user: Identity, filters: { status?: string; automation_type?: string; limit?: number; from?: string; to?: string } = {}): AuditEvent[] {
    return this.audit.events.filter(e => user.user_role === 'admin' || e.user_id === user.user_id)
      .filter(e => !filters.status || e.status === filters.status)
      .filter(e => !filters.automation_type || e.automation_type === filters.automation_type)
      .filter(e => !filters.from || Date.parse(e.created_at) >= Date.parse(filters.from))
      .filter(e => !filters.to || Date.parse(e.created_at) <= Date.parse(filters.to))
      .slice().reverse().slice(0, filters.limit ?? 100);
  }
  summary(user: Identity) {
    const events = this.events(user, { limit: Number.MAX_SAFE_INTEGER });
    const counter = (field: keyof AuditEvent) => {
      const result: Record<string, number> = {};
      for (const e of events) { const value = String(e[field] ?? ''); result[value] = (result[value] ?? 0) + 1; }
      return result;
    };
    // Las tasas se calculan por intento del executor; no se cuentan planificación, validación ni contenedores de lote.
    const attempts = events.filter(e => e.event_type === 'automation_execution_result' && ['executed', 'blocked', 'failed'].includes(e.status));
    const count = (status: string) => attempts.filter(e => e.status === status).length;
    const denominator = attempts.length || 1;
    const durations = attempts.map(e => e.duration_ms).filter((n): n is number => typeof n === 'number').sort((a, b) => a - b);
    const codes: Record<string, number> = {};
    for (const e of attempts) { const error = e.payload.error as { code?: string } | undefined; if (error?.code) codes[error.code] = (codes[error.code] ?? 0) + 1; }
    const validations = events.filter(e => e.event_type === 'pre_execution_validation');
    const batch = events.filter(e => e.event_type === 'batch_item_processed');
    return {
      generated_at: new Date().toISOString(), total_events: events.length, total_flows: new Set(events.map(e => e.flow_id)).size,
      by_event_type: counter('event_type'), by_automation_type: counter('automation_type'), by_status: counter('status'), by_user: counter('user_id'),
      terminal_attempts: attempts.length, executed: count('executed'), blocked: count('blocked'), failed: count('failed'),
      dry_runs: events.filter(e => e.event_type === 'automation_execution_result' && e.status === 'dry_run').length,
      health: { success_rate: count('executed') / denominator, blocked_rate: count('blocked') / denominator, failed_rate: count('failed') / denominator },
      validations: { total: validations.length, valid: validations.filter(e => e.status === 'valid').length, blocked: validations.filter(e => e.status === 'blocked').length },
      batch: { plans_created: events.filter(e => e.event_type === 'batch_plan_created').length, items_processed: batch.length,
        items_executed: batch.filter(e => e.status === 'executed').length, items_blocked: batch.filter(e => e.status === 'blocked').length,
        items_failed: batch.filter(e => e.status === 'failed').length, items_dry_run: batch.filter(e => e.status === 'dry_run').length },
      duration: { average_ms: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
        p95_ms: durations.length ? durations[Math.ceil(durations.length * 0.95) - 1] : 0 },
      most_common_errors: codes
    };
  }
}

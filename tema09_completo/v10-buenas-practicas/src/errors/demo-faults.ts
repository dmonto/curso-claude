import { ApiError } from './api-error.js';
import { withRetry } from './retry-policy.js';
import type { AuditService } from '../services/audit.service.js';
import type { BeforeMutation } from '../actions/action-executor.js';
export class DemoFaults {
  private faults = new Map<string, { mode: 'off' | 'once' | 'always'; remaining: number }>();
  constructor(private audit: AuditService) {}
  set(ticket: string, mode: 'off' | 'once' | 'always'): void { this.faults.set(ticket, { mode, remaining: mode === 'once' ? 1 : 0 }); }
  beforeMutation: BeforeMutation = async (action, payload, context) => {
    if (action !== 'add_comment') return;
    // Simula un fallo de lectura/validación del servicio externo, siempre antes del commit local.
    await withRetry(async () => {
      const fault = this.faults.get(String(payload.ticket_id));
      if (fault?.mode === 'always' || (fault?.mode === 'once' && fault.remaining-- > 0))
        throw new ApiError('EXTERNAL_TIMEOUT', 'El servicio interno ha tardado demasiado en responder.', 503);
    }, (attempt, error) => this.audit.write({ event_type: 'external_retry', flow_id: context.flow_id, automation_type: action,
      status: 'retrying', user_id: context.user_id, payload: { attempt, error: error.toJSON() } }));
  };
}

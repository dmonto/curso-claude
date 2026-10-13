import type { ActionRunner, ExecutionContext, Identity, Payload, Plan, Policy } from '../types/automation.types.js';
import { ApiError, toApiError } from '../errors/api-error.js';
import { createActionRegistry } from './action-registry.js';
import type { TicketRepository } from '../domain/support/ticket.repository.js';
import type { AuditService } from '../services/audit.service.js';
import type { PlanService } from '../planning/plan.service.js';
export type PayloadValidator = (action: string, payload: Payload) => Payload;
export type BeforeMutation = (action: string, payload: Payload, context: ExecutionContext) => Promise<void>;
export class ActionExecutor {
  private registry;
  private running = new Set<string>();
  private retryableFailures = new Set<string>();
  constructor(private stage: number, repo: TicketRepository, private plans: PlanService, private audit: AuditService,
    private options: { policy?: Policy; validate?: PayloadValidator; beforeMutation?: BeforeMutation; assertEnabled?: (action: string) => void } = {}) {
    this.registry = createActionRegistry(repo, stage);
  }
  validate(plan: Plan, user: Identity, confirmed: boolean, dryRun: boolean): Payload {
    const action = this.registry.get(plan.proposed_action.action_name);
    if (!action) throw new ApiError('ACTION_NOT_REGISTERED', 'Esta acción no está registrada.');
    this.options.assertEnabled?.(action.name);
    if (plan.status === 'executed') throw new ApiError('IDEMPOTENCY_CONFLICT', 'Esta acción ya fue ejecutada previamente.');
    const canRetry = plan.status === 'failed' && this.retryableFailures.has(plan.flow_id);
    if (!['ready_to_execute', 'waiting_for_confirmation'].includes(plan.status) && !canRetry)
      throw new ApiError('VALIDATION_ERROR', 'El estado del plan no permite ejecución.');
    if (!action.allowed_roles.includes(user.user_role)) throw new ApiError('PERMISSION_DENIED', `Tu rol no permite ejecutar ${action.name}.`, 403);
    if (action.requires_confirmation && !confirmed && !dryRun) throw new ApiError('CONFIRMATION_REQUIRED', 'Esta acción requiere confirmación explícita.');
    const payload = plan.proposed_action.payload;
    const missing = action.required_fields.filter(k => payload[k] == null || (typeof payload[k] === 'string' && !String(payload[k]).trim()));
    if (missing.length) throw new ApiError('MISSING_FIELDS', `Faltan datos: ${missing.join(', ')}.`);
    for (const name of action.required_fields) if (typeof payload[name] !== 'string')
      throw new ApiError('VALIDATION_ERROR', `${name} debe ser texto.`);
    const normalized = this.options.validate?.(action.name, payload) ?? structuredClone(payload);
    this.options.policy?.(action.name, normalized, user);
    return normalized;
  }
  run: ActionRunner = async (plan, context) => {
    const start = performance.now();
    if (this.running.has(plan.flow_id)) throw new ApiError('EXECUTION_IN_PROGRESS', 'La acción ya está ejecutándose.');
    let payload: Payload;
    try {
      payload = this.validate(plan, context, context.confirmed, context.dry_run);
      this.audit.write({ event_type: 'pre_execution_validation', flow_id: plan.flow_id, automation_type: plan.automation_type,
        status: 'valid', user_id: context.user_id, payload: { dry_run: context.dry_run } });
    } catch (error) {
      const e = toApiError(error);
      this.audit.write({ event_type: 'pre_execution_validation', flow_id: plan.flow_id, automation_type: plan.automation_type,
        status: 'blocked', user_id: context.user_id, payload: { errors: [e.code], error: e.toJSON() } });
      this.audit.write({ event_type: 'automation_execution_result', flow_id: plan.flow_id, automation_type: plan.automation_type,
        status: 'blocked', user_id: context.user_id, payload: { error: e.toJSON(), dry_run: context.dry_run } });
      throw e;
    }
    this.running.add(plan.flow_id);
    if (!context.dry_run) this.plans.mark(plan.flow_id, 'executing');
    try {
      // Los fallos externos del laboratorio se inyectan ANTES de modificar el repositorio.
      if (!context.dry_run) await this.options.beforeMutation?.(plan.automation_type, payload, context);
      const data = this.registry.get(plan.proposed_action.action_name)!.handler(payload, context);
      if (!context.dry_run) { this.plans.mark(plan.flow_id, 'executed'); this.retryableFailures.delete(plan.flow_id); }
      const result = { success: true, action_name: plan.automation_type, status: context.dry_run ? 'dry_run' as const : 'executed' as const,
        message: context.dry_run ? 'Simulación correcta. No se han modificado datos.' : 'Acción ejecutada correctamente.', data,
        duration_ms: Math.round(performance.now() - start) };
      this.audit.write({ event_type: 'automation_execution_result', flow_id: plan.flow_id, automation_type: plan.automation_type,
        status: result.status, user_id: context.user_id, duration_ms: result.duration_ms, payload: { dry_run: context.dry_run } });
      return result;
    } catch (error) {
      const e = toApiError(error);
      if (!context.dry_run) this.plans.mark(plan.flow_id, 'failed');
      if (e.toJSON().retryable) this.retryableFailures.add(plan.flow_id);
      this.audit.write({ event_type: 'automation_execution_result', flow_id: plan.flow_id, automation_type: plan.automation_type,
        status: 'failed', user_id: context.user_id, duration_ms: Math.round(performance.now() - start), payload: { error: e.toJSON() } });
      return { success: false, action_name: plan.automation_type, status: 'failed', message: e.message, error: e.toJSON() };
    } finally { this.running.delete(plan.flow_id); }
  };
}

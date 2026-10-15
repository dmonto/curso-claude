import type { ActionRunner } from '../types/automation.types.js';
import { getTask } from '../analysis/task-catalog.js';
import type { AuditService } from './audit.service.js';
import type { PlanService } from '../planning/plan.service.js';
import { ApiError } from '../errors/api-error.js';
export function simulatedExecutor(stage: number, plans: PlanService, audit: AuditService): ActionRunner {
  return async (plan, context) => {
    if (plan.status === 'executed') throw new ApiError('IDEMPOTENCY_CONFLICT', 'Esta simulación ya fue ejecutada.');
    if (!['ready_to_execute', 'waiting_for_confirmation'].includes(plan.status)) throw new ApiError('VALIDATION_ERROR', 'El estado del plan no permite ejecución.');
    const task = getTask(plan.automation_type, stage);
    if (!task) throw new ApiError('ACTION_NOT_REGISTERED', 'Tarea no disponible.');
    if (!task.allowed_roles.includes(context.user_role)) throw new ApiError('PERMISSION_DENIED', 'El rol de la sesión no permite ejecutar esta tarea.', 403);
    if (!context.dry_run && task.requires_confirmation && !context.confirmed) throw new ApiError('CONFIRMATION_REQUIRED', 'Confirma antes de ejecutar.');
    if (!context.dry_run) plans.mark(plan.flow_id, 'executed');
    const result = { success: true, action_name: task.name, status: context.dry_run ? 'dry_run' as const : 'executed' as const,
      message: 'Versión 02: ejecución simulada; no modifica tickets.', data: { simulated: true, would_execute: plan.proposed_action } };
    audit.write({ event_type: 'automation_execution_result', flow_id: plan.flow_id, automation_type: task.name,
      status: result.status, user_id: context.user_id, payload: { simulated: true } });
    return result;
  };
}

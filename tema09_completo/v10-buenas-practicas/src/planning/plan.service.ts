import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Analysis, Identity, Intent, Plan, Payload } from '../types/automation.types.js';
import { ApiError } from '../errors/api-error.js';
import { analysisFromIntent } from '../analysis/task-catalog.js';
import type { AuditService } from '../services/audit.service.js';
export class PlanService {
  private plans = new Map<string, Plan>();
  constructor(private stage: number, private audit: AuditService) {}
  create(intent: Intent, user: Identity): Plan {
    const analysis = analysisFromIntent(intent, this.stage);
    const status = !analysis.is_automatable ? 'blocked' : analysis.missing_fields.length ? 'waiting_for_user_data' :
      analysis.requires_confirmation ? 'waiting_for_confirmation' : 'ready_to_execute';
    const plan: Plan = {
      flow_id: randomUUID(), kind: 'single', created_by: user.user_id, created_at: new Date().toISOString(),
      status, automation_type: analysis.automation_type, risk_level: analysis.risk_level,
      requires_confirmation: analysis.requires_confirmation, summary: analysis.reason,
      missing_fields: analysis.missing_fields, can_execute: status === 'ready_to_execute',
      proposed_action: structuredClone(analysis.proposed_action),
      steps: [
        { id: 'validation', name: 'Validar datos, permisos y reglas en el backend', status: status === 'blocked' ? 'blocked' : 'pending' },
        { id: 'confirmation', name: 'Revisar y confirmar si modifica datos', status: 'pending' },
        { id: 'execution', name: 'Ejecutar la acción', status: 'pending' },
        { id: 'audit', name: 'Registrar evidencia', status: 'pending' }
      ],
      ...(status === 'blocked' ? { block_reason: analysis.reason } : {})
    };
    this.plans.set(plan.flow_id, plan);
    this.audit.write({ event_type: 'automation_plan_created', flow_id: plan.flow_id, automation_type: plan.automation_type,
      status, user_id: user.user_id, payload: { missing_fields: plan.missing_fields, risk_level: plan.risk_level } });
    return structuredClone(plan);
  }
  fromAnalysis(analysis: Analysis, user: Identity): Plan {
    // Se recalculan riesgo, endpoint, campos obligatorios y confirmación con el catálogo del backend.
    return this.create({ task_name: analysis.proposed_action.action_name ?? analysis.automation_type,
      slots: analysis.proposed_action.payload, confidence: analysis.is_automatable ? 1 : 0,
      user_message_summary: analysis.reason }, user);
  }
  get(id: string, user: Identity, supplied?: unknown): Plan {
    const plan = this.plans.get(id);
    if (!plan) throw new ApiError('PLAN_NOT_FOUND', 'No existe ese plan en este backend. Vuelve a prepararlo.', 404);
    if (plan.created_by !== user.user_id) throw new ApiError('PERMISSION_DENIED', 'Este plan pertenece a otra sesión.', 403);
    if (supplied && typeof supplied === 'object') {
      const p = supplied as { proposed_action?: unknown; automation_type?: unknown };
      if (!isDeepStrictEqual(p.proposed_action, plan.proposed_action) || p.automation_type !== plan.automation_type)
        throw new ApiError('PLAN_TAMPERED', 'El plan enviado ha cambiado. Genera uno nuevo antes de confirmar.');
    }
    return structuredClone(plan);
  }
  mark(id: string, status: Plan['status']): void {
    const plan = this.plans.get(id);
    if (!plan) return;
    plan.status = status; plan.can_execute = status === 'ready_to_execute';
    if (status === 'executed') plan.steps = plan.steps.map(s => ({ ...s, status: 'completed' }));
  }
  cancel(id: string, user: Identity): void {
    const plan = this.get(id, user);
    if (plan.status === 'executing') throw new ApiError('EXECUTION_IN_PROGRESS', 'La tarea ya está ejecutándose.');
    if (plan.status === 'executed') throw new ApiError('IDEMPOTENCY_CONFLICT', 'La tarea ya se ejecutó.');
    this.mark(id, 'cancelled');
    this.audit.write({ event_type: 'automation_cancelled', flow_id: id, automation_type: plan.automation_type,
      status: 'cancelled', user_id: user.user_id, payload: {} });
  }
}

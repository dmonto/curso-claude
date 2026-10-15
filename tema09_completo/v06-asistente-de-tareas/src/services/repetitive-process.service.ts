import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Identity, ExecutionResult } from '../types/automation.types.js';
import type { BatchItem, BatchPlan, BatchResult } from '../types/repetitive-process.types.js';
import type { TicketRepository } from '../domain/support/ticket.repository.js';
import type { PlanService } from '../planning/plan.service.js';
import type { ActionExecutor } from '../actions/action-executor.js';
import type { AuditService } from './audit.service.js';
import { ApiError, toApiError } from '../errors/api-error.js';
type RecordState = { plan: BatchPlan; executed: boolean; cancelled?: boolean; results: Map<string, ExecutionResult> };
export class RepetitiveProcessService {
  private records = new Map<string, RecordState>();
  private running = new Set<string>();
  constructor(private stage: number, private repo: TicketRepository, private plans: PlanService,
    private executor: ActionExecutor, private audit: AuditService, private assertEnabled?: (name: string) => void) {}
  private requireRole(user: Identity): void {
    if (!['support_lead', 'admin'].includes(user.user_role)) throw new ApiError('PERMISSION_DENIED', 'Los lotes requieren support_lead o admin.', 403);
  }
  create(name: string, user: Identity, maxItems = 10, staleHours = 48): BatchPlan {
    this.requireRole(user); this.assertEnabled?.(name);
    if (!['stale_ticket_followup', ...(this.stage >= 6 ? ['urgent_without_owner'] : [])].includes(name))
      throw new ApiError('ACTION_NOT_REGISTERED', 'Proceso no disponible en esta versión.');
    if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 10 || !Number.isFinite(staleHours) || staleHours < 1 || staleHours > 1680)
      throw new ApiError('VALIDATION_ERROR', 'max_items debe estar entre 1 y 10; stale_hours entre 1 y 1680.', 400);
    const candidates = this.repo.list().filter(t => t.status !== 'closed').filter(t => name === 'stale_ticket_followup' ?
      Date.now() - Date.parse(t.updated_at) >= staleHours * 3600000 : t.priority === 'urgent' && !t.owner_team).slice(0, maxItems);
    const items: BatchItem[] = candidates.map(ticket => {
      const action = name === 'stale_ticket_followup' ? 'add_comment' : 'assign_owner';
      const payload = action === 'add_comment' ? { ticket_id: ticket.ticket_id, comment: `Seguimiento automático: ticket sin actualización desde hace al menos ${staleHours} horas. Revisar estado y próximos pasos.` } :
        { ticket_id: ticket.ticket_id, owner_team: 'soporte N2' };
      const reason = ticket.category === 'security' ? 'Los tickets de seguridad requieren revisión manual.' :
        name === 'stale_ticket_followup' && ticket.priority === 'urgent' ? 'Los tickets urgentes requieren revisión manual.' : undefined;
      const flow = !reason ? this.plans.create({ task_name: action, confidence: 1, slots: payload, user_message_summary: `Seguimiento de ${ticket.ticket_id}` }, user) : undefined;
      return { item_id: randomUUID(), entity_id: ticket.ticket_id, entity_type: 'ticket', ticket_revision: ticket.revision,
        status: reason ? 'blocked' : 'approved', ...(reason ? { reason } : {}), ...(flow ? { flow_id: flow.flow_id } : {}),
        proposed_action: { action_name: action, payload } };
    });
    const plan: BatchPlan = { kind: 'batch', status: 'draft', process_id: randomUUID(), process_name: name,
      summary: name === 'stale_ticket_followup' ? 'Añadir comentarios de seguimiento a tickets sin actualizar' : 'Asignar urgentes sin responsable a soporte N2',
      created_by: user.user_id, created_at: new Date().toISOString(), dry_run_required: true, dry_run_passed: false,
      requires_confirmation: true, max_items: maxItems, total_candidates: items.length,
      approved_count: items.filter(i => i.status === 'approved').length, blocked_count: items.filter(i => i.status === 'blocked').length, items };
    this.records.set(plan.process_id, { plan, executed: false, results: new Map() });
    this.audit.write({ event_type: 'batch_plan_created', flow_id: plan.process_id, automation_type: name,
      status: 'created', user_id: user.user_id, payload: { total_candidates: items.length, approved_count: plan.approved_count, blocked_count: plan.blocked_count } });
    return structuredClone(plan);
  }
  get(id: string, user: Identity, supplied?: unknown): BatchPlan {
    this.requireRole(user);
    const record = this.records.get(id);
    if (!record) throw new ApiError('PLAN_NOT_FOUND', 'No existe ese proceso en este backend.', 404);
    if (record.plan.created_by !== user.user_id) throw new ApiError('PERMISSION_DENIED', 'Este proceso pertenece a otra sesión.', 403);
    if (supplied && typeof supplied === 'object') {
      const compare = (p: BatchPlan) => ({ process_name: p.process_name, items: p.items.map(i => ({ item_id: i.item_id, entity_id: i.entity_id, proposed_action: i.proposed_action })) });
      try { if (!isDeepStrictEqual(compare(supplied as BatchPlan), compare(record.plan))) throw new Error(); }
      catch { throw new ApiError('PLAN_TAMPERED', 'El lote enviado ha cambiado. Genera un nuevo plan.'); }
    }
    return structuredClone(record.plan);
  }
  async execute(id: string, user: Identity, confirmed: boolean, dryRun: boolean, retryFailed = false): Promise<BatchResult> {
    const plan = this.get(id, user); this.assertEnabled?.(plan.process_name);
    const record = this.records.get(id)!;
    if (record.cancelled) throw new ApiError('VALIDATION_ERROR', 'Este lote ha sido cancelado.');
    if (this.running.has(id)) throw new ApiError('EXECUTION_IN_PROGRESS', 'El lote ya está ejecutándose.');
    if (!dryRun && !confirmed) throw new ApiError('CONFIRMATION_REQUIRED', 'Confirma el lote antes de ejecutar.');
    if (!dryRun && !record.plan.dry_run_passed) throw new ApiError('DRY_RUN_REQUIRED', 'Ejecuta primero un dry run de este process_id.');
    if (record.executed && !retryFailed) throw new ApiError('IDEMPOTENCY_CONFLICT', 'El lote ya fue ejecutado. Usa retry-failed para fallos transitorios.');
    if (retryFailed && (this.stage < 9 || !record.executed || dryRun)) throw new ApiError('VALIDATION_ERROR', 'No hay un lote ejecutado que pueda reintentarse.');
    this.running.add(id);
    try {
      const output: BatchResult['items'] = [];
      for (const item of record.plan.items) {
        const previous = record.results.get(item.item_id);
        if (retryFailed && !(previous?.status === 'failed' && previous.error?.retryable)) {
          output.push({ ...item, status: previous?.status ?? item.status, ...(previous ? { result: previous } : {}) });
          continue;
        }
        let result: ExecutionResult;
        if (item.status === 'blocked') result = { success: false, action_name: item.proposed_action.action_name, status: 'blocked', message: item.reason! };
        else {
          const current = this.repo.find(item.entity_id);
          try {
            // Revalidar cada entidad evita ejecutar un plan sobre un estado que cambió después de la vista previa.
            if (!current || current.revision !== item.ticket_revision) throw new ApiError('PLAN_STALE', 'El ticket cambió desde que se generó el lote. Genera un nuevo plan.');
            if (current.status === 'closed' || current.category === 'security' || (plan.process_name === 'stale_ticket_followup' && current.priority === 'urgent'))
              throw new ApiError('BUSINESS_RULE_BLOCKED', 'El ticket ya no cumple los criterios del proceso.');
            const flow = this.plans.get(item.flow_id!, user);
            result = await this.executor.run(flow, { ...user, flow_id: flow.flow_id, confirmed, dry_run: dryRun });
          } catch (error) {
            const e = toApiError(error);
            result = { success: false, action_name: item.proposed_action.action_name, status: 'blocked', message: e.message, error: e.toJSON() };
          }
        }
        if (!dryRun) record.results.set(item.item_id, result);
        output.push({ ...item, status: result.status, result });
        this.audit.write({ event_type: 'batch_item_processed', flow_id: id, automation_type: plan.process_name,
          status: result.status, user_id: user.user_id, payload: { entity_id: item.entity_id, action_name: item.proposed_action.action_name, error: result.error ?? null, dry_run: dryRun } });
      }
      if (dryRun) record.plan.dry_run_passed = output.every(i => i.status === 'dry_run' || (i.status === 'blocked' && record.plan.items.find(x => x.item_id === i.item_id)?.status === 'blocked'));
      else { record.executed = true; record.plan.status = 'executed'; }
      const summary = { total: output.length, executed: output.filter(i => i.status === 'executed').length,
        blocked: output.filter(i => i.status === 'blocked').length, failed: output.filter(i => i.status === 'failed').length,
        dry_run: output.filter(i => i.status === 'dry_run').length };
      const status = dryRun ? 'dry_run' : summary.executed && (summary.blocked || summary.failed) ? 'partial_success' :
        summary.failed ? 'failed' : summary.blocked && !summary.executed ? 'blocked' : 'executed';
      this.audit.write({ event_type: retryFailed ? 'batch_retry_finished' : 'batch_plan_executed', flow_id: id,
        automation_type: plan.process_name, status, user_id: user.user_id, payload: summary });
      return { process_id: id, process_name: plan.process_name, status, dry_run_passed: record.plan.dry_run_passed, summary, items: output };
    } finally { this.running.delete(id); }
  }
  cancel(id: string, user: Identity): void {
    const plan = this.get(id, user);
    if (this.running.has(id)) throw new ApiError('EXECUTION_IN_PROGRESS', 'El lote ya está ejecutándose.');
    const record = this.records.get(id)!;
    if (record.executed) throw new ApiError('IDEMPOTENCY_CONFLICT', 'El lote ya fue ejecutado.');
    record.cancelled = true;
    record.plan.status = 'cancelled';
    this.audit.write({ event_type: 'batch_cancelled', flow_id: id, automation_type: plan.process_name, status: 'cancelled', user_id: user.user_id, payload: {} });
  }
}

import type { ClaudeService } from '../analysis/claude.service.js';
import { getTask, missingFields } from '../analysis/task-catalog.js';
import type { Identity, Payload, Plan, ExecutionResult, ActionRunner } from '../types/automation.types.js';
import type { BatchPlan, BatchResult } from '../types/repetitive-process.types.js';
import type { PlanService } from '../planning/plan.service.js';
import type { RepetitiveProcessService } from '../services/repetitive-process.service.js';
import { ApiError } from '../errors/api-error.js';
type Session = { user_id: string; task_name: string; slots: Payload; plan?: Plan | BatchPlan; completed?: boolean };
export type TaskResponse = { conversation_id: string; assistant_message: string; task_state: string; detected_task: string;
  missing_fields: string[]; confirmation_required: boolean; plan?: Plan | BatchPlan; result?: ExecutionResult | BatchResult };
export class TaskAssistant {
  private sessions = new Map<string, Session>();
  private running = new Set<string>();
  constructor(private stage: number, private claude: ClaudeService, private plans: PlanService,
    private run: ActionRunner, private processes: RepetitiveProcessService) {}
  private key(id: string, user: Identity): string { return `${user.user_id}:${id}`; }
  async message(id: string, message: string, user: Identity): Promise<TaskResponse> {
    const key = this.key(id, user);
    if (this.running.has(key)) throw new ApiError('EXECUTION_IN_PROGRESS', 'La conversación está procesando otra petición.');
    this.running.add(key);
    try {
      const previous = this.sessions.get(key);
      const base = { conversation_id: id, detected_task: 'unknown', missing_fields: [], confirmation_required: false };
      if (['cancelar', 'cancela', 'cancel', 'olvídalo'].includes(message.trim().toLowerCase())) {
        if (previous?.plan?.kind === 'single' && !previous.completed) this.plans.cancel(previous.plan.flow_id, user);
        if (previous?.plan?.kind === 'batch' && !previous.completed) this.processes.cancel(previous.plan.process_id, user);
        this.sessions.delete(key);
        return { ...base, assistant_message: 'He cancelado la tarea actual.', task_state: 'cancelled' };
      }
      const active = previous && !previous.completed ? previous : undefined;
      const intent = await this.claude.detect(message, active ? { task_name: active.task_name, slots: active.slots } : undefined);
      const task = getTask(intent.task_name, this.stage);
      if (!task || intent.confidence < 0.55) {
        // Una petición no soportada invalida la propuesta anterior: no queda una confirmación ambigua.
        if (active?.plan?.kind === 'single') this.plans.cancel(active.plan.flow_id, user);
        if (active?.plan?.kind === 'batch') this.processes.cancel(active.plan.process_id, user);
        this.sessions.delete(key);
        return { ...base, assistant_message: 'La tarea no está disponible. Puedes crear, buscar y asignar tickets o preparar un seguimiento.', task_state: 'blocked' };
      }
      const slots = { ...(active?.task_name === task.name ? active.slots : {}), ...intent.slots };
      if (active?.plan?.kind === 'single') this.plans.cancel(active.plan.flow_id, user);
      if (active?.plan?.kind === 'batch') this.processes.cancel(active.plan.process_id, user);
      const missing = missingFields(task, slots);
      const session: Session = { user_id: user.user_id, task_name: task.name, slots };
      this.sessions.set(key, session);
      if (missing.length) return { ...base, detected_task: task.name, missing_fields: missing,
        assistant_message: `Necesito estos datos para continuar: ${missing.join(', ')}.`, task_state: 'collecting_data' };
      const plan = task.mode === 'batch' ? this.processes.create(task.name, user, Number(slots.max_items ?? 10), Number(slots.stale_hours ?? 48)) :
        this.plans.create({ ...intent, task_name: task.name, slots }, user);
      session.plan = plan;
      if (!task.requires_confirmation && plan.kind === 'single') {
        const result = await this.run(plan, { ...user, flow_id: plan.flow_id, confirmed: false, dry_run: false });
        session.completed = result.success;
        return { ...base, detected_task: task.name, assistant_message: result.message, task_state: result.success ? 'completed' : 'failed', plan, result };
      }
      return { ...base, detected_task: task.name, confirmation_required: true, task_state: 'waiting_for_confirmation', plan,
        assistant_message: plan.kind === 'batch' ? 'He preparado el lote. Primero simúlalo; después revisa y confirma.' : 'He preparado el plan. Revisa los datos y confirma para ejecutarlo.' };
    } finally { this.running.delete(key); }
  }
  async confirm(id: string, user: Identity, confirmed: boolean, dryRun: boolean): Promise<TaskResponse> {
    const key = this.key(id, user);
    if (this.running.has(key)) throw new ApiError('EXECUTION_IN_PROGRESS', 'La conversación ya está procesando una petición.');
    const session = this.sessions.get(key);
    if (!session?.plan) throw new ApiError('PLAN_NOT_FOUND', 'No hay una tarea pendiente en esta conversación.', 404);
    this.running.add(key);
    try {
      const base = { conversation_id: id, detected_task: session.task_name, missing_fields: [], confirmation_required: false };
      if (!confirmed && !dryRun) {
        if (session.plan.kind === 'single') this.plans.cancel(session.plan.flow_id, user);
        else this.processes.cancel(session.plan.process_id, user);
        this.sessions.delete(key);
        return { ...base, assistant_message: 'He cancelado la tarea. No se ha ejecutado.', task_state: 'cancelled' };
      }
      const result = session.plan.kind === 'batch' ? await this.processes.execute(session.plan.process_id, user, confirmed, dryRun) :
        await this.run(this.plans.get(session.plan.flow_id, user), { ...user, flow_id: session.plan.flow_id, confirmed, dry_run: dryRun });
      if (!dryRun) session.completed = true;
      const updated = session.plan.kind === 'batch' ? this.processes.get(session.plan.process_id, user) : this.plans.get(session.plan.flow_id, user);
      return { ...base, plan: updated, result, confirmation_required: dryRun,
        assistant_message: dryRun ? 'Simulación terminada. Revisa el resultado y confirma para modificar datos.' : 'La tarea ha terminado. Revisa el resultado.',
        task_state: dryRun ? 'waiting_for_confirmation' : result.status === 'failed' ? 'failed' : result.status === 'blocked' ? 'blocked' : 'completed' };
    } finally { this.running.delete(key); }
  }
}

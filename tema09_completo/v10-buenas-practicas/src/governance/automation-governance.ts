import { taskCatalog } from '../analysis/task-catalog.js';
import { actionSchemas } from '../validation/action-schemas.js';
import { ApiError } from '../errors/api-error.js';
export class AutomationGovernance {
  constructor(private disabled: Set<string>, private stage: number) {}
  assertEnabled = (name: string): void => {
    if (this.disabled.has(name)) throw new ApiError('ACTION_DISABLED', 'Esta automatización está desactivada.');
  };
  entries() {
    return taskCatalog.filter(t => t.min_stage <= this.stage).map(t => ({
      action_name: t.name, enabled: !this.disabled.has(t.name), owner: t.mode === 'batch' ? 'operations' : 'support',
      risk_level: t.risk_level, requires_confirmation: t.requires_confirmation, allowed_roles: t.allowed_roles,
      schema_present: t.mode === 'batch' || Boolean(actionSchemas[t.name]),
      dry_run_required: t.mode === 'batch', ...(t.mode === 'batch' ? { max_batch_items: 10 } : {})
    }));
  }
  readiness() {
    const actions = this.entries().map(t => ({ ...t, ready: t.enabled && t.schema_present,
      issues: [...(!t.enabled ? ['Automatización desactivada'] : []), ...(!t.schema_present ? ['Falta esquema'] : [])] }));
    return { status: actions.every(a => a.ready) ? 'ready' : 'warning', actions };
  }
}

import { taskCatalog } from '../analysis/task-catalog.js';
import { runTicketAction } from './ticket.actions.js';
import type { ExecutionContext, Payload } from '../types/automation.types.js';
import type { TicketRepository } from '../domain/support/ticket.repository.js';
export function createActionRegistry(repo: TicketRepository, stage: number) {
  return new Map(taskCatalog.filter(t => t.min_stage <= stage && t.mode === 'single').map(task =>
    [task.name, { ...task, handler: (payload: Payload, context: ExecutionContext) => runTicketAction(repo, task.name, payload, context) }]
  ));
}

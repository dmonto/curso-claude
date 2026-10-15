import { HttpError, audit, id, now, withLock } from './storage.js';
import { executeConfirmedAction } from './actions.js';
import { getSession, saveSession } from './sessions.js';

export function createSupervision(runtime) {
  return {
    requiresHumanApproval(action) {
      if (action.toolName === 'cancel_order') return { required: true, riskLevel: action.evidence.order.amount >= 100 ? 'high' : 'medium', reason: 'Las cancelaciones requieren supervisor en este laboratorio.' };
      if (action.toolName === 'create_support_ticket' && (action.input.priority === 'high' || action.evidence.customer?.tier === 'vip')) return { required: true, riskLevel: 'high', reason: 'Ticket prioritario o cliente VIP.' };
      return { required: false };
    },
    createApproval(action, review) {
      const approval = { approvalId: id('APR'), status: 'pending', ...review, userId: action.userId, conversationId: action.conversationId, taskName: action.taskName, toolName: action.toolName, toolInput: action.input, agentSummary: action.summary, evidence: action.evidence, action: structuredClone(action), createdAt: now(), expiresAt: action.expiresAt };
      runtime.state.approvals.push(approval); runtime.saveState();
      audit(runtime, 'approvals.jsonl', approval);
      return approval;
    },
    listPending() {
      return runtime.state.approvals.filter(item => item.status === 'pending' && new Date(item.expiresAt).getTime() > Date.now()).map(({ action, ...item }) => item);
    },
    async decide(approvalId, decision, supervisor, reason) {
      return withLock(runtime, `approval:${approvalId}`, async () => {
        const approval = runtime.state.approvals.find(item => item.approvalId === approvalId);
        if (!approval) throw new HttpError(404, 'APPROVAL_NOT_FOUND', 'Solicitud no encontrada.');
        if (approval.status !== 'pending') throw new HttpError(409, 'APPROVAL_ALREADY_DECIDED', 'Esta solicitud ya tiene una decisión.');
        if (new Date(approval.expiresAt).getTime() <= Date.now()) {
          approval.status = 'expired'; runtime.saveState();
          throw new HttpError(410, 'APPROVAL_EXPIRED', 'La solicitud de aprobación ha caducado.');
        }
        const correlationId = id('corr');
        approval.decidedBy = supervisor.userId; approval.decidedAt = now(); approval.decisionReason = reason;
        let result = { success: true, status: 'rejected', text: 'Solicitud rechazada. No se ha ejecutado ninguna acción.', toolTrace: [] };
        if (decision === 'approve') {
          approval.status = 'executing'; runtime.saveState();
          // executeDomain revalida el estado y versión del pedido antes de escribir.
          result = await executeConfirmedAction(runtime, approval.action, correlationId);
          approval.status = result.success ? 'approved' : 'execution_failed';
          approval.executionResult = result.executionResult;
        } else approval.status = 'rejected';
        runtime.saveState();
        audit(runtime, 'approval-decisions.jsonl', { approvalId, decision, decidedBy: supervisor.userId, reason, success: result.success, status: approval.status, correlationId });
        const session = getSession(runtime, approval.userId, approval.conversationId);
        session.turns.push([{ role: 'user', content: `Decisión del supervisor para ${approvalId}` }, { role: 'assistant', content: result.text }]);
        saveSession(runtime, session);
        return { ...result, approvalId, decision: { decision, decidedBy: supervisor.userId, reason, decidedAt: approval.decidedAt }, approvalStatus: approval.status, conversationId: approval.conversationId, correlationId };
      });
    }
  };
}

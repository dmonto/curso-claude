export interface Version { id: string; stage: number; title: string; }
export interface Capabilities {
  version: Version; userId: string; tasks: Record<string, { description: string }>;
  permissions: { canSupervise?: boolean }; features: Record<string, boolean>;
}
export interface Order { id: string; customerName: string; status: string; amount: number; canCancel: boolean; deliveryAddress: string; }
export interface PendingAction { actionId: string; summary: string; expiresAt: string; input: Record<string, unknown>; }
export interface ToolTrace { toolName: string; status: string; result: unknown; }
export interface AgentReply {
  success: boolean; text: string; status: string; conversationId: string;
  taskName?: string; pendingAction?: PendingAction | null; toolTrace?: ToolTrace[];
  approvalRequired?: boolean; approvalId?: string; errorCode?: string;
}
export interface Approval {
  approvalId: string; agentSummary: string; reason: string; riskLevel: string;
  userId: string; taskName: string; toolName: string; toolInput: Record<string, unknown>;
  evidence: unknown; expiresAt: string;
}
export interface ChatEntry { role: 'user' | 'assistant'; text: string; reply?: AgentReply; }

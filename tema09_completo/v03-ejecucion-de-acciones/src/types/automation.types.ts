export type Role = 'support_agent' | 'support_lead' | 'admin' | 'viewer';
export type Identity = { user_id: string; user_role: Role };
export type Payload = Record<string, unknown>;
export type Intent = { task_name: string; confidence: number; slots: Payload; user_message_summary: string };
export type Analysis = {
  is_automatable: boolean; automation_type: string; risk_level: 'low' | 'medium' | 'high';
  requires_confirmation: boolean; missing_fields: string[]; reason: string;
  proposed_action: { action_name: string; endpoint: string | null; payload: Payload };
};
export type FlowStatus = 'waiting_for_user_data' | 'waiting_for_confirmation' | 'ready_to_execute' |
  'blocked' | 'executing' | 'executed' | 'failed' | 'cancelled';
export type Plan = {
  flow_id: string; kind: 'single'; created_by: string; created_at: string; status: FlowStatus;
  automation_type: string; risk_level: Analysis['risk_level']; requires_confirmation: boolean;
  summary: string; missing_fields: string[]; can_execute: boolean; block_reason?: string;
  proposed_action: Analysis['proposed_action'];
  steps: { id: string; name: string; status: 'pending' | 'completed' | 'blocked' }[];
};
export type SafeError = { code: string; category: string; retryable: boolean; user_message: string; details?: Payload };
export type ExecutionResult = {
  success: boolean; action_name: string; status: 'executed' | 'dry_run' | 'blocked' | 'failed';
  message: string; data?: Payload; error?: SafeError; duration_ms?: number;
};
export type ExecutionContext = Identity & { confirmed: boolean; dry_run: boolean; flow_id: string };
export type ActionRunner = (plan: Plan, context: ExecutionContext) => Promise<ExecutionResult>;
export type Policy = (action: string, payload: Payload, identity: Identity) => void;

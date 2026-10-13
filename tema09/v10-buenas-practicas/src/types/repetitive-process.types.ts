import type { ExecutionResult, Payload } from './automation.types.js';
export type BatchItem = {
  item_id: string; entity_id: string; entity_type: 'ticket'; ticket_revision: number;
  status: 'approved' | 'blocked'; reason?: string; flow_id?: string;
  proposed_action: { action_name: string; payload: Payload };
};
export type BatchPlan = {
  status: 'draft' | 'executed' | 'cancelled';
  kind: 'batch'; process_id: string; process_name: string; summary: string; created_by: string; created_at: string;
  dry_run_required: true; dry_run_passed: boolean; requires_confirmation: true; max_items: number;
  total_candidates: number; approved_count: number; blocked_count: number; items: BatchItem[];
};
export type BatchResult = {
  process_id: string; process_name: string; status: 'executed' | 'partial_success' | 'failed' | 'blocked' | 'dry_run';
  dry_run_passed: boolean; summary: { total: number; executed: number; blocked: number; failed: number; dry_run: number };
  items: (Omit<BatchItem, 'status'> & { status: string; result?: ExecutionResult })[];
};

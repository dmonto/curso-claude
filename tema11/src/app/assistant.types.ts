export interface Features { stage: number; actions: boolean; jwt: boolean; roles: boolean; performance: boolean; advancedSearch: boolean; [key: string]: unknown; }
export interface Health { status: string; version: string; title: string; authMode: string; modelMode: string; features: Features; }
export interface User { id: string; displayName: string; tenantId: string; permissions: string[]; roles: string[]; }
export interface Capabilities { user: User; availableTools: string[]; permissions: string[]; features: Features; }
export interface Action {
  actionId: string; type: 'cancel_order' | 'create_ticket'; orderId: string;
  status: 'pending' | 'executing' | 'executed' | 'failed' | 'expired' | 'dismissed' | 'unknown_outcome';
  summary: string; details: Record<string, unknown>; createdAt: string; expiresAt: string;
  result?: unknown; error?: string;
}
export interface AssistantResponse {
  ok: boolean; answer: string; correlationId: string; mode: string; toolCalls: number;
  toolResults: unknown[]; pendingActions: Action[]; durationMs: number;
  usage: { inputTokens: number; outputTokens: number };
}
export interface ChatMessage { id: string; role: 'user' | 'assistant'; text: string; response?: AssistantResponse; actions: Action[]; }

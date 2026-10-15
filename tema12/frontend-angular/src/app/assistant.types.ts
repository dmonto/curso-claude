export interface Version { id: string; stage: number; title: string; description?: string; }
export interface Capabilities { version: Version; userId: string; tasks: Record<string, { description: string }>; permissions: Record<string, boolean>; features: Record<string, boolean>; }
export interface Ticket { id: string; title: string; status: string; priority: string; pendingTasks: string[]; noteCount: number; sla: string; }
export interface PendingAction { actionId: string; type: string; resourceId: string; summary: string; expiresAt: string; }
export interface ContextReply { success: boolean; text: string; status: string; conversationId: string; pendingAction?: PendingAction | null; contextDebug?: unknown; }
export interface ChatEntry { role: 'user' | 'assistant'; text: string; reply?: ContextReply; }
export interface AppContext { route: string; appArea: 'support' | 'billing' | 'admin'; view: 'ticket_list' | 'ticket_detail' | 'dashboard' | 'unknown'; activeEntity: { type: 'ticket' | 'customer' | 'order' | 'none'; id?: string }; activeTab?: string; filters?: Record<string,string>; selectedRows?: string[]; lastUiError?: { code: string; visibleMessage?: string; occurredAt?: string }; draftState?: { hasUnsavedChanges?: boolean; draftReply?: string }; }

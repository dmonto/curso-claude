export type ChatRole = "user" | "assistant";

export type MessageStatus = "sending" | "sent" | "error";

export type AssistantContentBlock =
  | {
      type: "summary";
      title?: string;
      text: string;
    }
  | {
      type: "paragraph";
      title?: string;
      text: string;
    }
  | {
      type: "bullet_list";
      title?: string;
      items: string[];
    }
  | {
      type: "key_value";
      title?: string;
      items: Array<{ key: string; value: string }>;
    }
  | {
      type: "warning";
      title?: string;
      text: string;
    }
  | {
      type: "reference";
      title?: string;
      items: Array<{
        label: string;
        sourceId: string;
        sourceType: "ticket" | "knowledge" | "backend";
      }>;
    };

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  status?: MessageStatus;
  blocks?: AssistantContentBlock[];
}

export interface AssistantFrontendContext {
  route: string;
  pageKey?: string;
  entity?: {
    type: string;
    id: string;
    label?: string;
  };
  selection?: {
    tab?: string;
    selectedIds?: string[];
    filters?: Record<string, string | number | boolean>;
  };
  pageCapabilities?: {
    canSummarize?: boolean;
    canPrepareEscalation?: boolean;
    canNavigateHistory?: boolean;
  };
  client: {
    locale: string;
    timezone: string;
    appVersion: string;
  };
}

export interface AssistantRequest {
  conversationId: string;
  message: string;
  screenContext: AssistantFrontendContext;
}

export type AssistantActionRisk = "low" | "medium" | "high";

export interface AssistantAction {
  id: string;
  label: string;
  type: "navigate" | "open_form" | "confirm_backend_action";
  risk?: AssistantActionRisk;
  description?: string;
  payload?: unknown;
}

export interface AssistantMeta {
  correlationId: string;
  usedTools: string[];
  messageCount?: number;
}

export interface AssistantResponse {
  conversationId: string;
  message: ChatMessage;
  suggestedActions?: AssistantAction[];
  meta?: AssistantMeta;
}

export interface AssistantConversationResponse {
  conversationId: string;
  messages: ChatMessage[];
  meta: {
    messageCount: number;
  };
}

export interface AssistantConversationSummary {
  conversationId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  title: string;
}

export interface AssistantConversationListResponse {
  conversations: AssistantConversationSummary[];
}

export type AssistantErrorKind =
  | "validation"
  | "network"
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "backend"
  | "bad_response"
  | "sse"
  | "unknown";

export interface AssistantClientError {
  kind: AssistantErrorKind;
  title: string;
  message: string;
  retryable: boolean;
  correlationId?: string;
  requestId?: string;
  statusCode?: number;
  technicalDetail?: string;
}

export type AssistantStreamEvent =
  | {
      type: "connection.ready";
      createdAt: string;
    }
  | {
      type: "assistant.started";
      conversationId: string;
      messageId: string;
      correlationId: string;
      createdAt: string;
    }
  | {
      type: "assistant.progress";
      conversationId: string;
      messageId: string;
      step: string;
      label: string;
    }
  | {
      type: "assistant.delta";
      conversationId: string;
      messageId: string;
      delta: string;
    }
  | {
      type: "assistant.completed";
      conversationId: string;
      message: ChatMessage;
      suggestedActions?: AssistantAction[];
      meta?: AssistantMeta;
    }
  | {
      type: "assistant.error";
      error: string;
      message: string;
      correlationId?: string;
    };

export interface AssistantFeedbackRequest {
  conversationId: string;
  messageId: string;
  rating: "positive" | "negative";
  reason?: string;
  correlationId?: string;
}

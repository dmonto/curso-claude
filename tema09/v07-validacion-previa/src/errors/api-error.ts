import type { SafeError } from '../types/automation.types.js';

const categories: Record<string, string> = {
  VALIDATION_ERROR: 'validation', MISSING_FIELDS: 'validation', PERMISSION_DENIED: 'permission',
  BUSINESS_RULE_BLOCKED: 'business', CONFIRMATION_REQUIRED: 'confirmation',
  IDEMPOTENCY_CONFLICT: 'idempotency', EXECUTION_IN_PROGRESS: 'idempotency', PLAN_NOT_FOUND: 'validation',
  PLAN_STALE: 'business', PLAN_TAMPERED: 'validation', DRY_RUN_REQUIRED: 'confirmation',
  ACTION_NOT_REGISTERED: 'configuration', ACTION_DISABLED: 'configuration',
  EXTERNAL_TIMEOUT: 'transient', EXTERNAL_SERVICE_ERROR: 'transient',
  MODEL_OUTPUT_INVALID: 'model', MODEL_SERVICE_ERROR: 'model', UNEXPECTED_ERROR: 'technical'
};
export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 409, public details?: Record<string, unknown>) {
    super(message);
  }
  toJSON(): SafeError {
    return { code: this.code, category: categories[this.code] ?? 'technical',
      retryable: ['EXTERNAL_TIMEOUT', 'EXTERNAL_SERVICE_ERROR', 'MODEL_SERVICE_ERROR'].includes(this.code),
      user_message: this.message, ...(this.details ? { details: this.details } : {}) };
  }
}
export function toApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError('UNEXPECTED_ERROR', 'Se ha producido un error interno.', 500);
}

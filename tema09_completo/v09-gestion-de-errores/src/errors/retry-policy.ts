import { setTimeout as delay } from 'node:timers/promises';
import { ApiError } from './api-error.js';
export async function withRetry<T>(operation: () => Promise<T>, onRetry: (attempt: number, error: ApiError) => void): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (!(error instanceof ApiError) || !error.toJSON().retryable || attempt >= 3) throw error;
      onRetry(attempt, error); await delay(100 * attempt);
    }
  }
}

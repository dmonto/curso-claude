import path from 'node:path';
import { appendJsonLine, now, audit } from './storage.js';

export function createFeedbackStore(runtime) {
  return {
    save(userId, input) {
      const feedback = { timestamp: now(), userId, ...input, agentVersion: runtime.config.version.id };
      appendJsonLine(path.join(runtime.config.dataDir, 'feedback.jsonl'), feedback);
      audit(runtime, 'feedback.jsonl', feedback);
      return { success: true, feedback };
    }
  };
}

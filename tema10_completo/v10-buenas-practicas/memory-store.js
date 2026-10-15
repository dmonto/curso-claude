import path from 'node:path';
import { fingerprint, readJson, writeJson, now, audit } from './storage.js';
import { newSession } from './sessions.js';

export function createMemoryStore(runtime) {
  const root = path.join(runtime.config.dataDir, 'memory');
  const sessionFile = (userId, conversationId) => path.join(root, 'sessions', fingerprint({ userId, conversationId }) + '.json');
  const profileFile = userId => path.join(root, 'profiles', fingerprint({ userId }) + '.json');
  return {
    getSession(userId, conversationId) { return readJson(sessionFile(userId, conversationId), newSession(userId, conversationId, runtime.config.sessionTtlMs)); },
    saveSession(session) { writeJson(sessionFile(session.userId, session.conversationId), session); },
    getProfile(userId) { return readJson(profileFile(userId), { responseStyle: 'normal', showTechnicalDetails: false }); },
    updateProfile(userId, patch) {
      const next = { ...this.getProfile(userId), ...patch, updatedAt: now() };
      writeJson(profileFile(userId), next);
      audit(runtime, 'memory-operations.jsonl', { userId, operation: 'update_profile', changedKeys: Object.keys(patch) });
      return next;
    },
    forgetProfile(userId, key) {
      const profile = this.getProfile(userId); delete profile[key]; profile.updatedAt = now();
      writeJson(profileFile(userId), profile);
      audit(runtime, 'memory-operations.jsonl', { userId, operation: 'forget_profile', changedKeys: [key] });
      return { success: true, forgottenKey: key };
    }
  };
}

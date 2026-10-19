import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

export function loadConfig() {
  const apiKey = process.env.COURSE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
  const legacyMockClaude = String(process.env.MOCK_CLAUDE || '').toLowerCase();
  const modelMode = process.env.MODEL_MODE
    || (legacyMockClaude === 'true' ? 'mock' : undefined)
    || (legacyMockClaude === 'false' && apiKey ? 'claude' : undefined)
    || 'mock';

  return {
    modelMode,
    apiKey,
    claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    claudeEffort: process.env.CLAUDE_EFFORT || 'medium',
    claudeThinking: process.env.CLAUDE_THINKING || 'adaptive',
    claudeMaxTokens: Number(process.env.CLAUDE_MAX_TOKENS || 1200),
    port: Number(process.env.PORT || process.env.GATEWAY_PORT || 3000),
    dataDir: path.resolve(process.cwd(), process.env.DATA_DIR || 'data/runtime')
  };
}

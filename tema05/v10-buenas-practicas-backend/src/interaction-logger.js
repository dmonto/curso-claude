import fs from "fs";
import path from "path";
import crypto from "crypto";

const DEFAULT_LOG_DIR = "logs";
const DEFAULT_LOG_FILE = "assistant-interactions.jsonl";

export class InteractionLogger {
  constructor({
    logDir = DEFAULT_LOG_DIR,
    logFile = DEFAULT_LOG_FILE,
    logToConsole = true
  } = {}) {
    this.logDir = logDir;
    this.logPath = path.join(logDir, logFile);
    this.logToConsole = logToConsole;

    fs.mkdirSync(this.logDir, { recursive: true });
  }

  logInteraction(event) {
    const safeEvent = this.buildSafeEvent(event);

    this.appendJsonLine(safeEvent);

    if (this.logToConsole) {
      console.log(JSON.stringify({
        level: safeEvent.level,
        eventType: safeEvent.eventType,
        traceId: safeEvent.traceId,
        status: safeEvent.status,
        route: safeEvent.route,
        durationMs: safeEvent.durationMs,
        timestamp: safeEvent.timestamp
      }));
    }

    return safeEvent;
  }

  buildSafeEvent(event) {
    const timestamp = new Date().toISOString();

    return removeUndefined({
      eventType: event.eventType || "assistant_interaction",
      level: event.level || "info",
      timestamp,

      traceId: event.traceId || null,
      sessionId: event.sessionId || null,

      userId: event.userId || null,
      role: event.role || null,
      screen: event.screen || null,

      status: event.status || "unknown",
      statusCode: event.statusCode || null,
      errorCode: event.errorCode || null,

      intent: event.intent || null,
      riskLevel: event.riskLevel || null,
      warningsCount: Array.isArray(event.warnings) ? event.warnings.length : 0,

      route: event.route || null,
      profile: event.profile || null,
      promptMode: event.promptMode || null,
      callModel: event.callModel ?? null,

      securityAllowed: event.securityAllowed ?? null,
      securityFlags: event.securityFlags || [],
      securityReason: event.securityReason || null,

      contextRecentMessagesCount: event.contextDiagnostics?.recentMessagesCount ?? null,
      contextBlocksCount: event.contextDiagnostics?.contextBlocksCount ?? null,
      contextHasSessionSummary: event.contextDiagnostics?.hasSessionSummary ?? null,

      provider: event.provider || "anthropic",
      model: event.model || null,
      inputTokens: event.usage?.input_tokens ?? null,
      outputTokens: event.usage?.output_tokens ?? null,
      stopReason: event.stopReason || null,

      durationMs: event.durationMs ?? null,
      providerLatencyMs: event.providerLatencyMs ?? null,

      messageLength: typeof event.message === "string" ? event.message.length : null,
      messageHash: typeof event.message === "string" ? hashText(event.message) : null
    });
  }

  appendJsonLine(event) {
    const line = `${JSON.stringify(event)}\n`;
    fs.appendFileSync(this.logPath, line, { encoding: "utf8" });
  }
}

function hashText(text) {
  return crypto
    .createHash("sha256")
    .update(text)
    .digest("hex")
    .slice(0, 16);
}

function removeUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  );
}

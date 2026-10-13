import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { buildTaskAutomationPrompt } from "./prompts/taskAutomationPrompts.js";
import { executeProposedAction } from "./actions/ticketActions.js";
import { buildGuidedSupportPrompt } from "./prompts/guidedInteractionPrompts.js";
import { getGuidedSession, updateGuidedSession, resetGuidedSession } from "./state/guidedSessionStore.js";
import { buildTicketQuerySpecPrompt, buildTicketDataAnswerPrompt } from "./prompts/dataQueryPrompts.js";
import { executeTicketQuerySpec } from "./query/ticketQueryEngine.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3001;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function callClaude({ systemPrompt, userPrompt, maxTokens = 700, effort = "low" }) {
  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL,
    max_tokens: maxTokens,
    output_config: { effort },
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  const firstTextBlock = response.content.find((block) => block.type === "text");
  if (!firstTextBlock) throw new Error("Claude no devolvió contenido de texto");
  return firstTextBlock.text;
}

function stripJsonFence(text) {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : text;
}

const GuidedSupportRequestSchema = z.object({
  sessionId: z.string().default("session-demo-001"),
  userId: z.string().default("user-001"),
  userRole: z.enum(["employee", "support_agent", "admin"]).default("employee"),
  currentPage: z.string().default("/support/new"),
  userMessage: z.string().min(1),
});

const GuidedSupportOutputSchema = z.object({
  assistantMessage: z.string(),
  knownFields: z.record(z.any()),
  missingFields: z.array(z.string()),
  nextQuestion: z.object({
    field: z.string().nullable(),
    question: z.string(),
    uiControl: z.enum(["text", "textarea", "select", "none"]),
    options: z.array(z.string()),
  }),
  suggestedChips: z.array(z.string()),
  readyForAutomation: z.boolean(),
  suggestedPriority: z.enum(["low", "medium", "high"]).nullable(),
  validationWarnings: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

app.post("/api/assistant/guided-support", async (req, res) => {
  const requestId = `req_${Date.now()}`;
  try {
    const input = GuidedSupportRequestSchema.parse(req.body);
    const currentSession = getGuidedSession(input.sessionId);
    const prompt = buildGuidedSupportPrompt({ ...input, sessionState: currentSession });
    const rawText = await callClaude({ systemPrompt: prompt.systemPrompt, userPrompt: prompt.userPrompt, maxTokens: 900, effort: "medium" });
    const guidedOutput = GuidedSupportOutputSchema.parse(JSON.parse(stripJsonFence(rawText)));
    const updatedSession = updateGuidedSession(input.sessionId, {
      step: guidedOutput.readyForAutomation ? "ready_for_automation" : "collecting_fields",
      knownFields: guidedOutput.knownFields,
      missingFields: guidedOutput.missingFields,
      readyForAutomation: guidedOutput.readyForAutomation,
      suggestedPriority: guidedOutput.suggestedPriority,
      historySummary: guidedOutput.assistantMessage,
    });
    return res.json({ requestId, promptVersion: "guided-support-v1", session: updatedSession, assistant: { message: guidedOutput.assistantMessage, nextQuestion: guidedOutput.nextQuestion, suggestedChips: guidedOutput.suggestedChips, validationWarnings: guidedOutput.validationWarnings } });
  } catch (error) {
    return res.status(400).json({ requestId, error: error.message });
  }
});

app.post("/api/assistant/guided-support/reset", (req, res) => {
  const sessionId = req.body.sessionId ?? "session-demo-001";
  return res.json({ sessionId, session: resetGuidedSession(sessionId) });
});

const TaskAutomationRequestSchema = z.object({
  userId: z.string().default("user-001"),
  userRole: z.enum(["employee", "support_agent", "admin"]).default("employee"),
  userMessage: z.string().min(3),
  conversationState: z.record(z.any()).optional(),
});
const AutomationProposalSchema = z.object({
  proposedAction: z.enum(["ask_missing_fields","create_ticket_draft","suggest_escalation","prepare_user_reply","unsupported"]),
  requiresConfirmation: z.boolean(),
  riskLevel: z.enum(["low", "medium", "high"]),
  reason: z.string(),
  missingFields: z.array(z.string()),
  parameters: z.record(z.any()),
  userMessage: z.string(),
});
function getAllowedActionsForRole(userRole) {
  return {
    employee: ["ask_missing_fields", "create_ticket_draft", "prepare_user_reply"],
    support_agent: ["ask_missing_fields", "create_ticket_draft", "prepare_user_reply", "suggest_escalation"],
    admin: ["ask_missing_fields", "create_ticket_draft", "prepare_user_reply", "suggest_escalation"],
  }[userRole] ?? [];
}
app.post("/api/assistant/task-automation", async (req, res) => {
  const requestId = `req_${Date.now()}`;
  try {
    const input = TaskAutomationRequestSchema.parse(req.body);
    const userContext = { userId: input.userId, userRole: input.userRole, allowedActions: getAllowedActionsForRole(input.userRole) };
    const prompt = buildTaskAutomationPrompt({ ...input, allowedActions: userContext.allowedActions });
    const rawProposalText = await callClaude({ systemPrompt: prompt.systemPrompt, userPrompt: prompt.userPrompt, maxTokens: 800, effort: "low" });
    const proposal = AutomationProposalSchema.parse(JSON.parse(stripJsonFence(rawProposalText)));
    const executionResult = executeProposedAction(proposal, userContext);
    return res.json({ requestId, promptVersion: "task-automation-v1", proposal, executionResult });
  } catch (error) {
    return res.status(400).json({ requestId, error: error.message });
  }
});

const DataQueryRequestSchema = z.object({ userId: z.string().default("user-001"), userRole: z.enum(["employee","support_agent","admin"]).default("employee"), userMessage: z.string().min(3) });
const QuerySpecSchema = z.object({
  queryType: z.enum(["list","count","group_by","unsupported"]), entity: z.literal("ticket"),
  filters: z.array(z.object({ field: z.enum(["status","priority","service","createdAt","title","publicSummary"]), operator: z.enum(["eq","neq","gte","lte","contains"]), value: z.string() })),
  groupBy: z.enum(["status","priority","service"]).nullable(),
  sort: z.object({ field: z.enum(["createdAt","priority","status","service"]), direction: z.enum(["asc","desc"]) }).nullable(),
  limit: z.number().int().min(1).max(50), requiresClarification: z.boolean(), clarificationQuestion: z.string().nullable(), confidence: z.number().min(0).max(1)
});
app.post("/api/assistant/data-query", async (req, res) => {
  const requestId = `req_${Date.now()}`;
  try {
    const input = DataQueryRequestSchema.parse(req.body);
    const userContext = { userId: input.userId, userRole: input.userRole };
    const queryPrompt = buildTicketQuerySpecPrompt(input);
    const rawQuerySpecText = await callClaude({ systemPrompt: queryPrompt.systemPrompt, userPrompt: queryPrompt.userPrompt, maxTokens: 700, effort: "low" });
    const querySpec = QuerySpecSchema.parse(JSON.parse(stripJsonFence(rawQuerySpecText)));
    const queryResult = executeTicketQuerySpec(querySpec, userContext);
    const answerPrompt = buildTicketDataAnswerPrompt({ userMessage: input.userMessage, querySpec, queryResult });
    const finalAnswer = await callClaude({ systemPrompt: answerPrompt.systemPrompt, userPrompt: answerPrompt.userPrompt, maxTokens: 500, effort: "medium" });
    return res.json({ requestId, promptVersion: "ticket-data-query-v1", querySpec, queryResult, answer: finalAnswer.trim() });
  } catch (error) {
    return res.status(400).json({ requestId, error: error.message });
  }
});

app.listen(PORT, () => console.log(`Servidor escuchando en http://localhost:${PORT}`));

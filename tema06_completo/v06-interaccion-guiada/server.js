import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { buildTaskAutomationPrompt } from "./prompts/taskAutomationPrompts.js";
import { executeProposedAction } from "./actions/ticketActions.js";
import { buildGuidedSupportPrompt } from "./prompts/guidedInteractionPrompts.js";
import {
  getGuidedSession,
  updateGuidedSession,
  resetGuidedSession,
} from "./state/guidedSessionStore.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function callClaude({ systemPrompt, userPrompt, maxTokens = 700, effort = "low" }) {
  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL,
    max_tokens: maxTokens,
    output_config: { effort },
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const firstTextBlock = response.content.find((block) => block.type === "text");

  if (!firstTextBlock) {
    throw new Error("Claude no devolvió contenido de texto");
  }

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

    const prompt = buildGuidedSupportPrompt({
      ...input,
      sessionState: currentSession,
    });

    const rawText = await callClaude({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      maxTokens: 900,
      effort: "medium",
    });

    let parsed;

    try {
      parsed = JSON.parse(stripJsonFence(rawText));
    } catch {
      return res.status(502).json({
        requestId,
        error: "MODEL_OUTPUT_NOT_VALID_JSON",
        rawText,
      });
    }

    const guidedOutput = GuidedSupportOutputSchema.parse(parsed);

    const updatedSession = updateGuidedSession(input.sessionId, {
      step: guidedOutput.readyForAutomation
        ? "ready_for_automation"
        : "collecting_fields",
      knownFields: guidedOutput.knownFields,
      missingFields: guidedOutput.missingFields,
      readyForAutomation: guidedOutput.readyForAutomation,
      suggestedPriority: guidedOutput.suggestedPriority,
      historySummary: guidedOutput.assistantMessage,
    });

    console.log(
      JSON.stringify({
        event: "guided_support_completed",
        requestId,
        promptVersion: "guided-support-v1",
        sessionId: input.sessionId,
        missingFields: guidedOutput.missingFields,
        readyForAutomation: guidedOutput.readyForAutomation,
        suggestedPriority: guidedOutput.suggestedPriority,
      })
    );

    return res.json({
      requestId,
      promptVersion: "guided-support-v1",
      session: updatedSession,
      assistant: {
        message: guidedOutput.assistantMessage,
        nextQuestion: guidedOutput.nextQuestion,
        suggestedChips: guidedOutput.suggestedChips,
        validationWarnings: guidedOutput.validationWarnings,
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "guided_support_failed",
        requestId,
        error: error.message,
      })
    );

    return res.status(400).json({
      requestId,
      error: error.message,
    });
  }
});

app.post("/api/assistant/guided-support/reset", (req, res) => {
  const sessionId = req.body.sessionId ?? "session-demo-001";
  const session = resetGuidedSession(sessionId);

  return res.json({
    sessionId,
    session,
  });
});

const TaskAutomationRequestSchema = z.object({
  userId: z.string().default("user-001"),
  userRole: z.enum(["employee", "support_agent", "admin"]).default("employee"),
  userMessage: z.string().min(3),
  conversationState: z.record(z.any()).optional(),
});

const AutomationProposalSchema = z.object({
  proposedAction: z.enum([
    "ask_missing_fields",
    "create_ticket_draft",
    "suggest_escalation",
    "prepare_user_reply",
    "unsupported",
  ]),
  requiresConfirmation: z.boolean(),
  riskLevel: z.enum(["low", "medium", "high"]),
  reason: z.string(),
  missingFields: z.array(z.string()),
  parameters: z.record(z.any()),
  userMessage: z.string(),
});

function getAllowedActionsForRole(userRole) {
  const actionsByRole = {
    employee: ["ask_missing_fields", "create_ticket_draft", "prepare_user_reply"],
    support_agent: ["ask_missing_fields", "create_ticket_draft", "prepare_user_reply", "suggest_escalation"],
    admin: ["ask_missing_fields", "create_ticket_draft", "prepare_user_reply", "suggest_escalation"],
  };

  return actionsByRole[userRole] ?? [];
}

app.post("/api/assistant/task-automation", async (req, res) => {
  const requestId = `req_${Date.now()}`;

  try {
    const input = TaskAutomationRequestSchema.parse(req.body);
    const userContext = {
      userId: input.userId,
      userRole: input.userRole,
      allowedActions: getAllowedActionsForRole(input.userRole),
    };

    const prompt = buildTaskAutomationPrompt({
      ...input,
      allowedActions: userContext.allowedActions,
    });

    const rawProposalText = await callClaude({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      maxTokens: 800,
      effort: "low",
    });

    const proposal = AutomationProposalSchema.parse(JSON.parse(stripJsonFence(rawProposalText)));
    const executionResult = executeProposedAction(proposal, userContext);

    return res.json({
      requestId,
      promptVersion: "task-automation-v1",
      proposal,
      executionResult,
    });
  } catch (error) {
    return res.status(400).json({ requestId, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

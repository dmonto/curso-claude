import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { buildTaskAutomationPrompt } from "./prompts/taskAutomationPrompts.js";
import { executeProposedAction } from "./actions/ticketActions.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
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
    support_agent: [
      "ask_missing_fields",
      "create_ticket_draft",
      "prepare_user_reply",
      "suggest_escalation",
    ],
    admin: [
      "ask_missing_fields",
      "create_ticket_draft",
      "prepare_user_reply",
      "suggest_escalation",
    ],
  };

  return actionsByRole[userRole] ?? [];
}

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

    let parsedProposal;

    try {
      parsedProposal = JSON.parse(stripJsonFence(rawProposalText));
    } catch {
      return res.status(502).json({
        requestId,
        error: "MODEL_OUTPUT_NOT_VALID_JSON",
        rawProposalText,
      });
    }

    const proposal = AutomationProposalSchema.parse(parsedProposal);

    const executionResult = executeProposedAction(proposal, userContext);

    console.log(
      JSON.stringify({
        event: "task_automation_completed",
        requestId,
        promptVersion: "task-automation-v1",
        userId: input.userId,
        userRole: input.userRole,
        proposedAction: proposal.proposedAction,
        riskLevel: proposal.riskLevel,
        requiresConfirmation: proposal.requiresConfirmation,
        executionStatus: executionResult.status,
      })
    );

    return res.json({
      requestId,
      promptVersion: "task-automation-v1",
      proposal,
      executionResult,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "task_automation_failed",
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

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

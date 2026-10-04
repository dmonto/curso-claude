import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { TASK_TYPES, buildPromptForTask } from "./prompts/supportPrompts.js";
import { buildContextForTask } from "./context/supportContext.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SupportTaskRequestSchema = z.object({
  taskType: z.enum([
    TASK_TYPES.CLASSIFY,
    TASK_TYPES.EXTRACT,
    TASK_TYPES.COMPOSE_REPLY,
    TASK_TYPES.VALIDATE_TICKET,
    TASK_TYPES.TICKET_STATUS,
  ]),
  userId: z.string().default("user-001"),
  userRole: z.enum(["employee", "support_agent", "admin"]).default("employee"),
  currentPage: z.string().default("/support"),
  activeTicketId: z.string().nullable().optional(),
  userMessage: z.string().optional(),
  affectedService: z.enum(["vpn", "email", "erp", "crm", "unknown"]).optional(),
  conversationState: z.record(z.any()).optional(),
  ticketDraft: z.record(z.any()).optional(),
  decision: z.record(z.any()).optional(),
});

function extractText(response) {
  const firstTextBlock = response.content.find((block) => block.type === "text");

  if (!firstTextBlock) {
    throw new Error("Claude no devolvió contenido de texto");
  }

  return firstTextBlock.text;
}

function safeJsonParse(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

app.post("/api/assistant/support-task", async (req, res) => {
  const requestId = `req_${Date.now()}`;

  try {
    const input = SupportTaskRequestSchema.parse(req.body);

    const selectedContext = buildContextForTask(input);

    const { systemPrompt, userPrompt } = buildPromptForTask(
      input.taskType,
      input,
      selectedContext
    );

    const response = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL,
      max_tokens: 700,
      output_config: { effort: input.taskType === TASK_TYPES.COMPOSE_REPLY ? "medium" : "low" },
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const rawText = extractText(response);

    const maybeJson = safeJsonParse(rawText);

    console.log(
      JSON.stringify({
        event: "support_task_completed",
        requestId,
        taskType: input.taskType,
        promptVersion: `support-${input.taskType}-v2-context-controlled`,
        contextPolicy: selectedContext.contextPolicy,
        contextSizeChars: JSON.stringify(selectedContext).length,
      })
    );

    return res.json({
      requestId,
      taskType: input.taskType,
      promptVersion: `support-${input.taskType}-v2-context-controlled`,
      contextPolicy: selectedContext.contextPolicy,
      result: maybeJson ?? { reply: rawText.trim() },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "support_task_failed",
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

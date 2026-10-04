import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { TASK_TYPES, buildPromptForTask } from "./prompts/supportPrompts.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("Falta ANTHROPIC_API_KEY en el fichero .env");
}

if (!process.env.CLAUDE_MODEL) {
  throw new Error("Falta CLAUDE_MODEL en el fichero .env");
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SupportTaskRequestSchema = z.object({
  taskType: z.enum([
    TASK_TYPES.CLASSIFY,
    TASK_TYPES.EXTRACT,
    TASK_TYPES.COMPOSE_REPLY,
  ]),
  userMessage: z.string().min(3).optional(),
  userRole: z.enum(["employee", "support_agent", "admin"]).optional(),
  currentPage: z.string().optional(),
  affectedService: z.enum(["vpn", "email", "erp", "crm", "unknown"]).optional(),
  decision: z.record(z.any()).optional(),
});

const ClassifyOutputSchema = z.object({
  category: z.enum([
    "access_problem",
    "performance_problem",
    "functional_error",
    "data_issue",
    "request_information",
    "unknown",
  ]),
  affectedService: z.enum(["vpn", "email", "erp", "crm", "unknown"]),
  priority: z.enum(["low", "medium", "high"]),
  requiresClarification: z.boolean(),
  confidence: z.number().min(0).max(1),
});

const ExtractOutputSchema = z.object({
  affectedService: z
    .enum(["vpn", "email", "erp", "crm", "unknown"])
    .nullable(),
  startedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  otherUsersAffected: z.boolean().nullable(),
  mentionedUsers: z.array(z.string()),
  businessImpactText: z.string().nullable(),
});

function extractText(response) {
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

function validateOutput(taskType, rawText) {
  if (taskType === TASK_TYPES.COMPOSE_REPLY) {
    return {
      reply: rawText.trim(),
    };
  }

  let parsed;

  try {
    parsed = JSON.parse(stripJsonFence(rawText));
  } catch {
    const error = new Error("La salida del modelo no es JSON válido");
    error.rawText = rawText;
    throw error;
  }

  if (taskType === TASK_TYPES.CLASSIFY) {
    return ClassifyOutputSchema.parse(parsed);
  }

  if (taskType === TASK_TYPES.EXTRACT) {
    return ExtractOutputSchema.parse(parsed);
  }

  throw new Error(`No hay validador para taskType=${taskType}`);
}

app.post("/api/assistant/support-task", async (req, res) => {
  const requestId = `req_${Date.now()}`;

  try {
    const input = SupportTaskRequestSchema.parse(req.body);

    if (
      [TASK_TYPES.CLASSIFY, TASK_TYPES.EXTRACT].includes(input.taskType) &&
      !input.userMessage
    ) {
      return res.status(400).json({
        requestId,
        error: "userMessage es obligatorio para esta tarea",
      });
    }

    if (input.taskType === TASK_TYPES.COMPOSE_REPLY && !input.decision) {
      return res.status(400).json({
        requestId,
        error: "decision es obligatoria para compose_reply",
      });
    }

    const { systemPrompt, userPrompt } = buildPromptForTask(input.taskType, input);

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
    const validatedOutput = validateOutput(input.taskType, rawText);

    console.log(
      JSON.stringify({
        event: "support_task_completed",
        requestId,
        taskType: input.taskType,
        promptVersion: `support-${input.taskType}-v1`,
      })
    );

    return res.json({
      requestId,
      taskType: input.taskType,
      promptVersion: `support-${input.taskType}-v1`,
      result: validatedOutput,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "support_task_failed",
        requestId,
        error: error.message,
        rawText: error.rawText,
      })
    );

    return res.status(400).json({
      requestId,
      error: error.message,
      rawText: error.rawText,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

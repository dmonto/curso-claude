import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { buildTicketQuerySpecPrompt, buildTicketDataAnswerPrompt } from "./prompts/dataQueryPrompts.js";
import { executeTicketQuerySpec } from "./query/ticketQueryEngine.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const DataQueryRequestSchema = z.object({
  userId: z.string().default("user-001"),
  userRole: z.enum(["employee", "support_agent", "admin"]).default("employee"),
  userMessage: z.string().min(3),
});

const QuerySpecSchema = z.object({
  queryType: z.enum(["list", "count", "group_by", "unsupported"]),
  entity: z.literal("ticket"),
  filters: z.array(
    z.object({
      field: z.enum([
        "status",
        "priority",
        "service",
        "createdAt",
        "title",
        "publicSummary",
      ]),
      operator: z.enum(["eq", "neq", "gte", "lte", "contains"]),
      value: z.string(),
    })
  ),
  groupBy: z.enum(["status", "priority", "service"]).nullable(),
  sort: z
    .object({
      field: z.enum(["createdAt", "priority", "status", "service"]),
      direction: z.enum(["asc", "desc"]),
    })
    .nullable(),
  limit: z.number().int().min(1).max(50),
  requiresClarification: z.boolean(),
  clarificationQuestion: z.string().nullable(),
  confidence: z.number().min(0).max(1),
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

app.post("/api/assistant/data-query", async (req, res) => {
  const requestId = `req_${Date.now()}`;

  try {
    const input = DataQueryRequestSchema.parse(req.body);

    const userContext = {
      userId: input.userId,
      userRole: input.userRole,
    };

    const queryPrompt = buildTicketQuerySpecPrompt(input);

    const rawQuerySpecText = await callClaude({
      systemPrompt: queryPrompt.systemPrompt,
      userPrompt: queryPrompt.userPrompt,
      maxTokens: 700,
      effort: "low",
    });

    let parsedQuerySpec;

    try {
      parsedQuerySpec = JSON.parse(stripJsonFence(rawQuerySpecText));
    } catch {
      return res.status(502).json({
        requestId,
        error: "MODEL_OUTPUT_NOT_VALID_JSON",
        rawQuerySpecText,
      });
    }

    const querySpec = QuerySpecSchema.parse(parsedQuerySpec);

    const queryResult = executeTicketQuerySpec(querySpec, userContext);

    const answerPrompt = buildTicketDataAnswerPrompt({
      userMessage: input.userMessage,
      querySpec,
      queryResult,
    });

    const finalAnswer = await callClaude({
      systemPrompt: answerPrompt.systemPrompt,
      userPrompt: answerPrompt.userPrompt,
      maxTokens: 500,
      effort: "medium",
    });

    console.log(
      JSON.stringify({
        event: "data_query_completed",
        requestId,
        promptVersion: "ticket-data-query-v1",
        userId: input.userId,
        userRole: input.userRole,
        queryType: querySpec.queryType,
        filters: querySpec.filters,
        resultType: queryResult.type,
      })
    );

    return res.json({
      requestId,
      promptVersion: "ticket-data-query-v1",
      querySpec,
      queryResult,
      answer: finalAnswer.trim(),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "data_query_failed",
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

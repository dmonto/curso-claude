import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getResponseStyleProfile } from "./style/responseStyleProfiles.js";
import { buildStyledResponsePrompt } from "./prompts/styledResponsePrompts.js";
import {
  validateGeneratedResponse,
  buildFallbackResponse,
} from "./validators/generatedResponseValidator.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;
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

const StyledResponseRequestSchema = z.object({
  styleProfileName: z.enum([
    "end_user_support",
    "support_agent",
    "executive_summary",
    "validation_error",
    "safe_refusal",
  ]),
  decision: z.record(z.any()),
  responseContext: z.record(z.any()).optional(),
});

app.post("/api/assistant/validated-styled-response", async (req, res) => {
  const requestId = `req_${Date.now()}`;

  try {
    const input = StyledResponseRequestSchema.parse(req.body);

    const styleProfile = getResponseStyleProfile(input.styleProfileName);

    const prompt = buildStyledResponsePrompt({
      decision: input.decision,
      styleProfile,
      responseContext: input.responseContext ?? {},
    });

    const generatedText = await callClaude({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      maxTokens: 500,
      effort: "medium",
    });

    const validation = validateGeneratedResponse({
      responseText: generatedText.trim(),
      decision: input.decision,
      styleProfileName: input.styleProfileName,
    });

    const approvedResponse = validation.passed
      ? generatedText.trim()
      : buildFallbackResponse({
          decision: input.decision,
          styleProfileName: input.styleProfileName,
        });

    console.log(
      JSON.stringify({
        event: "validated_styled_response_completed",
        requestId,
        promptVersion: "validated-styled-response-v1",
        styleProfileName: input.styleProfileName,
        validationPassed: validation.passed,
        validationErrors: validation.errors.map((error) => error.code),
      })
    );

    return res.json({
      requestId,
      promptVersion: "validated-styled-response-v1",
      generatedText: generatedText.trim(),
      validation,
      approvedResponse,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "validated_styled_response_failed",
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

app.post("/api/assistant/validate-text-only", (req, res) => {
  const schema = z.object({
    responseText: z.string(),
    styleProfileName: z.enum([
      "end_user_support",
      "support_agent",
      "executive_summary",
      "validation_error",
      "safe_refusal",
    ]),
    decision: z.record(z.any()),
  });

  const input = schema.parse(req.body);

  const validation = validateGeneratedResponse({
    responseText: input.responseText,
    decision: input.decision,
    styleProfileName: input.styleProfileName,
  });

  const approvedResponse = validation.passed
    ? input.responseText
    : buildFallbackResponse({
        decision: input.decision,
        styleProfileName: input.styleProfileName,
      });

  return res.json({
    validation,
    approvedResponse,
  });
});

app.listen(PORT, () => console.log(`Servidor escuchando en http://localhost:${PORT}`));

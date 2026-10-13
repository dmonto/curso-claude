import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

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

const RequestSchema = z.object({
  userMessage: z.string().min(3),
  userRole: z.enum(["employee", "support_agent", "admin"]),
  currentPage: z.string().min(1),
  selectedTicket: z
    .object({
      id: z.string(),
      status: z.string(),
      service: z.string().optional(),
    })
    .nullable()
    .optional(),
});

const TriageOutputSchema = z.object({
  intent: z.enum([
    "ASK_CLARIFICATION",
    "ANSWER_GUIDANCE",
    "CREATE_TICKET_DRAFT",
    "ESCALATE_TO_SUPPORT",
  ]),
  priority: z.enum(["low", "medium", "high"]),
  missingFields: z.array(z.string()),
  safeToCreateTicket: z.boolean(),
  responseToUser: z.string(),
  confidence: z.number().min(0).max(1),
});

function buildSupportPrompt(input) {
  const applicationContext = {
    product: "Portal interno de soporte",
    currentPage: input.currentPage,
    userRole: input.userRole,
    selectedTicket: input.selectedTicket ?? null,
    allowedActionsByRole: {
      employee: ["create_ticket_draft", "view_own_tickets"],
      support_agent: ["create_ticket_draft", "view_assigned_tickets", "add_internal_note"],
      admin: ["create_ticket_draft", "view_all_tickets", "assign_ticket"],
    },
  };

  const systemPrompt = `
Eres un asistente integrado en una aplicación web de soporte interno.

Tu trabajo NO es resolver técnicamente todos los problemas.
Tu trabajo es ayudar a clasificar solicitudes, pedir datos que falten y preparar respuestas guiadas.

Reglas:
- No inventes datos técnicos.
- No afirmes que una acción se ha ejecutado si solo estás proponiéndola.
- No prometas tiempos de resolución.
- No solicites contraseñas, tokens, claves API ni datos sensibles.
- Respeta los permisos del usuario según su rol.
- Si faltan datos importantes, pide aclaración.
- Si el mensaje describe impacto generalizado, varios usuarios afectados o bloqueo completo, usa prioridad high.
- Si el mensaje es ambiguo, usa ASK_CLARIFICATION.
- Devuelve exclusivamente JSON válido.
`;

  const userPrompt = `
<contexto_aplicacion>
${JSON.stringify(applicationContext, null, 2)}
</contexto_aplicacion>

<mensaje_usuario>
${input.userMessage}
</mensaje_usuario>

<contrato_salida>
Devuelve exactamente este JSON, sin texto adicional:

{
  "intent": "ASK_CLARIFICATION | ANSWER_GUIDANCE | CREATE_TICKET_DRAFT | ESCALATE_TO_SUPPORT",
  "priority": "low | medium | high",
  "missingFields": ["..."],
  "safeToCreateTicket": true,
  "responseToUser": "...",
  "confidence": 0.0
}
</contrato_salida>
`;

  return { systemPrompt, userPrompt };
}

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

app.post("/api/assistant/support-triage", async (req, res) => {
  const requestId = `req_${Date.now()}`;

  try {
    const input = RequestSchema.parse(req.body);

    const { systemPrompt, userPrompt } = buildSupportPrompt(input);

    const response = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL,
      max_tokens: 700,
      output_config: { effort: "medium" },
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const rawText = extractText(response);

    let parsedJson;

    try {
      parsedJson = JSON.parse(stripJsonFence(rawText));
    } catch {
      return res.status(502).json({
        requestId,
        error: "MODEL_OUTPUT_NOT_VALID_JSON",
        rawText,
      });
    }

    const validatedOutput = TriageOutputSchema.parse(parsedJson);

    console.log(
      JSON.stringify({
        event: "assistant_triage_completed",
        requestId,
        promptVersion: "support-triage-v1",
        userRole: input.userRole,
        currentPage: input.currentPage,
        intent: validatedOutput.intent,
        priority: validatedOutput.priority,
        confidence: validatedOutput.confidence,
      })
    );

    return res.json({
      requestId,
      promptVersion: "support-triage-v1",
      result: validatedOutput,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "assistant_triage_failed",
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

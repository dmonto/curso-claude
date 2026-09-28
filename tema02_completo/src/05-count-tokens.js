import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.COURSE_ANTHROPIC_API_KEY
});

const model = process.env.CLAUDE_MODEL;

const system = `
Eres un asistente integrado en una aplicación web empresarial.
No inventes datos internos.
`;

const messages = [
  {
    role: "user",
    content:
      "Necesito la factura del pedido 8831."
  }
];

const result =
  await client.messages.countTokens({
    model,
    system,
    messages
  });

console.log({
  input_tokens: result.input_tokens
});
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.COURSE_ANTHROPIC_API_KEY;
const model = process.env.CLAUDE_MODEL;

if (!apiKey) {
  console.error("Falta ANTHROPIC_API_KEY");
  process.exit(1);
}

if (!model) {
  console.error("Falta CLAUDE_MODEL");
  process.exit(1);
}

const client = new Anthropic({
  apiKey
});

const response = await client.messages.create({
  model,
  max_tokens: 500,

  system: `
Eres un asistente integrado en una aplicación web empresarial.

Reglas:
- Responde de forma breve y clara.
- No inventes datos internos.
- Si falta información, pide solo el dato mínimo necesario.
`,

  messages: [
    {
      role: "user",
      content:
        "No encuentro la factura de mi último pedido y necesito enviarla hoy a contabilidad."
    }
  ]
});

const text = response.content
  .filter((block) => block.type === "text")
  .map((block) => block.text)
  .join("\n");

console.log("\n=== RESPUESTA ===\n");
console.log(text);

console.log("\n=== METADATOS ===\n");

console.log({
  model: response.model,
  stop_reason: response.stop_reason,
  input_tokens: response.usage?.input_tokens,
  output_tokens: response.usage?.output_tokens
});
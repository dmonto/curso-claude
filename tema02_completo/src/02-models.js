import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.COURSE_ANTHROPIC_API_KEY
});

console.log("\n=== MODELOS DISPONIBLES ===\n");

for await (const model of client.models.list()) {
  console.log({
    id: model.id,
    display_name: model.display_name,
    max_input_tokens: model.max_input_tokens,
    max_tokens: model.max_tokens,
    created_at: model.created_at
  });
}
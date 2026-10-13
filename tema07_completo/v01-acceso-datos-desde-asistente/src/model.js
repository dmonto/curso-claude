import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "dummy-key"
});

export async function askClaude({ system, user, maxTokens = 500 }) {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "tu_api_key") {
    return [
      "Respuesta mock sin llamar a Claude.",
      "El backend ha preparado contexto controlado y datos permitidos.",
      "Configura ANTHROPIC_API_KEY para usar el modelo real."
    ].join(" ");
  }

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-5",
    max_tokens: maxTokens,
    output_config: { effort: "low" },
    system,
    messages: [
      {
        role: "user",
        content: user
      }
    ]
  });

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

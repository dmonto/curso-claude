import Anthropic from "@anthropic-ai/sdk";

export class ClaudeService {
  constructor({
    apiKey,
    model,
    defaultMaxTokens = 600,
    defaultEffort = "low"
  }) {
    if (!apiKey) {
      throw new Error("Falta ANTHROPIC_API_KEY");
    }

    if (!model) {
      throw new Error("Falta ANTHROPIC_MODEL");
    }

    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.defaultMaxTokens = defaultMaxTokens;
    this.defaultEffort = defaultEffort;
  }

  async createMessage({
    system,
    messages,
    maxTokens,
    effort,
    metadata = {}
  }) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens || this.defaultMaxTokens,
      output_config: { effort: effort ?? this.defaultEffort },
      system,
      messages
    });

    return {
      answer: this.extractText(response),
      usage: response.usage || null,
      stopReason: response.stop_reason || null,
      rawId: response.id || null,
      metadata
    };
  }

  extractText(response) {
    if (!response || !Array.isArray(response.content)) {
      return "";
    }

    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  }
}

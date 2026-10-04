import Anthropic from "@anthropic-ai/sdk";

export class ClaudeService {
  constructor({
    apiKey,
    model,
    defaultMaxTokens = 600,
    defaultTemperature = 0.3
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
    this.defaultTemperature = defaultTemperature;
  }

  async createMessage({
    system,
    messages,
    maxTokens,
    temperature,
    metadata = {}
  }) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens || this.defaultMaxTokens,
      temperature: temperature ?? this.defaultTemperature,
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

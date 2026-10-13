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
    try {
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
    } catch (error) {
      throw this.normalizeError(error);
    }
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

  normalizeError(error) {
    const status = error.status || error.statusCode || 500;
    const type = error.error?.type || error.type || "unknown_error";
    const message = error.message || "Error llamando a Claude";

    const normalized = new Error(message);
    normalized.status = status;
    normalized.type = type;
    normalized.publicMessage = this.toPublicMessage(status, type);

    return normalized;
  }

  toPublicMessage(status, type) {
    if (status === 400) return "La petición enviada al modelo no es válida.";
    if (status === 401) return "Error de autenticación con el proveedor IA.";
    if (status === 403) return "La clave configurada no tiene permisos para usar este recurso.";
    if (status === 404) return "El modelo o recurso solicitado no está disponible.";
    if (status === 413) return "La petición es demasiado grande para ser procesada.";
    if (status === 429) return "Se ha alcanzado temporalmente un límite de uso. Inténtalo de nuevo en unos segundos.";
    if (status >= 500) return "El proveedor IA no está disponible temporalmente.";

    return `Error del proveedor IA: ${type}`;
  }
}

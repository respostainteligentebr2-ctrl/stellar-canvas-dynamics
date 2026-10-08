import axios from "axios";
import type { LlmProvider } from "../llm-provider.js";
import type { LlmRequest, LlmResponse } from "../../../contracts/interaction-types.js";

export type OllamaProviderConfig = {
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  keepAlive?: string;
};

export class OllamaLlmProvider implements LlmProvider {
  public readonly name = "native";

  constructor(private readonly config: OllamaProviderConfig = {}) {}

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const endpoint =
      this.config.endpoint || "http://127.0.0.1:11434/api/chat";

    const model =
      this.config.model || request.modelId || "mistral:latest";

    const systemPrompt =
      typeof request.metadata?.systemPrompt === "string"
        ? request.metadata.systemPrompt
        : undefined;

    const messages = [
      ...(systemPrompt
        ? [{ role: "system", content: systemPrompt }]
        : []),
      { role: "user", content: request.message },
    ];

    const response = await axios.post(
      endpoint,
      {
        model,
        messages,
        stream: false,
        keep_alive: this.config.keepAlive || "30m",
      },
      {
        timeout: this.config.timeoutMs ?? 180000,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const data = response.data as {
      message?: {
        role?: string;
        content?: string;
      };
      model?: string;
      eval_count?: number;
      prompt_eval_count?: number;
    };

    return {
      text: (data.message?.content || "").trim(),
      provider: "native",
      model: data.model || model,
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
      },
    };
  }
}

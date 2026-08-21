import {
  LocalGenerationRequestSchema,
  LocalStructuredGenerationRequestSchema,
  type LocalGenerationRequest,
  type LocalStructuredGenerationRequest,
} from "@alexa-control/shared";

import { LocalAIError } from "./errors.js";

export type OllamaModelInfo = { name: string; size?: number; modifiedAt?: string };

export interface LocalModelRuntime {
  readonly id: string;
  healthCheck(): Promise<boolean>;
  listModels(): Promise<OllamaModelInfo[]>;
  isModelAvailable(model: string): Promise<boolean>;
  loadModel(model: string): Promise<void>;
  unloadModel(model: string): Promise<void>;
  generate(request: LocalGenerationRequest, options?: { signal?: AbortSignal }): Promise<{ text: string; model: string }>;
  generateStructured(
    request: LocalStructuredGenerationRequest,
    options?: { signal?: AbortSignal },
  ): Promise<{ text: string; model: string }>;
}

const responseJson = async (response: Response) => {
  if (!response.ok)
    throw new LocalAIError(
      "RUNTIME_REQUEST_FAILED",
      `Local runtime returned HTTP ${response.status}.`,
      true,
    );
  return response.json() as Promise<Record<string, unknown>>;
};

export class OllamaLocalRuntime implements LocalModelRuntime {
  readonly id = "ollama";
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  private url(path: string) {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`;
  }

  async healthCheck() {
    try {
      const response = await this.fetchImpl(this.url("/"));
      return response.ok;
    } catch {
      return false;
    }
  }
  async listModels() {
    try {
      const body = await responseJson(await this.fetchImpl(this.url("/api/tags")));
      const models = Array.isArray(body.models) ? body.models : [];
      return models.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const value = item as Record<string, unknown>;
        return typeof value.name === "string"
          ? [
              {
                name: value.name,
                ...(typeof value.size === "number" ? { size: value.size } : {}),
                ...(typeof value.modified_at === "string"
                  ? { modifiedAt: value.modified_at }
                  : {}),
              },
            ]
          : [];
      });
    } catch (error) {
      throw error instanceof LocalAIError
        ? error
        : new LocalAIError("RUNTIME_UNAVAILABLE", "Ollama is unavailable.", true);
    }
  }
  async isModelAvailable(model: string) {
    return (await this.listModels()).some((item) => item.name === model);
  }
  async loadModel(model: string) {
    await this.generateRaw({ model, prompt: "", keep_alive: "10m" });
  }
  async unloadModel(model: string) {
    await this.generateRaw({ model, prompt: "", keep_alive: 0 });
  }
  async generate(request: LocalGenerationRequest, options: { signal?: AbortSignal } = {}) {
    const parsed = LocalGenerationRequestSchema.parse(request);
    return {
      text: await this.generateRaw({
        model: parsed.model,
        system: parsed.system,
        prompt: parsed.prompt,
        stream: false,
        options: {
          temperature: parsed.temperature,
          num_predict: parsed.maxOutputTokens,
        },
        timeoutMs: parsed.timeoutMs, signal: options.signal,
      }),
      model: parsed.model,
    };
  }
  async generateStructured(request: LocalStructuredGenerationRequest, options: { signal?: AbortSignal } = {}) {
    const parsed = LocalStructuredGenerationRequestSchema.parse(request);
    return {
      text: await this.generateRaw({
        model: parsed.model,
        system: parsed.system,
        prompt: parsed.prompt,
        stream: false,
        format: parsed.jsonSchema ?? "json",
        options: {
          temperature: parsed.temperature,
          num_predict: parsed.maxOutputTokens,
        },
        timeoutMs: parsed.timeoutMs, signal: options.signal,
      }),
      model: parsed.model,
    };
  }
  private async generateRaw(body: Record<string, unknown>) {
    let callerSignal: AbortSignal | undefined;
    try {
      const { timeoutMs, signal, ...payload } = body as Record<string, unknown> & { signal?: AbortSignal };
      callerSignal = signal;
      const controller =
        typeof AbortController === "undefined" ? undefined : new AbortController();
      const timer =
        controller && typeof timeoutMs === "number"
          ? setTimeout(() => controller.abort(), timeoutMs)
          : undefined;
      const result = await responseJson(
        await this.fetchImpl(this.url("/api/generate"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          ...(controller ? { signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal } : signal ? { signal } : {}),
        }),
      );
      if (timer) clearTimeout(timer);
      if (typeof result.response !== "string")
        throw new LocalAIError(
          "INVALID_RUNTIME_RESPONSE",
          "Ollama did not return text.",
        );
      return result.response;
    } catch (error) {
      if (error instanceof LocalAIError) throw error;
      if (callerSignal?.aborted) throw error;
      if (error instanceof DOMException && error.name === "AbortError")
        throw new LocalAIError("INFERENCE_TIMEOUT", "Local inference timed out.", true);
      throw new LocalAIError("RUNTIME_UNAVAILABLE", "Ollama is unavailable.", true);
    }
  }
}

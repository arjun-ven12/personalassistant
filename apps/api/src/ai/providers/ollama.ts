import {
  AIInferenceResponseSchema,
  AIModelDescriptorSchema,
  AIProviderHealthSchema,
  type AIInferenceRequest,
  type AIModelDescriptor,
  type AIProviderCapabilities,
  type AIProviderDescriptor,
  type AIProviderHealth,
} from "@alexa-control/shared";
import { AIProviderError } from "../errors.js";
import {
  ensureRequest,
  textFromRequest,
  type AIProvider,
  type AIStructuredInferenceRequest,
  type AIStructuredInferenceResponse,
} from "../provider.js";
import type { AIProviderExecutionOptions } from "../provider.js";
import type { LocalModelRuntime } from "../../local-ai/runtime.js";

const gemma = (modelId: string, enabled = true): AIModelDescriptor =>
  AIModelDescriptorSchema.parse({
    modelId,
    providerId: "ollama",
    displayName: "Gemma 3 4B",
    family: "gemma",
    version: "3",
    enabled,
    capabilities: {
      textGeneration: true,
      structuredOutput: true,
      reasoning: true,
      toolCalling: false,
      vision: false,
      embeddings: false,
      streaming: false,
    },
    contextWindow: 8_192,
    maxOutputTokens: 2_048,
    modality: ["TEXT"],
    locality: "LOCAL",
    approximateMemoryMb: 4_500,
    tags: ["local", "offline", "interpreter"],
  });

export class OllamaProvider implements AIProvider {
  readonly providerId = "ollama" as const;
  readonly providerType = "LOCAL" as const;
  private running = 0;
  private readonly queue: Array<() => void> = [];
  constructor(
    private readonly runtime: LocalModelRuntime,
    private readonly configuredModel = "gemma3:4b",
    private readonly enabled = true,
    private readonly maxConcurrentRequests = 1,
  ) {}
  getCapabilities(): AIProviderCapabilities {
    return {
      textGeneration: true,
      structuredOutput: true,
      reasoning: true,
      vision: false,
      embeddings: false,
      streaming: false,
    };
  }
  modelDescriptor(modelId = this.configuredModel) {
    return gemma(modelId, this.enabled);
  }
  describe(): AIProviderDescriptor {
    return {
      providerId: this.providerId,
      displayName: "Ollama",
      providerType: this.providerType,
      enabled: this.enabled,
      configured: true,
      capabilities: this.getCapabilities(),
      credentialState: "NOT_REQUIRED",
      trustClassification: "TRUSTED_LOCAL",
      baseEndpoint: "local",
    };
  }
  async healthCheck(): Promise<AIProviderHealth> {
    const started = performance.now();
    if (!this.enabled)
      return AIProviderHealthSchema.parse({
        providerId: this.providerId,
        status: "UNAVAILABLE",
        latencyMs: null,
        lastCheckedAt: new Date().toISOString(),
        errorCategory: "PROVIDER_DISABLED",
        version: null,
        modelsVisible: 0,
      });
    try {
      const available = await this.runtime.healthCheck();
      const models = available ? await this.runtime.listModels() : [];
      return AIProviderHealthSchema.parse({
        providerId: this.providerId,
        status: available ? "HEALTHY" : "UNAVAILABLE",
        latencyMs: Math.round(performance.now() - started),
        lastCheckedAt: new Date().toISOString(),
        errorCategory: available ? null : "PROVIDER_UNAVAILABLE",
        version: null,
        modelsVisible: models.length,
      });
    } catch (error) {
      return AIProviderHealthSchema.parse({
        providerId: this.providerId,
        status: "UNAVAILABLE",
        latencyMs: Math.round(performance.now() - started),
        lastCheckedAt: new Date().toISOString(),
        errorCategory:
          error instanceof AIProviderError ? error.code : "PROVIDER_UNAVAILABLE",
        version: null,
        modelsVisible: 0,
      });
    }
  }
  async listModels() {
    const installed = await this.runtime.listModels();
    return installed.map((item) =>
      item.name === this.configuredModel
        ? gemma(this.configuredModel, this.enabled)
        : AIModelDescriptorSchema.parse({
            modelId: item.name,
            providerId: this.providerId,
            displayName: item.name,
            enabled: true,
            capabilities: {
              textGeneration: true,
              structuredOutput: false,
              reasoning: false,
              toolCalling: false,
              vision: false,
              embeddings: false,
              streaming: false,
            },
            modality: ["TEXT"],
            locality: "LOCAL",
            tags: ["discovered", "unreviewed"],
          }),
    );
  }
  private request(request: AIInferenceRequest) {
    const parsed = ensureRequest(request);
    const model =
      parsed.model?.type === "MODEL" ? parsed.model.modelId : this.configuredModel;
    return { parsed, model, text: textFromRequest(parsed) };
  }
  async generate(request: AIInferenceRequest, options: AIProviderExecutionOptions = {}) {
    const started = performance.now();
    const { parsed, model, text } = this.request(request);
    try {
      const result = await this.queued(() =>
        this.runtime.generate({
          model,
          system: this.systemInstructions(parsed),
          prompt: text,
          temperature: parsed.temperature ?? 0.2,
          maxOutputTokens: parsed.maxOutputTokens ?? 512,
          priority: "INTERACTIVE_TEXT",
          timeoutMs: parsed.timeoutMs,
        }, options),
      );
      return AIInferenceResponseSchema.parse({
        requestId: parsed.requestId ?? crypto.randomUUID(),
        providerId: this.providerId,
        modelId: model,
        status: "SUCCESS",
        outputText: result.text,
        latencyMs: Math.round(performance.now() - started),
      });
    } catch (error) {
      throw this.normalizeError(error);
    }
  }
  async generateStructured<T>(
    request: AIStructuredInferenceRequest<T>,
    options: AIProviderExecutionOptions = {},
  ): Promise<AIStructuredInferenceResponse<T>> {
    const parsed = ensureRequest(request);
    const model =
      parsed.model?.type === "MODEL" ? parsed.model.modelId : this.configuredModel;
    const started = performance.now();
    try {
      const result = await this.queued(() =>
        this.runtime.generateStructured({
          model,
          system: this.systemInstructions(parsed),
          prompt: textFromRequest(parsed),
          temperature: parsed.temperature ?? 0.05,
          maxOutputTokens: parsed.maxOutputTokens ?? 512,
          priority: "INTERACTIVE_TEXT",
          timeoutMs: parsed.timeoutMs,
          schemaName: request.schemaName,
          schemaDescription: "Return JSON only matching the caller-provided schema.",
          ...(request.jsonSchema ? { jsonSchema: request.jsonSchema } : {}),
        }, options),
      );
      let value: T;
      try {
        value = request.schema.parse(JSON.parse(result.text));
      } catch {
        throw new AIProviderError(
          "OUTPUT_VALIDATION_FAILED",
          "Ollama structured output failed local schema validation.",
          this.providerId,
          true,
        );
      }
      return {
        ...AIInferenceResponseSchema.parse({
          requestId: parsed.requestId ?? crypto.randomUUID(),
          providerId: this.providerId,
          modelId: model,
          status: "SUCCESS",
          outputText: result.text,
          latencyMs: Math.round(performance.now() - started),
        }),
        structuredOutput: value,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }
  private normalizeError(error: unknown): AIProviderError {
    if (error instanceof AIProviderError) return error;
    const code =
      error instanceof Error && error.message.includes("timed out")
        ? "TIMEOUT"
        : "PROVIDER_UNAVAILABLE";
    return new AIProviderError(
      code,
      "Ollama inference failed.",
      this.providerId,
      code === "TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
    );
  }
  private systemInstructions(request: ReturnType<typeof ensureRequest>) {
    return request.systemInstructions?.length
      ? request.systemInstructions.join("\n")
      : "Return non-executable assistance only. Never claim authorization, approval, tool use, or completed actions.";
  }

  private async queued<T>(operation: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrentRequests)
      await new Promise<void>((resolve) => this.queue.push(resolve));
    this.running += 1;
    try {
      return await operation();
    } finally {
      this.running -= 1;
      this.queue.shift()?.();
    }
  }
}

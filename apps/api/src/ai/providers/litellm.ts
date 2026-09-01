import {
  AIInferenceResponseSchema,
  AIModelDescriptorSchema,
  AIProviderHealthSchema,
  type AIInferenceRequest,
  type AIProviderCapabilities,
  type AIProviderDescriptor,
} from "@alexa-control/shared";

import { AIProviderError } from "../errors.js";
import {
  ensureRequest,
  type AIProvider,
  type AIProviderExecutionOptions,
  type AIStructuredInferenceRequest,
  type AIStructuredInferenceResponse,
} from "../provider.js";

type LiteLLMResponse = {
  id?: string;
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model?: string;
};

/** Optional adapter for an explicitly controlled LiteLLM deployment below AIRouter. */
export class LiteLLMGatewayProvider implements AIProvider {
  readonly providerId = "litellm_gateway";
  readonly providerType = "CLOUD" as const;
  readonly #url: URL;
  readonly #failures: number[] = [];
  #rateLimitedUntil = 0;
  constructor(
    baseUrl: string,
    readonly apiKey: string | undefined,
    readonly models: string[],
    readonly allowedHosts: string[],
    readonly fetchImpl: typeof fetch = fetch,
    readonly enabled = true,
  ) {
    this.#url = new URL(baseUrl);
    if (!allowedHosts.includes(this.#url.hostname))
      throw new Error(
        "LiteLLM gateway host is not in the server-controlled allowlist.",
      );
    if (
      this.#url.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "::1"].includes(this.#url.hostname)
    )
      throw new Error("Remote LiteLLM gateways require HTTPS.");
  }
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
  modelDescriptor(modelId: string) {
    return AIModelDescriptorSchema.parse({
      modelId,
      providerId: this.providerId,
      displayName: `LiteLLM ${modelId}`,
      family: "gateway",
      enabled: this.enabled && Boolean(this.apiKey),
      capabilities: this.getCapabilities(),
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      modality: ["TEXT"],
      locality: "REMOTE",
      tags: ["controlled-gateway", "airouter-selected"],
    });
  }
  describe(): AIProviderDescriptor {
    return {
      providerId: this.providerId,
      displayName: "Controlled LiteLLM Gateway",
      providerType: this.providerType,
      enabled: this.enabled,
      configured: Boolean(this.apiKey) && this.models.length > 0,
      capabilities: this.getCapabilities(),
      credentialState: this.apiKey ? "CONFIGURED" : "MISSING",
      trustClassification: "APPROVED_CLOUD",
      baseEndpoint: "remote",
    };
  }
  listModels() {
    return Promise.resolve(this.models.map((model) => this.modelDescriptor(model)));
  }
  async healthCheck() {
    const started = performance.now();
    if (!this.enabled || !this.apiKey)
      return AIProviderHealthSchema.parse({
        providerId: this.providerId,
        status: this.enabled ? "UNCONFIGURED" : "UNAVAILABLE",
        latencyMs: null,
        lastCheckedAt: new Date().toISOString(),
        errorCategory: this.enabled ? "PROVIDER_UNCONFIGURED" : "PROVIDER_DISABLED",
        version: null,
        modelsVisible: 0,
      });
    if (Date.now() < this.#rateLimitedUntil)
      return AIProviderHealthSchema.parse({
        providerId: this.providerId,
        status: "DEGRADED",
        latencyMs: null,
        lastCheckedAt: new Date().toISOString(),
        errorCategory: "RATE_LIMITED",
        version: null,
        modelsVisible: this.models.length,
      });
    try {
      await this.call("/health/liveliness", { method: "GET" }, 5_000);
      return AIProviderHealthSchema.parse({
        providerId: this.providerId,
        status: this.healthState(),
        latencyMs: Math.round(performance.now() - started),
        lastCheckedAt: new Date().toISOString(),
        errorCategory: null,
        version: null,
        modelsVisible: this.models.length,
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
  async generate(request: AIInferenceRequest, options?: AIProviderExecutionOptions) {
    return this.execute(ensureRequest(request), options);
  }
  async generateStructured<T>(
    request: AIStructuredInferenceRequest<T>,
    options?: AIProviderExecutionOptions,
  ): Promise<AIStructuredInferenceResponse<T>> {
    const response = await this.execute(
      ensureRequest(request),
      options,
      request.schemaName,
    );
    let value: unknown;
    try {
      value = JSON.parse(response.outputText ?? "");
    } catch {
      throw new AIProviderError(
        "OUTPUT_VALIDATION_FAILED",
        "LiteLLM gateway returned invalid structured JSON.",
        this.providerId,
        false,
      );
    }
    const structuredOutput = request.schema.parse(value);
    return { ...response, structuredOutput };
  }
  private async execute(
    request: ReturnType<typeof ensureRequest>,
    options?: AIProviderExecutionOptions,
    schemaName?: string,
  ) {
    if (
      !request.model ||
      request.model.type !== "MODEL" ||
      request.model.providerId !== this.providerId ||
      !this.models.includes(request.model.modelId)
    )
      throw new AIProviderError(
        "MODEL_NOT_FOUND",
        "AIRouter did not select an approved LiteLLM gateway model.",
        this.providerId,
        false,
      );
    if (Date.now() < this.#rateLimitedUntil)
      throw new AIProviderError(
        "RATE_LIMITED",
        "LiteLLM gateway is in bounded cooldown.",
        this.providerId,
        true,
      );
    const started = performance.now();
    const payload = {
      model: request.model.modelId,
      messages: request.input.map((message) => ({
        role: message.role,
        content: message.content
          .map((part) =>
            part.type === "text"
              ? part.text
              : JSON.stringify(
                  part.type === "json" || part.type === "tool_result"
                    ? part.value
                    : { image: "unsupported" },
                ),
          )
          .join("\n"),
      })),
      max_tokens: request.maxOutputTokens,
      ...(request.temperature === undefined
        ? {}
        : { temperature: request.temperature }),
      ...(schemaName
        ? { response_format: { type: "json_object", schema_name: schemaName } }
        : {}),
    };
    const raw = (await this.call(
      "/v1/chat/completions",
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...(options?.signal ? { signal: options.signal } : {}),
      },
      request.timeoutMs ?? 60_000,
    )) as LiteLLMResponse;
    const content = raw.choices?.[0]?.message?.content;
    if (typeof content !== "string")
      throw new AIProviderError(
        "PROVIDER_ERROR",
        "LiteLLM gateway response did not contain text.",
        this.providerId,
        false,
      );
    return AIInferenceResponseSchema.parse({
      requestId: request.requestId ?? crypto.randomUUID(),
      providerId: this.providerId,
      modelId: request.model.modelId,
      status: "SUCCESS",
      outputText: content,
      finishReason: raw.choices?.[0]?.finish_reason,
      usage: raw.usage
        ? {
            inputTokens: raw.usage.prompt_tokens ?? 0,
            outputTokens: raw.usage.completion_tokens ?? 0,
            totalTokens: raw.usage.total_tokens ?? 0,
          }
        : undefined,
      providerRequestId: raw.id,
      latencyMs: Math.round(performance.now() - started),
    });
  }
  private async call(
    path: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<unknown> {
    if (!this.enabled || !this.apiKey)
      throw new AIProviderError(
        "PROVIDER_UNCONFIGURED",
        "Controlled LiteLLM gateway is not configured.",
        this.providerId,
        false,
      );
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const signal = init.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal;
      const response = await this.fetchImpl(
        new URL(path, `${this.#url.toString().replace(/\/$/, "")}/`),
        {
          ...init,
          signal,
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
            ...(init.headers ?? {}),
          },
        },
      );
      if (response.status === 429) {
        this.#rateLimitedUntil = Date.now() + 30_000;
        throw new AIProviderError(
          "RATE_LIMITED",
          "LiteLLM gateway rate limited the approved request.",
          this.providerId,
          true,
        );
      }
      if (!response.ok) {
        this.#failures.push(Date.now());
        throw new AIProviderError(
          response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_ERROR",
          "Controlled LiteLLM gateway request failed.",
          this.providerId,
          response.status >= 500,
        );
      }
      return response.json();
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (controller.signal.aborted)
        throw new AIProviderError(
          "TIMEOUT",
          "Controlled LiteLLM gateway timed out.",
          this.providerId,
          true,
        );
      throw new AIProviderError(
        "NETWORK_ERROR",
        "Controlled LiteLLM gateway was unreachable.",
        this.providerId,
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  private healthState() {
    const cutoff = Date.now() - 60_000;
    while ((this.#failures[0] ?? Infinity) < cutoff) this.#failures.shift();
    return this.#failures.length >= 3 ? ("DEGRADED" as const) : ("HEALTHY" as const);
  }
}

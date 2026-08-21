import type { z } from "zod";
import {
  AIInferenceRequestSchema,
  AIInferenceResponseSchema,
  AIModelDescriptorSchema,
  AIProviderDescriptorSchema,
  AIProviderHealthSchema,
  type AIInferenceRequest,
  type AIInferenceResponse,
  type AIModelDescriptor,
  type AIProviderCapabilities,
  type AIProviderDescriptor,
  type AIProviderHealth,
} from "@alexa-control/shared";
import { AIProviderError } from "./errors.js";

export type AIStructuredInferenceRequest<T> = AIInferenceRequest & {
  schema: z.ZodType<T>;
  schemaName: string;
  jsonSchema?: Record<string, unknown>;
};
export type AIStructuredInferenceResponse<T> = Omit<
  AIInferenceResponse,
  "structuredOutput"
> & { structuredOutput: T };

export type AIProviderExecutionOptions = { signal?: AbortSignal };

export interface AIProvider {
  readonly providerId: string;
  readonly providerType: AIProviderDescriptor["providerType"];
  healthCheck(): Promise<AIProviderHealth>;
  listModels(): Promise<AIModelDescriptor[]>;
  generate(request: AIInferenceRequest, options?: AIProviderExecutionOptions): Promise<AIInferenceResponse>;
  generateStructured<T>(
    request: AIStructuredInferenceRequest<T>,
    options?: AIProviderExecutionOptions,
  ): Promise<AIStructuredInferenceResponse<T>>;
  getCapabilities(): AIProviderCapabilities;
  describe(): AIProviderDescriptor;
}

export const textFromRequest = (request: AIInferenceRequest) => {
  const parts = request.input.flatMap((message) =>
    message.content.map((part) => {
      if (part.type === "text") return `${message.role}: ${part.text}`;
      if (part.type === "json" || part.type === "tool_result")
        return `${message.role}: ${JSON.stringify(part.value)}`;
      throw new AIProviderError(
        "CAPABILITY_NOT_SUPPORTED",
        "Image input is not supported by this provider.",
        undefined,
        false,
      );
    }),
  );
  const context = (request.context ?? []).map(
    (item) => `[${item.sourceType}/${item.trustLevel}] ${JSON.stringify(item.content)}`,
  );
  return [...context, ...parts].join("\n").slice(0, 32_000);
};

export const parseProviderResponse = (
  value: unknown,
  providerId: string,
  modelId: string,
  requestId: string,
  started: number,
): AIInferenceResponse => {
  const response = value as Record<string, unknown>;
  return AIInferenceResponseSchema.parse({
    requestId,
    providerId,
    modelId,
    status: "SUCCESS",
    ...(typeof response.outputText === "string"
      ? { outputText: response.outputText }
      : {}),
    ...(typeof response.finishReason === "string"
      ? { finishReason: response.finishReason }
      : {}),
    ...(response.usage && typeof response.usage === "object"
      ? { usage: response.usage }
      : {}),
    ...(typeof response.providerRequestId === "string"
      ? { providerRequestId: response.providerRequestId }
      : {}),
    latencyMs: Math.round(performance.now() - started),
  });
};

export const ensureRequest = (
  request: AIInferenceRequest | AIStructuredInferenceRequest<unknown>,
) => {
  const base = Object.fromEntries(
    Object.entries(request).filter(
      ([key]) => !["schema", "schemaName", "jsonSchema"].includes(key),
    ),
  );
  return AIInferenceRequestSchema.parse(base);
};
export const ensureModel = (model: AIModelDescriptor) =>
  AIModelDescriptorSchema.parse(model);
export const ensureProvider = (provider: AIProviderDescriptor) =>
  AIProviderDescriptorSchema.parse(provider);
export const ensureHealth = (health: AIProviderHealth) =>
  AIProviderHealthSchema.parse(health);

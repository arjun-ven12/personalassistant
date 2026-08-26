/* eslint-disable @typescript-eslint/require-await */
import {
  AIProviderHealthSchema,
  type AIInferenceRequest,
  type AIInferenceResponse,
  type AIModelDescriptor,
} from "@alexa-control/shared";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { AIModelRegistry, AIProviderRegistry } from "../registry.js";
import { AIRuntimeService } from "../runtime-service.js";
import { AIRouterService } from "./service.js";
import { AIEconomicsService } from "../economics/service.js";
import type { AIProvider } from "../provider.js";

const descriptor = (providerId: string, modelId: string, locality: "LOCAL" | "REMOTE"): AIModelDescriptor => ({
  providerId, modelId, displayName: modelId, enabled: true,
  capabilities: { textGeneration: true, structuredOutput: true, reasoning: true, toolCalling: false, vision: false, embeddings: false, streaming: false },
  modality: ["TEXT"], locality,
});

const fakeProvider = (providerId: string, modelId: string, locality: "LOCAL" | "REMOTE", confidence = 0.95): AIProvider => ({
  providerId, providerType: locality === "LOCAL" ? "LOCAL" : "CLOUD",
  healthCheck: async () => AIProviderHealthSchema.parse({ providerId, status: "HEALTHY", latencyMs: 1, lastCheckedAt: new Date().toISOString(), errorCategory: null, version: "test", modelsVisible: 1 }),
  listModels: async () => [descriptor(providerId, modelId, locality)],
  getCapabilities: () => ({ structuredOutput: true, textGeneration: true, reasoning: true, vision: false, embeddings: false, streaming: false }),
  describe: () => ({ providerId, displayName: providerId, providerType: locality === "LOCAL" ? "LOCAL" : "CLOUD", enabled: true, configured: true, capabilities: { structuredOutput: true, textGeneration: true, reasoning: true, vision: false, embeddings: false, streaming: false }, credentialState: locality === "LOCAL" ? "NOT_REQUIRED" : "CONFIGURED", baseEndpoint: locality === "LOCAL" ? "local" : "remote" }),
  generate: async (request: AIInferenceRequest): Promise<AIInferenceResponse> => ({ requestId: request.requestId ?? crypto.randomUUID(), providerId, modelId, status: "SUCCESS", outputText: "ok", latencyMs: 1 }),
  generateStructured: async (request) => ({ requestId: request.requestId ?? crypto.randomUUID(), providerId, modelId, status: "SUCCESS" as const, structuredOutput: request.schema.parse({ intent: "OPEN_PROJECT", entities: {}, confidence, requiresClarification: confidence < 0.6 }), latencyMs: 1 }),
});

const makeRouter = async (localConfidence = 0.95) => {
  const providers = new AIProviderRegistry();
  providers.register(fakeProvider("ollama", "gemma", "LOCAL", localConfidence));
  providers.register(fakeProvider("openai", "luna", "REMOTE"));
  const models = new AIModelRegistry();
  models.register(descriptor("ollama", "gemma", "LOCAL"));
  models.register(descriptor("openai", "luna", "REMOTE"));
  const runtime = new AIRuntimeService(providers, models);
  runtime.setRole({
    role: "FAST_INTERPRETER",
    providerId: "openai",
    modelId: "luna",
    enabled: true,
  });
  const economics = new AIEconomicsService();
  await economics.upsertPricing({
    id: crypto.randomUUID(),
    providerId: "openai",
    modelId: "luna",
    currency: "USD",
    inputPerMillionTokens: "0.01",
    outputPerMillionTokens: "0.02",
    effectiveFrom: new Date(Date.now() - 1_000).toISOString(),
    version: "test",
    status: "ACTIVE",
  });
  runtime.requirePaidInferenceAuthorization(async ({ ownerId, reservationId }) =>
    Boolean(await economics.verifyActiveReservation(ownerId, reservationId)),
  );
  return { router: new AIRouterService(runtime, economics), economics };
};

const authorizeCloud = (economics: AIEconomicsService, ownerId: string) =>
  economics.upsertPolicy({
    id: crypto.randomUUID(),
    ownerId,
    scope: "PROVIDER",
    scopeId: "openai",
    period: "MONTHLY",
    currency: "USD",
    limitUsd: "1",
    warningThresholdPct: 80,
    hardStopThresholdPct: 100,
    overflowBehavior: "DENY",
    enabled: true,
    effectiveFrom: new Date(Date.now() - 1_000).toISOString(),
  });

const request = (overrides: Record<string, unknown> = {}) => ({
  purpose: "INTERPRETATION" as const,
  input: [{ role: "user" as const, content: [{ type: "text" as const, text: "take me back to that coding thing" }] }],
  outputMode: "STRUCTURED" as const,
  ...overrides,
});

describe("AIRouterService", () => {
  it("bypasses AI for an already deterministic result", async () => {
    const { router } = await makeRouter();
    const result = await router.execute({ ...request(), deterministicResolved: true });
    expect(result.outcome).toBe("NO_AI");
    expect(result.attempts).toHaveLength(0);
  });

  it("prefers local models and never sends LOCAL_ONLY requests to cloud", async () => {
    const { router } = await makeRouter();
    const result = await router.executeStructured({
      ...request(), privacy: "LOCAL_ONLY", allowCloud: true, schemaName: "test", schema: z.object({ intent: z.string(), entities: z.record(z.string(), z.unknown()), confidence: z.number(), requiresClarification: z.boolean() }),
    });
    expect(result.providerId).toBe("ollama");
  });

  it("uses the configured Luna role mapping for ordinary remote-allowed interpretation", async () => {
    const { router, economics } = await makeRouter();
    const ownerId = crypto.randomUUID();
    await authorizeCloud(economics, ownerId);
    const result = await router.executeStructured({
      ...request(),
      economicContext: {
        ownerId,
        purpose: "INTERPRETATION",
        autonomyMode: "INTERACTIVE",
        priority: "IMPORTANT",
      },
      schemaName: "test",
      schema: z.object({
        intent: z.string(),
        entities: z.record(z.string(), z.unknown()),
        confidence: z.number(),
        requiresClarification: z.boolean(),
      }),
    });
    expect(result.providerId).toBe("openai");
    expect(result.modelId).toBe("luna");
  });

  it("attributes enrolled agent provider usage through the bounded economy hook", async () => {
    const { router, economics } = await makeRouter();
    const ownerId = crypto.randomUUID();
    const agentId = crypto.randomUUID();
    await authorizeCloud(economics, ownerId);
    const accounting = {
      reserveProviderCost: vi.fn().mockResolvedValue("internal-reservation"),
      settleProviderCost: vi.fn().mockResolvedValue(undefined),
      releaseProviderCost: vi.fn().mockResolvedValue(undefined),
    };
    router.setAgentEconomyAccounting(accounting);
    const result = await router.executeStructured({
      ...request(),
      economicContext: {
        ownerId,
        agentId,
        purpose: "INTERPRETATION",
        autonomyMode: "INTERACTIVE",
        priority: "IMPORTANT",
      },
      schemaName: "test",
      schema: z.object({ intent: z.string(), entities: z.record(z.string(), z.unknown()), confidence: z.number(), requiresClarification: z.boolean() }),
    });
    expect(result.outcome).toBe("SUCCESS");
    expect(accounting.reserveProviderCost).toHaveBeenCalledOnce();
    expect(accounting.settleProviderCost).toHaveBeenCalledWith(expect.objectContaining({ ownerId, agentId, reservationId: "internal-reservation", locality: "REMOTE" }));
    expect(accounting.releaseProviderCost).not.toHaveBeenCalled();
  });

  it("returns clarification instead of accepting low confidence", async () => {
    const { router } = await makeRouter(0.4);
    const result = await router.executeStructured({
      ...request(), allowCloud: false, schemaName: "test", schema: z.object({ intent: z.string(), entities: z.record(z.string(), z.unknown()), confidence: z.number(), requiresClarification: z.boolean() }),
    });
    expect(result.outcome).toBe("CLARIFICATION_REQUIRED");
  });

  it("keeps cloud disabled when local inference fails", async () => {
    const { router } = await makeRouter();
    const result = await router.execute({ ...request(), allowCloud: false, outputMode: "TEXT" });
    expect(result.providerId).toBe("ollama");
  });

  it("treats caller cancellation as terminal and never falls back", async () => {
    let calls = 0;
    const providers = new AIProviderRegistry();
    const delayed: AIProvider = {
      ...fakeProvider("delayed", "slow", "LOCAL"),
      generate: async (input, options) => {
        calls += 1;
        await new Promise<void>((resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
        });
        return { requestId: input.requestId ?? crypto.randomUUID(), providerId: "delayed", modelId: "slow", status: "SUCCESS", outputText: "never", latencyMs: 1 };
      },
    };
    providers.register(delayed);
    const models = new AIModelRegistry();
    models.register(descriptor("delayed", "slow", "LOCAL"));
    const router = new AIRouterService(new AIRuntimeService(providers, models));
    const controller = new AbortController();
    const pending = router.execute({ ...request({ outputMode: "TEXT", model: { type: "MODEL", providerId: "delayed", modelId: "slow" }, allowFallback: true }) }, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    expect((await pending).outcome).toBe("CANCELLED");
    expect(calls).toBe(1);
  });
});

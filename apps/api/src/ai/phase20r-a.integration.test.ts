/* eslint-disable @typescript-eslint/require-await */
import {
  AIProviderHealthSchema,
  type AIInferenceRequest,
  type AIInferenceResponse,
  type AIModelDescriptor,
} from "@alexa-control/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { CognitiveContextService } from "./context/service.js";
import { AIEconomicsService } from "./economics/service.js";
import { AIProviderError } from "./errors.js";
import type { AIProvider } from "./provider.js";
import { AIModelRegistry, AIProviderRegistry } from "./registry.js";
import { AIRuntimeService } from "./runtime-service.js";
import { createCanonicalAIServices } from "./bootstrap.js";

const model = (
  providerId: string,
  modelId: string,
  locality: "LOCAL" | "REMOTE",
  enabled = true,
): AIModelDescriptor => ({
  providerId,
  modelId,
  displayName: modelId,
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
  modality: ["TEXT"],
  locality,
});

const provider = (input: {
  providerId: string;
  modelId: string;
  locality: "LOCAL" | "REMOTE";
  enabled?: boolean;
  unavailable?: boolean;
  captured?: AIInferenceRequest[];
  structuredFailure?: boolean;
}): AIProvider => ({
  providerId: input.providerId,
  providerType: input.locality === "LOCAL" ? "LOCAL" : "CLOUD",
  describe: () => ({
    providerId: input.providerId,
    displayName: input.providerId,
    providerType: input.locality === "LOCAL" ? "LOCAL" : "CLOUD",
    enabled: input.enabled ?? true,
    configured: true,
    capabilities: model(input.providerId, input.modelId, input.locality).capabilities,
    credentialState: "NOT_REQUIRED",
    baseEndpoint: input.locality === "LOCAL" ? "local" : "remote",
  }),
  getCapabilities: () =>
    model(input.providerId, input.modelId, input.locality).capabilities,
  healthCheck: async () =>
    AIProviderHealthSchema.parse({
      providerId: input.providerId,
      status: input.enabled === false || input.unavailable ? "UNAVAILABLE" : "HEALTHY",
      latencyMs: 1,
      lastCheckedAt: new Date().toISOString(),
      errorCategory:
        input.enabled === false
          ? "PROVIDER_DISABLED"
          : input.unavailable
            ? "PROVIDER_UNAVAILABLE"
            : null,
      version: "test",
      modelsVisible: input.enabled === false ? 0 : 1,
    }),
  listModels: async () => [
    model(input.providerId, input.modelId, input.locality, input.enabled),
  ],
  generate: async (request: AIInferenceRequest): Promise<AIInferenceResponse> => {
    input.captured?.push(request);
    return {
      requestId: request.requestId ?? crypto.randomUUID(),
      providerId: input.providerId,
      modelId: input.modelId,
      status: "SUCCESS",
      outputText: "canonical",
      latencyMs: 1,
    };
  },
  generateStructured: async (request) => {
    input.captured?.push(request);
    if (input.structuredFailure)
      throw new AIProviderError(
        "OUTPUT_VALIDATION_FAILED",
        "Malformed local output.",
        input.providerId,
        true,
      );
    return {
      requestId: request.requestId ?? crypto.randomUUID(),
      providerId: input.providerId,
      modelId: input.modelId,
      status: "SUCCESS" as const,
      structuredOutput: request.schema.parse({
        intent: "INFORMATIONAL",
        confidence: 0.95,
      }),
      latencyMs: 1,
    };
  },
});

const graph = (providersInput: AIProvider[], modelsInput: AIModelDescriptor[]) => {
  const providers = new AIProviderRegistry();
  const models = new AIModelRegistry();
  for (const item of providersInput) providers.register(item);
  for (const item of modelsInput) models.register(item);
  const runtime = new AIRuntimeService(providers, models);
  const economics = new AIEconomicsService();
  void economics.upsertPricing({
    id: crypto.randomUUID(),
    providerId: "fakezo",
    modelId: "cloud",
    currency: "USD",
    inputPerMillionTokens: "1",
    outputPerMillionTokens: "1",
    effectiveFrom: new Date().toISOString(),
    version: "test-cloud",
    status: "ACTIVE",
  });
  void economics.upsertPricing({
    id: crypto.randomUUID(),
    providerId: "fakezo",
    modelId: "zo-general",
    currency: "USD",
    inputPerMillionTokens: "1",
    outputPerMillionTokens: "1",
    effectiveFrom: new Date().toISOString(),
    version: "test-general",
    status: "ACTIVE",
  });
  void economics.upsertPolicy({
    id: crypto.randomUUID(),
    ownerId: economicContext.ownerId,
    scope: "GLOBAL",
    period: "MONTHLY",
    currency: "USD",
    limitUsd: "10",
    warningThresholdPct: 70,
    hardStopThresholdPct: 100,
    overflowBehavior: "DENY",
    enabled: true,
    effectiveFrom: new Date().toISOString(),
  });
  const context = new CognitiveContextService();
  context.register({
    sourceType: "MEMORY",
    retrieve: async () => [
      {
        id: "test-context",
        sourceType: "MEMORY",
        trustLevel: "TRUSTED",
        title: "Bounded test context",
        content: { environment: "test" },
        relevanceScore: 0.8,
        importanceScore: 0.8,
        confidence: 1,
        estimatedTokens: 8,
        cacheability: "DYNAMIC",
        sensitivity: "NORMAL",
        mandatory: false,
      },
    ],
  });
  const canonical = createCanonicalAIServices(runtime, economics, context);
  return { runtime, context, router: canonical.aiRouter };
};

const economicContext = {
  ownerId: crypto.randomUUID(),
  purpose: "CONVERSATION" as const,
  autonomyMode: "INTERACTIVE" as const,
  priority: "IMPORTANT" as const,
};

describe("Phase 20R-A production service graph", () => {
  it("keeps high-level systems behind the provider-neutral router boundary", () => {
    const roots = ["human-understanding", "agents", "voice", "workflows"];
    const forbidden = [
      "OpenAIProvider",
      "OllamaProvider",
      "LocalAIService",
      "/api/openai",
      "api.openai.com",
      "/api/generate",
    ];
    for (const root of roots) {
      const directory = path.resolve("apps/api/src", root);
      const files = readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.endsWith(".ts") &&
            !entry.name.endsWith(".test.ts"),
        )
        .map((entry) => path.join(entry.parentPath, entry.name));
      for (const file of files) {
        const source = readFileSync(file, "utf8");
        for (const token of forbidden)
          expect(source, `${file} imports or calls ${token}`).not.toContain(token);
      }
    }
  });

  it("compiles router policy fields into a canonical provider request", async () => {
    const captured: AIInferenceRequest[] = [];
    const fake = provider({
      providerId: "local-fake",
      modelId: "text-1",
      locality: "LOCAL",
      captured,
    });
    const { router, context } = graph([fake], [model("local-fake", "text-1", "LOCAL")]);
    const response = await router.execute({
      purpose: "CONVERSATION",
      input: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
      taskText: "hello",
      allowCloud: false,
      privacy: "LOCAL_ONLY",
      risk: "HIGH",
      maxAttempts: 2,
      economicContext,
    });
    expect(response.outcome).toBe("SUCCESS");
    expect(context.sourceCount()).toBe(1);
    expect(captured).toHaveLength(1);
    expect(captured[0]).not.toHaveProperty("allowCloud");
    expect(captured[0]).not.toHaveProperty("privacy");
    expect(captured[0]).not.toHaveProperty("risk");
    expect(captured[0]).not.toHaveProperty("maxAttempts");
    expect(captured[0]?.context).toEqual([
      {
        sourceType: "MEMORY",
        trustLevel: "TRUSTED",
        content: { environment: "test" },
      },
    ]);
  });

  it("runs canonical structured inference through context and runtime", async () => {
    const fake = provider({
      providerId: "local-fake",
      modelId: "structured-1",
      locality: "LOCAL",
    });
    const { router } = graph([fake], [model("local-fake", "structured-1", "LOCAL")]);
    const response = await router.executeStructured({
      purpose: "INTERPRETATION",
      input: [{ role: "user", content: [{ type: "text", text: "interpret" }] }],
      outputMode: "STRUCTURED",
      allowCloud: false,
      economicContext: { ...economicContext, purpose: "INTERPRETATION" },
      schemaName: "Interpretation",
      schema: z.object({ intent: z.string(), confidence: z.number() }),
    });
    expect(response.outcome).toBe("SUCCESS");
    expect(response.structuredOutput).toEqual({
      intent: "INFORMATIONAL",
      confidence: 0.95,
    });
  });

  it("excludes disabled local providers and falls back to healthy cloud", async () => {
    const local = provider({
      providerId: "local-fake",
      modelId: "local",
      locality: "LOCAL",
      enabled: false,
    });
    const cloud = provider({
      providerId: "fakezo",
      modelId: "cloud",
      locality: "REMOTE",
    });
    const { router } = graph(
      [local, cloud],
      [model("local-fake", "local", "LOCAL"), model("fakezo", "cloud", "REMOTE")],
    );
    const response = await router.execute({
      purpose: "CONVERSATION",
      input: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
      allowCloud: true,
      economicContext,
    });
    expect(response.providerId).toBe("fakezo");
    expect(response.attempts).toHaveLength(1);
  });

  it("excludes unavailable local providers and falls back to healthy cloud", async () => {
    const local = provider({
      providerId: "local-fake",
      modelId: "local",
      locality: "LOCAL",
      unavailable: true,
    });
    const cloud = provider({
      providerId: "fakezo",
      modelId: "cloud",
      locality: "REMOTE",
    });
    const { router } = graph(
      [local, cloud],
      [model("local-fake", "local", "LOCAL"), model("fakezo", "cloud", "REMOTE")],
    );
    const response = await router.execute({
      purpose: "CONVERSATION",
      input: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
      allowCloud: true,
      economicContext,
    });
    expect(response.providerId).toBe("fakezo");
  });

  it("starts deterministically with no configured model providers", async () => {
    const { router, runtime } = graph([], []);
    await expect(runtime.providerHealth()).resolves.toEqual([]);
    await expect(
      router.execute({
        purpose: "CONVERSATION",
        input: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
        deterministicResolved: true,
      }),
    ).resolves.toMatchObject({ outcome: "NO_AI" });
  });

  it("falls back after malformed local structured output", async () => {
    const localCalls: AIInferenceRequest[] = [];
    const local = provider({
      providerId: "local-fake",
      modelId: "local",
      locality: "LOCAL",
      structuredFailure: true,
      captured: localCalls,
    });
    const cloud = provider({
      providerId: "fakezo",
      modelId: "cloud",
      locality: "REMOTE",
    });
    const { router } = graph(
      [local, cloud],
      [model("local-fake", "local", "LOCAL"), model("fakezo", "cloud", "REMOTE")],
    );
    const response = await router.executeStructured({
      purpose: "INTERPRETATION",
      input: [{ role: "user", content: [{ type: "text", text: "interpret" }] }],
      outputMode: "STRUCTURED",
      schemaName: "Interpretation",
      schema: z.object({ intent: z.string(), confidence: z.number() }),
      economicContext: { ...economicContext, purpose: "INTERPRETATION" },
    });
    expect(response.providerId).toBe("fakezo");
    expect(response.attempts[0]?.status).toBe("REJECTED_INVALID_OUTPUT");
    expect(localCalls).toHaveLength(2);
  });

  it("honors role swaps and provider locality metadata without provider-name logic", async () => {
    const local = provider({
      providerId: "local-fake",
      modelId: "local",
      locality: "LOCAL",
    });
    const zo = provider({
      providerId: "fakezo",
      modelId: "zo-general",
      locality: "REMOTE",
    });
    const { router, runtime } = graph(
      [local, zo],
      [model("local-fake", "local", "LOCAL"), model("fakezo", "zo-general", "REMOTE")],
    );
    runtime.setRole({
      role: "GENERAL_REASONER",
      providerId: "fakezo",
      modelId: "zo-general",
      enabled: true,
    });
    const response = await router.execute({
      purpose: "CONVERSATION",
      requestedRole: "GENERAL_REASONER",
      input: [{ role: "user", content: [{ type: "text", text: "analyze" }] }],
      allowCloud: true,
      economicContext,
    });
    expect(response.providerId).toBe("fakezo");
  });

  it("blocks direct paid runtime invocation without a durable reservation permit", async () => {
    const captured: AIInferenceRequest[] = [];
    const cloud = provider({
      providerId: "fakezo",
      modelId: "cloud",
      locality: "REMOTE",
      captured,
    });
    const { runtime } = graph([cloud], [model("fakezo", "cloud", "REMOTE")]);
    await expect(
      runtime.generate({
        purpose: "CONVERSATION",
        model: { type: "MODEL", providerId: "fakezo", modelId: "cloud" },
        input: [{ role: "user", content: [{ type: "text", text: "bypass" }] }],
      }),
    ).rejects.toThrow("durable economic reservation");
    expect(captured).toHaveLength(0);
  });
});

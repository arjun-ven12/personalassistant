/* eslint-disable @typescript-eslint/require-await */
import {
  AIProviderHealthSchema,
  type AIInferenceRequest,
  type AIInferenceResponse,
  type AIModelDescriptor,
} from "@alexa-control/shared";
import { describe, expect, it } from "vitest";
import { CognitiveContextService } from "./context/service.js";
import { AIEconomicsService } from "./economics/service.js";
import type { AIProvider } from "./provider.js";
import { AIModelRegistry, AIProviderRegistry } from "./registry.js";
import { AIRouterService } from "./router/service.js";
import { AIRuntimeService } from "./runtime-service.js";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const descriptor = (providerId: string, modelId: string, locality: "LOCAL" | "REMOTE") => ({
  providerId, modelId, displayName: modelId, enabled: true, locality, modality: ["TEXT"],
  contextWindow: 8_192, maxOutputTokens: 512,
  capabilities: { textGeneration: true, structuredOutput: true, reasoning: true, toolCalling: false, vision: false, embeddings: false, streaming: false },
} satisfies AIModelDescriptor);
const provider = (providerId: string, modelId: string, locality: "LOCAL" | "REMOTE"): AIProvider => ({
  providerId, providerType: locality === "LOCAL" ? "LOCAL" : "CLOUD",
  describe: () => ({ providerId, displayName: providerId, providerType: locality === "LOCAL" ? "LOCAL" : "CLOUD", enabled: true, configured: true, capabilities: descriptor(providerId, modelId, locality).capabilities, credentialState: locality === "LOCAL" ? "NOT_REQUIRED" : "CONFIGURED", baseEndpoint: locality === "LOCAL" ? "local" : "remote" }),
  getCapabilities: () => descriptor(providerId, modelId, locality).capabilities,
  healthCheck: async () => AIProviderHealthSchema.parse({ providerId, status: "HEALTHY", latencyMs: 1, lastCheckedAt: new Date().toISOString(), errorCategory: null, version: "test", modelsVisible: 1 }),
  listModels: async () => [descriptor(providerId, modelId, locality)],
  generate: async (request: AIInferenceRequest): Promise<AIInferenceResponse> => ({ requestId: request.requestId ?? crypto.randomUUID(), providerId, modelId, status: "SUCCESS", outputText: "ok", latencyMs: 1, usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 } }),
  generateStructured: async (request) => ({ requestId: request.requestId ?? crypto.randomUUID(), providerId, modelId, status: "SUCCESS" as const, structuredOutput: request.schema.parse({}), latencyMs: 1, usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 } }),
});

const makeCanonicalPath = async () => {
  const providers = new AIProviderRegistry();
  providers.register(provider("ollama", "fake-local", "LOCAL"));
  providers.register(provider("fake-paid", "fake-cloud", "REMOTE"));
  const models = new AIModelRegistry();
  models.register(descriptor("ollama", "fake-local", "LOCAL"));
  models.register(descriptor("fake-paid", "fake-cloud", "REMOTE"));
  const runtime = new AIRuntimeService(providers, models);
  runtime.setRole({ role: "GENERAL_REASONER", providerId: "fake-paid", modelId: "fake-cloud", enabled: true });
  const economics = new AIEconomicsService();
  await economics.initialise();
  await economics.upsertPricing({ id: crypto.randomUUID(), providerId: "fake-paid", modelId: "fake-cloud", currency: "USD", inputPerMillionTokens: "1", outputPerMillionTokens: "1", effectiveFrom: new Date().toISOString(), version: "load-v1", status: "ACTIVE" });
  for (const ownerId of [ownerA, ownerB]) await economics.upsertPolicy({ id: crypto.randomUUID(), ownerId, scope: "GLOBAL", period: "MONTHLY", currency: "USD", limitUsd: "1", warningThresholdPct: 70, hardStopThresholdPct: 100, overflowBehavior: "DENY", enabled: true, effectiveFrom: new Date().toISOString() });
  runtime.requirePaidInferenceAuthorization(async (permit) => Boolean(await economics.verifyActiveReservation(permit.ownerId, permit.reservationId)));
  const context = new CognitiveContextService();
  context.register({ sourceType: "RECENT_ACTIVITY", retrieve: async () => [{ id: "load-context", sourceType: "RECENT_ACTIVITY", trustLevel: "TRUSTED", title: "load context", content: "bounded context", relevanceScore: 1, importanceScore: 1, confidence: 1, estimatedTokens: 4, cacheability: "DYNAMIC", sensitivity: "NORMAL", mandatory: false }] });
  return { economics, router: new AIRouterService(runtime, economics, context) };
};

describe("Phase 20R-E canonical bounded load", () => {
  for (const count of [5, 10, 20]) it(`${count} concurrent Router -> Context -> Economics -> Provider requests preserve owner-scoped accounting`, async () => {
    const { router, economics } = await makeCanonicalPath();
    const results = await Promise.all(Array.from({ length: count }, (_, index) => {
      const ownerId = index % 2 ? ownerA : ownerB;
      return router.execute({ requestId: crypto.randomUUID(), purpose: "CONVERSATION", input: [{ role: "user", content: [{ type: "text", text: `load ${index}` }] }], outputMode: "TEXT", model: { type: "MODEL", providerId: "fake-paid", modelId: "fake-cloud" }, locality: "ALLOW_REMOTE", allowCloud: true, allowFallback: false, taskText: `load ${index}`, economicContext: { ownerId, purpose: "CONVERSATION", autonomyMode: "INTERACTIVE", workflowRunId: "33333333-3333-4333-8333-333333333333", costCenter: "load" } });
    }));
    expect(results.every((result) => result.outcome === "SUCCESS")).toBe(true);
    const [ledgerA, ledgerB] = await Promise.all([economics.listLedger(ownerA), economics.listLedger(ownerB)]);
    expect(ledgerA).toHaveLength(Math.floor(count / 2));
    expect(ledgerB).toHaveLength(Math.ceil(count / 2));
    expect([...ledgerA, ...ledgerB].every((entry) => entry.actualCostUsd === "0.00002")).toBe(true);
    expect((await economics.listReservations(ownerA)).every((item) => item.status === "SETTLED")).toBe(true);
    expect((await economics.listReservations(ownerB)).every((item) => item.status === "SETTLED")).toBe(true);
  });
});

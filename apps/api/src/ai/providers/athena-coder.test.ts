/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AIProviderHealthSchema, isAthenaCoderEligible, type AIInferenceRequest, type AthenaCoderRuntimeMetadata } from "@alexa-control/shared";
import { createAIRuntime } from "../bootstrap.js";
import { AIModelRegistry, AIProviderRegistry } from "../registry.js";
import { AIRuntimeService } from "../runtime-service.js";
import { AIRouterService } from "../router/service.js";
import type { LocalModelRuntime } from "../../local-ai/runtime.js";
import type { AIProvider } from "../provider.js";
import type { AIProviderError } from "../errors.js";
import { LocalAIError } from "../../local-ai/errors.js";
import {
  ATHENA_CODER_MAC_MODEL_ID,
  ATHENA_CODER_OLLAMA_TAG,
  AthenaCoderMacOllamaBackend,
  AthenaCoderProvider,
} from "./athena-coder.js";

const localRuntime = (): LocalModelRuntime => ({
  id: "ollama",
  healthCheck: vi.fn().mockResolvedValue(true),
  listModels: vi.fn().mockResolvedValue([{ name: ATHENA_CODER_OLLAMA_TAG, digest: "a".repeat(64) }]),
  isModelAvailable: vi.fn().mockResolvedValue(true),
  loadModel: vi.fn().mockResolvedValue(undefined),
  unloadModel: vi.fn().mockResolvedValue(undefined),
  generate: vi.fn().mockResolvedValue({ model: ATHENA_CODER_OLLAMA_TAG, text: "ok" }),
  generateStructured: vi.fn().mockResolvedValue({ model: ATHENA_CODER_OLLAMA_TAG, text: JSON.stringify({ summary: "read", operations: [] }) }),
});
const review = {
  artifactDigest: `sha256:${"a".repeat(64)}`,
  measuredP95LatencyMs: 2_000,
  measuredSuccessRate: 0.9,
  measuredMemoryRequirementMb: 7_000,
};

const eligible = {
  source: "TRUSTED_ENGINEERING_POLICY" as const,
  activeModelId: ATHENA_CODER_MAC_MODEL_ID,
  size: "SMALL" as const,
  category: "TESTS" as const,
  risk: "LOW" as const,
  securitySensitive: false,
  authenticationRelated: false,
  tenantIsolationRelated: false,
  approvalRelated: false,
  migrationRelated: false,
  measuredP95LatencyMs: 2_000,
  measuredSuccessRate: 0.9,
  maxAcceptableP95LatencyMs: 5_000,
  minAcceptableSuccessRate: 0.8,
};

const fallback: AIProvider = {
  providerId: "luna",
  providerType: "LOCAL",
  healthCheck: async () => AIProviderHealthSchema.parse({ providerId: "luna", status: "HEALTHY", latencyMs: 1, lastCheckedAt: new Date().toISOString(), errorCategory: null, version: "test", modelsVisible: 1 }),
  listModels: async () => [],
  getCapabilities: () => ({ textGeneration: true, structuredOutput: true, reasoning: true, vision: false, embeddings: false, streaming: false }),
  describe: () => ({ providerId: "luna", displayName: "Luna fixture", providerType: "LOCAL", enabled: true, configured: true, capabilities: { textGeneration: true, structuredOutput: true, reasoning: true, vision: false, embeddings: false, streaming: false }, credentialState: "NOT_REQUIRED" }),
  generate: async (request) => ({ requestId: request.requestId ?? crypto.randomUUID(), providerId: "luna", modelId: "luna-fixture", status: "SUCCESS", outputText: "fallback", latencyMs: 1 }),
  generateStructured: async (request) => ({ requestId: request.requestId ?? crypto.randomUUID(), providerId: "luna", modelId: "luna-fixture", status: "SUCCESS", structuredOutput: request.schema.parse({ summary: "fallback", operations: [] }), latencyMs: 1 }),
};

const request: AIInferenceRequest = {
  purpose: "CODING",
  input: [{ role: "user", content: [{ type: "text", text: "Add a routine test" }] }],
  outputMode: "STRUCTURED",
};
const schema = z.object({ summary: z.string(), operations: z.array(z.unknown()) });

const router = (runtime: LocalModelRuntime, binding?: AthenaCoderRuntimeMetadata["distillation"]) => {
  const providers = new AIProviderRegistry();
  const backend = new AthenaCoderMacOllamaBackend(runtime, review);
  if (binding) backend.metadata.distillation = binding;
  const athena = new AthenaCoderProvider([backend]);
  providers.register(athena);
  providers.register(fallback);
  const models = new AIModelRegistry();
  for (const model of athena.modelDescriptors()) models.register(model);
  models.register({ providerId: "luna", modelId: "luna-fixture", displayName: "Luna fixture", enabled: true, capabilities: { textGeneration: true, structuredOutput: true, reasoning: true, toolCalling: false, vision: false, embeddings: false, streaming: false }, modality: ["TEXT"], locality: "LOCAL" });
  models.setRole({ role: "CODER", providerId: "luna", modelId: "luna-fixture", enabled: true });
  return new AIRouterService(new AIRuntimeService(providers, models));
};

describe("AthenaCoder provider and AIRouter", () => {
  it("stamps the reviewed trained version identity onto canonical attempt telemetry (fixture only)", async () => {
    const binding = { runId: crypto.randomUUID(), ownerId: crypto.randomUUID(), companyId: crypto.randomUUID(), baseDigest: "b".repeat(64), adapterDigest: "d".repeat(64), inferenceDigest: review.artifactDigest };
    const result = await router(localRuntime(), binding).executeStructured({ ...request, schema, schemaName: "proposal", jsonSchema: z.toJSONSchema(schema) }, { athenaCoder: eligible });
    expect(result.attempts[0]?.athenaCoder).toMatchObject({ distillationRunId: binding.runId, artifactDigest: review.artifactDigest });
  });
  it("pins real Ollama bare digests and rejects malformed or different artifacts", async () => {
    const local = localRuntime();
    const backend = new AthenaCoderMacOllamaBackend(local, review);
    for (const digest of ["a".repeat(64), review.artifactDigest]) {
      vi.mocked(local.listModels).mockResolvedValue([{ name: ATHENA_CODER_OLLAMA_TAG, digest }]);
      expect(await backend.healthCheck()).toBe(true);
    }
    for (const digest of ["b".repeat(64), "a".repeat(63), `md5:${"a".repeat(64)}`, "A".repeat(64)]) {
      vi.mocked(local.listModels).mockResolvedValue([{ name: ATHENA_CODER_OLLAMA_TAG, digest }]);
      expect(await backend.healthCheck()).toBe(false);
    }
  });

  it("registers a versioned disabled model until reviewed", () => {
    const runtime = createAIRuntime({ ollamaRuntime: localRuntime(), ollamaEnabled: false, ollamaModel: "gemma3:4b", openAIEnabled: false, openAIModel: "luna", openAIBaseUrl: "https://api.openai.com/v1" });
    expect(runtime.listProviders().find((item) => item.providerId === "athena_coder")?.enabled).toBe(false);
    expect(runtime.listModels().find((item) => item.modelId === ATHENA_CODER_MAC_MODEL_ID)?.enabled).toBe(false);
  });

  it("routes only measured low risk routine work to AthenaCoder", async () => {
    const local = localRuntime();
    const ai = router(local);
    const good = await ai.executeStructured({ ...request, schema, schemaName: "proposal", jsonSchema: z.toJSONSchema(schema) }, { athenaCoder: eligible });
    expect(good.providerId).toBe("athena_coder");
    expect(good.structuredOutput).toEqual({ summary: "read", operations: [] });
    expect(good.attempts[0]?.athenaCoder).toMatchObject({
      placement: "MAC_OLLAMA",
      selectionReason: "MEASURED_ROUTINE_ENGINEERING",
      artifactDigest: review.artifactDigest,
      paidApiCostUsd: 0,
      infrastructureCostUsd: null,
      coldStartMs: null,
      promptIngestionMs: null,
      generationMs: null,
    });
    expect(good.attempts[0]?.athenaCoder?.providerCallMs).toEqual(expect.any(Number));
    const denied = await ai.executeStructured({ ...request, schema, schemaName: "proposal", risk: "HIGH" }, { athenaCoder: eligible });
    expect(denied.providerId).toBe("luna");
    expect(isAthenaCoderEligible({ ...eligible, measuredP95LatencyMs: null })).toBe(false);
    expect(isAthenaCoderEligible({ ...eligible, authenticationRelated: true })).toBe(false);
    for (const excluded of [
      { tenantIsolationRelated: true }, { approvalRelated: true },
      { migrationRelated: true }, { securitySensitive: true },
      { category: "OTHER" as const }, { size: "MEDIUM" as const },
      { risk: "HIGH" as const }, { measuredSuccessRate: null },
      { measuredP95LatencyMs: 10_000 },
    ]) expect(isAthenaCoderEligible({ ...eligible, ...excluded })).toBe(false);
  });

  it("falls back immediately on unavailable runtime and invalid output", async () => {
    const unavailable = localRuntime();
    vi.mocked(unavailable.healthCheck).mockResolvedValue(false);
    const first = await router(unavailable).executeStructured({ ...request, schema, schemaName: "proposal" }, { athenaCoder: eligible });
    expect(first.providerId).toBe("luna");
    expect(first.attempts.every((attempt) => attempt.providerId !== "athena_coder")).toBe(true);
    const malformed = localRuntime();
    vi.mocked(malformed.generateStructured).mockResolvedValue({ model: ATHENA_CODER_OLLAMA_TAG, text: "not-json" });
    const second = await router(malformed).executeStructured({ ...request, schema, schemaName: "proposal", jsonSchema: z.toJSONSchema(schema) }, { athenaCoder: eligible });
    expect(second.providerId).toBe("luna");
    expect(malformed.generateStructured).toHaveBeenCalledOnce();
    expect(second.attempts[0]?.status).toBe("REJECTED_INVALID_OUTPUT");
    expect(second.decision.reason).toContain("validated fallback");
  });

  it("bounds a stalled local inference and falls back", async () => {
    const stalled = localRuntime();
    vi.mocked(stalled.generateStructured).mockImplementation(() => new Promise(() => undefined));
    const result = await router(stalled).executeStructured(
      { ...request, timeoutMs: 100, schema, schemaName: "proposal", jsonSchema: z.toJSONSchema(schema) },
      { athenaCoder: eligible },
    );
    expect(result.providerId).toBe("luna");
    expect(result.attempts[0]?.errorCode).toBe("TIMEOUT");
  });

  it("rejects non-coding requests and never loads a model itself", async () => {
    const local = localRuntime();
    const provider = new AthenaCoderProvider([new AthenaCoderMacOllamaBackend(local, review)]);
    await expect(provider.generate({ ...request, purpose: "OTHER", outputMode: "TEXT", model: { type: "MODEL", providerId: "athena_coder", modelId: ATHENA_CODER_MAC_MODEL_ID } })).rejects.toMatchObject({ code: "CAPABILITY_NOT_SUPPORTED" } satisfies Partial<AIProviderError>);
    expect(local.loadModel).not.toHaveBeenCalled();
  });

  it("keeps an unreviewed or mismatched model digest disabled", async () => {
    const local = localRuntime();
    const disabled = new AthenaCoderProvider([new AthenaCoderMacOllamaBackend(local)]);
    expect(disabled.describe().enabled).toBe(false);
    expect((await disabled.healthCheck()).status).toBe("UNCONFIGURED");
    const wrong = new AthenaCoderProvider([new AthenaCoderMacOllamaBackend(local, { ...review, artifactDigest: `sha256:${"b".repeat(64)}` })]);
    expect((await wrong.healthCheck()).status).toBe("UNAVAILABLE");
    await expect(wrong.generate({ ...request, outputMode: "TEXT", model: { type: "MODEL", providerId: "athena_coder", modelId: ATHENA_CODER_MAC_MODEL_ID } })).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("cancels and enforces one in-flight call without queuing", async () => {
    const local = localRuntime();
    let release: ((value: { model: string; text: string }) => void) | undefined;
    vi.mocked(local.generate).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const provider = new AthenaCoderProvider([new AthenaCoderMacOllamaBackend(local, review)]);
    const input = { ...request, outputMode: "TEXT" as const, model: { type: "MODEL" as const, providerId: "athena_coder", modelId: ATHENA_CODER_MAC_MODEL_ID } };
    const controller = new AbortController();
    const first = provider.generate(input, { signal: controller.signal });
    await vi.waitFor(() => expect(local.generate).toHaveBeenCalledOnce());
    await expect(provider.generate(input)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    controller.abort();
    await expect(first).rejects.toMatchObject({ code: "CANCELLED" });
    release?.({ model: ATHENA_CODER_OLLAMA_TAG, text: "too late" });
  });

  it("falls back on simulated model memory failure and recovers after circuit expiry", async () => {
    const local = localRuntime();
    vi.mocked(local.generateStructured).mockRejectedValue(new LocalAIError("RUNTIME_REQUEST_FAILED", "out of memory", true));
    const ai = router(local);
    const first = await ai.executeStructured({ ...request, schema, schemaName: "proposal", jsonSchema: z.toJSONSchema(schema) }, { athenaCoder: eligible });
    expect(first.providerId).toBe("luna");
    expect(first.attempts[0]?.errorCode).toBe("PROVIDER_UNAVAILABLE");

    const direct = new AthenaCoderProvider([new AthenaCoderMacOllamaBackend(local, review)]);
    const input = { ...request, outputMode: "TEXT" as const, model: { type: "MODEL" as const, providerId: "athena_coder", modelId: ATHENA_CODER_MAC_MODEL_ID } };
    vi.mocked(local.generate).mockRejectedValueOnce(new LocalAIError("RUNTIME_REQUEST_FAILED", "out of memory", true)).mockRejectedValueOnce(new LocalAIError("RUNTIME_REQUEST_FAILED", "out of memory", true));
    await expect(direct.generate(input)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    await expect(direct.generate(input)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    vi.mocked(local.generate).mockResolvedValue({ model: ATHENA_CODER_OLLAMA_TAG, text: "recovered" });
    await expect(direct.generate(input)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    const now = Date.now();
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(now + 31_000);
    try { expect((await direct.generate(input)).outputText).toBe("recovered"); }
    finally { dateSpy.mockRestore(); }
  });
});

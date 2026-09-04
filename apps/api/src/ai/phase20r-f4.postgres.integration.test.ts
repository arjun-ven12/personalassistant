/* eslint-disable @typescript-eslint/require-await */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AIProviderHealthSchema,
  type AIEconomicContext,
  type AIInferenceRequest,
  type AIInferenceResponse,
  type AIModelDescriptor,
  type AIProviderHealth,
} from "@alexa-control/shared";
import { z } from "zod";
import { buildApi } from "../app.js";
import { PostgresDatabase } from "../persistence/database.js";
import {
  provisionTestDefaultCompany,
  safeTestDatabaseUrl,
} from "../persistence/test-database.js";
import { CognitiveContextService } from "./context/service.js";
import { AIEconomicsService } from "./economics/service.js";
import { PostgresAIEconomicsStore } from "./economics/postgres-store.js";
import { digestEconomicOverride } from "./economics/override-digest.js";
import { AIProviderError } from "./errors.js";
import type { AIProvider, AIProviderExecutionOptions } from "./provider.js";
import { AIModelRegistry, AIProviderRegistry } from "./registry.js";
import { AIRouterService } from "./router/service.js";
import { AIRuntimeService } from "./runtime-service.js";
import { AIBenchmarkRunner } from "./benchmark/service.js";
import { PostgresAIBenchmarkStore } from "./benchmark/postgres-store.js";

const connectionString = safeTestDatabaseUrl();
const ownerA = crypto.randomUUID();
const ownerB = crypto.randomUUID();
const agentA = "11111111-aaaa-4aaa-8aaa-111111111111";
const workflowA = "22222222-aaaa-4aaa-8aaa-222222222222";
const runA = "33333333-aaaa-4aaa-8aaa-333333333333";
const cloudProviderId = "fake-paid";
const cloudModelId = "fake-cloud";
const localProviderId = "fake-local";
const localModelId = "fake-local-model";

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("cancelled", "AbortError"));
    };
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
  });

const descriptor = (
  providerId: string,
  modelId: string,
  locality: "LOCAL" | "REMOTE",
): AIModelDescriptor => ({
  providerId,
  modelId,
  displayName: modelId,
  enabled: true,
  locality,
  modality: ["TEXT"],
  contextWindow: 8_192,
  maxOutputTokens: 512,
  capabilities: {
    textGeneration: true,
    structuredOutput: true,
    reasoning: true,
    toolCalling: false,
    vision: false,
    embeddings: false,
    streaming: false,
  },
});

class ControllableProvider implements AIProvider {
  readonly providerType: "LOCAL" | "CLOUD";
  calls = 0;
  aborts = 0;
  failuresBeforeSuccess = 0;
  status: AIProviderHealth["status"] = "HEALTHY";
  delayMs = 0;
  partialOnAbort = false;
  constructor(
    readonly providerId: string,
    readonly modelId: string,
    readonly locality: "LOCAL" | "REMOTE",
  ) {
    this.providerType = locality === "LOCAL" ? "LOCAL" : "CLOUD";
  }
  describe() {
    return {
      providerId: this.providerId,
      displayName: this.providerId,
      providerType: this.providerType,
      enabled: true,
      configured: true,
      capabilities: descriptor(this.providerId, this.modelId, this.locality)
        .capabilities,
      credentialState:
        this.locality === "LOCAL" ? ("NOT_REQUIRED" as const) : ("CONFIGURED" as const),
      trustClassification:
        this.locality === "LOCAL"
          ? ("TRUSTED_LOCAL" as const)
          : ("APPROVED_CLOUD" as const),
      baseEndpoint:
        this.locality === "LOCAL" ? ("local" as const) : ("remote" as const),
    };
  }
  getCapabilities() {
    return this.describe().capabilities;
  }
  async healthCheck() {
    return AIProviderHealthSchema.parse({
      providerId: this.providerId,
      status: this.status,
      latencyMs: 1,
      lastCheckedAt: new Date().toISOString(),
      errorCategory: this.status === "HEALTHY" ? null : "PROVIDER_UNAVAILABLE",
      version: "f4",
      modelsVisible: this.status === "UNAVAILABLE" ? 0 : 1,
    });
  }
  async listModels() {
    return [descriptor(this.providerId, this.modelId, this.locality)];
  }
  async generate(
    request: AIInferenceRequest,
    options: AIProviderExecutionOptions = {},
  ): Promise<AIInferenceResponse> {
    this.calls += 1;
    if (this.failuresBeforeSuccess > 0) {
      this.failuresBeforeSuccess -= 1;
      throw new AIProviderError(
        "TIMEOUT",
        "controlled provider timeout",
        this.providerId,
        true,
      );
    }
    try {
      if (this.delayMs) await sleep(this.delayMs, options.signal);
    } catch (error) {
      this.aborts += 1;
      if (this.partialOnAbort) {
        const cancelled = new AIProviderError(
          "CANCELLED",
          "provider cancelled after partial billable usage",
          this.providerId,
          false,
          {
            inputTokens: 20,
            outputTokens: 5,
            totalTokens: 25,
            source: "PROVIDER_REPORTED",
          },
        );
        cancelled.name = "AbortError";
        throw cancelled;
      }
      throw error;
    }
    return {
      requestId: request.requestId ?? crypto.randomUUID(),
      providerId: this.providerId,
      modelId: this.modelId,
      status: "SUCCESS",
      outputText: "ok",
      latencyMs: Math.max(1, this.delayMs),
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    };
  }
  async generateStructured<T>(
    request: AIInferenceRequest & { schema: z.ZodType<T> },
    options: AIProviderExecutionOptions = {},
  ) {
    const result = await this.generate(request, options);
    const serialized = JSON.stringify(request);
    const requiresClarification = serialized.includes("clarify");
    return {
      ...result,
      structuredOutput: request.schema.parse({
        intent: "LaunchApplication",
        entities: {},
        confidence: requiresClarification ? 0.3 : 0.95,
        requiresClarification,
      }),
    };
  }
}

const request = (
  ownerId: string,
  text: string,
  overrides: Record<string, unknown> = {},
) => ({
  requestId: crypto.randomUUID(),
  purpose: "CONVERSATION" as const,
  input: [{ role: "user" as const, content: [{ type: "text" as const, text }] }],
  outputMode: "TEXT" as const,
  model: { type: "MODEL" as const, providerId: cloudProviderId, modelId: cloudModelId },
  locality: "ALLOW_REMOTE" as const,
  allowCloud: true,
  allowFallback: false,
  taskText: text,
  economicContext: {
    ownerId,
    purpose: "CONVERSATION" as const,
    autonomyMode: "INTERACTIVE" as const,
    agentId: agentA,
    workflowId: workflowA,
    workflowRunId: runA,
    costCenter: "phase20r-f4",
  },
  ...overrides,
});

describe.skipIf(!connectionString)("Phase 20R-F4 closure gates", () => {
  let administration: PostgresDatabase;
  let database: PostgresDatabase;
  let schema: string;

  beforeAll(async () => {
    administration = new PostgresDatabase(connectionString!, {
      connectionTimeoutMillis: 60_000,
    });
    schema = `phase20rf4_${crypto.randomUUID().replaceAll("-", "")}`;
    await administration.pool.query(`CREATE SCHEMA "${schema}"`);
    const isolated = new URL(connectionString!);
    isolated.hostname = isolated.hostname.replace("-pooler.", ".");
    if (isolated.searchParams.get("sslmode") !== "disable")
      isolated.searchParams.set("sslmode", "verify-full");
    isolated.searchParams.set("options", `-c search_path=${schema}`);
    database = new PostgresDatabase(isolated.toString(), {
      connectionTimeoutMillis: 60_000,
    });
    await database.migrate();
    await database.pool.query(
      `INSERT INTO owners(id,email,password_hash,record,created_at,updated_at)
       VALUES($1,$2,'test-only',$3,NOW(),NOW()),($4,$5,'test-only',$6,NOW(),NOW())
       ON CONFLICT(id) DO NOTHING`,
      [
        ownerA,
        `f4-${ownerA}@example.test`,
        { id: ownerA },
        ownerB,
        `f4-${ownerB}@example.test`,
        { id: ownerB },
      ],
    );
    for (const id of [ownerA, ownerB])
      await provisionTestDefaultCompany(database.pool, id);
  }, 60_000);

  afterAll(async () => {
    await database?.close();
    if (administration && schema) {
      await administration.pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      await administration.close();
    }
  }, 90_000);

  const makePath = async (limitUsd = "10") => {
    const store = new PostgresAIEconomicsStore(database.pool);
    const economics = new AIEconomicsService(store);
    await economics.initialise();
    await database.pool.query(
      `UPDATE ai_budget_policies SET enabled=FALSE WHERE owner_id=ANY($1::uuid[])`,
      [[ownerA, ownerB]],
    );
    await database.pool.query(
      `UPDATE ai_budget_reservations SET status='RELEASED', settled_amount_usd=0
       WHERE owner_id=ANY($1::uuid[]) AND status='ACTIVE'`,
      [[ownerA, ownerB]],
    );
    await economics.upsertPricing({
      id: crypto.randomUUID(),
      providerId: cloudProviderId,
      modelId: cloudModelId,
      currency: "USD",
      inputPerMillionTokens: "1",
      outputPerMillionTokens: "1",
      effectiveFrom: new Date().toISOString(),
      version: crypto.randomUUID(),
      status: "ACTIVE",
    });
    for (const ownerId of [ownerA, ownerB])
      await economics.upsertPolicy({
        id: crypto.randomUUID(),
        ownerId,
        scope: "GLOBAL",
        period: "MONTHLY",
        currency: "USD",
        limitUsd,
        warningThresholdPct: 70,
        hardStopThresholdPct: 100,
        overflowBehavior: "REQUIRE_APPROVAL",
        enabled: true,
        effectiveFrom: new Date().toISOString(),
      });
    const cloud = new ControllableProvider(cloudProviderId, cloudModelId, "REMOTE");
    const local = new ControllableProvider(localProviderId, localModelId, "LOCAL");
    const providers = new AIProviderRegistry();
    providers.register(cloud);
    providers.register(local);
    const models = new AIModelRegistry();
    models.register(descriptor(cloudProviderId, cloudModelId, "REMOTE"));
    models.register(descriptor(localProviderId, localModelId, "LOCAL"));
    const runtime = new AIRuntimeService(providers, models);
    runtime.requirePaidInferenceAuthorization(async (permit) =>
      Boolean(
        await economics.verifyActiveReservation(permit.ownerId, permit.reservationId),
      ),
    );
    const context = new CognitiveContextService();
    for (const sourceType of ["RECENT_ACTIVITY", "WORKFLOW", "AGENT"] as const)
      context.register({
        sourceType,
        retrieve: async (contextRequest, runtimeContext) => {
          const taskText = contextRequest.taskText ?? "";
          if (sourceType === "RECENT_ACTIVITY" && taskText.includes("before-provider"))
            await sleep(10_000, runtimeContext.signal);
          return [
            {
              id: `${sourceType.toLowerCase()}-${contextRequest.ownerId}`,
              sourceType,
              trustLevel: "TRUSTED",
              title: `Phase 20R-F4 ${sourceType} ${taskText}`,
              content: `bounded ${sourceType} context for ${contextRequest.ownerId}: ${taskText}`,
              relevanceScore: 1,
              importanceScore: 1,
              confidence: 1,
              estimatedTokens: 4,
              cacheability: "DYNAMIC",
              sensitivity: "NORMAL",
              mandatory: true,
            },
          ];
        },
      });
    const router = new AIRouterService(runtime, economics, context);
    return { economics, router, cloud, local, runtime, context };
  };

  it("reconciles graceful app shutdown through draining, cancellation, provider aborts, and durable accounting", async () => {
    const { economics, router, cloud } = await makePath();
    cloud.delayMs = 10_000;
    const app = await buildApi({
      corsOrigin: "http://localhost",
      privateNetworkRequired: false,
      logger: false,
      aiRouter: router,
      aiEconomics: economics,
    });
    const beforeProvider = router.execute(request(ownerA, "before-provider"));
    const duringProvider = router.execute(request(ownerA, "during-provider"));
    const partialUsage = router.execute(request(ownerB, "partial-usage"));
    for (
      let attempt = 0;
      attempt < 6_000 &&
      router.activeRequests.list().filter((item) => item.reservationId).length < 2;
      attempt += 1
    )
      await sleep(10);
    expect(
      router.activeRequests.list().filter((item) => item.reservationId).length,
    ).toBeGreaterThanOrEqual(2);
    const reservationsBefore = [
      ...(await economics.listReservations(ownerA)),
      ...(await economics.listReservations(ownerB)),
    ];
    cloud.partialOnAbort = true;
    await app.close();
    expect(router.activeRequests.isDraining()).toBe(true);
    expect((await router.execute(request(ownerA, "new-after-drain"))).outcome).toBe(
      "ROUTING_FAILED",
    );
    const results = await Promise.all([beforeProvider, duringProvider, partialUsage]);
    expect(results.map((item) => item.outcome)).toEqual([
      "CANCELLED",
      "CANCELLED",
      "CANCELLED",
    ]);
    const reservationsAfter = [
      ...(await economics.listReservations(ownerA)),
      ...(await economics.listReservations(ownerB)),
    ];
    const ledger = [
      ...(await economics.listLedger(ownerA)),
      ...(await economics.listLedger(ownerB)),
    ];
    const duplicateSettlements = await database.pool.query(
      `SELECT request_id, attempt_id, COUNT(*)::int AS count
       FROM ai_usage_ledger GROUP BY request_id, attempt_id HAVING COUNT(*) > 1`,
    );
    expect(
      reservationsBefore.filter((item) => item.status === "ACTIVE").length,
    ).toBeGreaterThanOrEqual(2);
    expect(reservationsAfter.filter((item) => item.status === "ACTIVE")).toHaveLength(
      0,
    );
    expect(
      ledger.filter((item) => item.status === "CANCELLED").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      ledger.some((item) => item.status === "CANCELLED" && item.actualCostUsd !== "0"),
    ).toBe(true);
    expect(cloud.aborts).toBeGreaterThanOrEqual(2);
    expect(duplicateSettlements.rows).toHaveLength(0);
    expect(router.activeRequests.list()).toHaveLength(0);
  }, 120_000);

  it("reconciles abrupt restart reservations, preserves valid TTL state, and rejects late duplicate settlement", async () => {
    const { economics } = await makePath();
    const expiredContext = request(ownerA, "expired")
      .economicContext as AIEconomicContext;
    const validContext = request(ownerA, "valid").economicContext as AIEconomicContext;
    const candidate = {
      providerId: cloudProviderId,
      modelId: cloudModelId,
      locality: "REMOTE" as const,
      estimatedInputTokens: 10,
      maxOutputTokens: 10,
    };
    const expired = await economics.reserve(
      candidate,
      expiredContext,
      crypto.randomUUID(),
      { routeId: crypto.randomUUID(), attemptId: crypto.randomUUID() },
    );
    const valid = await economics.reserve(
      candidate,
      validContext,
      crypto.randomUUID(),
      { routeId: crypto.randomUUID(), attemptId: crypto.randomUUID() },
    );
    await database.pool.query(
      `UPDATE ai_budget_reservations SET expires_at=NOW() - INTERVAL '1 second' WHERE id=$1`,
      [expired.id],
    );
    const restarted = new AIEconomicsService(
      new PostgresAIEconomicsStore(database.pool),
    );
    await restarted.initialise();
    expect(
      (await restarted.listReservations(ownerA)).find((item) => item.id === expired.id)
        ?.status,
    ).toBe("EXPIRED");
    expect(
      (await restarted.listReservations(ownerA)).find((item) => item.id === valid.id)
        ?.status,
    ).toBe("ACTIVE");
    const correlation = { routeId: valid.routeId!, attemptId: valid.attemptId! };
    const first = await restarted.settle(
      valid.id,
      validContext,
      candidate,
      {
        inputTokens: 10,
        outputTokens: 10,
        totalTokens: 20,
        source: "PROVIDER_REPORTED",
      },
      "SETTLED",
      undefined,
      correlation,
      valid.requestId,
    );
    const late = await restarted.settle(
      valid.id,
      validContext,
      candidate,
      {
        inputTokens: 10,
        outputTokens: 50,
        totalTokens: 60,
        source: "PROVIDER_REPORTED",
      },
      "SETTLED",
      undefined,
      correlation,
      valid.requestId,
    );
    expect(late.id).toBe(first.id);
    const descriptorValue = {
      ownerId: ownerA,
      requestId: crypto.randomUUID(),
      purpose: "CONVERSATION" as const,
      requestedAdditionalSpendUsd: "0.001",
      maxAdditionalSpendUsd: "0.001",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      agentId: agentA,
      workflowId: workflowA,
      workflowRunId: runA,
      costCenter: "phase20r-f4",
      providerId: cloudProviderId,
      modelId: cloudModelId,
    };
    const grant = await new PostgresAIEconomicsStore(database.pool).createOverrideGrant(
      {
        descriptor: descriptorValue,
        grant: {
          id: crypto.randomUUID(),
          ownerId: ownerA,
          approvalId: crypto.randomUUID(),
          requestId: descriptorValue.requestId,
          digest: digestEconomicOverride(descriptorValue),
          maxAdditionalSpendUsd: "0.001",
          expiresAt: descriptorValue.expiresAt,
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
        },
      },
    );
    const overrideReservation = await restarted.reserve(
      candidate,
      expiredContext,
      descriptorValue.requestId,
      { routeId: crypto.randomUUID(), attemptId: crypto.randomUUID() },
      { grantId: grant.id },
    );
    const afterOverrideRestart = new AIEconomicsService(
      new PostgresAIEconomicsStore(database.pool),
    );
    await afterOverrideRestart.initialise();
    await expect(
      afterOverrideRestart.reserve(
        candidate,
        expiredContext,
        descriptorValue.requestId,
        { routeId: crypto.randomUUID(), attemptId: crypto.randomUUID() },
        { grantId: grant.id },
      ),
    ).rejects.toThrow();
    expect(
      (await afterOverrideRestart.listReservations(ownerA)).filter(
        (item) => item.requestId === overrideReservation.requestId,
      ),
    ).toHaveLength(1);
  }, 90_000);

  it("fails paid inference closed during a controlled PostgreSQL connection fault and recovers without reseeding", async () => {
    const { economics, router, cloud } = await makePath();
    const beforeLedger = await economics.listLedger(ownerA);
    const databaseFault = vi
      .spyOn(database.pool, "query")
      .mockRejectedValueOnce(new Error("controlled PostgreSQL connection fault"));
    const denied = await router.execute(request(ownerA, "db outage"));
    databaseFault.mockRestore();
    expect(denied.outcome).toBe("ROUTING_FAILED");
    expect(cloud.calls).toBe(0);
    expect((await economics.health(ownerA)).status).toBe("READY");
    const recovered = await router.execute(request(ownerA, "db recovered"));
    expect(recovered.outcome).toBe("SUCCESS");
    expect((await economics.listLedger(ownerA)).length).toBe(beforeLedger.length + 1);
  });

  it("recovers provider eligibility after bounded failures and keeps cancellation terminal during outage", async () => {
    const { router, cloud } = await makePath();
    cloud.status = "DEGRADED";
    cloud.failuresBeforeSuccess = 2;
    await router.execute(
      request(ownerA, "provider failure 1", { allowFallback: true }),
    );
    await router.execute(
      request(ownerA, "provider failure 2", { allowFallback: true }),
    );
    const circuitOpen = await router.execute(request(ownerA, "circuit open"));
    expect(circuitOpen.outcome).toBe("CAPABILITY_UNAVAILABLE");
    cloud.failuresBeforeSuccess = 0;
    cloud.status = "HEALTHY";
    expect((await router.execute(request(ownerA, "provider recovered"))).outcome).toBe(
      "SUCCESS",
    );
    cloud.delayMs = 10_000;
    const pending = router.execute(
      request(ownerA, "cancel during failure", { allowFallback: true }),
    );
    await sleep(20);
    router.cancel(ownerA, router.activeRequests.list(ownerA)[0]?.requestId ?? "");
    expect((await pending).outcome).toBe("CANCELLED");
  }, 60_000);

  it("lets emergency stop beat approved economic overrides without consuming the grant", async () => {
    const { router, cloud } = await makePath("0");
    router.setEmergencyStopCheck(async () => true);
    const store = new PostgresAIEconomicsStore(database.pool);
    const descriptorValue = {
      ownerId: ownerA,
      requestId: crypto.randomUUID(),
      purpose: "CONVERSATION" as const,
      requestedAdditionalSpendUsd: "0.01",
      maxAdditionalSpendUsd: "0.01",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      agentId: agentA,
      workflowId: workflowA,
      workflowRunId: runA,
      costCenter: "phase20r-f4",
      providerId: cloudProviderId,
      modelId: cloudModelId,
    };
    const grant = await store.createOverrideGrant({
      descriptor: descriptorValue,
      grant: {
        id: crypto.randomUUID(),
        ownerId: ownerA,
        approvalId: crypto.randomUUID(),
        requestId: descriptorValue.requestId,
        digest: digestEconomicOverride(descriptorValue),
        maxAdditionalSpendUsd: "0.01",
        expiresAt: descriptorValue.expiresAt,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
      },
    });
    const result = await router.execute(
      request(ownerA, "override blocked by emergency", {
        requestId: descriptorValue.requestId,
        economicOverrideGrantId: grant.id,
      }),
    );
    expect(result.outcome).toBe("ROUTING_FAILED");
    expect(cloud.calls).toBe(0);
    expect((await store.getOverrideGrant(ownerA, grant.id))?.grant.status).toBe(
      "ACTIVE",
    );
  });

  for (const count of [5, 10, 20]) {
    it(`passes PostgreSQL-backed mixed canonical ${count} request load tier`, async () => {
      const { economics, router } = await makePath("10");
      const started = performance.now();
      const results = await Promise.all(
        Array.from({ length: count }, (_, index) => {
          const ownerId = index % 2 ? ownerA : ownerB;
          if (index === 1)
            return router.execute(
              request(ownerId, `local zero ${index}`, {
                model: {
                  type: "MODEL",
                  providerId: localProviderId,
                  modelId: localModelId,
                },
                locality: "LOCAL_ONLY",
                allowCloud: false,
              }),
            );
          if (index === 2)
            return router.executeStructured({
              ...request(ownerId, `clarify ${index}`),
              outputMode: "STRUCTURED",
              schemaName: "Intent",
              schema: z.object({
                intent: z.string(),
                entities: z.record(z.string(), z.unknown()),
                confidence: z.number(),
                requiresClarification: z.boolean(),
              }),
            });
          if (index === 3)
            return router.execute(
              request(ownerId, `budget denied ${index}`, {
                economicContext: {
                  ...(request(ownerId, "x").economicContext as AIEconomicContext),
                  costCenter: `denied-${crypto.randomUUID()}`,
                },
              }),
            );
          return router.execute(
            request(ownerId, `paid ${index}`, {
              agentId: agentA,
              workflowId: workflowA,
              workflowRunId: crypto.randomUUID(),
            }),
          );
        }),
      );
      const latencies = results.map((item) => item.latencyMs).sort((a, b) => a - b);
      const reservations = [
        ...(await economics.listReservations(ownerA)),
        ...(await economics.listReservations(ownerB)),
      ];
      const ledgerA = await economics.listLedger(ownerA);
      const ledgerB = await economics.listLedger(ownerB);
      const duplicateSettlements = await database.pool.query(
        `SELECT request_id, attempt_id FROM ai_usage_ledger GROUP BY request_id, attempt_id HAVING COUNT(*) > 1`,
      );
      expect(
        results.filter((item) => item.outcome === "SUCCESS").length,
      ).toBeGreaterThan(0);
      expect(results.some((item) => item.outcome === "CLARIFICATION_REQUIRED")).toBe(
        true,
      );
      expect(reservations.filter((item) => item.status === "ACTIVE")).toHaveLength(0);
      expect(duplicateSettlements.rows).toHaveLength(0);
      expect(ledgerA.every((item) => item.ownerId === ownerA)).toBe(true);
      expect(ledgerB.every((item) => item.ownerId === ownerB)).toBe(true);
      expect(performance.now() - started).toBeGreaterThanOrEqual(0);
      expect(latencies[Math.floor(latencies.length * 0.5)]).toBeGreaterThanOrEqual(0);
      expect(
        latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)],
      ).toBeGreaterThanOrEqual(0);
    }, 120_000);
  }

  it("bounds a DB-backed runaway autonomous agent with workflow-run call caps", async () => {
    const { economics, router, cloud } = await makePath("10");
    const runawayRunId = crypto.randomUUID();
    await economics.upsertPolicy({
      id: crypto.randomUUID(),
      ownerId: ownerA,
      scope: "WORKFLOW",
      scopeId: runawayRunId,
      period: "PER_RUN",
      currency: "USD",
      limitUsd: "10",
      warningThresholdPct: 70,
      hardStopThresholdPct: 100,
      overflowBehavior: "DENY",
      enabled: true,
      maxCloudCallsPerRun: 3,
      effectiveFrom: new Date().toISOString(),
    });
    const results = [];
    for (let index = 0; index < 10; index += 1)
      results.push(
        await router.execute(
          request(ownerA, `runaway ${index}`, {
            economicContext: {
              ownerId: ownerA,
              purpose: "CONVERSATION",
              autonomyMode: "AUTONOMOUS",
              agentId: agentA,
              workflowId: workflowA,
              workflowRunId: runawayRunId,
              costCenter: "runaway",
            },
          }),
        ),
      );
    expect(results.filter((item) => item.outcome === "SUCCESS")).toHaveLength(3);
    expect(cloud.calls).toBe(3);
    expect(
      (await economics.listLedger(ownerA)).filter(
        (item) => item.workflowRunId === runawayRunId && item.agentId === agentA,
      ),
    ).toHaveLength(3);
  }, 90_000);

  it("persists benchmark runs, results, metrics, profiles, baselines, and owner isolation across runner reconstruction", async () => {
    const runner = new AIBenchmarkRunner(
      (item) => ({
        output: {
          intent: item.input.includes("hi")
            ? "Behaviour.greeting_response"
            : "LaunchApplication",
        },
        providerId: "ollama",
        modelId: "gemma3:4b",
        locality: "LOCAL",
        latencyMs: 1,
        nonExecution: item.input.includes("do not"),
      }),
      new PostgresAIBenchmarkStore(database.pool),
    );
    const run = await runner.runSuite(ownerA, "alexa-core-deterministic", "FAST", {
      maxCases: 2,
      baseline: true,
    });
    const restarted = new AIBenchmarkRunner(
      () => ({ errorCode: "not-used" }),
      new PostgresAIBenchmarkStore(database.pool),
    );
    const recovered = await restarted.getRun(ownerA, run.id);
    expect(recovered?.id).toBe(run.id);
    expect(recovered?.results).toHaveLength(2);
    expect(recovered?.metrics.length).toBeGreaterThan(0);
    expect(await restarted.getRun(ownerB, run.id)).toBeUndefined();
    expect((await restarted.listProfiles(ownerA))[0]).toMatchObject({
      providerId: "ollama",
      modelId: "gemma3:4b",
    });
  });

  it("keeps owner-scoped economics, context traces, active requests, and cancellation isolated", async () => {
    const { economics, router, cloud, context } = await makePath();
    cloud.delayMs = 10_000;
    const pending = router.execute(request(ownerA, "owner active"));
    await sleep(20);
    const activeA = router.activeRequests.list(ownerA)[0]!;
    expect(router.activeRequests.list(ownerB)).toHaveLength(0);
    expect(router.cancel(ownerB, activeA.requestId)).toBe(false);
    expect(router.cancel(ownerA, activeA.requestId)).toBe(true);
    expect((await pending).outcome).toBe("CANCELLED");
    await router.execute(request(ownerB, "owner b context"));
    const traceB = context.listTraceMetadata(ownerB)[0]!;
    expect(context.getTrace(ownerA, traceB.contextId)).toBeUndefined();
    expect(
      (await economics.listLedger(ownerA)).every((item) => item.ownerId === ownerA),
    ).toBe(true);
    expect(
      (await economics.listReservations(ownerB)).every(
        (item) => item.ownerId === ownerB,
      ),
    ).toBe(true);
  }, 180_000);
});

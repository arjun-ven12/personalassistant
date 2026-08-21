import { describe, expect, it } from "vitest";
import { AIEconomicsService, AICostCalculator } from "./service.js";
import { InMemoryAIEconomicsStore } from "./store.js";
import { digestEconomicOverride } from "./override-digest.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const context = {
  ownerId,
  purpose: "REASONING" as const,
  autonomyMode: "AUTONOMOUS" as const,
  priority: "NORMAL" as const,
};
const cloud = {
  providerId: "fake",
  modelId: "model",
  locality: "REMOTE" as const,
  estimatedInputTokens: 1_000_000,
  maxOutputTokens: 0,
};

describe("AI economic governance", () => {
  it("consumes a digest-bound override exactly once and rejects binding mutations", async () => {
    const store = new InMemoryAIEconomicsStore();
    const requestId = "55555555-5555-4555-8555-555555555555";
    const descriptor = {
      ownerId, requestId, purpose: "REASONING" as const,
      requestedAdditionalSpendUsd: "0.5", maxAdditionalSpendUsd: "0.5",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      providerId: cloud.providerId, modelId: cloud.modelId,
    };
    store.upsertPolicy({
      id: crypto.randomUUID(), ownerId, scope: "GLOBAL", period: "MONTHLY", currency: "USD",
      limitUsd: "0", warningThresholdPct: 70, hardStopThresholdPct: 100,
      overflowBehavior: "REQUIRE_APPROVAL", enabled: true, effectiveFrom: new Date().toISOString(),
    });
    const grant = {
      id: crypto.randomUUID(), ownerId, approvalId: crypto.randomUUID(), requestId,
      digest: digestEconomicOverride(descriptor), maxAdditionalSpendUsd: "0.5",
      expiresAt: descriptor.expiresAt, status: "ACTIVE" as const, createdAt: new Date().toISOString(),
    };
    await store.createOverrideGrant({ grant, descriptor });
    const reservation = {
      id: crypto.randomUUID(), ownerId, requestId, routeId: crypto.randomUUID(),
      attemptId: crypto.randomUUID(), providerId: cloud.providerId, modelId: cloud.modelId,
      amountUsd: "0.5", status: "ACTIVE" as const, createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(), context,
    };
    await expect(store.consumeOverrideGrantWithReservation({
      ownerId, grantId: grant.id, descriptor: { ...descriptor, requestId: crypto.randomUUID() },
      reservation, context, candidate: { providerId: cloud.providerId, modelId: cloud.modelId, locality: "REMOTE" },
    })).rejects.toThrow();
    await store.consumeOverrideGrantWithReservation({
      ownerId, grantId: grant.id, descriptor,
      reservation, context, candidate: { providerId: cloud.providerId, modelId: cloud.modelId, locality: "REMOTE" },
    });
    await expect(store.consumeOverrideGrantWithReservation({
      ownerId, grantId: grant.id, descriptor, reservation: { ...reservation, id: crypto.randomUUID(), attemptId: crypto.randomUUID() },
      context, candidate: { providerId: cloud.providerId, modelId: cloud.modelId, locality: "REMOTE" },
    })).rejects.toThrow();
    expect((await store.getOverrideGrant(ownerId, grant.id))?.grant.status).toBe("CONSUMED");
    expect(store.listReservations(ownerId)).toHaveLength(1);
  });

  it("serializes concurrent single-use consumption and rolls back when reservation validation fails", async () => {
    const store = new InMemoryAIEconomicsStore();
    const descriptor = {
      ownerId, requestId: crypto.randomUUID(), purpose: "REASONING" as const,
      requestedAdditionalSpendUsd: "0.5", maxAdditionalSpendUsd: "0.5",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const grant = { id: crypto.randomUUID(), ownerId, approvalId: crypto.randomUUID(), requestId: descriptor.requestId,
      digest: digestEconomicOverride(descriptor), maxAdditionalSpendUsd: "0.5", expiresAt: descriptor.expiresAt,
      status: "ACTIVE" as const, createdAt: new Date().toISOString() };
    await store.createOverrideGrant({ grant, descriptor });
    const reservationInput = (amountUsd: string) => ({ ownerId, grantId: grant.id, descriptor,
      reservation: { id: crypto.randomUUID(), ownerId, requestId: descriptor.requestId, routeId: crypto.randomUUID(), attemptId: crypto.randomUUID(),
        providerId: cloud.providerId, modelId: cloud.modelId, amountUsd, status: "ACTIVE" as const,
        createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), context },
      context, candidate: { providerId: cloud.providerId, modelId: cloud.modelId, locality: "REMOTE" as const } });
    await expect(store.consumeOverrideGrantWithReservation(reservationInput("0.6"))).rejects.toThrow();
    expect((await store.getOverrideGrant(ownerId, grant.id))?.grant.status).toBe("ACTIVE");
    store.upsertPolicy({ id: crypto.randomUUID(), ownerId, scope: "GLOBAL", period: "MONTHLY", currency: "USD", limitUsd: "0", warningThresholdPct: 70, hardStopThresholdPct: 100, overflowBehavior: "REQUIRE_APPROVAL", enabled: true, effectiveFrom: new Date().toISOString() });
    const results = await Promise.allSettled([store.consumeOverrideGrantWithReservation(reservationInput("0.5")), store.consumeOverrideGrantWithReservation(reservationInput("0.5"))]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(store.listReservations(ownerId)).toHaveLength(1);
  });
  it("calculates decimal token costs without floating point drift", () => {
    const calculator = new AICostCalculator();
    expect(
      calculator.estimate(
        { inputTokens: 1_000_000, outputTokens: 1_000_000 },
        {
          id: "22222222-2222-4222-8222-222222222222",
          providerId: "fake",
          modelId: "model",
          currency: "USD",
          inputPerMillionTokens: "1",
          outputPerMillionTokens: "2",
          effectiveFrom: new Date().toISOString(),
          version: "v1",
          status: "ACTIVE",
        },
      ),
    ).toBe("3");
  });

  it("applies hierarchical caps and reservations", async () => {
    const economics = new AIEconomicsService();
    await economics.upsertPricing({
      id: "22222222-2222-4222-8222-222222222222",
      providerId: "fake",
      modelId: "model",
      currency: "USD",
      inputPerMillionTokens: "1",
      outputPerMillionTokens: "1",
      effectiveFrom: new Date().toISOString(),
      version: "v1",
      status: "ACTIVE",
    });
    await economics.upsertPolicy({
      id: "33333333-3333-4333-8333-333333333333",
      ownerId,
      scope: "AGENT",
      scopeId: "44444444-4444-4444-8444-444444444444",
      period: "MONTHLY",
      currency: "USD",
      limitUsd: "0.5",
      warningThresholdPct: 70,
      hardStopThresholdPct: 100,
      overflowBehavior: "DENY",
      enabled: true,
      effectiveFrom: new Date().toISOString(),
    });
    const agentContext = {
      ...context,
      agentId: "44444444-4444-4444-8444-444444444444",
    };
    const first = await economics.reserve(
      { ...cloud, estimatedInputTokens: 400_000 },
      agentContext,
      "55555555-5555-4555-8555-555555555555",
      { routeId: crypto.randomUUID(), attemptId: crypto.randomUUID() },
    );
    expect(first.status).toBe("ACTIVE");
    await expect(
      economics.reserve(
        { ...cloud, estimatedInputTokens: 400_000 },
        agentContext,
        "66666666-6666-4666-8666-666666666666",
        { routeId: crypto.randomUUID(), attemptId: crypto.randomUUID() },
      ),
    ).rejects.toThrow("RESERVATION_FAILED");
  });

  it("settles actual usage and releases unused reservation", async () => {
    const economics = new AIEconomicsService();
    await economics.upsertPricing({
      id: "22222222-2222-4222-8222-222222222222",
      providerId: "fake",
      modelId: "model",
      currency: "USD",
      inputPerMillionTokens: "1",
      outputPerMillionTokens: "1",
      effectiveFrom: new Date().toISOString(),
      version: "v1",
      status: "ACTIVE",
    });
    await economics.upsertPolicy({
      id: crypto.randomUUID(),
      ownerId,
      scope: "GLOBAL",
      period: "MONTHLY",
      currency: "USD",
      limitUsd: "5",
      warningThresholdPct: 70,
      hardStopThresholdPct: 100,
      overflowBehavior: "DENY",
      enabled: true,
      effectiveFrom: new Date().toISOString(),
    });
    const correlation = {
      routeId: crypto.randomUUID(),
      attemptId: crypto.randomUUID(),
    };
    const reservation = await economics.reserve(
      cloud,
      { ...context, autonomyMode: "INTERACTIVE" },
      "77777777-7777-4777-8777-777777777777",
      correlation,
    );
    const entry = await economics.settle(
      reservation.id,
      { ...context, autonomyMode: "INTERACTIVE" },
      cloud,
      { inputTokens: 100_000, outputTokens: 0, source: "PROVIDER_REPORTED" },
      "SETTLED",
      undefined,
      correlation,
    );
    expect(entry?.actualCostUsd).toBe("0.1");
    expect((await economics.listReservations(ownerId))[0]?.status).toBe("SETTLED");
  });

  it("fails closed for unknown paid pricing and missing autonomous identity", async () => {
    const economics = new AIEconomicsService();
    await expect(
      economics.reserve(cloud, context, crypto.randomUUID(), {
        routeId: crypto.randomUUID(),
        attemptId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("agent or workflow identity");
    const interactive = { ...context, autonomyMode: "INTERACTIVE" as const };
    await expect(
      economics.reserve(cloud, interactive, crypto.randomUUID(), {
        routeId: crypto.randomUUID(),
        attemptId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("pricing");
  });

  it("durably accounts failed and cancelled attempts without stuck reservations", async () => {
    const economics = new AIEconomicsService();
    await economics.upsertPricing({
      id: crypto.randomUUID(),
      providerId: "fake",
      modelId: "model",
      currency: "USD",
      inputPerMillionTokens: "1",
      outputPerMillionTokens: "1",
      effectiveFrom: new Date().toISOString(),
      version: "failure-v1",
      status: "ACTIVE",
    });
    await economics.upsertPolicy({
      id: crypto.randomUUID(),
      ownerId,
      scope: "GLOBAL",
      period: "MONTHLY",
      currency: "USD",
      limitUsd: "5",
      warningThresholdPct: 70,
      hardStopThresholdPct: 100,
      overflowBehavior: "DENY",
      enabled: true,
      effectiveFrom: new Date().toISOString(),
    });
    const interactive = { ...context, autonomyMode: "INTERACTIVE" as const };
    for (const status of ["FAILED", "CANCELLED"] as const) {
      const correlation = {
        routeId: crypto.randomUUID(),
        attemptId: crypto.randomUUID(),
      };
      const reservation = await economics.reserve(
        cloud,
        interactive,
        crypto.randomUUID(),
        correlation,
      );
      await economics.settle(
        reservation.id,
        interactive,
        cloud,
        { source: "ESTIMATED" },
        status,
        "0",
        correlation,
      );
    }
    expect(
      (await economics.listReservations(ownerId)).every(
        (item) => item.status === "RELEASED",
      ),
    ).toBe(true);
    expect(
      (await economics.listLedger(ownerId)).map((item) => item.status).sort(),
    ).toEqual(["CANCELLED", "FAILED"]);
  });

  it("enforces workflow-run spend and call-count guards", async () => {
    const economics = new AIEconomicsService();
    const workflowId = "88888888-8888-4888-8888-888888888888";
    const workflowRunId = "99999999-9999-4999-8999-999999999999";
    const agentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await economics.upsertPricing({
      id: crypto.randomUUID(),
      providerId: "fake",
      modelId: "model",
      currency: "USD",
      inputPerMillionTokens: "1",
      outputPerMillionTokens: "1",
      effectiveFrom: new Date().toISOString(),
      version: "run-v1",
      status: "ACTIVE",
    });
    await economics.upsertPolicy({
      id: crypto.randomUUID(),
      ownerId,
      scope: "WORKFLOW",
      scopeId: workflowRunId,
      period: "PER_RUN",
      currency: "USD",
      limitUsd: "1",
      warningThresholdPct: 70,
      hardStopThresholdPct: 100,
      overflowBehavior: "DENY",
      enabled: true,
      maxCallsPerRun: 1,
      maxCloudCallsPerRun: 1,
      effectiveFrom: new Date().toISOString(),
    });
    const runContext = {
      ownerId,
      agentId,
      workflowId,
      workflowRunId,
      purpose: "REASONING" as const,
      autonomyMode: "AUTONOMOUS" as const,
    };
    const correlation = {
      routeId: crypto.randomUUID(),
      attemptId: crypto.randomUUID(),
    };
    const reservation = await economics.reserve(
      { ...cloud, estimatedInputTokens: 100_000 },
      runContext,
      crypto.randomUUID(),
      correlation,
    );
    await economics.settle(
      reservation.id,
      runContext,
      cloud,
      { inputTokens: 100_000, source: "PROVIDER_REPORTED" },
      "SETTLED",
      undefined,
      correlation,
    );
    await expect(
      economics.reserve(
        { ...cloud, estimatedInputTokens: 100_000 },
        runContext,
        crypto.randomUUID(),
        { routeId: crypto.randomUUID(), attemptId: crypto.randomUUID() },
      ),
    ).rejects.toThrow("call limit");
  });
});

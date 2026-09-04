import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../persistence/database.js";
import { provisionTestDefaultCompany, safeTestDatabaseUrl } from "../../persistence/test-database.js";
import { PostgresAIEconomicsStore } from "./postgres-store.js";
import { AIEconomicsService } from "./service.js";

const connectionString = safeTestDatabaseUrl();
const ownerA = crypto.randomUUID();
const ownerB = crypto.randomUUID();
const cloud = {
  providerId: "fake-paid",
  modelId: "model-v1",
  locality: "REMOTE" as const,
  estimatedInputTokens: 700_000,
  maxOutputTokens: 0,
};
const context = {
  ownerId: ownerA,
  purpose: "CONVERSATION" as const,
  autonomyMode: "INTERACTIVE" as const,
};

describe.skipIf(!connectionString)("Phase 20R-B PostgreSQL economic authority", () => {
  let administration: PostgresDatabase;
  let database: PostgresDatabase;
  let schema: string;

  beforeAll(async () => {
    administration = new PostgresDatabase(connectionString!);
    schema = `phase20rb_${crypto.randomUUID().replaceAll("-", "")}`;
    await administration.pool.query(`CREATE SCHEMA "${schema}"`);
    const isolated = new URL(connectionString!);
    isolated.hostname = isolated.hostname.replace("-pooler.", ".");
    if (isolated.searchParams.get("sslmode") !== "disable")
      isolated.searchParams.set("sslmode", "verify-full");
    isolated.searchParams.set("options", `-c search_path=${schema}`);
    database = new PostgresDatabase(isolated.toString());
    await database.migrate();
    for (const [id, email] of [
      [ownerA, `phase20rb-${ownerA}@example.test`],
      [ownerB, `phase20rb-${ownerB}@example.test`],
    ])
      await database.pool.query(
        `INSERT INTO owners(id,email,password_hash,record,created_at,updated_at)
         VALUES($1,$2,'test-only',$3,NOW(),NOW())
         ON CONFLICT(id) DO NOTHING`,
        [id, email, { id, email }],
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
  });

  it("survives restart and permits only one of two concurrent reservations", async () => {
    const first = new AIEconomicsService(new PostgresAIEconomicsStore(database.pool));
    await first.initialise();
    await first.upsertPricing({
      id: crypto.randomUUID(),
      providerId: cloud.providerId,
      modelId: cloud.modelId,
      currency: "USD",
      inputPerMillionTokens: "1",
      outputPerMillionTokens: "1",
      effectiveFrom: new Date(Date.now() - 1_000).toISOString(),
      version: "fixture-v1",
      source: "integration-fixture",
      status: "ACTIVE",
    });
    await first.upsertPolicy({
      id: crypto.randomUUID(),
      ownerId: ownerA,
      scope: "GLOBAL",
      period: "MONTHLY",
      currency: "USD",
      limitUsd: "1",
      warningThresholdPct: 70,
      hardStopThresholdPct: 100,
      overflowBehavior: "DENY",
      enabled: true,
      effectiveFrom: new Date(Date.now() - 1_000).toISOString(),
    });
    const second = new AIEconomicsService(new PostgresAIEconomicsStore(database.pool));
    await second.initialise();
    const attempts = await Promise.allSettled([
      first.reserve(cloud, context, crypto.randomUUID(), {
        routeId: crypto.randomUUID(),
        attemptId: crypto.randomUUID(),
      }),
      second.reserve(cloud, context, crypto.randomUUID(), {
        routeId: crypto.randomUUID(),
        attemptId: crypto.randomUUID(),
      }),
    ]);
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(await second.listPolicies(ownerA)).toHaveLength(1);
    expect(await second.listReservations(ownerA)).toHaveLength(1);
  });

  it("settles idempotently, releases unused capacity, and isolates owners", async () => {
    const service = new AIEconomicsService(new PostgresAIEconomicsStore(database.pool));
    const active = (await service.listReservations(ownerA)).find(
      (item) => item.status === "ACTIVE",
    )!;
    const correlation = {
      routeId: active.routeId!,
      attemptId: active.attemptId!,
    };
    const settled = await service.settle(
      active.id,
      context,
      cloud,
      { inputTokens: 180_000, outputTokens: 0, source: "PROVIDER_REPORTED" },
      "SETTLED",
      undefined,
      correlation,
    );
    const duplicate = await service.settle(
      active.id,
      context,
      cloud,
      { inputTokens: 180_000, outputTokens: 0, source: "PROVIDER_REPORTED" },
      "SETTLED",
      undefined,
      correlation,
    );
    expect(settled.id).toBe(duplicate.id);
    expect(settled.actualCostUsd).toBe("0.18");
    expect(
      (await service.listLedger(ownerA)).filter(
        (item) => item.attemptId === correlation.attemptId,
      ),
    ).toHaveLength(1);
    expect((await service.listReservations(ownerA))[0]?.status).toBe("SETTLED");
    expect(await service.listLedger(ownerB)).toEqual([]);
    await expect(
      service.settle(
        active.id,
        { ...context, ownerId: ownerB },
        cloud,
        { source: "ESTIMATED" },
        "FAILED",
        "0",
        correlation,
      ),
    ).rejects.toThrow("Reservation was not found");
  });

  it("reconciles expired active reservations on reconstructed service startup", async () => {
    const service = new AIEconomicsService(new PostgresAIEconomicsStore(database.pool));
    const reservation = await service.reserve(
      { ...cloud, estimatedInputTokens: 100_000 },
      context,
      crypto.randomUUID(),
      { routeId: crypto.randomUUID(), attemptId: crypto.randomUUID() },
    );
    await database.pool.query(
      `UPDATE ai_budget_reservations SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1`,
      [reservation.id],
    );
    const restarted = new AIEconomicsService(
      new PostgresAIEconomicsStore(database.pool),
    );
    await restarted.initialise();
    expect(
      (await restarted.listReservations(ownerA)).find(
        (item) => item.id === reservation.id,
      )?.status,
    ).toBe("EXPIRED");
  });

  it("locks global, agent, and workflow-run caps in deterministic multi-scope races", async () => {
    const agentId = "33333333-3333-4333-8333-333333333333";
    const workflowId = "44444444-4444-4444-8444-444444444444";
    const workflowRunId = "55555555-5555-4555-8555-555555555555";
    const serviceA = new AIEconomicsService(
      new PostgresAIEconomicsStore(database.pool),
    );
    for (const policy of [
      { scope: "GLOBAL" as const, limitUsd: "1" },
      { scope: "AGENT" as const, scopeId: agentId, limitUsd: "0.8" },
      {
        scope: "WORKFLOW" as const,
        scopeId: workflowRunId,
        limitUsd: "0.6",
        period: "PER_RUN" as const,
      },
    ])
      await serviceA.upsertPolicy({
        id: crypto.randomUUID(),
        ownerId: ownerB,
        ...policy,
        period: policy.period ?? "MONTHLY",
        currency: "USD",
        warningThresholdPct: 70,
        hardStopThresholdPct: 100,
        overflowBehavior: "DENY",
        enabled: true,
        effectiveFrom: new Date(Date.now() - 1_000).toISOString(),
      });
    const serviceB = new AIEconomicsService(
      new PostgresAIEconomicsStore(database.pool),
    );
    const scopedContext = {
      ownerId: ownerB,
      agentId,
      workflowId,
      workflowRunId,
      purpose: "REASONING" as const,
      autonomyMode: "AUTONOMOUS" as const,
    };
    const results = await Promise.allSettled(
      [serviceA, serviceB].map((service) =>
        service.reserve(
          { ...cloud, estimatedInputTokens: 400_000 },
          scopedContext,
          crypto.randomUUID(),
          { routeId: crypto.randomUUID(), attemptId: crypto.randomUUID() },
        ),
      ),
    );
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(1);
  });
});

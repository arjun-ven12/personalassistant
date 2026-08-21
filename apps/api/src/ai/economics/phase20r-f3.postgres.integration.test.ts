import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../persistence/database.js";
import { safeTestDatabaseUrl } from "../../persistence/test-database.js";
import { PostgresAIEconomicsStore } from "./postgres-store.js";
import { digestEconomicOverride } from "./override-digest.js";

const connectionString = safeTestDatabaseUrl();
const ownerId = crypto.randomUUID();
const otherOwnerId = crypto.randomUUID();
const candidate = { providerId: "override-provider", modelId: "override-model", locality: "REMOTE" as const };
const context = { ownerId, purpose: "REASONING" as const, autonomyMode: "INTERACTIVE" as const, priority: "NORMAL" as const };

describe.skipIf(!connectionString)("Phase 20R-F3 transactional economic overrides", () => {
  let administration: PostgresDatabase;
  let database: PostgresDatabase;
  let schema: string;

  beforeAll(async () => {
    administration = new PostgresDatabase(connectionString!);
    schema = `phase20rf3_${crypto.randomUUID().replaceAll("-", "")}`;
    await administration.pool.query(`CREATE SCHEMA "${schema}"`);
    const isolated = new URL(connectionString!);
    isolated.hostname = isolated.hostname.replace("-pooler.", ".");
    isolated.searchParams.set("sslmode", "verify-full");
    isolated.searchParams.set("options", `-c search_path=${schema},public`);
    database = new PostgresDatabase(isolated.toString());
    await database.migrate();
    await database.pool.query(
      `INSERT INTO owners(id,email,password_hash,record,created_at,updated_at)
       VALUES ($1,$2,'test-only',$3,NOW(),NOW()),($4,$5,'test-only',$6,NOW(),NOW())
       ON CONFLICT(id) DO NOTHING`,
      [ownerId, `f3-${ownerId}@example.test`, { id: ownerId }, otherOwnerId, `f3-${otherOwnerId}@example.test`, { id: otherOwnerId }],
    );
  }, 60_000);

  afterAll(async () => {
    await database?.close();
    if (administration && schema) {
      await administration.pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      await administration.close();
    }
  });

  it("locks one grant across independent connections and preserves rollback", async () => {
    const store = new PostgresAIEconomicsStore(database.pool);
    const policy = { id: crypto.randomUUID(), owner_id: ownerId, scope: "GLOBAL", period: "MONTHLY", currency: "USD", limit_usd: "0", warning_threshold_pct: 70, hard_stop_threshold_pct: 100, overflow_behavior: "REQUIRE_APPROVAL", enabled: true, effective_from: new Date().toISOString() };
    await database.pool.query(`INSERT INTO ai_budget_policies(id,owner_id,scope,period,currency,limit_usd,warning_threshold_pct,hard_stop_threshold_pct,overflow_behavior,enabled,effective_from,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`, Object.values(policy));
    const descriptor = { ownerId, requestId: crypto.randomUUID(), purpose: "REASONING" as const, requestedAdditionalSpendUsd: "0.50", maxAdditionalSpendUsd: "0.50", expiresAt: new Date(Date.now() + 60_000).toISOString() };
    const grant = { id: crypto.randomUUID(), ownerId, approvalId: crypto.randomUUID(), requestId: descriptor.requestId, digest: digestEconomicOverride(descriptor), maxAdditionalSpendUsd: "0.50", expiresAt: descriptor.expiresAt, status: "ACTIVE" as const, createdAt: new Date().toISOString() };
    await store.createOverrideGrant({ grant, descriptor });
    const input = (amountUsd = "0.50") => ({ ownerId, grantId: grant.id, descriptor, context, candidate, reservation: { id: crypto.randomUUID(), ownerId, requestId: descriptor.requestId, routeId: crypto.randomUUID(), attemptId: crypto.randomUUID(), providerId: candidate.providerId, modelId: candidate.modelId, amountUsd, status: "ACTIVE" as const, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), context } });
    const results = await Promise.allSettled([store.consumeOverrideGrantWithReservation(input()), store.consumeOverrideGrantWithReservation(input())]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await store.getOverrideGrant(ownerId, grant.id))?.grant.status).toBe("CONSUMED");
    expect((await store.listReservations(ownerId)).filter((item) => item.requestId === descriptor.requestId)).toHaveLength(1);
  });

  it("does not consume a grant when reservation creation fails and isolates owners", async () => {
    const store = new PostgresAIEconomicsStore(database.pool);
    const descriptor = { ownerId, requestId: crypto.randomUUID(), purpose: "REASONING" as const, requestedAdditionalSpendUsd: "0.50", maxAdditionalSpendUsd: "0.50", expiresAt: new Date(Date.now() + 60_000).toISOString() };
    const grant = { id: crypto.randomUUID(), ownerId, approvalId: crypto.randomUUID(), requestId: descriptor.requestId, digest: digestEconomicOverride(descriptor), maxAdditionalSpendUsd: "0.50", expiresAt: descriptor.expiresAt, status: "ACTIVE" as const, createdAt: new Date().toISOString() };
    await store.createOverrideGrant({ grant, descriptor });
    const reservation = { id: crypto.randomUUID(), ownerId, requestId: descriptor.requestId, routeId: crypto.randomUUID(), attemptId: crypto.randomUUID(), ...candidate, amountUsd: "0.80", status: "ACTIVE" as const, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), context };
    await expect(store.consumeOverrideGrantWithReservation({ ownerId, grantId: grant.id, descriptor, reservation, context, candidate })).rejects.toThrow();
    expect((await store.getOverrideGrant(ownerId, grant.id))?.grant.status).toBe("ACTIVE");
    expect(await store.getOverrideGrant(otherOwnerId, grant.id)).toBeUndefined();
  });
});

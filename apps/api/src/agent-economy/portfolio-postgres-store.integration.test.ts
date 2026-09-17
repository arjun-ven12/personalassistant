import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createIsolatedTestDatabase, safeTestDatabaseUrl } from "../persistence/test-database.js";
import type { PostgresDatabase } from "../persistence/database.js";
import { PostgresPortfolioEconomyStore } from "./portfolio-postgres-store.js";

const connectionString = safeTestDatabaseUrl();
describe.skipIf(!connectionString)("Phase 25.8H PostgreSQL portfolio economy", () => {
  let database: PostgresDatabase;
  let cleanup: () => Promise<void>;
  let store: PostgresPortfolioEconomyStore;
  const ownerId = crypto.randomUUID();
  const companyId = crypto.randomUUID();
  const at = "2026-09-02T00:00:00.000Z";

  beforeAll(async () => {
    ({ database, cleanup } = await createIsolatedTestDatabase(connectionString!, "phase258h"));
    await database.pool.query(
      "INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'test-only',$3,$4,$4)",
      [ownerId, `phase258h-${ownerId}@example.test`, { id: ownerId }, at],
    );
    await database.pool.query(
      "INSERT INTO companies(id,owner_id,slug,name,status,timezone,default_currency,record,created_at,updated_at) VALUES($1,$2,'nova','Nova','ACTIVE','UTC','USD',$3,$4,$4)",
      [companyId, ownerId, { id: companyId, ownerId, name: "Nova" }, at],
    );
    store = new PostgresPortfolioEconomyStore(database.pool);
    await store.ensureAccounts(ownerId, [companyId], at);
    await store.fundOwnerReserve({ ownerId, amount: 500, reason: "Isolated administrative funding", authorityRef: "OWNER_RESERVE_FUND:isolated-test", idempotencyKey: "fund-owner-reserve-pg-0001", approvalId: crypto.randomUUID(), at });
  }, 60_000);

  afterAll(async () => cleanup?.());

  it("atomically prevents concurrent overspend and returns one idempotent ledger result", async () => {
    const attempts = await Promise.allSettled([
      store.transfer({ ownerId, companyId, amount: 400, reason: "First concurrent allocation", idempotencyKey: "portfolio-pg-allocation-0001", approvalId: null, at }),
      store.transfer({ ownerId, companyId, amount: 400, reason: "Second concurrent allocation", idempotencyKey: "portfolio-pg-allocation-0002", approvalId: null, at }),
    ]);
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((item) => item.status === "rejected")).toHaveLength(1);
    const accounts = await store.listAccounts(ownerId);
    expect(accounts.find((item) => item.accountType === "OWNER_RESERVE")?.availableCredits).toBe(100);
    expect(accounts.find((item) => item.companyId === companyId)?.availableCredits).toBe(400);
    const successful = attempts.find((item) => item.status === "fulfilled")!;
    const retry = await store.transfer({ ownerId, companyId, amount: 400, reason: successful.value.reason, idempotencyKey: successful.value.idempotencyKey, approvalId: null, at });
    expect(retry.id).toBe(successful.value.id);
    expect((await store.listAccounts(ownerId)).find((item) => item.accountType === "OWNER_RESERVE")?.availableCredits).toBe(100);
  });

  it("serializes duplicate funding and rejects changed replay terms without a balance change", async () => {
    const before = (await store.listAccounts(ownerId)).find((a) => a.accountType === "OWNER_RESERVE")!.availableCredits;
    const input = { ownerId, amount: 25, reason: "Concurrent funding fixture", authorityRef: "OWNER_RESERVE_FUND:isolated-test", idempotencyKey: "fund-concurrent-replay-0001", approvalId: crypto.randomUUID(), at };
    const results = await Promise.all(Array.from({ length: 8 }, () => store.fundOwnerReserve(input)));
    expect(new Set(results.map((r) => r.fundingId)).size).toBe(1);
    await expect(store.fundOwnerReserve({ ...input, amount: 26 })).rejects.toMatchObject({ code: "ECONOMY_IDEMPOTENCY_CONFLICT" });
    expect((await store.listAccounts(ownerId)).find((a) => a.accountType === "OWNER_RESERVE")!.availableCredits).toBe(before + 25);
    expect(await store.findFunding(crypto.randomUUID(), input.idempotencyKey)).toBeNull();
  });

  it("rolls back funding when the enclosing audit fails and safely retries", async () => {
    const transactional = new PostgresPortfolioEconomyStore(database.pool, database.transaction);
    const before = (await store.listAccounts(ownerId)).find((a) => a.accountType === "OWNER_RESERVE")!.availableCredits;
    const input = { ownerId, amount: 7, reason: "Audit rollback fixture", authorityRef: "OWNER_RESERVE_FUND:isolated-test", idempotencyKey: "fund-audit-rollback-0001", approvalId: crypto.randomUUID(), at };
    await expect(database.transaction(`portfolio:${ownerId}`, async () => {
      await transactional.fundOwnerReserve(input);
      throw new Error("AUDIT_WRITE_FAILED");
    })).rejects.toThrow("AUDIT_WRITE_FAILED");
    expect(await store.findFunding(ownerId, input.idempotencyKey)).toBeNull();
    expect((await store.listAccounts(ownerId)).find((a) => a.accountType === "OWNER_RESERVE")!.availableCredits).toBe(before);
    const results = await Promise.all(Array.from({ length: 4 }, () => transactional.fundOwnerReserve(input)));
    expect(new Set(results.map((r) => r.fundingId)).size).toBe(1);
    const transferInput = { ownerId, companyId, amount: 1, reason: "Duplicate allocation fixture", idempotencyKey: "transfer-concurrent-0001", approvalId: null, at };
    const transfers = await Promise.all(Array.from({ length: 4 }, () => transactional.transfer(transferInput)));
    expect(new Set(transfers.map((r) => r.id)).size).toBe(1);
    expect((await store.listAccounts(ownerId)).find((a) => a.accountType === "OWNER_RESERVE")!.availableCredits).toBe(before + 6);
  });
});

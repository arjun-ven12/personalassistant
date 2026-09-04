import { describe, expect, it } from "vitest";

import { InMemoryPortfolioEconomyStore } from "./portfolio-store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const otherOwner = "10000000-0000-4000-8000-000000000002";
const companyId = "20000000-0000-4000-8000-000000000001";
const at = "2026-09-02T00:00:00.000Z";

describe("Phase 25.8H portfolio economy", () => {
  it("creates one reserve and company account without minting credits", () => {
    const store = new InMemoryPortfolioEconomyStore();
    const first = store.ensureAccounts(ownerId, [companyId], at);
    const second = store.ensureAccounts(ownerId, [companyId], at);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(first.find((item) => item.accountType === "OWNER_RESERVE")?.availableCredits).toBe(0);
  });

  it("settles exactly once and rejects overspend without partial effects", () => {
    const store = new InMemoryPortfolioEconomyStore();
    store.fundOwnerReserve({ ownerId, amount: 500, reason: "Test administrative funding", authorityRef: "OWNER_RESERVE_FUND:test", idempotencyKey: "fund-owner-reserve-0001", approvalId: "30000000-0000-4000-8000-000000000001", at });
    const input = { ownerId, companyId, amount: 300, reason: "Approved operating allocation", idempotencyKey: "allocate-company-nova-0001", approvalId: "30000000-0000-4000-8000-000000000001", at };
    const first = store.transfer(input);
    const retry = store.transfer(input);
    expect(retry.id).toBe(first.id);
    const accounts = store.listAccounts(ownerId);
    expect(accounts.find((item) => item.accountType === "OWNER_RESERVE")?.availableCredits).toBe(200);
    expect(accounts.find((item) => item.companyId === companyId)?.availableCredits).toBe(300);
    expect(() => store.transfer({ ...input, amount: 201, idempotencyKey: "allocate-company-nova-0002" })).toThrow(/insufficient/i);
    expect(store.listAccounts(ownerId).find((item) => item.accountType === "OWNER_RESERVE")?.availableCredits).toBe(200);
  });

  it("keeps reserve and idempotency namespaces owner-scoped", () => {
    const store = new InMemoryPortfolioEconomyStore();
    const funding = store.fundOwnerReserve({ ownerId, amount: 100, reason: "Test administrative funding", authorityRef: "OWNER_RESERVE_FUND:test", idempotencyKey: "fund-owner-reserve-0002", approvalId: "30000000-0000-4000-8000-000000000001", at });
    expect(store.fundOwnerReserve({ ownerId, amount: 100, reason: "Test administrative funding", authorityRef: "OWNER_RESERVE_FUND:test", idempotencyKey: "fund-owner-reserve-0002", approvalId: "30000000-0000-4000-8000-000000000001", at }).fundingId).toBe(funding.fundingId);
    store.ensureAccounts(otherOwner, [companyId], at);
    expect(() => store.transfer({ ownerId: otherOwner, companyId, amount: 1, reason: "cross-owner attempt", idempotencyKey: "allocate-company-nova-0003", approvalId: null, at })).toThrow(/insufficient/i);
    expect(store.listAccounts(ownerId).find((item) => item.accountType === "OWNER_RESERVE")?.availableCredits).toBe(100);
    expect(() => store.fundOwnerReserve({ ownerId, amount: -1, reason: "Invalid", authorityRef: "OWNER_RESERVE_FUND:test", idempotencyKey: "fund-owner-reserve-bad01", approvalId: "30000000-0000-4000-8000-000000000001", at })).toThrow(/positive bounded integer/i);
    expect(() => store.fundOwnerReserve({ ownerId, amount: 1_000_000_001, reason: "Invalid", authorityRef: "OWNER_RESERVE_FUND:test", idempotencyKey: "fund-owner-reserve-bad02", approvalId: "30000000-0000-4000-8000-000000000001", at })).toThrow(/positive bounded integer/i);
    expect(store.listAccounts(otherOwner).find((item) => item.accountType === "OWNER_RESERVE")?.availableCredits).toBe(0);
    expect(() => store.transfer({ ownerId, companyId, amount: -500, reason: "tampered", idempotencyKey: "allocate-company-nova-0004", approvalId: null, at })).toThrow(/positive bounded integer/i);
    expect(store.listAccounts(ownerId).find((item) => item.accountType === "OWNER_RESERVE")?.availableCredits).toBe(100);
  });
});

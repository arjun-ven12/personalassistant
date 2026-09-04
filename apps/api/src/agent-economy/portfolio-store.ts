import { createHash } from "node:crypto";

import {
  EconomyScopeAccountSchema,
  EconomyScopeTransferSchema,
  OwnerReserveFundingSchema,
  type EconomyScopeAccount,
  type EconomyScopeTransfer,
  type OwnerReserveFunding,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface PortfolioEconomyStore {
  ensureAccounts(ownerId: string, companyIds: string[], at: string): Awaitable<EconomyScopeAccount[]>;
  listAccounts(ownerId: string): Awaitable<EconomyScopeAccount[]>;
  findTransfer(ownerId: string, idempotencyKey: string): Awaitable<EconomyScopeTransfer | null>;
  transfer(input: {
    ownerId: string;
    companyId: string;
    amount: number;
    reason: string;
    idempotencyKey: string;
    approvalId: string | null;
    at: string;
  }): Awaitable<EconomyScopeTransfer>;
  findFunding(ownerId: string, idempotencyKey: string): Awaitable<OwnerReserveFunding | null>;
  fundOwnerReserve(input: {
    ownerId: string;
    amount: number;
    reason: string;
    authorityRef: string;
    idempotencyKey: string;
    approvalId: string;
    at: string;
  }): Awaitable<OwnerReserveFunding>;
}

const stableUuid = (value: string) => {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
};
const reserveId = (ownerId: string) => stableUuid(`economy:owner-reserve:${ownerId}`);
const companyIdFor = (ownerId: string, companyId: string) => stableUuid(`economy:company:${ownerId}:${companyId}`);

export class InMemoryPortfolioEconomyStore implements PortfolioEconomyStore {
  readonly #accounts = new Map<string, EconomyScopeAccount>();
  readonly #transfers = new Map<string, EconomyScopeTransfer>();
  readonly #funding = new Map<string, OwnerReserveFunding>();

  ensureAccounts(ownerId: string, companyIds: string[], at: string) {
    const reserveKey = `${ownerId}:${reserveId(ownerId)}`;
    if (!this.#accounts.has(reserveKey))
      this.#accounts.set(reserveKey, EconomyScopeAccountSchema.parse({
        id: reserveId(ownerId), ownerId, accountType: "OWNER_RESERVE", companyId: null,
        availableCredits: 0, reservedCredits: 0, lifetimeAllocated: 0, lifetimeSpent: 0,
        createdAt: at, updatedAt: at,
      }));
    for (const companyId of companyIds) {
      const id = companyIdFor(ownerId, companyId);
      const key = `${ownerId}:${id}`;
      if (!this.#accounts.has(key))
        this.#accounts.set(key, EconomyScopeAccountSchema.parse({
          id, ownerId, accountType: "COMPANY", companyId,
          availableCredits: 0, reservedCredits: 0, lifetimeAllocated: 0, lifetimeSpent: 0,
          createdAt: at, updatedAt: at,
        }));
    }
    return this.listAccounts(ownerId);
  }

  listAccounts(ownerId: string) {
    return [...this.#accounts.values()].filter((item) => item.ownerId === ownerId).map((item) => structuredClone(item));
  }

  findTransfer(ownerId: string, idempotencyKey: string) {
    const value = this.#transfers.get(`${ownerId}:${idempotencyKey}`);
    return value ? structuredClone(value) : null;
  }

  transfer(input: { ownerId: string; companyId: string; amount: number; reason: string; idempotencyKey: string; approvalId: string | null; at: string }) {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 1_000_000_000)
      throw Object.assign(new Error("Transfer amount must be a positive bounded integer."), { code: "INVALID_PORTFOLIO_TRANSFER_AMOUNT" });
    const duplicate = this.findTransfer(input.ownerId, input.idempotencyKey);
    if (duplicate) return duplicate;
    this.ensureAccounts(input.ownerId, [input.companyId], input.at);
    const sourceKey = `${input.ownerId}:${reserveId(input.ownerId)}`;
    const destinationKey = `${input.ownerId}:${companyIdFor(input.ownerId, input.companyId)}`;
    const source = this.#accounts.get(sourceKey)!;
    const destination = this.#accounts.get(destinationKey)!;
    if (source.availableCredits < input.amount)
      throw Object.assign(new Error("Owner reserve is insufficient."), { code: "INSUFFICIENT_OWNER_RESERVE" });
    const transfer = EconomyScopeTransferSchema.parse({
      id: stableUuid(`economy:transfer:${input.ownerId}:${input.idempotencyKey}`),
      ownerId: input.ownerId, sourceAccountId: source.id, destinationAccountId: destination.id,
      companyId: input.companyId, amount: input.amount, reason: input.reason,
      idempotencyKey: input.idempotencyKey, approvalId: input.approvalId,
      status: "SETTLED", createdAt: input.at, settledAt: input.at,
    });
    this.#accounts.set(sourceKey, EconomyScopeAccountSchema.parse({ ...source, availableCredits: source.availableCredits - input.amount, lifetimeAllocated: source.lifetimeAllocated + input.amount, updatedAt: input.at }));
    this.#accounts.set(destinationKey, EconomyScopeAccountSchema.parse({ ...destination, availableCredits: destination.availableCredits + input.amount, lifetimeAllocated: destination.lifetimeAllocated + input.amount, updatedAt: input.at }));
    this.#transfers.set(`${input.ownerId}:${input.idempotencyKey}`, transfer);
    return structuredClone(transfer);
  }

  findFunding(ownerId: string, idempotencyKey: string) {
    const value = this.#funding.get(`${ownerId}:${idempotencyKey}`);
    return value ? structuredClone(value) : null;
  }

  fundOwnerReserve(input: { ownerId: string; amount: number; reason: string; authorityRef: string; idempotencyKey: string; approvalId: string; at: string }) {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 1_000_000_000)
      throw Object.assign(new Error("Funding amount must be a positive bounded integer."), { code: "INVALID_OWNER_RESERVE_FUNDING_AMOUNT" });
    const key = `${input.ownerId}:${input.idempotencyKey}`;
    const duplicate = this.#funding.get(key);
    if (duplicate) return structuredClone(duplicate);
    this.ensureAccounts(input.ownerId, [], input.at);
    const accountKey = `${input.ownerId}:${reserveId(input.ownerId)}`;
    const account = this.#accounts.get(accountKey)!;
    if (!input.authorityRef.trim()) throw Object.assign(new Error("Funding authority is required."), { code: "OWNER_RESERVE_AUTHORITY_REQUIRED" });
    const updated = EconomyScopeAccountSchema.parse({ ...account, availableCredits: account.availableCredits + input.amount, updatedAt: input.at });
    const funding = OwnerReserveFundingSchema.parse({
      fundingId: stableUuid(`economy:funding:${input.ownerId}:${input.idempotencyKey}`),
      ownerId: input.ownerId, amount: input.amount, reason: input.reason,
      authority: "OWNER_RESERVE_FUND", authorityRef: input.authorityRef,
      idempotencyKey: input.idempotencyKey, approvalId: input.approvalId,
      status: "SETTLED", createdAt: input.at, settledAt: input.at,
    });
    this.#accounts.set(accountKey, updated);
    this.#funding.set(key, funding);
    return structuredClone(funding);
  }
}

export { companyIdFor as portfolioCompanyEconomyAccountId, reserveId as ownerReserveAccountId };

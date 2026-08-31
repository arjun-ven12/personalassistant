import {
  AgentEconomyAccountSchema,
  AgentEconomyLedgerEntrySchema,
  AgentEconomyPerformanceSchema,
  AgentEconomyReservationSchema,
  type AgentEconomyAccount,
  type AgentEconomyLedgerEntry,
  type AgentEconomyPerformance,
  type AgentEconomyReservation,
  type AgentEconomyStatus,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";
import { companyScope } from "../companies/scope.js";

export type EconomyMutationResult = {
  account: AgentEconomyAccount;
  entry: AgentEconomyLedgerEntry;
  duplicate: boolean;
};

export interface AgentEconomyStore {
  saveAccount(account: AgentEconomyAccount): Awaitable<AgentEconomyAccount>;
  updateAccount(account: AgentEconomyAccount): Awaitable<AgentEconomyAccount>;
  findAccount(ownerId: string, agentId: string): Awaitable<AgentEconomyAccount | undefined>;
  listAccounts(ownerId: string): Awaitable<AgentEconomyAccount[]>;
  setStatus(
    ownerId: string,
    agentId: string,
    status: AgentEconomyStatus,
    updatedAt: string,
  ): Awaitable<AgentEconomyAccount>;
  creditAtomic(input: {
    account: AgentEconomyAccount;
    entry: AgentEconomyLedgerEntry;
  }): Awaitable<EconomyMutationResult>;
  penalizeAtomic(input: {
    account: AgentEconomyAccount;
    entry: AgentEconomyLedgerEntry;
  }): Awaitable<EconomyMutationResult>;
  reserveAtomic(input: {
    account: AgentEconomyAccount;
    reservation: AgentEconomyReservation;
    entry: AgentEconomyLedgerEntry;
  }): Awaitable<{ account: AgentEconomyAccount; reservation: AgentEconomyReservation; duplicate: boolean }>;
  settleAtomic(input: {
    ownerId: string;
    agentId: string;
    reservationId: string;
    amount: number;
    entry: AgentEconomyLedgerEntry;
    updatedAt: string;
  }): Awaitable<{ account: AgentEconomyAccount; reservation: AgentEconomyReservation; duplicate: boolean }>;
  releaseAtomic(input: {
    ownerId: string;
    agentId: string;
    reservationId: string;
    entry: AgentEconomyLedgerEntry;
    updatedAt: string;
  }): Awaitable<{ account: AgentEconomyAccount; reservation: AgentEconomyReservation; duplicate: boolean }>;
  listLedger(ownerId: string, limit: number): Awaitable<AgentEconomyLedgerEntry[]>;
  listReservations(ownerId: string, agentId?: string): Awaitable<AgentEconomyReservation[]>;
  savePerformance(record: AgentEconomyPerformance): Awaitable<void>;
  findPerformance(ownerId: string, agentId: string): Awaitable<AgentEconomyPerformance | undefined>;
  listPerformance(ownerId: string): Awaitable<AgentEconomyPerformance[]>;
}

const companyKey = (ownerId: string) => companyScope.companyId(ownerId) ?? "owner-default";
const keyFor = (ownerId: string, agentId: string) =>
  `${ownerId}:${companyKey(ownerId)}:${agentId}`;
const recordKey = (ownerId: string, id: string) =>
  `${ownerId}:${companyKey(ownerId)}:${id}`;

export class InMemoryAgentEconomyStore implements AgentEconomyStore {
  readonly #accounts = new Map<string, AgentEconomyAccount>();
  readonly #ledger = new Map<string, AgentEconomyLedgerEntry>();
  readonly #idempotency = new Map<string, string>();
  readonly #reservations = new Map<string, AgentEconomyReservation>();
  readonly #reservationKeys = new Map<string, string>();
  readonly #performance = new Map<string, AgentEconomyPerformance>();

  saveAccount(account: AgentEconomyAccount) {
    const parsed = AgentEconomyAccountSchema.parse(account);
    const key = keyFor(parsed.ownerId, parsed.agentId);
    const existing = this.#accounts.get(key);
    if (existing) return structuredClone(existing);
    this.#accounts.set(key, structuredClone(parsed));
    return structuredClone(parsed);
  }

  updateAccount(account: AgentEconomyAccount) {
    const parsed = AgentEconomyAccountSchema.parse(account);
    const key = keyFor(parsed.ownerId, parsed.agentId);
    if (!this.#accounts.has(key)) throw Object.assign(new Error("Economy account not found."), { code: "ECONOMY_ACCOUNT_NOT_FOUND" });
    this.#accounts.set(key, structuredClone(parsed));
    return structuredClone(parsed);
  }

  findAccount(ownerId: string, agentId: string) {
    const account = this.#accounts.get(keyFor(ownerId, agentId));
    return account ? structuredClone(account) : undefined;
  }

  listAccounts(ownerId: string) {
    const prefix = `${ownerId}:${companyKey(ownerId)}:`;
    return [...this.#accounts.entries()]
      .filter(([key, account]) => key.startsWith(prefix) && account.ownerId === ownerId)
      .map(([, account]) => account)
      .sort((left, right) => left.agentId.localeCompare(right.agentId))
      .map((account) => structuredClone(account));
  }

  setStatus(ownerId: string, agentId: string, status: AgentEconomyStatus, updatedAt: string) {
    const key = keyFor(ownerId, agentId);
    const account = this.#accounts.get(key);
    if (!account) throw Object.assign(new Error("Economy account not found."), { code: "ECONOMY_ACCOUNT_NOT_FOUND" });
    const updated = AgentEconomyAccountSchema.parse({ ...account, economyStatus: status, updatedAt });
    this.#accounts.set(key, structuredClone(updated));
    return structuredClone(updated);
  }

  creditAtomic(input: { account: AgentEconomyAccount; entry: AgentEconomyLedgerEntry }) {
    const account = this.requireAccount(input.account.ownerId, input.account.agentId);
    const existing = this.findIdempotent(input.entry.ownerId, input.entry.idempotencyKey);
    if (existing) return { account, entry: existing, duplicate: true };
    const amount = input.entry.amount;
    const updated = AgentEconomyAccountSchema.parse({
      ...account,
      availableCredits: account.availableCredits + amount,
      lifetimeEarned: account.lifetimeEarned + amount,
      updatedAt: input.entry.createdAt,
    });
    this.commit(updated, input.entry);
    return { account: structuredClone(updated), entry: structuredClone(input.entry), duplicate: false };
  }

  penalizeAtomic(input: { account: AgentEconomyAccount; entry: AgentEconomyLedgerEntry }) {
    const account = this.requireAccount(input.account.ownerId, input.account.agentId);
    const existing = this.findIdempotent(input.entry.ownerId, input.entry.idempotencyKey);
    if (existing) return { account, entry: existing, duplicate: true };
    const amount = Math.min(account.availableCredits, input.entry.amount);
    const updated = AgentEconomyAccountSchema.parse({
      ...account,
      availableCredits: account.availableCredits - amount,
      lifetimeSpent: account.lifetimeSpent + amount,
      updatedAt: input.entry.createdAt,
    });
    const entry = AgentEconomyLedgerEntrySchema.parse({ ...input.entry, amount });
    this.commit(updated, entry);
    return { account: structuredClone(updated), entry: structuredClone(entry), duplicate: false };
  }

  reserveAtomic(input: { account: AgentEconomyAccount; reservation: AgentEconomyReservation; entry: AgentEconomyLedgerEntry }) {
    const existingReservationId = this.#reservationKeys.get(`${input.reservation.ownerId}:${companyKey(input.reservation.ownerId)}:${input.reservation.idempotencyKey}`);
    if (existingReservationId) {
      const reservation = this.#reservations.get(recordKey(input.reservation.ownerId, existingReservationId))!;
      return { account: this.requireAccount(reservation.ownerId, reservation.agentId), reservation: structuredClone(reservation), duplicate: true };
    }
    const account = this.requireAccount(input.account.ownerId, input.account.agentId);
    if (account.availableCredits < input.reservation.amountReserved)
      throw Object.assign(new Error("Insufficient economic budget."), { code: "INSUFFICIENT_ECONOMIC_BUDGET" });
    const updated = AgentEconomyAccountSchema.parse({
      ...account,
      availableCredits: account.availableCredits - input.reservation.amountReserved,
      reservedCredits: account.reservedCredits + input.reservation.amountReserved,
      updatedAt: input.reservation.createdAt,
    });
    this.commit(updated, input.entry);
    const reservation = AgentEconomyReservationSchema.parse(input.reservation);
    this.#reservations.set(recordKey(reservation.ownerId, reservation.id), structuredClone(reservation));
    this.#reservationKeys.set(`${reservation.ownerId}:${companyKey(reservation.ownerId)}:${reservation.idempotencyKey}`, reservation.id);
    return { account: structuredClone(updated), reservation: structuredClone(reservation), duplicate: false };
  }

  settleAtomic(input: { ownerId: string; agentId: string; reservationId: string; amount: number; entry: AgentEconomyLedgerEntry; updatedAt: string }) {
    const existing = this.findIdempotent(input.ownerId, input.entry.idempotencyKey);
    const reservation = this.requireReservation(input.ownerId, input.agentId, input.reservationId);
    const account = this.requireAccount(input.ownerId, input.agentId);
    if (existing) return { account, reservation, duplicate: true };
    if (reservation.status !== "ACTIVE") throw Object.assign(new Error("Reservation is not active."), { code: "ECONOMY_RESERVATION_NOT_ACTIVE" });
    const extra = Math.max(0, input.amount - reservation.amountReserved);
    if (extra > account.availableCredits)
      throw Object.assign(new Error("Insufficient economic budget for settlement."), { code: "INSUFFICIENT_ECONOMIC_BUDGET" });
    const release = Math.max(0, reservation.amountReserved - input.amount);
    const updated = AgentEconomyAccountSchema.parse({
      ...account,
      availableCredits: account.availableCredits + release - extra,
      reservedCredits: account.reservedCredits - reservation.amountReserved,
      lifetimeSpent: account.lifetimeSpent + input.amount,
      updatedAt: input.updatedAt,
    });
    const settled = AgentEconomyReservationSchema.parse({ ...reservation, amountSettled: input.amount, status: "SETTLED", updatedAt: input.updatedAt });
    this.commit(updated, input.entry);
    this.#reservations.set(recordKey(settled.ownerId, settled.id), structuredClone(settled));
    return { account: structuredClone(updated), reservation: structuredClone(settled), duplicate: false };
  }

  releaseAtomic(input: { ownerId: string; agentId: string; reservationId: string; entry: AgentEconomyLedgerEntry; updatedAt: string }) {
    const existing = this.findIdempotent(input.ownerId, input.entry.idempotencyKey);
    const reservation = this.requireReservation(input.ownerId, input.agentId, input.reservationId);
    const account = this.requireAccount(input.ownerId, input.agentId);
    if (existing) return { account, reservation, duplicate: true };
    if (reservation.status !== "ACTIVE") throw Object.assign(new Error("Reservation is not active."), { code: "ECONOMY_RESERVATION_NOT_ACTIVE" });
    const updated = AgentEconomyAccountSchema.parse({
      ...account,
      availableCredits: account.availableCredits + reservation.amountReserved,
      reservedCredits: account.reservedCredits - reservation.amountReserved,
      updatedAt: input.updatedAt,
    });
    const released = AgentEconomyReservationSchema.parse({ ...reservation, status: "RELEASED", updatedAt: input.updatedAt });
    this.commit(updated, input.entry);
    this.#reservations.set(recordKey(released.ownerId, released.id), structuredClone(released));
    return { account: structuredClone(updated), reservation: structuredClone(released), duplicate: false };
  }

  listLedger(ownerId: string, limit: number) {
    const prefix = `${ownerId}:${companyKey(ownerId)}:`;
    return [...this.#ledger.entries()]
      .filter(([key, entry]) => key.startsWith(prefix) && entry.ownerId === ownerId)
      .map(([, entry]) => entry)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((entry) => structuredClone(entry));
  }

  listReservations(ownerId: string, agentId?: string) {
    const prefix = `${ownerId}:${companyKey(ownerId)}:`;
    return [...this.#reservations.entries()]
      .filter(([key, reservation]) => key.startsWith(prefix) && reservation.ownerId === ownerId && (!agentId || reservation.agentId === agentId))
      .map(([, reservation]) => reservation)
      .map((reservation) => structuredClone(reservation));
  }

  savePerformance(record: AgentEconomyPerformance) {
    const parsed = AgentEconomyPerformanceSchema.parse(record);
    this.#performance.set(keyFor(parsed.ownerId, parsed.agentId), structuredClone(parsed));
  }

  findPerformance(ownerId: string, agentId: string) {
    const record = this.#performance.get(keyFor(ownerId, agentId));
    return record ? structuredClone(record) : undefined;
  }

  listPerformance(ownerId: string) {
    const prefix = `${ownerId}:${companyKey(ownerId)}:`;
    return [...this.#performance.entries()]
      .filter(([key, record]) => key.startsWith(prefix) && record.ownerId === ownerId)
      .map(([, record]) => structuredClone(record));
  }

  private requireAccount(ownerId: string, agentId: string) {
    const account = this.#accounts.get(keyFor(ownerId, agentId));
    if (!account) throw Object.assign(new Error("Economy account not found."), { code: "ECONOMY_ACCOUNT_NOT_FOUND" });
    return structuredClone(account);
  }

  private requireReservation(ownerId: string, agentId: string, reservationId: string) {
    const reservation = this.#reservations.get(recordKey(ownerId, reservationId));
    if (!reservation || reservation.ownerId !== ownerId || reservation.agentId !== agentId)
      throw Object.assign(new Error("Economy reservation not found."), { code: "ECONOMY_RESERVATION_NOT_FOUND" });
    return structuredClone(reservation);
  }

  private findIdempotent(ownerId: string, idempotencyKey: string) {
    const id = this.#idempotency.get(`${ownerId}:${companyKey(ownerId)}:${idempotencyKey}`);
    const entry = id ? this.#ledger.get(recordKey(ownerId, id)) : undefined;
    return entry ? structuredClone(entry) : undefined;
  }

  private commit(account: AgentEconomyAccount, entry: AgentEconomyLedgerEntry) {
    const parsedEntry = AgentEconomyLedgerEntrySchema.parse(entry);
    this.#accounts.set(keyFor(account.ownerId, account.agentId), structuredClone(account));
    this.#ledger.set(recordKey(parsedEntry.ownerId, parsedEntry.id), structuredClone(parsedEntry));
    this.#idempotency.set(`${parsedEntry.ownerId}:${companyKey(parsedEntry.ownerId)}:${parsedEntry.idempotencyKey}`, parsedEntry.id);
  }
}

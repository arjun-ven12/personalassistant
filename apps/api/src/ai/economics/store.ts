import {
  AIBudgetPolicySchema,
  AIBudgetReservationSchema,
  AIPricingSchema,
  AIUsageLedgerEntrySchema,
  type AIBudgetPolicy,
  type AIBudgetReservation,
  type AIEconomicContext,
  AIEconomicOverrideDescriptorSchema,
  AIEconomicOverrideGrantSchema,
  type AIEconomicOverrideDescriptor,
  type AIEconomicOverrideGrant,
  type AIPricing,
  type AIUsageLedgerEntry,
} from "@alexa-control/shared";
import type { Awaitable } from "../../identity/store.js";
import { AIEconomicError } from "./errors.js";
import { digestEconomicOverride } from "./override-digest.js";

export const MONEY_SCALE = 100_000_000n;
export const decimalToUnits = (value: string) => {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * MONEY_SCALE + BigInt(fraction.padEnd(8, "0").slice(0, 8));
};
export const unitsToDecimal = (value: bigint) => {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / MONEY_SCALE;
  const fraction = (absolute % MONEY_SCALE)
    .toString()
    .padStart(8, "0")
    .replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
};

export type ReservationCandidate = {
  providerId: string;
  modelId: string;
  locality: "LOCAL" | "REMOTE";
};

export type AtomicReservationInput = {
  reservation: AIBudgetReservation;
  context: AIEconomicContext;
  candidate: ReservationCandidate;
};

export type AtomicSettlementInput = {
  ownerId: string;
  reservationId?: string;
  entry: AIUsageLedgerEntry;
};

export type OverrideGrantWithDescriptor = {
  grant: AIEconomicOverrideGrant;
  descriptor: AIEconomicOverrideDescriptor;
};

export type OverrideGrantReservationInput = AtomicReservationInput & {
  ownerId: string;
  grantId: string;
  descriptor: AIEconomicOverrideDescriptor;
};

export interface AIEconomicsStore {
  readonly persistence: "POSTGRESQL" | "IN_MEMORY_DEVELOPMENT";
  health(): Promise<boolean>;
  listPricing(): Awaitable<AIPricing[]>;
  upsertPricing(item: AIPricing): Awaitable<AIPricing>;
  listPolicies(ownerId: string): Awaitable<AIBudgetPolicy[]>;
  upsertPolicy(item: AIBudgetPolicy): Awaitable<AIBudgetPolicy>;
  disablePolicy(ownerId: string, id: string): Awaitable<boolean>;
  listReservations(ownerId: string): Awaitable<AIBudgetReservation[]>;
  listLedger(ownerId: string, limit: number): Awaitable<AIUsageLedgerEntry[]>;
  reserveAtomic(input: AtomicReservationInput): Promise<AIBudgetReservation>;
  settleAtomic(input: AtomicSettlementInput): Promise<AIUsageLedgerEntry>;
  release(
    ownerId: string,
    reservationId: string,
  ): Awaitable<AIBudgetReservation | undefined>;
  reconcileExpired(now: Date): Promise<number>;
  findActiveReservation(
    ownerId: string,
    reservationId: string,
  ): Awaitable<AIBudgetReservation | undefined>;
  createOverrideGrant(input: OverrideGrantWithDescriptor): Promise<AIEconomicOverrideGrant>;
  getOverrideGrant(ownerId: string, grantId: string): Promise<OverrideGrantWithDescriptor | undefined>;
  consumeOverrideGrantWithReservation(
    input: OverrideGrantReservationInput,
  ): Promise<AIBudgetReservation>;
  expireOverrideGrant(ownerId: string, grantId: string): Promise<boolean>;
}

export const policyApplies = (
  policy: AIBudgetPolicy,
  context: AIEconomicContext,
  candidate: ReservationCandidate,
) => {
  if (!policy.enabled) return false;
  const now = Date.now();
  if (Date.parse(policy.effectiveFrom) > now) return false;
  if (policy.effectiveUntil && Date.parse(policy.effectiveUntil) <= now) return false;
  if (policy.scope === "GLOBAL") return true;
  if (policy.scope === "PROVIDER") return policy.scopeId === candidate.providerId;
  if (policy.scope === "MODEL")
    return policy.scopeId === `${candidate.providerId}/${candidate.modelId}`;
  if (policy.scope === "DEPARTMENT") return policy.scopeId === context.departmentId;
  if (policy.scope === "AGENT") return policy.scopeId === context.agentId;
  if (policy.scope === "WORKFLOW")
    return (
      policy.scopeId === context.workflowRunId || policy.scopeId === context.workflowId
    );
  return policy.scopeId === context.costCenter;
};

export const periodStart = (policy: AIBudgetPolicy, now = new Date()) => {
  if (policy.period === "PER_RUN") return new Date(0);
  const start = new Date(now);
  if (policy.period === "DAILY") start.setHours(0, 0, 0, 0);
  if (policy.period === "WEEKLY") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
  }
  if (policy.period === "MONTHLY") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return start;
};

const ledgerMatchesPolicy = (
  entry: AIUsageLedgerEntry,
  policy: AIBudgetPolicy,
  context: AIEconomicContext,
  candidate: ReservationCandidate,
) => {
  if (new Date(entry.completedAt ?? entry.startedAt) < periodStart(policy))
    return false;
  if (policy.period === "PER_RUN" && entry.workflowRunId !== context.workflowRunId)
    return false;
  if (policy.scope === "GLOBAL") return true;
  if (policy.scope === "PROVIDER") return entry.providerId === candidate.providerId;
  if (policy.scope === "MODEL")
    return `${entry.providerId}/${entry.modelId}` === policy.scopeId;
  if (policy.scope === "DEPARTMENT") return entry.departmentId === policy.scopeId;
  if (policy.scope === "AGENT") return entry.agentId === policy.scopeId;
  if (policy.scope === "WORKFLOW")
    return (
      entry.workflowId === policy.scopeId || entry.workflowRunId === policy.scopeId
    );
  return entry.metadata?.costCenter === policy.scopeId;
};

export const assertReservationAllowed = (input: {
  policies: AIBudgetPolicy[];
  ledger: AIUsageLedgerEntry[];
  activeReservations: AIBudgetReservation[];
  reservation: AIBudgetReservation;
  context: AIEconomicContext;
  candidate: ReservationCandidate;
}) => {
  if (!input.policies.length)
    throw new AIEconomicError(
      "BUDGET_EXHAUSTED",
      "No applicable durable budget policy authorizes this paid request.",
    );
  for (const policy of [...input.policies].sort((a, b) =>
    `${a.scope}:${a.scopeId ?? ""}:${a.id}`.localeCompare(
      `${b.scope}:${b.scopeId ?? ""}:${b.id}`,
    ),
  )) {
    const matchingLedger = input.ledger.filter((entry) =>
      ledgerMatchesPolicy(entry, policy, input.context, input.candidate),
    );
    const spent = matchingLedger.reduce(
      (sum, entry) => sum + decimalToUnits(entry.actualCostUsd ?? "0"),
      0n,
    );
    const reserved = input.activeReservations
      .filter((item) => item.policyIds?.includes(policy.id))
      .reduce((sum, item) => sum + decimalToUnits(item.amountUsd), 0n);
    if (
      spent + reserved + decimalToUnits(input.reservation.amountUsd) >
      decimalToUnits(policy.limitUsd)
    )
      throw new AIEconomicError(
        policy.scope === "AGENT"
          ? "AGENT_BUDGET_EXHAUSTED"
          : policy.scope === "WORKFLOW" || policy.period === "PER_RUN"
            ? "WORKFLOW_BUDGET_EXHAUSTED"
            : policy.scope === "PROVIDER"
              ? "PROVIDER_BUDGET_EXHAUSTED"
              : "BUDGET_EXHAUSTED",
        `Budget policy ${policy.id} would be exceeded.`,
      );
    const minuteCount =
      matchingLedger.filter(
        (entry) => Date.parse(entry.startedAt) >= Date.now() - 60_000,
      ).length +
      input.activeReservations.filter(
        (item) =>
          item.policyIds?.includes(policy.id) &&
          Date.parse(item.createdAt) >= Date.now() - 60_000,
      ).length;
    if (policy.maxCallsPerMinute && minuteCount >= policy.maxCallsPerMinute)
      throw new AIEconomicError(
        "RATE_LIMIT_EXCEEDED",
        `Budget policy ${policy.id} call-rate limit was reached.`,
      );
    if (policy.maxCallsPerRun && input.context.workflowRunId) {
      const runCount =
        matchingLedger.filter(
          (entry) => entry.workflowRunId === input.context.workflowRunId,
        ).length +
        input.activeReservations.filter(
          (item) =>
            item.policyIds?.includes(policy.id) &&
            item.context?.workflowRunId === input.context.workflowRunId,
        ).length;
      if (runCount >= policy.maxCallsPerRun)
        throw new AIEconomicError(
          "RATE_LIMIT_EXCEEDED",
          `Budget policy ${policy.id} workflow-run call limit was reached.`,
        );
    }
    if (policy.maxCloudCallsPerRun && input.context.workflowRunId) {
      const cloudRunCount =
        matchingLedger.filter(
          (entry) =>
            entry.workflowRunId === input.context.workflowRunId &&
            entry.locality === "CLOUD",
        ).length +
        input.activeReservations.filter(
          (item) =>
            item.policyIds?.includes(policy.id) &&
            item.context?.workflowRunId === input.context.workflowRunId &&
            item.providerId !== undefined,
        ).length;
      if (cloudRunCount >= policy.maxCloudCallsPerRun)
        throw new AIEconomicError(
          "RATE_LIMIT_EXCEEDED",
          `Budget policy ${policy.id} cloud workflow-run call limit was reached.`,
        );
    }
  }
};

export class InMemoryAIEconomicsStore implements AIEconomicsStore {
  readonly persistence = "IN_MEMORY_DEVELOPMENT" as const;
  private readonly pricing = new Map<string, AIPricing>();
  private readonly policies = new Map<string, AIBudgetPolicy>();
  private readonly reservations = new Map<string, AIBudgetReservation>();
  private readonly ledger = new Map<string, AIUsageLedgerEntry>();
  private readonly overrideGrants = new Map<string, OverrideGrantWithDescriptor>();
  private queue = Promise.resolve();

  health() {
    return Promise.resolve(true);
  }
  listPricing() {
    return [...this.pricing.values()].map((item) => structuredClone(item));
  }
  upsertPricing(input: AIPricing) {
    const item = AIPricingSchema.parse(input);
    for (const [id, existing] of this.pricing)
      if (
        existing.providerId === item.providerId &&
        existing.modelId === item.modelId &&
        existing.status === "ACTIVE" &&
        id !== item.id
      )
        this.pricing.set(id, { ...existing, status: "HISTORICAL" });
    this.pricing.set(item.id, structuredClone(item));
    return item;
  }
  listPolicies(ownerId: string) {
    return [...this.policies.values()]
      .filter((item) => item.ownerId === ownerId)
      .map((item) => structuredClone(item));
  }
  upsertPolicy(input: AIBudgetPolicy) {
    const item = AIBudgetPolicySchema.parse(input);
    this.policies.set(item.id, structuredClone(item));
    return item;
  }
  disablePolicy(ownerId: string, id: string) {
    const item = this.policies.get(id);
    if (!item || item.ownerId !== ownerId) return false;
    this.policies.set(id, { ...item, enabled: false });
    return true;
  }
  listReservations(ownerId: string) {
    return [...this.reservations.values()]
      .filter((item) => item.ownerId === ownerId)
      .map((item) => structuredClone(item));
  }
  listLedger(ownerId: string, limit: number) {
    return [...this.ledger.values()]
      .filter((item) => item.ownerId === ownerId)
      .slice(-limit)
      .reverse()
      .map((item) => structuredClone(item));
  }
  async reserveAtomic(input: AtomicReservationInput) {
    let output: AIBudgetReservation | undefined;
    let failure: unknown;
    this.queue = this.queue.then(() => {
      try {
        const duplicate = [...this.reservations.values()].find(
          (item) =>
            item.ownerId === input.reservation.ownerId &&
            item.requestId === input.reservation.requestId &&
            item.attemptId === input.reservation.attemptId,
        );
        if (duplicate) {
          output = structuredClone(duplicate);
          return;
        }
        const policies = this.listPolicies(input.reservation.ownerId).filter((policy) =>
          policyApplies(policy, input.context, input.candidate),
        );
        const reservation = AIBudgetReservationSchema.parse({
          ...input.reservation,
          policyIds: policies.map((item) => item.id),
        });
        assertReservationAllowed({
          policies,
          ledger: this.listLedger(input.reservation.ownerId, 100_000),
          activeReservations: this.listReservations(input.reservation.ownerId).filter(
            (item) =>
              item.status === "ACTIVE" && Date.parse(item.expiresAt) > Date.now(),
          ),
          reservation,
          context: input.context,
          candidate: input.candidate,
        });
        this.reservations.set(reservation.id, structuredClone(reservation));
        output = reservation;
      } catch (error) {
        failure = error;
      }
    });
    await this.queue;
    if (failure)
      throw failure instanceof Error ? failure : new Error("RESERVATION_FAILED");
    if (!output) throw new AIEconomicError("RESERVATION_FAILED", "Reservation failed.");
    return output;
  }
  settleAtomic(input: AtomicSettlementInput) {
    const key = `${input.entry.ownerId}:${input.entry.requestId}:${input.entry.attemptId ?? input.entry.id}`;
    const existing = this.ledger.get(key);
    if (existing) return Promise.resolve(structuredClone(existing));
    if (input.reservationId) {
      const reservation = this.reservations.get(input.reservationId);
      if (!reservation || reservation.ownerId !== input.ownerId)
        throw new AIEconomicError("RESERVATION_FAILED", "Reservation was not found.");
      this.reservations.set(reservation.id, {
        ...reservation,
        status: input.entry.status === "SETTLED" ? "SETTLED" : "RELEASED",
        settledAmountUsd: input.entry.actualCostUsd ?? "0",
      });
    }
    const entry = AIUsageLedgerEntrySchema.parse(input.entry);
    this.ledger.set(key, structuredClone(entry));
    return Promise.resolve(entry);
  }
  release(ownerId: string, reservationId: string) {
    const item = this.reservations.get(reservationId);
    if (!item || item.ownerId !== ownerId) return undefined;
    const released = { ...item, status: "RELEASED" as const, settledAmountUsd: "0" };
    this.reservations.set(item.id, released);
    return released;
  }
  reconcileExpired(now: Date) {
    let count = 0;
    for (const [id, item] of this.reservations)
      if (item.status === "ACTIVE" && Date.parse(item.expiresAt) <= now.getTime()) {
        this.reservations.set(id, { ...item, status: "EXPIRED" });
        count += 1;
      }
    return Promise.resolve(count);
  }
  findActiveReservation(ownerId: string, reservationId: string) {
    const item = this.reservations.get(reservationId);
    return item?.ownerId === ownerId &&
      item.status === "ACTIVE" &&
      Date.parse(item.expiresAt) > Date.now()
      ? structuredClone(item)
      : undefined;
  }

  createOverrideGrant(input: OverrideGrantWithDescriptor) {
    const descriptor = AIEconomicOverrideDescriptorSchema.parse(input.descriptor);
    const grant = AIEconomicOverrideGrantSchema.parse(input.grant);
    if (grant.ownerId !== descriptor.ownerId || grant.requestId !== descriptor.requestId)
      throw new AIEconomicError("OVERRIDE_REQUIRED", "Override grant binding is invalid.");
    this.overrideGrants.set(grant.id, {
      grant: structuredClone(grant),
      descriptor: structuredClone(descriptor),
    });
    return Promise.resolve(structuredClone(grant));
  }

  getOverrideGrant(ownerId: string, grantId: string) {
    const record = this.overrideGrants.get(grantId);
    return Promise.resolve(
      record && record.grant.ownerId === ownerId ? structuredClone(record) : undefined,
    );
  }

  async consumeOverrideGrantWithReservation(input: OverrideGrantReservationInput) {
    let output: AIBudgetReservation | undefined;
    let failure: unknown;
    this.queue = this.queue.then(() => {
      try {
        const record = this.overrideGrants.get(input.grantId);
        if (!record || record.grant.ownerId !== input.ownerId)
          throw new AIEconomicError("OVERRIDE_REQUIRED", "Override grant was not found.");
        if (record.grant.status !== "ACTIVE")
          throw new AIEconomicError("OVERRIDE_REQUIRED", "Override grant was already used or revoked.");
        if (Date.parse(record.grant.expiresAt) <= Date.now()) {
          record.grant = { ...record.grant, status: "EXPIRED" };
          throw new AIEconomicError("OVERRIDE_REQUIRED", "Override grant has expired.");
        }
        if (record.grant.requestId !== input.reservation.requestId ||
            digestEconomicOverride(input.descriptor) !== record.grant.digest)
          throw new AIEconomicError("OVERRIDE_REQUIRED", "Override grant binding does not match this request.");
        if (decimalToUnits(input.reservation.amountUsd) > decimalToUnits(record.grant.maxAdditionalSpendUsd))
          throw new AIEconomicError("OVERRIDE_REQUIRED", "Override grant amount was exceeded.");
        assertOverrideBindings(record.descriptor, input.context, input.candidate);
        const policies = this.listPolicies(input.ownerId).filter((policy) =>
          policyApplies(policy, input.context, input.candidate),
        );
        if (!policies.length) throw new AIEconomicError("OVERRIDE_REQUIRED", "No applicable budget policy exists.");
        const reservation = AIBudgetReservationSchema.parse({
          ...input.reservation,
          policyIds: policies.map((item) => item.id),
        });
        if ([...this.reservations.values()].some((item) => item.ownerId === input.ownerId && item.requestId === reservation.requestId && item.attemptId === reservation.attemptId)) {
          throw new AIEconomicError("OVERRIDE_REQUIRED", "Override reservation already exists.");
        }
        this.reservations.set(reservation.id, structuredClone(reservation));
        record.grant = { ...record.grant, status: "CONSUMED", consumedAt: new Date().toISOString() };
        output = reservation;
      } catch (error) {
        failure = error;
      }
    });
    await this.queue;
    if (failure) throw failure instanceof Error ? failure : new Error("OVERRIDE_REQUIRED");
    if (!output) throw new AIEconomicError("OVERRIDE_REQUIRED", "Override reservation failed.");
    return output;
  }

  expireOverrideGrant(ownerId: string, grantId: string) {
    const record = this.overrideGrants.get(grantId);
    if (!record || record.grant.ownerId !== ownerId) return Promise.resolve(false);
    if (record.grant.status !== "ACTIVE") return Promise.resolve(false);
    record.grant = { ...record.grant, status: "EXPIRED" };
    return Promise.resolve(true);
  }
}

export const assertOverrideBindings = (
  descriptor: AIEconomicOverrideDescriptor,
  context: AIEconomicContext,
  candidate: ReservationCandidate,
) => {
  for (const key of ["agentId", "workflowId", "workflowRunId", "taskId", "costCenter"] as const)
    if (descriptor[key] !== undefined && descriptor[key] !== context[key])
      throw new AIEconomicError("OVERRIDE_REQUIRED", `Override ${key} binding does not match.`);
  if (descriptor.providerId !== undefined && descriptor.providerId !== candidate.providerId)
    throw new AIEconomicError("OVERRIDE_REQUIRED", "Override provider binding does not match.");
  if (descriptor.modelId !== undefined && descriptor.modelId !== candidate.modelId)
    throw new AIEconomicError("OVERRIDE_REQUIRED", "Override model binding does not match.");
};

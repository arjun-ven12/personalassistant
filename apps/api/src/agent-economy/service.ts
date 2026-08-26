import {
  AgentEconomyAccountSchema,
  AgentEconomyDashboardSchema,
  AgentEconomyLedgerEntrySchema,
  AgentEconomyOutcomeSchema,
  AgentEconomyPerformanceSchema,
  AgentEconomyReservationSchema,
  EnrollAgentEconomyRequestSchema,
  type AgentEconomyOutcome,
  type AgentEconomyStatus,
  type EconomyReferenceSet,
} from "@alexa-control/shared";

import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { AgentStore } from "../agents/store.js";
import type { AgentEconomyStore } from "./store.js";

type VerifiedRewardAuthority = "TASK_VERIFIER" | "WORKFLOW_EVALUATOR" | "HUMAN_REVIEWER";
type CostType = Parameters<AgentEconomyStore["reserveAtomic"]>[0]["reservation"]["costType"];

const economyError = (error: unknown): never => {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "ECONOMY_MUTATION_FAILED";
  const status = code === "INSUFFICIENT_ECONOMIC_BUDGET" ? 409 : code.endsWith("NOT_FOUND") ? 404 : 409;
  throw new ExecutionError(status, code, error instanceof Error ? error.message : "Agent economy mutation failed.");
};
const guardedMutation = async <T>(work: () => T | Promise<T>): Promise<T> => {
  try {
    return await work();
  } catch (error) {
    return economyError(error);
  }
};

export class AgentEconomyService {
  constructor(
    readonly store: AgentEconomyStore,
    readonly agentStore: AgentStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async enroll(ownerId: string, agentId: string, body: unknown, requestId: string, ipAddress: string) {
    const agent = await this.requireAgent(ownerId, agentId);
    const existing = await this.store.findAccount(ownerId, agentId);
    if (existing) return existing;
    const input = EnrollAgentEconomyRequestSchema.parse(body);
    const at = this.now().toISOString();
    const account = await this.store.saveAccount(AgentEconomyAccountSchema.parse({
      ownerId,
      agentId: agent.id,
      availableCredits: 0,
      reservedCredits: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
      reputation: 50,
      economyStatus: "DORMANT",
      organizationId: input.organizationId ?? null,
      departmentId: input.departmentId ?? null,
      parentAgentId: input.parentAgentId ?? null,
      memoryScopeId: input.memoryScopeId ?? null,
      capabilityProfileId: input.capabilityProfileId ?? null,
      modelPolicyId: input.modelPolicyId ?? null,
      activationPolicyId: input.activationPolicyId ?? null,
      createdAt: at,
      updatedAt: at,
    }));
    await this.audit({ eventType: "AGENT_ECONOMY_ENROLLED", ownerId, outcome: "SUCCESS", reason: "Owner enrolled an agent in the internal economy without activating runtime resources.", requestId, ipAddress, metadata: { agentId } });
    return account;
  }

  async setStatus(ownerId: string, agentId: string, status: AgentEconomyStatus, requestId: string, ipAddress: string) {
    await this.requireAgent(ownerId, agentId);
    const account = await guardedMutation(() => this.store.setStatus(ownerId, agentId, status, this.now().toISOString()));
    await this.audit({ eventType: "AGENT_ECONOMY_STATUS_CHANGED", ownerId, outcome: "SUCCESS", reason: "Owner changed economic participation state.", requestId, ipAddress, metadata: { agentId, status } });
    return account;
  }

  async allocate(input: { ownerId: string; agentId: string; amount: number; reasonCode: string; idempotencyKey: string; requestId: string; ipAddress: string }) {
    const account = await this.requireAccount(input.ownerId, input.agentId);
    const at = this.now().toISOString();
    const entry = AgentEconomyLedgerEntrySchema.parse({ id: crypto.randomUUID(), ownerId: input.ownerId, agentId: input.agentId, type: "CREDIT_GRANTED", amount: input.amount, reasonCode: input.reasonCode, idempotencyKey: input.idempotencyKey, references: {}, createdAt: at });
    const result = await guardedMutation(() => this.store.creditAtomic({ account, entry }));
    if (!result.duplicate) await this.audit({ eventType: "AGENT_ECONOMY_CREDITS_ALLOCATED", ownerId: input.ownerId, outcome: "SUCCESS", reason: input.reasonCode, requestId: input.requestId, ipAddress: input.ipAddress, metadata: { agentId: input.agentId, amount: input.amount, ledgerEntryId: result.entry.id } });
    return result.account;
  }

  async reserve(input: { ownerId: string; agentId: string; amount: number; costType: CostType; reasonCode: string; idempotencyKey: string; references?: EconomyReferenceSet }) {
    const agent = await this.requireAgent(input.ownerId, input.agentId);
    if (["disabled", "unhealthy", "paused"].includes(agent.status)) throw new ExecutionError(403, "AGENT_LIFECYCLE_BLOCKS_ECONOMY", "The Agent OS lifecycle does not permit new resource reservations.");
    const account = await this.requireAccount(input.ownerId, input.agentId);
    if (account.economyStatus !== "ACTIVE") throw new ExecutionError(403, "AGENT_ECONOMY_NOT_ACTIVE", "The agent is not active in the internal economy.");
    const at = this.now().toISOString();
    const reservation = AgentEconomyReservationSchema.parse({ id: crypto.randomUUID(), ownerId: input.ownerId, agentId: input.agentId, amountReserved: input.amount, amountSettled: 0, status: "ACTIVE", costType: input.costType, idempotencyKey: input.idempotencyKey, references: input.references ?? {}, createdAt: at, updatedAt: at });
    const entry = AgentEconomyLedgerEntrySchema.parse({ id: crypto.randomUUID(), ownerId: input.ownerId, agentId: input.agentId, type: "COST_RESERVED", amount: input.amount, reasonCode: input.reasonCode, idempotencyKey: `reserve:${input.idempotencyKey}`, references: input.references ?? {}, createdAt: at });
    return guardedMutation(() => this.store.reserveAtomic({ account, reservation, entry }));
  }

  async settle(input: { ownerId: string; agentId: string; reservationId: string; actualCost: number; idempotencyKey: string; reasonCode: string; references?: EconomyReferenceSet }) {
    if (input.actualCost === 0) return this.release({ ownerId: input.ownerId, agentId: input.agentId, reservationId: input.reservationId, idempotencyKey: input.idempotencyKey, reasonCode: input.reasonCode });
    const at = this.now().toISOString();
    const entry = AgentEconomyLedgerEntrySchema.parse({ id: crypto.randomUUID(), ownerId: input.ownerId, agentId: input.agentId, type: "COST_SETTLED", amount: input.actualCost, reasonCode: input.reasonCode, idempotencyKey: `settle:${input.idempotencyKey}`, references: input.references ?? {}, createdAt: at });
    return guardedMutation(() => this.store.settleAtomic({ ownerId: input.ownerId, agentId: input.agentId, reservationId: input.reservationId, amount: input.actualCost, entry, updatedAt: at }));
  }

  async release(input: { ownerId: string; agentId: string; reservationId: string; idempotencyKey: string; reasonCode: string }) {
    const reservations = await this.store.listReservations(input.ownerId, input.agentId);
    const reservation = reservations.find((item) => item.id === input.reservationId);
    if (!reservation) throw new ExecutionError(404, "ECONOMY_RESERVATION_NOT_FOUND", "Economy reservation not found.");
    const at = this.now().toISOString();
    const entry = AgentEconomyLedgerEntrySchema.parse({ id: crypto.randomUUID(), ownerId: input.ownerId, agentId: input.agentId, type: "RESERVATION_RELEASED", amount: reservation.amountReserved, reasonCode: input.reasonCode, idempotencyKey: `release:${input.idempotencyKey}`, references: reservation.references, createdAt: at });
    return guardedMutation(() => this.store.releaseAtomic({ ownerId: input.ownerId, agentId: input.agentId, reservationId: input.reservationId, entry, updatedAt: at }));
  }

  async rewardVerified(input: { ownerId: string; agentId: string; amount: number; authority: VerifiedRewardAuthority; outcome: AgentEconomyOutcome; idempotencyKey: string; reasonCode: string }) {
    this.assertRewardAuthority(input.authority);
    const outcome = AgentEconomyOutcomeSchema.parse(input.outcome);
    if (outcome.verificationResult !== "VERIFIED") throw new ExecutionError(403, "UNVERIFIED_REWARD_DENIED", "Only verified outcomes may receive an economic reward.");
    if (!outcome.actualSuccess) throw new ExecutionError(403, "FAILED_OUTCOME_REWARD_DENIED", "A verified failed outcome may affect calibration but cannot earn a success reward.");
    const account = await this.requireAccount(input.ownerId, input.agentId);
    const at = this.now().toISOString();
    const entry = AgentEconomyLedgerEntrySchema.parse({ id: crypto.randomUUID(), ownerId: input.ownerId, agentId: input.agentId, type: "REWARD_EARNED", amount: input.amount, reasonCode: `${input.authority}:${input.reasonCode}`, idempotencyKey: `reward:${input.idempotencyKey}`, references: { taskId: outcome.taskId }, createdAt: at });
    const result = await guardedMutation(() => this.store.creditAtomic({ account, entry }));
    if (!result.duplicate) {
      await this.recordOutcome(input.ownerId, input.agentId, outcome);
      await this.audit({ eventType: "AGENT_ECONOMY_REWARD_GRANTED", ownerId: input.ownerId, outcome: "SUCCESS", reason: input.reasonCode, requestId: input.idempotencyKey, ipAddress: "internal", metadata: { agentId: input.agentId, amount: input.amount, taskId: outcome.taskId } });
    }
    return result;
  }

  async distributeVerifiedReward(input: {
    ownerId: string;
    totalAmount: number;
    authority: VerifiedRewardAuthority;
    idempotencyKey: string;
    reasonCode: string;
    contributions: Array<{ agentId: string; weight: number; outcome: AgentEconomyOutcome }>;
  }) {
    this.assertRewardAuthority(input.authority);
    if (input.contributions.length === 0)
      throw new ExecutionError(400, "EMPTY_CONTRIBUTION_SET", "At least one verified contribution is required.");
    const weightTotal = input.contributions.reduce((sum, item) => sum + item.weight, 0);
    if (!Number.isFinite(weightTotal) || weightTotal <= 0)
      throw new ExecutionError(400, "INVALID_CONTRIBUTION_WEIGHTS", "Contribution weights must be positive.");
    await Promise.all(input.contributions.map(async (item) => {
      if (item.weight <= 0) throw new ExecutionError(400, "INVALID_CONTRIBUTION_WEIGHTS", "Contribution weights must be positive.");
      AgentEconomyOutcomeSchema.parse(item.outcome);
      await this.requireAccount(input.ownerId, item.agentId);
    }));
    let remaining = input.totalAmount;
    const results = [];
    for (const [index, contribution] of input.contributions.entries()) {
      const amount = index === input.contributions.length - 1
        ? remaining
        : Math.floor((input.totalAmount * contribution.weight) / weightTotal);
      remaining -= amount;
      if (amount === 0) continue;
      results.push(await this.rewardVerified({
        ownerId: input.ownerId,
        agentId: contribution.agentId,
        amount,
        authority: input.authority,
        outcome: contribution.outcome,
        idempotencyKey: `${input.idempotencyKey}:${contribution.agentId}`,
        reasonCode: input.reasonCode,
      }));
    }
    return results;
  }

  async penalize(input: { ownerId: string; agentId: string; amount: number; authority: VerifiedRewardAuthority; idempotencyKey: string; reasonCode: "BUSINESS_FAILURE" | "SECURITY_VIOLATION"; outcome?: AgentEconomyOutcome }) {
    this.assertRewardAuthority(input.authority);
    const verifiedOutcome = input.outcome
      ? AgentEconomyOutcomeSchema.parse(input.outcome)
      : undefined;
    if (verifiedOutcome?.verificationResult !== undefined && verifiedOutcome.verificationResult !== "VERIFIED")
      throw new ExecutionError(403, "UNVERIFIED_PENALTY_DENIED", "Only a verified outcome may affect performance calibration.");
    const account = await this.requireAccount(input.ownerId, input.agentId);
    if (account.availableCredits === 0) return { account, entry: null, duplicate: false };
    const at = this.now().toISOString();
    const entry = AgentEconomyLedgerEntrySchema.parse({ id: crypto.randomUUID(), ownerId: input.ownerId, agentId: input.agentId, type: "PENALTY", amount: Math.min(input.amount, account.availableCredits), reasonCode: `${input.authority}:${input.reasonCode}`, idempotencyKey: `penalty:${input.idempotencyKey}`, references: {}, createdAt: at });
    const result = await guardedMutation(() => this.store.penalizeAtomic({ account, entry }));
    if (!result.duplicate) {
      if (verifiedOutcome) await this.recordOutcome(input.ownerId, input.agentId, verifiedOutcome);
      await this.audit({ eventType: "AGENT_ECONOMY_PENALTY_APPLIED", ownerId: input.ownerId, outcome: "SUCCESS", reason: input.reasonCode, requestId: input.idempotencyKey, ipAddress: "internal", metadata: { agentId: input.agentId, amount: result.entry.amount } });
    }
    return result;
  }

  async reconstructBalance(ownerId: string, agentId: string) {
    await this.requireAccount(ownerId, agentId);
    const [ledger, reservations] = await Promise.all([
      this.store.listLedger(ownerId, 100_000),
      this.store.listReservations(ownerId, agentId),
    ]);
    const entries = ledger.filter((entry) => entry.agentId === agentId);
    const totalEarned = entries
      .filter((entry) => ["CREDIT_GRANTED", "REWARD_EARNED", "ADJUSTMENT"].includes(entry.type))
      .reduce((sum, entry) => sum + entry.amount, 0);
    const totalSpent = entries
      .filter((entry) => ["COST_SETTLED", "PENALTY"].includes(entry.type))
      .reduce((sum, entry) => sum + entry.amount, 0);
    const reserved = reservations
      .filter((reservation) => reservation.status === "ACTIVE")
      .reduce((sum, reservation) => sum + reservation.amountReserved, 0);
    return { availableCredits: totalEarned - totalSpent - reserved, reservedCredits: reserved, lifetimeEarned: totalEarned, lifetimeSpent: totalSpent };
  }

  normalizedCost(input: { kind: CostType; externalCostUsd?: number; totalTokens?: number; runtimeMs?: number }) {
    if (input.kind === "MODEL_INFERENCE") return Math.max(1, Math.ceil((input.externalCostUsd ?? 0) * 1_000));
    if (input.kind === "LOCAL_INFERENCE") return Math.max(1, Math.ceil((input.runtimeMs ?? 0) / 1_000));
    if (input.totalTokens) return Math.max(1, Math.ceil(input.totalTokens / 1_000));
    return Math.max(1, Math.ceil((input.runtimeMs ?? 1_000) / 1_000));
  }

  async reserveProviderCost(input: {
    ownerId: string;
    agentId: string;
    providerRequestId: string;
    estimatedCostUsd?: string;
    estimatedTokens: number;
    locality: "LOCAL" | "REMOTE";
    workflowId?: string;
    taskId?: string;
  }) {
    const account = await this.store.findAccount(input.ownerId, input.agentId);
    if (!account) return undefined;
    const amount = this.normalizedCost({
      kind: input.locality === "LOCAL" ? "LOCAL_INFERENCE" : "MODEL_INFERENCE",
      ...(input.estimatedCostUsd
        ? { externalCostUsd: Number(input.estimatedCostUsd) }
        : { totalTokens: input.estimatedTokens }),
    });
    const reserved = await this.reserve({
      ownerId: input.ownerId,
      agentId: input.agentId,
      amount,
      costType: input.locality === "LOCAL" ? "LOCAL_INFERENCE" : "MODEL_INFERENCE",
      reasonCode: "AI_PROVIDER_ESTIMATE",
      idempotencyKey: `provider:${input.providerRequestId}`,
      references: {
        providerRequestId: input.providerRequestId,
        ...(input.workflowId ? { workflowId: input.workflowId } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
      },
    });
    return reserved.reservation.id;
  }

  async settleProviderCost(input: {
    ownerId: string;
    agentId: string;
    reservationId: string;
    providerRequestId: string;
    actualCostUsd?: string;
    totalTokens?: number;
    locality: "LOCAL" | "REMOTE";
  }) {
    const actualCost = this.normalizedCost({
      kind: input.locality === "LOCAL" ? "LOCAL_INFERENCE" : "MODEL_INFERENCE",
      ...(input.actualCostUsd
        ? { externalCostUsd: Number(input.actualCostUsd) }
        : { totalTokens: input.totalTokens ?? 0 }),
    });
    await this.settle({
      ownerId: input.ownerId,
      agentId: input.agentId,
      reservationId: input.reservationId,
      actualCost,
      idempotencyKey: `provider:${input.providerRequestId}`,
      reasonCode: "AI_PROVIDER_ACTUAL",
      references: { providerRequestId: input.providerRequestId },
    });
  }

  async releaseProviderCost(input: {
    ownerId: string;
    agentId: string;
    reservationId: string;
    providerRequestId: string;
  }) {
    await this.release({
      ownerId: input.ownerId,
      agentId: input.agentId,
      reservationId: input.reservationId,
      idempotencyKey: `provider:${input.providerRequestId}:failed`,
      reasonCode: "AI_PROVIDER_NOT_COMPLETED",
    });
  }

  async dashboard(ownerId: string) {
    const [accounts, ledger, performance, registeredAgents] = await Promise.all([this.store.listAccounts(ownerId), this.store.listLedger(ownerId, 500), this.store.listPerformance(ownerId), this.agentStore.listAgents(ownerId)]);
    const reputationTotal = accounts.reduce((sum, account) => sum + account.reputation, 0);
    return AgentEconomyDashboardSchema.parse({
      overview: {
        allocatedCredits: accounts.reduce((sum, account) => sum + account.lifetimeEarned, 0),
        availableCredits: accounts.reduce((sum, account) => sum + account.availableCredits, 0),
        reservedCredits: accounts.reduce((sum, account) => sum + account.reservedCredits, 0),
        spentCredits: accounts.reduce((sum, account) => sum + account.lifetimeSpent, 0),
        economyEnabledAgents: accounts.filter((account) => account.economyStatus !== "ECONOMY_DISABLED").length,
        activeAgents: accounts.filter((account) => account.economyStatus === "ACTIVE").length,
        dormantAgents: accounts.filter((account) => account.economyStatus === "DORMANT").length,
        suspendedAgents: accounts.filter((account) => account.economyStatus === "SUSPENDED").length,
        averageReputation: accounts.length ? reputationTotal / accounts.length : 0,
        settledTasks: performance.reduce((sum, record) => sum + record.tasksCompleted, 0),
      },
      accounts,
      performance,
      ledger,
      registeredAgents: registeredAgents.length,
      runtimeActivationsFromRegistration: 0,
      creditsGrantAuthority: "OWNER_OR_GOVERNED_SERVICE",
      creditsCanBuyAuthority: false,
      creditsCanBuyReputation: false,
    });
  }

  private async recordOutcome(ownerId: string, agentId: string, raw: AgentEconomyOutcome) {
    const outcome = AgentEconomyOutcomeSchema.parse(raw);
    const prior = await this.store.findPerformance(ownerId, agentId);
    const attempted = (prior?.tasksAttempted ?? 0) + 1;
    const successes = (prior?.verifiedSuccesses ?? 0) + (outcome.actualSuccess ? 1 : 0);
    const failures = (prior?.verifiedFailures ?? 0) + (outcome.actualSuccess ? 0 : 1);
    const totalQuality = (prior?.totalQualityScore ?? 0) + outcome.qualityScore;
    const brier = (outcome.predictedSuccessProbability - (outcome.actualSuccess ? 1 : 0)) ** 2;
    const totalBrier = (prior?.totalBrierScore ?? 0) + brier;
    const totalCost = (prior?.totalActualCost ?? 0) + outcome.actualCost;
    const equivalentValue = (prior?.totalEquivalentOutcomeValue ?? 0) + Math.round(outcome.qualityScore * 100);
    const successRate = successes / attempted;
    const averageQuality = totalQuality / attempted;
    const calibration = Math.max(0, 1 - totalBrier / attempted);
    const costEfficiency = totalCost === 0 ? equivalentValue : equivalentValue / totalCost;
    const reputation = Math.max(0, Math.min(100, 50 * successRate + 25 * averageQuality + 15 * calibration + 10 * Math.min(1, costEfficiency)));
    const at = this.now().toISOString();
    await this.store.savePerformance(AgentEconomyPerformanceSchema.parse({ ownerId, agentId, tasksAttempted: attempted, tasksCompleted: attempted, verifiedSuccesses: successes, verifiedFailures: failures, totalQualityScore: totalQuality, totalPredictedProbability: (prior?.totalPredictedProbability ?? 0) + outcome.predictedSuccessProbability, totalBrierScore: totalBrier, totalActualCost: totalCost, totalEquivalentOutcomeValue: equivalentValue, calibration, costEfficiency, updatedAt: at }));
    const account = await this.requireAccount(ownerId, agentId);
    await this.store.updateAccount(AgentEconomyAccountSchema.parse({ ...account, reputation, updatedAt: at }));
  }

  private async requireAgent(ownerId: string, agentId: string) {
    const agent = await this.agentStore.findAgent(ownerId, agentId);
    if (!agent) throw new ExecutionError(404, "AGENT_NOT_FOUND", "Agent not found.");
    return agent;
  }

  private assertRewardAuthority(authority: string): asserts authority is VerifiedRewardAuthority {
    if (!["TASK_VERIFIER", "WORKFLOW_EVALUATOR", "HUMAN_REVIEWER"].includes(authority))
      throw new ExecutionError(403, "SELF_REWARD_DENIED", "Agents cannot issue their own rewards or penalties.");
  }

  private async requireAccount(ownerId: string, agentId: string) {
    await this.requireAgent(ownerId, agentId);
    const account = await this.store.findAccount(ownerId, agentId);
    if (!account) throw new ExecutionError(404, "ECONOMY_ACCOUNT_NOT_FOUND", "Agent economy account not found.");
    return account;
  }
}

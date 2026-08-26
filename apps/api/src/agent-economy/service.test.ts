import { describe, expect, it, vi } from "vitest";

import { InMemoryAgentStore } from "../agents/store.js";
import { InMemoryAgentEconomyStore } from "./store.js";
import { AgentEconomyService } from "./service.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherOwnerId = "22222222-2222-4222-8222-222222222222";

const addAgent = (store: InMemoryAgentStore, id: string, owner = ownerId, status: "available" | "paused" = "available") => {
  const at = new Date().toISOString();
  store.upsertAgent({ schemaVersion: "1", id, ownerId: owner, role: "coding", displayName: id, version: "1", status, capabilities: ["code.review"], supportedTasks: ["task.review"], configuration: {}, createdAt: at, updatedAt: at, healthSummary: "Registered without a dedicated runtime." });
};

const setup = () => {
  const agents = new InMemoryAgentStore();
  const store = new InMemoryAgentEconomyStore();
  const audit = vi.fn();
  const service = new AgentEconomyService(store, agents, audit);
  addAgent(agents, "agent_a");
  addAgent(agents, "agent_b");
  return { agents, store, service, audit };
};

const activateFunded = async (service: AgentEconomyService, agentId = "agent_a", amount = 100) => {
  await service.enroll(ownerId, agentId, {}, "request-enroll", "127.0.0.1");
  await service.allocate({ ownerId, agentId, amount, reasonCode: "TEST_ALLOCATION", idempotencyKey: `allocate:${agentId}:${amount}`, requestId: "request-allocate", ipAddress: "127.0.0.1" });
  await service.setStatus(ownerId, agentId, "ACTIVE", "request-status", "127.0.0.1");
};

describe("AgentEconomyService", () => {
  it("enrolls 250 dormant agents without runtime or provider activation", async () => {
    const { agents, service } = setup();
    for (let index = 0; index < 250; index += 1) addAgent(agents, `dormant_${index}`);
    await Promise.all(Array.from({ length: 250 }, (_, index) => service.enroll(ownerId, `dormant_${index}`, {}, `request-${index}`, "127.0.0.1")));
    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.overview.dormantAgents).toBe(250);
    expect(dashboard.runtimeActivationsFromRegistration).toBe(0);
    expect(dashboard.accounts.every((account) => account.availableCredits === 0 && account.economyStatus === "DORMANT")).toBe(true);
  });

  it("uses an idempotent ledger for owner allocations", async () => {
    const { service } = setup();
    await service.enroll(ownerId, "agent_a", {}, "request-enroll", "127.0.0.1");
    const input = { ownerId, agentId: "agent_a", amount: 40, reasonCode: "OWNER_ALLOCATION", idempotencyKey: "allocation:stable", requestId: "request", ipAddress: "127.0.0.1" };
    await service.allocate(input);
    await service.allocate(input);
    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.overview.availableCredits).toBe(40);
    expect(dashboard.ledger).toHaveLength(1);
  });

  it("prevents concurrent double spending", async () => {
    const { service } = setup();
    await activateFunded(service, "agent_a", 10);
    const results = await Promise.allSettled([
      service.reserve({ ownerId, agentId: "agent_a", amount: 8, costType: "TASK_EXECUTION", reasonCode: "TASK", idempotencyKey: "reserve:first" }),
      service.reserve({ ownerId, agentId: "agent_a", amount: 8, costType: "TASK_EXECUTION", reasonCode: "TASK", idempotencyKey: "reserve:second" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await service.dashboard(ownerId)).overview.reservedCredits).toBe(8);
  });

  it("reserves, settles actual cost, and releases the remainder", async () => {
    const { service } = setup();
    await activateFunded(service);
    const reserved = await service.reserve({ ownerId, agentId: "agent_a", amount: 20, costType: "MODEL_INFERENCE", reasonCode: "MODEL_ESTIMATE", idempotencyKey: "provider:req-1", references: { providerRequestId: "req-1" } });
    await service.settle({ ownerId, agentId: "agent_a", reservationId: reserved.reservation.id, actualCost: 14, idempotencyKey: "provider:req-1", reasonCode: "MODEL_ACTUAL", references: { providerRequestId: "req-1" } });
    const account = (await service.dashboard(ownerId)).accounts[0]!;
    expect(account.availableCredits).toBe(86);
    expect(account.reservedCredits).toBe(0);
    expect(account.lifetimeSpent).toBe(14);
    expect(await service.reconstructBalance(ownerId, "agent_a")).toEqual({ availableCredits: 86, reservedCredits: 0, lifetimeEarned: 100, lifetimeSpent: 14 });
  });

  it("denies self reward and exposes no authority-purchase operation", async () => {
    const { service } = setup();
    await activateFunded(service);
    await expect(service.rewardVerified({ ownerId, agentId: "agent_a", amount: 10, authority: "AGENT" as never, idempotencyKey: "reward:self", reasonCode: "SELF", outcome: { taskId: "task-1", predictedSuccessProbability: 0.8, estimatedCost: 4, estimatedDurationMs: 100, actualSuccess: true, actualCost: 3, actualDurationMs: 90, qualityScore: 0.9, verificationResult: "VERIFIED", evidenceRefs: ["review-1"] } })).rejects.toMatchObject({ code: "SELF_REWARD_DENIED" });
    expect("purchaseAuthority" in service).toBe(false);
    expect("purchaseReputation" in service).toBe(false);
    await expect(service.rewardVerified({ ownerId, agentId: "agent_a", amount: 10, authority: "TASK_VERIFIER", idempotencyKey: "reward:failed", reasonCode: "FAILED", outcome: { taskId: "failed-task", predictedSuccessProbability: 0.9, estimatedCost: 2, estimatedDurationMs: 100, actualSuccess: false, actualCost: 2, actualDurationMs: 100, qualityScore: 0.2, verificationResult: "VERIFIED", evidenceRefs: ["review-failed"] } })).rejects.toMatchObject({ code: "FAILED_OUTCOME_REWARD_DENIED" });
  });

  it("rewards a duplicate verified callback only once and updates calibration", async () => {
    const { service } = setup();
    await activateFunded(service);
    const input = { ownerId, agentId: "agent_a", amount: 20, authority: "TASK_VERIFIER" as const, idempotencyKey: "task:verified-1", reasonCode: "VERIFIED_TASK", outcome: { taskId: "task-1", predictedSuccessProbability: 0.7, estimatedCost: 5, estimatedDurationMs: 100, actualSuccess: true, actualCost: 4, actualDurationMs: 90, qualityScore: 0.9, verificationResult: "VERIFIED" as const, evidenceRefs: ["review-1"] } };
    await service.rewardVerified(input);
    await service.rewardVerified(input);
    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.accounts[0]?.availableCredits).toBe(120);
    expect(dashboard.performance[0]?.tasksAttempted).toBe(1);
    expect(dashboard.performance[0]?.calibration).toBeCloseTo(0.91);
  });

  it("keeps owners and agents isolated", async () => {
    const { agents, service } = setup();
    addAgent(agents, "other_agent", otherOwnerId);
    await service.enroll(otherOwnerId, "other_agent", {}, "request-other", "127.0.0.1");
    await expect(service.allocate({ ownerId, agentId: "other_agent", amount: 10, reasonCode: "BAD_SCOPE", idempotencyKey: "allocation:other", requestId: "request", ipAddress: "127.0.0.1" })).rejects.toMatchObject({ code: "AGENT_NOT_FOUND" });
    expect((await service.dashboard(ownerId)).accounts).toHaveLength(0);
  });

  it("blocks reservations when Agent OS lifecycle is paused", async () => {
    const { agents, service } = setup();
    addAgent(agents, "paused_agent", ownerId, "paused");
    await activateFunded(service, "paused_agent");
    await expect(service.reserve({ ownerId, agentId: "paused_agent", amount: 1, costType: "TASK_EXECUTION", reasonCode: "TASK", idempotencyKey: "reserve:paused" })).rejects.toMatchObject({ code: "AGENT_LIFECYCLE_BLOCKS_ECONOMY" });
  });

  it("scores calibrated predictions above overconfident failures", async () => {
    const { service } = setup();
    await activateFunded(service, "agent_a");
    await activateFunded(service, "agent_b");
    for (let index = 0; index < 10; index += 1) {
      const aOutcome = { taskId: `a-task-${index}`, predictedSuccessProbability: 0.95, estimatedCost: 2, estimatedDurationMs: 100, actualSuccess: index < 5, actualCost: 2, actualDurationMs: 100, qualityScore: 0.7, verificationResult: "VERIFIED" as const, evidenceRefs: [`a-review-${index}`] };
      const bOutcome = { taskId: `b-task-${index}`, predictedSuccessProbability: 0.7, estimatedCost: 2, estimatedDurationMs: 100, actualSuccess: index < 7, actualCost: 2, actualDurationMs: 100, qualityScore: 0.7, verificationResult: "VERIFIED" as const, evidenceRefs: [`b-review-${index}`] };
      if (aOutcome.actualSuccess) await service.rewardVerified({ ownerId, agentId: "agent_a", amount: 1, authority: "TASK_VERIFIER", idempotencyKey: `a:${index}`, reasonCode: "CALIBRATION", outcome: aOutcome });
      else await service.penalize({ ownerId, agentId: "agent_a", amount: 1, authority: "TASK_VERIFIER", idempotencyKey: `a:${index}`, reasonCode: "BUSINESS_FAILURE", outcome: aOutcome });
      if (bOutcome.actualSuccess) await service.rewardVerified({ ownerId, agentId: "agent_b", amount: 1, authority: "TASK_VERIFIER", idempotencyKey: `b:${index}`, reasonCode: "CALIBRATION", outcome: bOutcome });
      else await service.penalize({ ownerId, agentId: "agent_b", amount: 1, authority: "TASK_VERIFIER", idempotencyKey: `b:${index}`, reasonCode: "BUSINESS_FAILURE", outcome: bOutcome });
    }
    const dashboard = await service.dashboard(ownerId);
    const a = dashboard.performance.find((record) => record.agentId === "agent_a")!;
    const b = dashboard.performance.find((record) => record.agentId === "agent_b")!;
    expect(b.calibration).toBeGreaterThan(a.calibration);
  });

  it("maps provider, workflow, skill, task, and local runtime costs consistently", () => {
    const { service } = setup();
    expect(service.normalizedCost({ kind: "MODEL_INFERENCE", externalCostUsd: 0.004 })).toBe(4);
    expect(service.normalizedCost({ kind: "LOCAL_INFERENCE", runtimeMs: 2_200 })).toBe(3);
    expect(service.normalizedCost({ kind: "WORKFLOW_EXECUTION", runtimeMs: 1_200 })).toBe(2);
    expect(service.normalizedCost({ kind: "SKILL_EXECUTION", totalTokens: 1_400 })).toBe(2);
    expect(service.normalizedCost({ kind: "TASK_EXECUTION", runtimeMs: 400 })).toBe(1);
  });

  it("attributes a provider request through reserve and settlement", async () => {
    const { service } = setup();
    await activateFunded(service);
    const reservationId = await service.reserveProviderCost({ ownerId, agentId: "agent_a", providerRequestId: "provider-request-1", estimatedCostUsd: "0.010", estimatedTokens: 2_000, locality: "REMOTE", taskId: "task-1" });
    expect(reservationId).toBeTruthy();
    await service.settleProviderCost({ ownerId, agentId: "agent_a", reservationId: reservationId!, providerRequestId: "provider-request-1", actualCostUsd: "0.006", totalTokens: 1_100, locality: "REMOTE" });
    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.accounts[0]?.lifetimeSpent).toBe(6);
    expect(dashboard.ledger.some((entry) => entry.references.providerRequestId === "provider-request-1")).toBe(true);
  });

  it("distributes one bounded reward across contributors without inflation", async () => {
    const { service } = setup();
    await activateFunded(service, "agent_a", 10);
    await activateFunded(service, "agent_b", 10);
    const outcome = (agent: string) => ({ taskId: `shared-${agent}`, predictedSuccessProbability: 0.8, estimatedCost: 4, estimatedDurationMs: 100, actualSuccess: true, actualCost: 4, actualDurationMs: 90, qualityScore: 0.9, verificationResult: "VERIFIED" as const, evidenceRefs: [`review-${agent}`] });
    await service.distributeVerifiedReward({ ownerId, totalAmount: 100, authority: "WORKFLOW_EVALUATOR", idempotencyKey: "shared:task-1", reasonCode: "SHARED_RESULT", contributions: [{ agentId: "agent_a", weight: 3, outcome: outcome("a") }, { agentId: "agent_b", weight: 1, outcome: outcome("b") }] });
    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.overview.availableCredits).toBe(120);
    expect(dashboard.ledger.filter((entry) => entry.type === "REWARD_EARNED").reduce((sum, entry) => sum + entry.amount, 0)).toBe(100);
  });

  it("runs a deterministic 30-task economy simulation without rewarding activity", async () => {
    const { agents, service } = setup();
    for (const agentId of ["agent_c", "agent_d", "agent_e"]) addAgent(agents, agentId);
    for (const agentId of ["agent_a", "agent_b", "agent_c", "agent_d", "agent_e"]) await activateFunded(service, agentId, 100);
    const agentIds = ["agent_a", "agent_b", "agent_c", "agent_d", "agent_e"];
    for (let index = 0; index < 30; index += 1) {
      const agentId = agentIds[index % agentIds.length]!;
      const cost = 2 + (index % 4);
      const reserved = await service.reserve({ ownerId, agentId, amount: cost + 2, costType: "TASK_EXECUTION", reasonCode: "SIM_TASK", idempotencyKey: `simulation:reserve:${index}`, references: { taskId: `simulation-${index}` } });
      await service.settle({ ownerId, agentId, reservationId: reserved.reservation.id, actualCost: cost, idempotencyKey: `simulation:settle:${index}`, reasonCode: "SIM_TASK_ACTUAL", references: { taskId: `simulation-${index}` } });
      const outcome = { taskId: `simulation-${index}`, predictedSuccessProbability: 0.6 + (index % 3) * 0.1, estimatedCost: cost + 2, estimatedDurationMs: 100, actualSuccess: index % 5 !== 0, actualCost: cost, actualDurationMs: 80 + index, qualityScore: index % 5 === 0 ? 0.4 : 0.8, verificationResult: "VERIFIED" as const, evidenceRefs: [`simulation-review-${index}`] };
      if (outcome.actualSuccess) await service.rewardVerified({ ownerId, agentId, amount: 5, authority: "TASK_VERIFIER", idempotencyKey: `simulation:reward:${index}`, reasonCode: "SIM_VERIFIED", outcome });
      else await service.penalize({ ownerId, agentId, amount: 1, authority: "TASK_VERIFIER", idempotencyKey: `simulation:penalty:${index}`, reasonCode: "BUSINESS_FAILURE", outcome });
    }
    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.performance.reduce((sum, item) => sum + item.tasksAttempted, 0)).toBe(30);
    expect(dashboard.overview.reservedCredits).toBe(0);
    expect(dashboard.ledger.some((entry) => entry.reasonCode.includes("message"))).toBe(false);
  });
});

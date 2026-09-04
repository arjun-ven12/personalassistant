import { GovernorProposalSchema, type GovernorProposal } from "@alexa-control/shared";
import { describe, expect, it, vi } from "vitest";

import { GovernorProposalWorker } from "./governor-proposal-worker.js";
import { InMemoryObservabilityStore } from "./store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000001";
const at = "2026-09-03T00:00:00.000Z";
const proposal = (index: number): GovernorProposal => GovernorProposalSchema.parse({
  id: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  ownerId, companyId, portfolioObjectiveId: null,
  sourceGovernorId: "portfolio_coordinator",
  targetGovernorAssignmentId: "40000000-0000-4000-8000-000000000001",
  proposalType: "RESOURCE_REQUEST", status: "DELIVERED",
  revisions: [{
    version: 1, proposedBy: "PORTFOLIO",
    terms: { requestedOutcome: `Outcome ${index}`, targetValue: null, unit: null,
      budgetCredits: 0, deadline: null, constraints: [] },
    reasonCode: "PORTFOLIO_PROPOSED", explanation: null, createdAt: at,
  }],
  maxCounterproposalRounds: 2, idempotencyKey: `governor-proposal-worker-${String(index).padStart(4, "0")}`,
  companyObjectiveId: null, createdAt: at, updatedAt: at,
  expiresAt: "2026-09-04T00:00:00.000Z", decisionIdempotencyKeys: [],
});

describe("Phase 25.8HF Governor proposal durable workload", () => {
  it("lets multiple workers claim 20 proposals exactly once without per-company workers", async () => {
    const store = new InMemoryObservabilityStore();
    for (let index = 1; index <= 20; index += 1) store.saveGovernorProposal(proposal(index));
    const evaluated = new Set<string>();
    const evaluateClaimedGovernorProposal = vi.fn((item: GovernorProposal) => {
      expect(evaluated.has(item.id)).toBe(false);
      evaluated.add(item.id);
      const settled = GovernorProposalSchema.parse({
        ...item, status: "ACCEPTED", leaseOwner: null, leaseAcquiredAt: null,
        leaseExpiresAt: null, updatedAt: at,
      });
      store.saveGovernorProposal(settled);
      return Promise.resolve(settled);
    });
    const portfolio = { evaluateClaimedGovernorProposal } as never;
    const workerA = new GovernorProposalWorker(store, portfolio, "worker-a", { leaseMs: 30_000, limit: 10 }, () => new Date(at));
    const workerB = new GovernorProposalWorker(store, portfolio, "worker-b", { leaseMs: 30_000, limit: 10 }, () => new Date(at));
    await Promise.all([workerA.tick(), workerB.tick()]);
    expect(evaluated.size).toBe(20);
    expect(evaluateClaimedGovernorProposal).toHaveBeenCalledTimes(20);
    expect(store.listGovernorProposals(ownerId).every((item) => item.status === "ACCEPTED")).toBe(true);
  });

  it("recovers an expired lease after restart and refuses an active duplicate claim", () => {
    const store = new InMemoryObservabilityStore();
    store.saveGovernorProposal(proposal(99));
    const first = store.claimGovernorProposals({ workerId: "worker-a", now: at, leaseMs: 1_000, limit: 1 });
    expect(first).toHaveLength(1);
    expect(store.claimGovernorProposals({ workerId: "worker-b", now: "2026-09-03T00:00:00.500Z", leaseMs: 1_000, limit: 1 })).toHaveLength(0);
    const recovered = store.claimGovernorProposals({ workerId: "worker-b", now: "2026-09-03T00:00:01.001Z", leaseMs: 1_000, limit: 1 });
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.leaseGeneration).toBe(2);
    expect(recovered[0]?.attemptCount).toBe(2);
  });

  it("never claims expired proposals", () => {
    const store = new InMemoryObservabilityStore();
    store.saveGovernorProposal(GovernorProposalSchema.parse({ ...proposal(100), expiresAt: at }));
    expect(store.claimGovernorProposals({ workerId: "worker-a", now: at, leaseMs: 1_000, limit: 1 })).toHaveLength(0);
  });

  it("releases a failed evaluation for retry instead of losing the proposal", async () => {
    const store = new InMemoryObservabilityStore();
    store.saveGovernorProposal(proposal(101));
    const portfolio = {
      evaluateClaimedGovernorProposal: () => Promise.reject(new Error("transient failure")),
    } as never;
    const worker = new GovernorProposalWorker(store, portfolio, "worker-a", { leaseMs: 1_000, limit: 1 }, () => new Date(at));
    const results = await worker.tick();
    expect(results[0]?.status).toBe("rejected");
    expect(store.findGovernorProposal(ownerId, proposal(101).id)).toMatchObject({
      status: "DELIVERED", leaseOwner: null, leaseExpiresAt: null, attemptCount: 1,
    });
  });
});

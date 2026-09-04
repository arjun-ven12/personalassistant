import type { GovernorProposal } from "@alexa-control/shared";

import type { BoundedSchedulerWorkload } from "../durable-execution/scheduler.js";
import type { OwnerPortfolioObservabilityService } from "./service.js";
import type { ObservabilityStore } from "./store.js";

/** Bounded auxiliary workload owned by the existing durable scheduler. */
export class GovernorProposalWorker implements BoundedSchedulerWorkload {
  constructor(
    readonly store: ObservabilityStore,
    readonly portfolio: OwnerPortfolioObservabilityService,
    readonly workerId: string,
    readonly options = { leaseMs: 30_000, limit: 20 },
    readonly now = () => new Date(),
  ) {}

  async tick() {
    const claimed = await this.store.claimGovernorProposals({
      workerId: this.workerId, now: this.now().toISOString(),
      leaseMs: this.options.leaseMs, limit: this.options.limit,
    });
    return Promise.allSettled(claimed.map((proposal) => this.runWithHeartbeat(proposal)));
  }

  private async runWithHeartbeat(proposal: GovernorProposal) {
    const heartbeat = setInterval(() => {
      void this.store.renewGovernorProposalLease({
        ownerId: proposal.ownerId, proposalId: proposal.id, workerId: this.workerId,
        now: this.now().toISOString(), leaseMs: this.options.leaseMs,
      });
    }, Math.max(250, Math.floor(this.options.leaseMs / 3)));
    heartbeat.unref();
    try {
      return await this.portfolio.evaluateClaimedGovernorProposal(proposal, this.workerId);
    } catch (error) {
      await this.store.releaseGovernorProposalLease(proposal.ownerId, proposal.id, this.workerId);
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }
}

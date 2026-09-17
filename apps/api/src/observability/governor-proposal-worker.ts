import type { GovernorProposal } from "@alexa-control/shared";

import type { BoundedSchedulerWorkload } from "../durable-execution/scheduler.js";
import type { OwnerPortfolioObservabilityService } from "./service.js";
import type { ObservabilityStore } from "./store.js";

/** Bounded auxiliary workload owned by the existing durable scheduler. */
export class GovernorProposalWorker implements BoundedSchedulerWorkload {
  readonly metrics = { renewalFailures: 0 };
  constructor(
    readonly store: ObservabilityStore,
    readonly portfolio: OwnerPortfolioObservabilityService,
    readonly workerId: string,
    readonly options = { leaseMs: 30_000, limit: 20 },
    readonly now = () => new Date(),
  ) {}

  async tick() {
    const claimed = await this.store.claimGovernorProposals({
      workerId: this.workerId,
      now: this.now().toISOString(),
      leaseMs: this.options.leaseMs,
      limit: this.options.limit,
    });
    return Promise.allSettled(
      claimed.map((proposal) => this.runWithHeartbeat(proposal)),
    );
  }

  private async runWithHeartbeat(proposal: GovernorProposal) {
    let renewing = false;
    const controller = new AbortController();
    const heartbeat = setInterval(
      () => {
        if (renewing) return;
        renewing = true;
        void Promise.resolve()
          .then(() =>
            this.store.renewGovernorProposalLease({
              ownerId: proposal.ownerId,
              proposalId: proposal.id,
              workerId: this.workerId,
              leaseGeneration: proposal.leaseGeneration,
              now: this.now().toISOString(),
              leaseMs: this.options.leaseMs,
            }),
          )
          .then((lease) => {
            if (!lease) {
              this.metrics.renewalFailures += 1;
              controller.abort();
              clearInterval(heartbeat);
            }
          })
          .catch(() => {
            this.metrics.renewalFailures += 1;
            controller.abort();
            clearInterval(heartbeat);
          })
          .finally(() => {
            renewing = false;
          });
      },
      Math.max(250, Math.floor(this.options.leaseMs / 3)),
    );
    heartbeat.unref();
    try {
      return await this.portfolio.evaluateClaimedGovernorProposal(
        proposal,
        this.workerId,
        controller.signal,
      );
    } catch (error) {
      await this.store.releaseGovernorProposalLease(
        proposal.ownerId,
        proposal.id,
        this.workerId,
        proposal.leaseGeneration,
      );
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }
}

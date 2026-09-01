import type { CrossCompanyExecutionService } from "./service.js";
import type { DurableExecutionStore } from "./store.js";

export interface DurableSchedulerMetrics {
  ticks: number;
  claimed: number;
  completedSteps: number;
  failedSteps: number;
  emptyTicks: number;
  totalClaimLatencyMs: number;
  totalSchedulingDelayMs: number;
}

/** One bounded scheduler coordinates all companies; PostgreSQL leases provide authority. */
export class DurableExecutionScheduler {
  readonly metrics: DurableSchedulerMetrics = {
    ticks: 0,
    claimed: 0,
    completedSteps: 0,
    failedSteps: 0,
    emptyTicks: 0,
    totalClaimLatencyMs: 0,
    totalSchedulingDelayMs: 0,
  };
  #timer: NodeJS.Timeout | undefined;
  #running = false;

  constructor(
    readonly store: DurableExecutionStore,
    readonly execution: CrossCompanyExecutionService,
    readonly workerId = `durable-worker:${crypto.randomUUID()}`,
    readonly options = {
      pollIntervalMs: 1_000,
      leaseMs: 30_000,
      globalConcurrency: 8,
      perCompanyConcurrency: 2,
    },
    readonly now = () => new Date(),
  ) {}

  start() {
    if (this.#timer) return;
    this.#timer = setInterval(() => void this.tick(), this.options.pollIntervalMs);
    this.#timer.unref();
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  async tick() {
    if (this.#running) return [];
    this.#running = true;
    const started = performance.now();
    const now = this.now().toISOString();
    this.metrics.ticks += 1;
    try {
      const claimed = await this.store.claimRunnable({
        workerId: this.workerId,
        now,
        leaseMs: this.options.leaseMs,
        limit: this.options.globalConcurrency,
        maxPerCompany: this.options.perCompanyConcurrency,
      });
      this.metrics.totalClaimLatencyMs += performance.now() - started;
      this.metrics.claimed += claimed.length;
      if (!claimed.length) this.metrics.emptyTicks += 1;
      for (const item of claimed)
        this.metrics.totalSchedulingDelayMs += Math.max(
          0,
          this.now().getTime() - new Date(item.nextRunAt ?? item.updatedAt).getTime(),
        );
      const results = await Promise.allSettled(
        claimed.map((item) => this.runWithHeartbeat(item)),
      );
      this.metrics.completedSteps += results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      this.metrics.failedSteps += results.filter(
        (result) => result.status === "rejected",
      ).length;
      return results;
    } finally {
      this.#running = false;
    }
  }

  private async runWithHeartbeat(
    execution: Awaited<ReturnType<DurableExecutionStore["claimRunnable"]>>[number],
  ) {
    const heartbeatEveryMs = Math.max(250, Math.floor(this.options.leaseMs / 3));
    const heartbeat = setInterval(() => {
      void this.store.renewLease({
        ownerId: execution.ownerId,
        executionId: execution.id,
        workerId: this.workerId,
        now: this.now().toISOString(),
        leaseMs: this.options.leaseMs,
      });
    }, heartbeatEveryMs);
    heartbeat.unref();
    try {
      return await this.execution.runClaimed(execution, this.workerId);
    } finally {
      clearInterval(heartbeat);
    }
  }
}

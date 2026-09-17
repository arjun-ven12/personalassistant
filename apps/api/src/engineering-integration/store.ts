import {
  EngineeringIntegrationReviewSchema,
  EngineeringIntegrationRunSchema,
  EngineeringMergeCandidateSchema,
  type EngineeringIntegrationReview,
  type EngineeringIntegrationRun,
  type EngineeringMergeCandidate,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface EngineeringIntegrationStore {
  saveRun(run: EngineeringIntegrationRun): Awaitable<void>;
  findRun(
    ownerId: string,
    companyId: string,
    runId: string,
  ): Awaitable<EngineeringIntegrationRun | undefined>;
  findRunByIdempotency(
    ownerId: string,
    companyId: string,
    repositoryId: string,
    idempotencyKey: string,
  ): Awaitable<EngineeringIntegrationRun | undefined>;
  listRuns(
    ownerId: string,
    companyId: string,
    limit: number,
  ): Awaitable<EngineeringIntegrationRun[]>;
  acquireLease(input: {
    ownerId: string;
    companyId: string;
    runId: string;
    workerId: string;
    now: string;
    expiresAt: string;
  }): Awaitable<EngineeringIntegrationRun | undefined>;
  acquireReadyLease(input: {
    ownerId: string;
    companyId: string;
    runId: string;
    workerId: string;
    now: string;
    expiresAt: string;
  }): Awaitable<EngineeringIntegrationRun | undefined>;
  renewLease(input: {
    ownerId: string;
    companyId: string;
    runId: string;
    workerId: string;
    generation: number;
    now: string;
    expiresAt: string;
  }): Awaitable<boolean>;
  saveRunFenced(
    run: EngineeringIntegrationRun,
    workerId: string,
    generation: number,
    now: string,
  ): Awaitable<boolean>;
  commitReady(
    run: EngineeringIntegrationRun,
    candidate: EngineeringMergeCandidate,
    workerId: string,
    generation: number,
    now: string,
  ): Awaitable<boolean>;
  releaseLease(input: {
    ownerId: string;
    companyId: string;
    runId: string;
    workerId: string;
    generation: number;
    now: string;
  }): Awaitable<boolean>;
  saveCandidate(candidate: EngineeringMergeCandidate): Awaitable<void>;
  saveCandidateFenced(candidate: EngineeringMergeCandidate, workerId: string, generation: number, now: string): Awaitable<boolean>;
  findCandidateByRun(
    ownerId: string,
    companyId: string,
    runId: string,
  ): Awaitable<EngineeringMergeCandidate | undefined>;
  saveReview(review: EngineeringIntegrationReview): Awaitable<void>;
  listReviews(
    ownerId: string,
    companyId: string,
    runId: string,
  ): Awaitable<EngineeringIntegrationReview[]>;
}

const key = (ownerId: string, companyId: string, id: string) =>
  `${ownerId}:${companyId}:${id}`;

export class InMemoryEngineeringIntegrationStore implements EngineeringIntegrationStore {
  readonly #runs = new Map<string, EngineeringIntegrationRun>();
  readonly #candidates = new Map<string, EngineeringMergeCandidate>();
  readonly #reviews = new Map<string, EngineeringIntegrationReview>();

  saveRun(value: EngineeringIntegrationRun) {
    const run = EngineeringIntegrationRunSchema.parse(value);
    this.#runs.set(key(run.ownerId, run.companyId, run.id), structuredClone(run));
  }
  findRun(ownerId: string, companyId: string, runId: string) {
    const value = this.#runs.get(key(ownerId, companyId, runId));
    return value ? structuredClone(value) : undefined;
  }
  findRunByIdempotency(
    ownerId: string,
    companyId: string,
    repositoryId: string,
    idempotencyKey: string,
  ) {
    const value = [...this.#runs.values()].find(
      (run) =>
        run.ownerId === ownerId &&
        run.companyId === companyId &&
        run.repositoryId === repositoryId &&
        run.idempotencyKey === idempotencyKey,
    );
    return value ? structuredClone(value) : undefined;
  }
  listRuns(ownerId: string, companyId: string, limit: number) {
    return [...this.#runs.values()]
      .filter((run) => run.ownerId === ownerId && run.companyId === companyId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((run) => structuredClone(run));
  }
  acquireLease(input: {
    ownerId: string;
    companyId: string;
    runId: string;
    workerId: string;
    now: string;
    expiresAt: string;
  }) {
    const run = this.findRun(input.ownerId, input.companyId, input.runId);
    if (!run || ["CANCELLED", "READY", "BLOCKED"].includes(run.status)) return undefined;
    if (run.leaseOwner && run.leaseExpiresAt && run.leaseExpiresAt > input.now)
      return undefined;
    const claimed = EngineeringIntegrationRunSchema.parse({
      ...run,
      leaseOwner: input.workerId,
      leaseExpiresAt: input.expiresAt,
      leaseGeneration: run.leaseGeneration + 1,
      startedAt: run.startedAt ?? input.now,
      updatedAt: input.now,
    });
    this.saveRun(claimed);
    return claimed;
  }
  acquireReadyLease(input: {
    ownerId: string;
    companyId: string;
    runId: string;
    workerId: string;
    now: string;
    expiresAt: string;
  }) {
    const run = this.findRun(input.ownerId, input.companyId, input.runId);
    if (!run || run.status !== "READY") return undefined;
    if (run.leaseOwner && run.leaseExpiresAt && run.leaseExpiresAt > input.now)
      return undefined;
    const claimed = EngineeringIntegrationRunSchema.parse({
      ...run,
      leaseOwner: input.workerId,
      leaseExpiresAt: input.expiresAt,
      leaseGeneration: run.leaseGeneration + 1,
      updatedAt: input.now,
    });
    this.saveRun(claimed);
    return claimed;
  }
  renewLease(input: {
    ownerId: string;
    companyId: string;
    runId: string;
    workerId: string;
    generation: number;
    now: string;
    expiresAt: string;
  }) {
    const run = this.findRun(input.ownerId, input.companyId, input.runId);
    if (
      !run ||
      run.leaseOwner !== input.workerId ||
      run.leaseGeneration !== input.generation ||
      !run.leaseExpiresAt ||
      run.leaseExpiresAt <= input.now
    )
      return false;
    this.saveRun({ ...run, leaseExpiresAt: input.expiresAt, updatedAt: input.now });
    return true;
  }
  saveRunFenced(
    value: EngineeringIntegrationRun,
    workerId: string,
    generation: number,
    now: string,
  ) {
    const run = EngineeringIntegrationRunSchema.parse(value);
    const current = this.findRun(run.ownerId, run.companyId, run.id);
    if (
      !current ||
      current.leaseOwner !== workerId ||
      current.leaseGeneration !== generation ||
      !current.leaseExpiresAt ||
      current.leaseExpiresAt <= now
    )
      return false;
    this.saveRun(run);
    return true;
  }
  commitReady(
    value: EngineeringIntegrationRun,
    candidate: EngineeringMergeCandidate,
    workerId: string,
    generation: number,
    now: string,
  ) {
    const run = EngineeringIntegrationRunSchema.parse(value);
    const parsedCandidate = EngineeringMergeCandidateSchema.parse(candidate);
    const current = this.findRun(run.ownerId, run.companyId, run.id);
    if (
      !current ||
      current.leaseOwner !== workerId ||
      current.leaseGeneration !== generation ||
      !current.leaseExpiresAt ||
      current.leaseExpiresAt <= now ||
      run.status !== "READY" ||
      parsedCandidate.status !== "READY" ||
      parsedCandidate.runId !== run.id ||
      parsedCandidate.headCommit !== parsedCandidate.validatedHeadCommit ||
      parsedCandidate.headCommit !== parsedCandidate.reviewedHeadCommit
    )
      return false;
    this.saveCandidate(parsedCandidate);
    this.saveRun({
      ...run,
      leaseOwner: current.leaseOwner,
      leaseExpiresAt: current.leaseExpiresAt,
      leaseGeneration: current.leaseGeneration,
    });
    return true;
  }
  releaseLease(input: {
    ownerId: string;
    companyId: string;
    runId: string;
    workerId: string;
    generation: number;
    now: string;
  }) {
    const run = this.findRun(input.ownerId, input.companyId, input.runId);
    if (
      !run ||
      run.leaseOwner !== input.workerId ||
      run.leaseGeneration !== input.generation ||
      !run.leaseExpiresAt ||
      run.leaseExpiresAt <= input.now
    )
      return false;
    this.saveRun({
      ...run,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: input.now,
    });
    return true;
  }
  saveCandidate(value: EngineeringMergeCandidate) {
    const candidate = EngineeringMergeCandidateSchema.parse(value);
    this.#candidates.set(
      key(candidate.ownerId, candidate.companyId, candidate.runId),
      structuredClone(candidate),
    );
  }
  saveCandidateFenced(value: EngineeringMergeCandidate, workerId: string, generation: number, now: string) {
    const candidate = EngineeringMergeCandidateSchema.parse(value);
    const run = this.findRun(candidate.ownerId, candidate.companyId, candidate.runId);
    const current = this.findCandidateByRun(candidate.ownerId, candidate.companyId, candidate.runId);
    if (!run || !current || current.id !== candidate.id ||
        run.leaseOwner !== workerId || run.leaseGeneration !== generation ||
        !run.leaseExpiresAt || run.leaseExpiresAt <= now || run.status !== "READY") return false;
    this.saveCandidate(candidate);
    return true;
  }
  findCandidateByRun(ownerId: string, companyId: string, runId: string) {
    const value = this.#candidates.get(key(ownerId, companyId, runId));
    return value ? structuredClone(value) : undefined;
  }
  saveReview(value: EngineeringIntegrationReview) {
    const review = EngineeringIntegrationReviewSchema.parse(value);
    this.#reviews.set(
      key(review.ownerId, review.companyId, review.id),
      structuredClone(review),
    );
  }
  listReviews(ownerId: string, companyId: string, runId: string) {
    return [...this.#reviews.values()]
      .filter(
        (review) =>
          review.ownerId === ownerId &&
          review.companyId === companyId &&
          review.runId === runId,
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((review) => structuredClone(review));
  }
}

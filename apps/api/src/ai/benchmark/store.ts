import {
  AIBenchmarkCaseResultSchema,
  AIBenchmarkProfileSchema,
  AIBenchmarkRegressionSchema,
  AIBenchmarkRunSchema,
  type AIBenchmarkCaseResult,
  type AIBenchmarkProfile,
  type AIBenchmarkRegression,
  type AIBenchmarkRun,
  type AIBenchmarkSuite,
} from "@alexa-control/shared";

export interface AIBenchmarkStore {
  readonly persistence: "POSTGRESQL" | "IN_MEMORY_DEVELOPMENT" | "UNAVAILABLE";
  health(): Promise<boolean>;
  ensureSuite(ownerId: string, suite: AIBenchmarkSuite): Promise<void>;
  createRun(run: AIBenchmarkRun): Promise<void>;
  appendResult(ownerId: string, runId: string, result: AIBenchmarkCaseResult): Promise<void>;
  completeRun(run: AIBenchmarkRun): Promise<void>;
  getRun(ownerId: string, runId: string): Promise<AIBenchmarkRun | undefined>;
  listRuns(ownerId: string): Promise<AIBenchmarkRun[]>;
  listProfiles(ownerId: string): Promise<AIBenchmarkProfile[]>;
  upsertProfiles(ownerId: string, profiles: AIBenchmarkProfile[]): Promise<void>;
  saveRegressions(
    ownerId: string,
    baselineRunId: string,
    currentRunId: string,
    regressions: AIBenchmarkRegression[],
  ): Promise<void>;
}

/** Production fail-closed store used when persistence was not configured. */
export class UnavailableAIBenchmarkStore implements AIBenchmarkStore {
  readonly persistence = "UNAVAILABLE" as const;
  private rejected<T>(): Promise<T> {
    return Promise.reject(new Error("BENCHMARK_DATABASE_REQUIRED_IN_PRODUCTION"));
  }
  health() { return Promise.resolve(false); }
  ensureSuite() { return this.rejected<void>(); }
  createRun() { return this.rejected<void>(); }
  appendResult() { return this.rejected<void>(); }
  completeRun() { return this.rejected<void>(); }
  getRun() { return this.rejected<AIBenchmarkRun | undefined>(); }
  listRuns() { return this.rejected<AIBenchmarkRun[]>(); }
  listProfiles() { return this.rejected<AIBenchmarkProfile[]>(); }
  upsertProfiles() { return this.rejected<void>(); }
  saveRegressions() { return this.rejected<void>(); }
}

/** Development/test-only store. Production app construction rejects this store. */
export class InMemoryAIBenchmarkStore implements AIBenchmarkStore {
  readonly persistence = "IN_MEMORY_DEVELOPMENT" as const;
  private readonly runs = new Map<string, AIBenchmarkRun>();
  private readonly profiles = new Map<string, AIBenchmarkProfile>();
  private readonly regressions = new Map<string, AIBenchmarkRegression[]>();
  health() { return Promise.resolve(true); }
  ensureSuite(ownerId: string, suite: AIBenchmarkSuite) {
    void ownerId;
    void suite;
    return Promise.resolve();
  }
  createRun(run: AIBenchmarkRun) { this.runs.set(run.id, structuredClone(run)); return Promise.resolve(); }
  appendResult(ownerId: string, runId: string, result: AIBenchmarkCaseResult) {
    const run = this.runs.get(runId);
    if (!run || run.ownerId !== ownerId) throw new Error("BENCHMARK_RUN_NOT_FOUND");
    run.results.push(AIBenchmarkCaseResultSchema.parse(result));
    return Promise.resolve();
  }
  completeRun(run: AIBenchmarkRun) {
    if (run.baseline) for (const [id, existing] of this.runs)
      if (id !== run.id && existing.ownerId === run.ownerId && existing.suiteId === run.suiteId)
        this.runs.set(id, { ...existing, baseline: false });
    this.runs.set(run.id, structuredClone(run)); return Promise.resolve();
  }
  getRun(ownerId: string, runId: string) {
    const run = this.runs.get(runId);
    return Promise.resolve(run?.ownerId === ownerId ? AIBenchmarkRunSchema.parse(structuredClone(run)) : undefined);
  }
  listRuns(ownerId: string) {
    return Promise.resolve([...this.runs.values()]
      .filter((run) => run.ownerId === ownerId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 100)
      .map((run) => AIBenchmarkRunSchema.parse(structuredClone(run))));
  }
  listProfiles(ownerId: string) {
    return Promise.resolve([...this.profiles.entries()]
      .filter(([key]) => key.startsWith(`${ownerId}:`))
      .map(([, value]) => AIBenchmarkProfileSchema.parse(structuredClone(value))));
  }
  upsertProfiles(ownerId: string, profiles: AIBenchmarkProfile[]) {
    for (const profile of profiles) this.profiles.set(
      `${ownerId}:${profile.providerId}:${profile.modelId}`,
      AIBenchmarkProfileSchema.parse(profile),
    ); return Promise.resolve();
  }
  saveRegressions(ownerId: string, baselineRunId: string, currentRunId: string, regressions: AIBenchmarkRegression[]) {
    this.regressions.set(`${ownerId}:${baselineRunId}:${currentRunId}`, regressions.map((item) => AIBenchmarkRegressionSchema.parse(item)));
    return Promise.resolve();
  }
}

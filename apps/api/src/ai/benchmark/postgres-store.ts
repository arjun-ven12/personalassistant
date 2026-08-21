import {
  AIBenchmarkCaseResultSchema,
  AIBenchmarkProfileSchema,
  AIBenchmarkRunSchema,
  type AIBenchmarkCaseResult,
  type AIBenchmarkProfile,
  type AIBenchmarkRegression,
  type AIBenchmarkRun,
  type AIBenchmarkSuite,
} from "@alexa-control/shared";
import type pg from "pg";
import type { AIBenchmarkStore } from "./store.js";

type Row = Record<string, unknown>;
const text = (value: unknown) => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return `${value}`;
  throw new Error("BENCHMARK_PERSISTENCE_INVALID_ROW");
};
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : text(value);
const optional = (value: unknown) => value === null || value === undefined ? undefined : text(value);
const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

const runFromRow = (row: Row, results: AIBenchmarkCaseResult[] = []): AIBenchmarkRun =>
  AIBenchmarkRunSchema.parse({
    id: row.id,
    ownerId: row.owner_id,
    suiteId: row.suite_key,
    suiteVersion: row.suite_version,
    mode: row.mode,
    status: row.status,
    startedAt: iso(row.started_at),
    ...(row.completed_at ? { completedAt: iso(row.completed_at) } : {}),
    caseCount: Number(row.case_count),
    results,
    metrics: asArray(row.metrics),
    safetyCriticalFailures: Number(row.safety_critical_failures),
    paidOptIn: Boolean(row.paid_opt_in),
    baseline: Boolean(row.baseline),
    ...(optional(row.routing_policy_version) ? { routingPolicyVersion: optional(row.routing_policy_version) } : {}),
    ...(optional(row.context_profile_version) ? { contextProfileVersion: optional(row.context_profile_version) } : {}),
    ...(optional(row.runtime_version) ? { runtimeVersion: optional(row.runtime_version) } : {}),
    ...(row.environment ? { environment: row.environment } : {}),
  });

const profileFromRow = (row: Row): AIBenchmarkProfile =>
  AIBenchmarkProfileSchema.parse({
    providerId: row.provider_id,
    modelId: row.model_id,
    sampleCount: Number(row.sample_count),
    ...(typeof row.metrics === "object" && row.metrics ? row.metrics : {}),
    updatedAt: iso(row.updated_at),
  });

export class PostgresAIBenchmarkStore implements AIBenchmarkStore {
  readonly persistence = "POSTGRESQL" as const;
  constructor(private readonly pool: pg.Pool) {}
  async health() { await this.pool.query("SELECT 1"); return true; }
  async ensureSuite(ownerId: string, suite: AIBenchmarkSuite) {
    await this.pool.query(
      `INSERT INTO ai_benchmark_suites(id, owner_id, suite_key, version, definition, enabled)
       VALUES($1,$2,$3,$4,$5,TRUE)
       ON CONFLICT(owner_id, suite_key, version)
       DO UPDATE SET definition=EXCLUDED.definition, enabled=TRUE`,
      [crypto.randomUUID(), ownerId, suite.id, suite.version, JSON.stringify(suite)],
    );
  }
  async createRun(run: AIBenchmarkRun) {
    await this.pool.query(
      `INSERT INTO ai_benchmark_runs(
        id, owner_id, suite_id, suite_key, suite_version, mode, status, case_count,
        metrics, safety_critical_failures, paid_opt_in, baseline,
        routing_policy_version, context_profile_version, runtime_version,
        environment, started_at, completed_at
      ) SELECT $1,$2,id,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
      FROM ai_benchmark_suites
      WHERE owner_id=$2 AND suite_key=$3 AND version=$4`,
      [run.id, run.ownerId, run.suiteId, run.suiteVersion, run.mode, run.status,
        run.caseCount, JSON.stringify(run.metrics), run.safetyCriticalFailures, run.paidOptIn,
        run.baseline, run.routingPolicyVersion ?? null, run.contextProfileVersion ?? null,
        run.runtimeVersion ?? null, run.environment ? JSON.stringify(run.environment) : null, run.startedAt,
        run.completedAt ?? null],
    );
  }
  async appendResult(ownerId: string, runId: string, result: AIBenchmarkCaseResult) {
    const inserted = await this.pool.query(
      `INSERT INTO ai_benchmark_case_results(run_id, case_id, status, metrics, result)
       SELECT $1,$2,$3,$4,$5 WHERE EXISTS(
         SELECT 1 FROM ai_benchmark_runs WHERE id=$1 AND owner_id=$6
       ) ON CONFLICT(run_id, case_id) DO NOTHING`,
      [runId, result.caseId, result.status, JSON.stringify(result.metrics), JSON.stringify(result), ownerId],
    );
    if (inserted.rowCount !== 1) throw new Error("BENCHMARK_RUN_NOT_FOUND");
  }
  async completeRun(run: AIBenchmarkRun) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (run.baseline) await client.query(
        `UPDATE ai_benchmark_runs SET baseline=FALSE
         WHERE owner_id=$1 AND suite_key=$2 AND id<>$3 AND baseline=TRUE`,
        [run.ownerId, run.suiteId, run.id],
      );
      const updated = await client.query(
        `UPDATE ai_benchmark_runs SET status=$3, metrics=$4, safety_critical_failures=$5,
         baseline=$6, completed_at=$7 WHERE id=$1 AND owner_id=$2`,
        [run.id, run.ownerId, run.status, JSON.stringify(run.metrics), run.safetyCriticalFailures,
          run.baseline, run.completedAt ?? new Date().toISOString()],
      );
      if (updated.rowCount !== 1) throw new Error("BENCHMARK_RUN_NOT_FOUND");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  private async results(runId: string) {
    const result = await this.pool.query<Row>(
      `SELECT result FROM ai_benchmark_case_results WHERE run_id=$1 ORDER BY id`, [runId],
    );
    return result.rows.map((row) => AIBenchmarkCaseResultSchema.parse(row.result));
  }
  async getRun(ownerId: string, runId: string) {
    const result = await this.pool.query<Row>(
      `SELECT * FROM ai_benchmark_runs WHERE id=$1 AND owner_id=$2`, [runId, ownerId],
    );
    const row = result.rows[0];
    return row ? runFromRow(row, await this.results(String(row.id))) : undefined;
  }
  async listRuns(ownerId: string) {
    const result = await this.pool.query<Row>(
      `SELECT * FROM ai_benchmark_runs WHERE owner_id=$1 ORDER BY started_at DESC LIMIT 100`, [ownerId],
    );
    return Promise.all(result.rows.map(async (row) => runFromRow(row, await this.results(String(row.id)))));
  }
  async listProfiles(ownerId: string) {
    const result = await this.pool.query<Row>(
      `SELECT * FROM ai_benchmark_profiles WHERE owner_id=$1 ORDER BY updated_at DESC`, [ownerId],
    );
    return result.rows.map(profileFromRow);
  }
  async upsertProfiles(ownerId: string, profiles: AIBenchmarkProfile[]) {
    for (const profile of profiles) await this.pool.query(
      `INSERT INTO ai_benchmark_profiles(owner_id, provider_id, model_id, sample_count, metrics, updated_at)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(owner_id, provider_id, model_id) DO UPDATE SET
         sample_count=EXCLUDED.sample_count, metrics=EXCLUDED.metrics, updated_at=EXCLUDED.updated_at`,
      [ownerId, profile.providerId, profile.modelId, profile.sampleCount,
        JSON.stringify({ ...profile, providerId: undefined, modelId: undefined, sampleCount: undefined, updatedAt: undefined }), profile.updatedAt],
    );
  }
  async saveRegressions(ownerId: string, baselineRunId: string, currentRunId: string, regressions: AIBenchmarkRegression[]) {
    await this.pool.query(
      `INSERT INTO ai_benchmark_regressions(id, owner_id, baseline_run_id, current_run_id, regressions)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(owner_id, baseline_run_id, current_run_id) DO UPDATE SET regressions=EXCLUDED.regressions, created_at=NOW()`,
      [crypto.randomUUID(), ownerId, baselineRunId, currentRunId, JSON.stringify(regressions)],
    );
  }
}

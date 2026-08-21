import {
  SkillBenchmarkResultSchema,
  SkillDraftBenchmarkCaseResultSchema,
  SkillDraftBenchmarkRunSchema,
  SkillEvolutionCandidateSchema,
  SkillEvolutionEvaluationRecordSchema,
  SkillEvolutionEventSchema,
  SkillEvolutionSkillSchema,
  SkillEvolutionUsageRecordSchema,
  SkillValidationResultSchema,
  SkillVersionSchema,
  type SkillBenchmarkResult,
  type SkillDraftBenchmarkCaseResult,
  type SkillDraftBenchmarkRun,
  type SkillEvolutionCandidate,
  type SkillEvolutionEvaluationRecord,
  type SkillEvolutionEvent,
  type SkillEvolutionSkill,
  type SkillEvolutionUsageRecord,
  type SkillValidationResult,
  type SkillVersion,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { SkillEvolutionStore } from "./store.js";

const save = async (
  pool: Pool,
  kind: string,
  value: { id: string; ownerId: string },
  at: string,
  mutable = true,
) => {
  await pool.query(
    `INSERT INTO skill_evolution_artifacts(id,owner_id,kind,updated_at,record)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(id) DO ${mutable ? "UPDATE SET updated_at=EXCLUDED.updated_at,record=EXCLUDED.record" : "NOTHING"}`,
    [value.id, value.ownerId, kind, at, value],
  );
};

const list = async <T>(
  pool: Pool,
  ownerId: string,
  kind: string,
  order: string,
  limit: number,
  schema: { parse(value: unknown): T },
) =>
  (
    await pool.query<{ record: unknown }>(
      `SELECT record FROM skill_evolution_artifacts
       WHERE owner_id=$1 AND kind=$2 ORDER BY ${order} DESC LIMIT $3`,
      [ownerId, kind, limit],
    )
  ).rows.map((row) => schema.parse(row.record));

const get = async <T>(
  pool: Pool,
  ownerId: string,
  id: string,
  kind: string,
  schema: { parse(value: unknown): T },
) => {
  const result = await pool.query<{ record: unknown }>(
    "SELECT record FROM skill_evolution_artifacts WHERE owner_id=$1 AND id=$2 AND kind=$3",
    [ownerId, id, kind],
  );
  return result.rows[0] ? schema.parse(result.rows[0].record) : null;
};

export class PostgresSkillEvolutionStore implements SkillEvolutionStore {
  constructor(readonly pool: Pool) {}

  async saveCandidate(record: SkillEvolutionCandidate) {
    const parsed = SkillEvolutionCandidateSchema.parse(record);
    await save(this.pool, "CANDIDATE", parsed, parsed.updatedAt);
  }
  getCandidate(ownerId: string, id: string) {
    return get(this.pool, ownerId, id, "CANDIDATE", SkillEvolutionCandidateSchema);
  }
  listCandidates(ownerId: string, limit: number) {
    return list(this.pool, ownerId, "CANDIDATE", "updated_at", limit, SkillEvolutionCandidateSchema);
  }
  async saveSkill(record: SkillEvolutionSkill) {
    const parsed = SkillEvolutionSkillSchema.parse(record);
    await save(this.pool, "SKILL", parsed, parsed.updatedAt);
  }
  getSkill(ownerId: string, id: string) {
    return get(this.pool, ownerId, id, "SKILL", SkillEvolutionSkillSchema);
  }
  listSkills(ownerId: string, limit: number) {
    return list(this.pool, ownerId, "SKILL", "updated_at", limit, SkillEvolutionSkillSchema);
  }
  async saveVersion(record: SkillVersion) {
    const parsed = SkillVersionSchema.parse(record);
    await save(this.pool, "VERSION", parsed, parsed.createdAt, false);
  }
  getVersion(ownerId: string, id: string) {
    return get(this.pool, ownerId, id, "VERSION", SkillVersionSchema);
  }
  listVersions(ownerId: string, limit: number) {
    return list(this.pool, ownerId, "VERSION", "updated_at", limit, SkillVersionSchema);
  }
  async saveValidation(record: SkillValidationResult) {
    const parsed = SkillValidationResultSchema.parse(record);
    await save(this.pool, "VALIDATION", parsed, parsed.validatedAt);
  }
  listValidations(ownerId: string, limit: number) {
    return list(this.pool, ownerId, "VALIDATION", "updated_at", limit, SkillValidationResultSchema);
  }
  async saveBenchmark(record: SkillBenchmarkResult) {
    const parsed = SkillBenchmarkResultSchema.parse(record);
    await save(this.pool, "BENCHMARK", parsed, parsed.createdAt);
  }
  listBenchmarks(ownerId: string, limit: number) {
    return list(this.pool, ownerId, "BENCHMARK", "updated_at", limit, SkillBenchmarkResultSchema);
  }
  async saveEvaluation(record: SkillEvolutionEvaluationRecord) {
    const parsed = SkillEvolutionEvaluationRecordSchema.parse(record);
    await save(this.pool, "EVALUATION", parsed, parsed.createdAt);
  }
  listEvaluations(ownerId: string, limit: number) {
    return list(this.pool, ownerId, "EVALUATION", "updated_at", limit, SkillEvolutionEvaluationRecordSchema);
  }
  async saveDraftBenchmarkRun(record: SkillDraftBenchmarkRun) {
    const parsed = SkillDraftBenchmarkRunSchema.parse(record);
    await save(this.pool, "DRAFT_RUN", parsed, parsed.createdAt);
  }
  listDraftBenchmarkRuns(ownerId: string, limit: number) {
    return list(this.pool, ownerId, "DRAFT_RUN", "updated_at", limit, SkillDraftBenchmarkRunSchema);
  }
  async saveDraftBenchmarkCaseResult(record: SkillDraftBenchmarkCaseResult) {
    const parsed = SkillDraftBenchmarkCaseResultSchema.parse(record);
    await save(this.pool, "DRAFT_RESULT", parsed, parsed.createdAt);
  }
  listDraftBenchmarkCaseResults(ownerId: string, limit: number) {
    return list(this.pool, ownerId, "DRAFT_RESULT", "updated_at", limit, SkillDraftBenchmarkCaseResultSchema);
  }
  async saveUsage(record: SkillEvolutionUsageRecord) {
    const parsed = SkillEvolutionUsageRecordSchema.parse(record);
    await save(this.pool, "USAGE", parsed, parsed.createdAt);
  }
  listUsage(ownerId: string, limit: number) {
    return list(this.pool, ownerId, "USAGE", "updated_at", limit, SkillEvolutionUsageRecordSchema);
  }
  async saveEvent(record: SkillEvolutionEvent) {
    const parsed = SkillEvolutionEventSchema.parse(record);
    await save(this.pool, "EVENT", parsed, parsed.createdAt);
  }
  listEvents(ownerId: string, limit: number) {
    return list(this.pool, ownerId, "EVENT", "updated_at", limit, SkillEvolutionEventSchema);
  }
}

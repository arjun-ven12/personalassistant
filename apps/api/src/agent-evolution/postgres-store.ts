import {
  BenchmarkResultRecordSchema,
  CapabilityMarketplaceRecordSchema,
  EvolutionProposalRecordSchema,
  EvolutionRecordSchema,
  EvolutionTimelineRecordSchema,
  ExpertiseHistoryRecordSchema,
  ImprovementRecordSchema,
  OutcomeHistoryRecordSchema,
  SelfEvaluationRecordSchema,
  VersionRecordSchema,
  type BenchmarkResultRecord,
  type CapabilityMarketplaceRecord,
  type EvolutionProposalRecord,
  type EvolutionTimelineRecord,
  type ExpertiseHistoryRecord,
  type ExpertiseRecord,
  type ImprovementRecord,
  type OutcomeHistoryRecord,
  type SelfEvaluationRecord,
  type VersionRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { AgentEvolutionStore } from "./store.js";

const versionTable = (subjectType: VersionRecord["subjectType"]) =>
  ({
    capability: "capability_versions",
    prompt: "prompt_versions",
    reasoning: "reasoning_versions",
  })[subjectType];

const improvementTable = (area: ImprovementRecord["area"]) =>
  area === "workflow" ? "workflow_improvements" : "knowledge_improvements";

const outcomeTable = (type: OutcomeHistoryRecord["outcomeType"]) =>
  type === "failure" ? "failure_history" : "success_history";

const list = async <T>(
  pool: Pool,
  table: string,
  ownerId: string,
  order: string,
  limit: number,
  schema: { parse: (value: unknown) => T },
) => {
  const result = await pool.query<{ record: unknown }>(
    `SELECT record FROM ${table} WHERE owner_id=$1 ORDER BY ${order} DESC LIMIT $2`,
    [ownerId, limit],
  );
  return result.rows.map((row) => schema.parse(row.record));
};

export class PostgresAgentEvolutionStore implements AgentEvolutionStore {
  constructor(readonly pool: Pool) {}

  async saveExpertise(record: ExpertiseRecord) {
    const parsed = EvolutionRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO agent_expertise(
        id,owner_id,agent_id,category,name,level,confidence,success_rate,growth_trend,updated_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE
       SET level=$6,confidence=$7,success_rate=$8,growth_trend=$9,updated_at=$10,record=$11`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.category,
        parsed.name,
        parsed.level,
        parsed.confidence,
        parsed.successRate,
        parsed.growthTrend,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async listExpertise(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_expertise WHERE owner_id=$1 ORDER BY updated_at DESC",
      [ownerId],
    );
    return result.rows.map((row) => EvolutionRecordSchema.parse(row.record));
  }

  async saveExpertiseHistory(record: ExpertiseHistoryRecord) {
    const parsed = ExpertiseHistoryRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO expertise_history(id,owner_id,agent_id,expertise_id,new_level,created_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.expertiseId,
        parsed.newLevel,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  listExpertiseHistory(ownerId: string, limit: number) {
    return list(
      this.pool,
      "expertise_history",
      ownerId,
      "created_at",
      limit,
      ExpertiseHistoryRecordSchema,
    );
  }

  async saveProposal(record: EvolutionProposalRecord) {
    const parsed = EvolutionProposalRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO evolution_proposals(
        id,owner_id,agent_id,type,status,confidence,risk,created_at,updated_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET status=$5,updated_at=$9,record=$10`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.type,
        parsed.status,
        parsed.confidence,
        parsed.risk,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  listProposals(ownerId: string, limit: number) {
    return list(
      this.pool,
      "evolution_proposals",
      ownerId,
      "created_at",
      limit,
      EvolutionProposalRecordSchema,
    );
  }

  async saveVersion(record: VersionRecord) {
    const parsed = VersionRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO ${versionTable(parsed.subjectType)}(
        id,owner_id,agent_id,subject_id,version,created_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.subjectId,
        parsed.version,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  listVersions(
    ownerId: string,
    subjectType: VersionRecord["subjectType"],
    limit: number,
  ) {
    return list(
      this.pool,
      versionTable(subjectType),
      ownerId,
      "created_at",
      limit,
      VersionRecordSchema,
    );
  }

  async saveImprovement(record: ImprovementRecord) {
    const parsed = ImprovementRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO ${improvementTable(parsed.area)}(
        id,owner_id,agent_id,status,confidence,created_at,updated_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET status=$4,updated_at=$7,record=$8`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.status,
        parsed.confidence,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  listImprovements(ownerId: string, area: ImprovementRecord["area"], limit: number) {
    return list(
      this.pool,
      improvementTable(area),
      ownerId,
      "created_at",
      limit,
      ImprovementRecordSchema,
    );
  }

  async saveOutcome(record: OutcomeHistoryRecord) {
    const parsed = OutcomeHistoryRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO ${outcomeTable(parsed.outcomeType)}(id,owner_id,agent_id,created_at,record)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      [parsed.id, parsed.ownerId, parsed.agentId, parsed.createdAt, parsed],
    );
  }

  listOutcomes(
    ownerId: string,
    outcomeType: OutcomeHistoryRecord["outcomeType"],
    limit: number,
  ) {
    return list(
      this.pool,
      outcomeTable(outcomeType),
      ownerId,
      "created_at",
      limit,
      OutcomeHistoryRecordSchema,
    );
  }

  async saveBenchmark(record: BenchmarkResultRecord) {
    const parsed = BenchmarkResultRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO benchmark_results(id,owner_id,agent_id,score,trend,created_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.score,
        parsed.trend,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  listBenchmarks(ownerId: string, limit: number) {
    return list(
      this.pool,
      "benchmark_results",
      ownerId,
      "created_at",
      limit,
      BenchmarkResultRecordSchema,
    );
  }

  async saveTimeline(record: EvolutionTimelineRecord) {
    const parsed = EvolutionTimelineRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO evolution_timeline(id,owner_id,agent_id,event_type,occurred_at,record)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.eventType,
        parsed.occurredAt,
        parsed,
      ],
    );
  }

  listTimeline(ownerId: string, limit: number) {
    return list(
      this.pool,
      "evolution_timeline",
      ownerId,
      "occurred_at",
      limit,
      EvolutionTimelineRecordSchema,
    );
  }

  async saveSelfEvaluation(record: SelfEvaluationRecord) {
    const parsed = SelfEvaluationRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO self_evaluations(id,owner_id,agent_id,created_at,record)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      [parsed.id, parsed.ownerId, parsed.agentId, parsed.createdAt, parsed],
    );
  }

  listSelfEvaluations(ownerId: string, limit: number) {
    return list(
      this.pool,
      "self_evaluations",
      ownerId,
      "created_at",
      limit,
      SelfEvaluationRecordSchema,
    );
  }

  async saveMarketplace(record: CapabilityMarketplaceRecord) {
    const parsed = CapabilityMarketplaceRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO capability_marketplace(
        id,owner_id,quality_score,version,created_at,updated_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (owner_id,id) DO UPDATE
       SET quality_score=$3,version=$4,updated_at=$6,record=$7`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.qualityScore,
        parsed.version,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async listMarketplace(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM capability_marketplace WHERE owner_id=$1 ORDER BY updated_at DESC",
      [ownerId],
    );
    return result.rows.map((row) =>
      CapabilityMarketplaceRecordSchema.parse(row.record),
    );
  }
}

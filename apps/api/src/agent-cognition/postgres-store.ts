import {
  AgentDecisionLogRecordSchema,
  CognitiveMemoryRecordSchema,
  CognitiveMetricsRecordSchema,
  CognitiveStateRecordSchema,
  ConfidenceRecordSchema,
  ExperienceRecordSchema,
  GoalTrackingRecordSchema,
  LearningPipelineEventRecordSchema,
  MemoryConsolidationRecordSchema,
  MemoryRelationshipRecordSchema,
  ReflectionReportRecordSchema,
  SpecializationProfileRecordSchema,
  type AgentDecisionLogRecord,
  type CognitiveMemoryRecord,
  type CognitiveMetricsRecord,
  type CognitiveSearchQuery,
  type CognitiveStateRecord,
  type ConfidenceRecord,
  type ExperienceRecord,
  type GoalTrackingRecord,
  type LearningPipelineEventRecord,
  type MemoryConsolidationRecord,
  type MemoryRelationshipRecord,
  type ReflectionReportRecord,
  type SpecializationProfileRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { AgentCognitionStore } from "./store.js";

const memoryTable = (kind: CognitiveMemoryRecord["kind"]) =>
  ({
    working: "working_memory",
    episodic: "episodic_memory",
    semantic: "semantic_memory",
    procedural: "procedural_memory",
  })[kind];

const like = (value: string) =>
  `%${value.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

const listRecords = async <T>(
  pool: Pool,
  table: string,
  ownerId: string,
  order: string,
  limit: number,
  parser: { parse: (value: unknown) => T },
) => {
  const result = await pool.query<{ record: unknown }>(
    `SELECT record FROM ${table} WHERE owner_id=$1 ORDER BY ${order} DESC LIMIT $2`,
    [ownerId, limit],
  );
  return result.rows.map((row) => parser.parse(row.record));
};

export class PostgresAgentCognitionStore implements AgentCognitionStore {
  constructor(readonly pool: Pool) {}

  async saveMemory(memory: CognitiveMemoryRecord) {
    const parsed = CognitiveMemoryRecordSchema.parse(memory);
    if (parsed.kind === "working") {
      await this.pool.query(
        `INSERT INTO working_memory(
          id,owner_id,agent_id,workflow_id,confidence,expires_at,created_at,updated_at,record
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE
         SET confidence=$5,expires_at=$6,updated_at=$8,record=$9`,
        [
          parsed.id,
          parsed.ownerId,
          parsed.agentId,
          parsed.workflowId,
          parsed.confidence,
          parsed.expiresAt,
          parsed.createdAt,
          parsed.updatedAt,
          parsed,
        ],
      );
      return;
    }
    await this.pool.query(
      `INSERT INTO ${memoryTable(parsed.kind)}(
        id,owner_id,agent_id,workflow_id,confidence,created_at,updated_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE
       SET confidence=$5,updated_at=$7,record=$8`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.workflowId,
        parsed.confidence,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  listMemory(ownerId: string, kind: CognitiveMemoryRecord["kind"], limit: number) {
    return listRecords(
      this.pool,
      memoryTable(kind),
      ownerId,
      "updated_at",
      limit,
      CognitiveMemoryRecordSchema,
    );
  }

  async searchMemory(ownerId: string, query: CognitiveSearchQuery) {
    const tables = query.kind
      ? [memoryTable(query.kind)]
      : ["working_memory", "episodic_memory", "semantic_memory", "procedural_memory"];
    const results: CognitiveMemoryRecord[] = [];
    for (const table of tables) {
      const clauses = ["owner_id=$1"];
      const values: unknown[] = [ownerId];
      if (query.agentId) {
        values.push(query.agentId);
        clauses.push(`agent_id=$${values.length}`);
      }
      if (query.q) {
        values.push(like(query.q));
        clauses.push(
          `(record->>'title' ILIKE $${values.length} ESCAPE '\\' OR record->>'summary' ILIKE $${values.length} ESCAPE '\\' OR record->>'content' ILIKE $${values.length} ESCAPE '\\')`,
        );
      }
      values.push(query.limit);
      const result = await this.pool.query<{ record: unknown }>(
        `SELECT record FROM ${table}
         WHERE ${clauses.join(" AND ")}
         ORDER BY confidence DESC, updated_at DESC
         LIMIT $${values.length}`,
        values,
      );
      results.push(
        ...result.rows.map((row) => CognitiveMemoryRecordSchema.parse(row.record)),
      );
    }
    return results
      .sort(
        (left, right) =>
          right.importance * right.confidence - left.importance * left.confidence ||
          right.updatedAt.localeCompare(left.updatedAt),
      )
      .slice(0, query.limit);
  }

  async saveRelationship(relationship: MemoryRelationshipRecord) {
    const parsed = MemoryRelationshipRecordSchema.parse(relationship);
    await this.pool.query(
      `INSERT INTO memory_relationships(
        id,owner_id,agent_id,source_memory_id,target_memory_id,relationship,confidence,created_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.sourceMemoryId,
        parsed.targetMemoryId,
        parsed.relationship,
        parsed.confidence,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  listRelationships(ownerId: string, limit: number) {
    return listRecords(
      this.pool,
      "memory_relationships",
      ownerId,
      "created_at",
      limit,
      MemoryRelationshipRecordSchema,
    );
  }

  async saveExperience(experience: ExperienceRecord) {
    const parsed = ExperienceRecordSchema.parse(experience);
    await this.pool.query(
      `INSERT INTO experience_store(
        id,owner_id,agent_id,workflow_id,outcome,impact,confidence,created_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.workflowId,
        parsed.outcome,
        parsed.impact,
        parsed.confidence,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  listExperiences(ownerId: string, limit: number) {
    return listRecords(
      this.pool,
      "experience_store",
      ownerId,
      "created_at",
      limit,
      ExperienceRecordSchema,
    );
  }

  async saveDecision(decision: AgentDecisionLogRecord) {
    const parsed = AgentDecisionLogRecordSchema.parse(decision);
    await this.pool.query(
      `INSERT INTO decision_log(
        id,owner_id,agent_id,workflow_id,confidence,created_at,updated_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET confidence=$5,updated_at=$7,record=$8`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.workflowId,
        parsed.confidence,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  listDecisions(ownerId: string, limit: number) {
    return listRecords(
      this.pool,
      "decision_log",
      ownerId,
      "created_at",
      limit,
      AgentDecisionLogRecordSchema,
    );
  }

  async saveSpecialization(profile: SpecializationProfileRecord) {
    const parsed = SpecializationProfileRecordSchema.parse(profile);
    await this.pool.query(
      `INSERT INTO agent_specializations(
        owner_id,agent_id,performance_score,confidence,expertise_growth,updated_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (owner_id,agent_id) DO UPDATE
       SET performance_score=$3,confidence=$4,expertise_growth=$5,updated_at=$6,record=$7`,
      [
        parsed.ownerId,
        parsed.agentId,
        parsed.performanceScore,
        parsed.confidence,
        parsed.expertiseGrowth,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async listSpecializations(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_specializations WHERE owner_id=$1 ORDER BY updated_at DESC",
      [ownerId],
    );
    return result.rows.map((row) =>
      SpecializationProfileRecordSchema.parse(row.record),
    );
  }

  async saveReflection(reflection: ReflectionReportRecord) {
    const parsed = ReflectionReportRecordSchema.parse(reflection);
    await this.pool.query(
      `INSERT INTO reflection_reports(
        id,owner_id,agent_id,workflow_id,confidence,created_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.workflowId,
        parsed.confidence,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  listReflections(ownerId: string, limit: number) {
    return listRecords(
      this.pool,
      "reflection_reports",
      ownerId,
      "created_at",
      limit,
      ReflectionReportRecordSchema,
    );
  }

  async saveConfidence(confidence: ConfidenceRecord) {
    const parsed = ConfidenceRecordSchema.parse(confidence);
    await this.pool.query(
      `INSERT INTO confidence_history(
        id,owner_id,agent_id,workflow_id,target_type,confidence,created_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.workflowId,
        parsed.targetType,
        parsed.confidence,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  listConfidence(ownerId: string, limit: number) {
    return listRecords(
      this.pool,
      "confidence_history",
      ownerId,
      "created_at",
      limit,
      ConfidenceRecordSchema,
    );
  }

  async saveGoal(goal: GoalTrackingRecord) {
    const parsed = GoalTrackingRecordSchema.parse(goal);
    await this.pool.query(
      `INSERT INTO goal_tracking(
        id,owner_id,agent_id,workflow_id,status,progress_percent,updated_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET status=$5,progress_percent=$6,updated_at=$7,record=$8`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.workflowId,
        parsed.status,
        parsed.progressPercent,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  listGoals(ownerId: string, limit: number) {
    return listRecords(
      this.pool,
      "goal_tracking",
      ownerId,
      "updated_at",
      limit,
      GoalTrackingRecordSchema,
    );
  }

  async saveState(state: CognitiveStateRecord) {
    const parsed = CognitiveStateRecordSchema.parse(state);
    await this.pool.query(
      `INSERT INTO agent_cognitive_states(
        owner_id,agent_id,state,active_workflow_id,last_transition_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (owner_id,agent_id) DO UPDATE
       SET state=$3,active_workflow_id=$4,last_transition_at=$5,record=$6`,
      [
        parsed.ownerId,
        parsed.agentId,
        parsed.state,
        parsed.activeWorkflowId,
        parsed.lastTransitionAt,
        parsed,
      ],
    );
  }

  async listStates(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_cognitive_states WHERE owner_id=$1 ORDER BY last_transition_at DESC",
      [ownerId],
    );
    return result.rows.map((row) => CognitiveStateRecordSchema.parse(row.record));
  }

  async saveLearningEvent(event: LearningPipelineEventRecord) {
    const parsed = LearningPipelineEventRecordSchema.parse(event);
    await this.pool.query(
      `INSERT INTO agent_learning_events(id,owner_id,agent_id,workflow_id,stage,created_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.workflowId,
        parsed.stage,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  listLearningEvents(ownerId: string, limit: number) {
    return listRecords(
      this.pool,
      "agent_learning_events",
      ownerId,
      "created_at",
      limit,
      LearningPipelineEventRecordSchema,
    );
  }

  async saveConsolidation(record: MemoryConsolidationRecord) {
    const parsed = MemoryConsolidationRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO memory_consolidation(id,owner_id,agent_id,status,created_at,completed_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET status=$4,completed_at=$6,record=$7`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.status,
        parsed.createdAt,
        parsed.completedAt,
        parsed,
      ],
    );
  }

  listConsolidations(ownerId: string, limit: number) {
    return listRecords(
      this.pool,
      "memory_consolidation",
      ownerId,
      "created_at",
      limit,
      MemoryConsolidationRecordSchema,
    );
  }

  async saveMetrics(metrics: CognitiveMetricsRecord) {
    const parsed = CognitiveMetricsRecordSchema.parse(metrics);
    await this.pool.query(
      `INSERT INTO cognitive_metrics(owner_id,agent_id,recorded_at,record)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (owner_id,agent_id) DO UPDATE SET recorded_at=$3,record=$4`,
      [parsed.ownerId, parsed.agentId, parsed.recordedAt, parsed],
    );
  }

  async listMetrics(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM cognitive_metrics WHERE owner_id=$1 ORDER BY recorded_at DESC",
      [ownerId],
    );
    return result.rows.map((row) => CognitiveMetricsRecordSchema.parse(row.record));
  }
}

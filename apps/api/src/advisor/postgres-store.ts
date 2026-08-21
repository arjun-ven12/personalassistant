import {
  ArchitectureHealthRecordSchema,
  EngineeringGoalRecordSchema,
  EngineeringMetricsRecordSchema,
  EngineeringRiskRecordSchema,
  OpportunityRecordSchema,
  RecommendationRecordSchema,
  ReleaseAssessmentRecordSchema,
  RepositoryHealthRecordSchema,
  RoadmapRecordSchema,
  ScenarioSimulationResponseSchema,
  StrategicPlanRecordSchema,
  TechnicalDebtRecordSchema,
  type ArchitectureHealthRecord,
  type EngineeringGoalRecord,
  type EngineeringMetricsRecord,
  type EngineeringRiskRecord,
  type OpportunityRecord,
  type RecommendationRecord,
  type ReleaseAssessmentRecord,
  type RepositoryHealthRecord,
  type RoadmapRecord,
  type SimulationRunRecord,
  type StrategicPlanRecord,
  type TechnicalDebtRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { AdvisorStore } from "./store.js";

const rows = async <T>(
  pool: Pool,
  schema: { parse: (value: unknown) => T },
  table: string,
  ownerId: string,
  orderBy: string,
  limit: number,
) => {
  const result = await pool.query<{ record: unknown }>(
    `SELECT record FROM ${table} WHERE owner_id=$1 ORDER BY ${orderBy} DESC LIMIT $2`,
    [ownerId, limit],
  );
  return result.rows.map((row) => schema.parse(row.record));
};

export class PostgresAdvisorStore implements AdvisorStore {
  constructor(readonly pool: Pool) {}

  async saveGoal(goal: EngineeringGoalRecord) {
    const parsed = EngineeringGoalRecordSchema.parse(goal);
    await this.pool.query(
      `INSERT INTO engineering_goals(id,owner_id,priority,status,completion_percent,created_at,updated_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE
       SET priority=$3,status=$4,completion_percent=$5,updated_at=$7,record=$8`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.priority,
        parsed.status,
        parsed.completionPercent,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async findGoal(ownerId: string, goalId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_goals WHERE owner_id=$1 AND id=$2",
      [ownerId, goalId],
    );
    return result.rows[0]
      ? EngineeringGoalRecordSchema.parse(result.rows[0].record)
      : undefined;
  }

  listGoals(ownerId: string, limit: number) {
    return rows(
      this.pool,
      EngineeringGoalRecordSchema,
      "engineering_goals",
      ownerId,
      "updated_at",
      limit,
    );
  }

  async saveStrategicPlan(plan: StrategicPlanRecord) {
    const parsed = StrategicPlanRecordSchema.parse(plan);
    await this.pool.query(
      `INSERT INTO strategic_plans(id,owner_id,goal_id,created_at,updated_at,record)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET updated_at=$5,record=$6`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.goalId,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  listStrategicPlans(ownerId: string, limit: number) {
    return rows(
      this.pool,
      StrategicPlanRecordSchema,
      "strategic_plans",
      ownerId,
      "updated_at",
      limit,
    );
  }

  async saveTechnicalDebt(debt: TechnicalDebtRecord) {
    const parsed = TechnicalDebtRecordSchema.parse(debt);
    await this.pool.query(
      `INSERT INTO technical_debt(id,owner_id,repository_id,severity,priority,trend,created_at,updated_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET severity=$4,priority=$5,trend=$6,updated_at=$8,record=$9`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.repositoryId,
        parsed.severity,
        parsed.priority,
        parsed.trend,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  listTechnicalDebt(ownerId: string, limit: number) {
    return rows(
      this.pool,
      TechnicalDebtRecordSchema,
      "technical_debt",
      ownerId,
      "updated_at",
      limit,
    );
  }

  async saveRisk(risk: EngineeringRiskRecord) {
    const parsed = EngineeringRiskRecordSchema.parse(risk);
    await this.pool.query(
      `INSERT INTO engineering_risks(id,owner_id,repository_id,category,severity,status,likelihood,impact,created_at,updated_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET severity=$5,status=$6,likelihood=$7,impact=$8,updated_at=$10,record=$11`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.repositoryId,
        parsed.category,
        parsed.severity,
        parsed.status,
        parsed.likelihood,
        parsed.impact,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  listRisks(ownerId: string, limit: number) {
    return rows(
      this.pool,
      EngineeringRiskRecordSchema,
      "engineering_risks",
      ownerId,
      "updated_at",
      limit,
    );
  }

  async saveRepositoryHealth(health: RepositoryHealthRecord) {
    const parsed = RepositoryHealthRecordSchema.parse(health);
    await this.pool.query(
      `INSERT INTO repository_health(id,owner_id,repository_id,overall,trend,assessed_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET overall=$4,trend=$5,assessed_at=$6,record=$7`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.repositoryId,
        parsed.overall,
        parsed.trend,
        parsed.assessedAt,
        parsed,
      ],
    );
  }

  listRepositoryHealth(ownerId: string, limit: number) {
    return rows(
      this.pool,
      RepositoryHealthRecordSchema,
      "repository_health",
      ownerId,
      "assessed_at",
      limit,
    );
  }

  async saveArchitectureHealth(health: ArchitectureHealthRecord) {
    const parsed = ArchitectureHealthRecordSchema.parse(health);
    await this.pool.query(
      `INSERT INTO architecture_health(id,owner_id,repository_id,score,drift,coupling_risk,assessed_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET score=$4,drift=$5,coupling_risk=$6,assessed_at=$7,record=$8`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.repositoryId,
        parsed.score,
        parsed.drift,
        parsed.couplingRisk,
        parsed.assessedAt,
        parsed,
      ],
    );
  }

  listArchitectureHealth(ownerId: string, limit: number) {
    return rows(
      this.pool,
      ArchitectureHealthRecordSchema,
      "architecture_health",
      ownerId,
      "assessed_at",
      limit,
    );
  }

  async saveRecommendation(recommendation: RecommendationRecord) {
    const parsed = RecommendationRecordSchema.parse(recommendation);
    await this.pool.query(
      `INSERT INTO recommendations(id,owner_id,repository_id,category,priority,status,confidence,created_at,updated_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET priority=$5,status=$6,confidence=$7,updated_at=$9,record=$10`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.repositoryId,
        parsed.category,
        parsed.priority,
        parsed.status,
        parsed.confidence,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  listRecommendations(ownerId: string, limit: number) {
    return rows(
      this.pool,
      RecommendationRecordSchema,
      "recommendations",
      ownerId,
      "updated_at",
      limit,
    );
  }

  async saveOpportunity(opportunity: OpportunityRecord) {
    const parsed = OpportunityRecordSchema.parse(opportunity);
    await this.pool.query(
      `INSERT INTO opportunities(id,owner_id,repository_id,category,priority,detected_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.repositoryId,
        parsed.category,
        parsed.priority,
        parsed.detectedAt,
        parsed,
      ],
    );
  }

  listOpportunities(ownerId: string, limit: number) {
    return rows(
      this.pool,
      OpportunityRecordSchema,
      "opportunities",
      ownerId,
      "detected_at",
      limit,
    );
  }

  async saveRoadmap(roadmap: RoadmapRecord) {
    const parsed = RoadmapRecordSchema.parse(roadmap);
    await this.pool.query(
      `INSERT INTO roadmaps(id,owner_id,horizon,created_at,updated_at,record)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET horizon=$3,updated_at=$5,record=$6`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.horizon,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  listRoadmaps(ownerId: string, limit: number) {
    return rows(
      this.pool,
      RoadmapRecordSchema,
      "roadmaps",
      ownerId,
      "updated_at",
      limit,
    );
  }

  async saveReleaseAssessment(assessment: ReleaseAssessmentRecord) {
    const parsed = ReleaseAssessmentRecordSchema.parse(assessment);
    await this.pool.query(
      `INSERT INTO release_assessments(id,owner_id,repository_id,status,score,assessed_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET status=$4,score=$5,assessed_at=$6,record=$7`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.repositoryId,
        parsed.status,
        parsed.score,
        parsed.assessedAt,
        parsed,
      ],
    );
  }

  listReleaseAssessments(ownerId: string, limit: number) {
    return rows(
      this.pool,
      ReleaseAssessmentRecordSchema,
      "release_assessments",
      ownerId,
      "assessed_at",
      limit,
    );
  }

  async saveSimulation(simulation: SimulationRunRecord) {
    const parsed = ScenarioSimulationResponseSchema.parse(simulation);
    await this.pool.query(
      `INSERT INTO simulation_runs(id,owner_id,risk,rollback_complexity,confidence,created_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.risk,
        parsed.rollbackComplexity,
        parsed.confidence,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  listSimulations(ownerId: string, limit: number) {
    return rows(
      this.pool,
      ScenarioSimulationResponseSchema,
      "simulation_runs",
      ownerId,
      "created_at",
      limit,
    );
  }

  async saveMetrics(metrics: EngineeringMetricsRecord) {
    const parsed = EngineeringMetricsRecordSchema.parse(metrics);
    await this.pool.query(
      `INSERT INTO engineering_metrics(id,owner_id,average_repository_health,release_readiness,recorded_at,record)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.averageRepositoryHealth,
        parsed.releaseReadiness,
        parsed.recordedAt,
        parsed,
      ],
    );
  }

  async latestMetrics(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_metrics WHERE owner_id=$1 ORDER BY recorded_at DESC LIMIT 1",
      [ownerId],
    );
    return result.rows[0]
      ? EngineeringMetricsRecordSchema.parse(result.rows[0].record)
      : undefined;
  }
}

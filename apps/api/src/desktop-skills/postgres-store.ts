import {
  ApprovalCheckpointRecordSchema,
  DesktopSkillRecordSchema,
  DesktopWorkflowMetricRecordSchema,
  ExecutionConditionRecordSchema,
  ExecutionContextRecordSchema,
  ExecutionDependencyRecordSchema,
  ExecutionGraphRecordSchema,
  DesktopExecutionStepRecordSchema,
  SkillExecutionRecordSchema,
  WorkflowFailureRecordSchema,
  WorkflowRecoveryRecordSchema,
  type ApprovalCheckpointRecord,
  type DesktopSkillRecord,
  type DesktopWorkflowMetricRecord,
  type ExecutionConditionRecord,
  type ExecutionContextRecord,
  type ExecutionDependencyRecord,
  type ExecutionGraphRecord,
  type DesktopExecutionStepRecord,
  type SkillExecutionRecord,
  type WorkflowFailureRecord,
  type WorkflowRecoveryRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { DesktopSkillStore } from "./store.js";

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

const insertRecord = async (
  pool: Pool,
  table: string,
  record: { id: string; ownerId: string },
  columns: Record<string, string | number | boolean | null>,
) => {
  const names = ["id", "owner_id", ...Object.keys(columns), "record"];
  const values = [record.id, record.ownerId, ...Object.values(columns), record];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
  const updates = [...Object.keys(columns), "record"]
    .map((name) => `${name}=EXCLUDED.${name}`)
    .join(",");
  await pool.query(
    `INSERT INTO ${table}(${names.join(",")}) VALUES (${placeholders})
     ON CONFLICT (owner_id, id) DO UPDATE SET ${updates}`,
    values,
  );
};

export class PostgresDesktopSkillStore implements DesktopSkillStore {
  constructor(readonly pool: Pool) {}

  async saveDesktopSkill(record: DesktopSkillRecord) {
    const parsed = DesktopSkillRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_skills", parsed, {
      generated_skill_id: parsed.generatedSkillId,
      health: parsed.health,
      planner_available: parsed.plannerAvailable,
      updated_at: parsed.updatedAt,
    });
  }
  listDesktopSkills(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_skills",
      ownerId,
      "updated_at",
      limit,
      DesktopSkillRecordSchema,
    );
  }
  async getDesktopSkill(ownerId: string, skillId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM desktop_skills WHERE owner_id=$1 AND id=$2",
      [ownerId, skillId],
    );
    return result.rows[0]
      ? DesktopSkillRecordSchema.parse(result.rows[0].record)
      : null;
  }
  async saveSkillExecution(record: SkillExecutionRecord) {
    const parsed = SkillExecutionRecordSchema.parse(record);
    await insertRecord(this.pool, "skill_execution", parsed, {
      root_skill_id: parsed.rootSkillId,
      status: parsed.status,
      origin: parsed.origin,
      updated_at: parsed.updatedAt,
    });
  }
  listSkillExecutions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "skill_execution",
      ownerId,
      "updated_at",
      limit,
      SkillExecutionRecordSchema,
    );
  }
  async getSkillExecution(ownerId: string, executionId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM skill_execution WHERE owner_id=$1 AND id=$2",
      [ownerId, executionId],
    );
    return result.rows[0]
      ? SkillExecutionRecordSchema.parse(result.rows[0].record)
      : null;
  }
  async saveExecutionStep(record: DesktopExecutionStepRecord) {
    const parsed = DesktopExecutionStepRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_execution_steps", parsed, {
      execution_id: parsed.executionId,
      skill_id: parsed.skillId,
      status: parsed.status,
      sequence: parsed.sequence,
      updated_at: parsed.updatedAt,
    });
  }
  listExecutionSteps(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_execution_steps",
      ownerId,
      "updated_at",
      limit,
      DesktopExecutionStepRecordSchema,
    );
  }
  async saveExecutionGraph(record: ExecutionGraphRecord) {
    const parsed = ExecutionGraphRecordSchema.parse(record);
    await insertRecord(this.pool, "execution_graphs", parsed, {
      execution_id: parsed.executionId,
      root_skill_id: parsed.rootSkillId,
      updated_at: parsed.updatedAt,
    });
  }
  listExecutionGraphs(ownerId: string, limit: number) {
    return list(
      this.pool,
      "execution_graphs",
      ownerId,
      "updated_at",
      limit,
      ExecutionGraphRecordSchema,
    );
  }
  async saveExecutionContext(record: ExecutionContextRecord) {
    const parsed = ExecutionContextRecordSchema.parse(record);
    await insertRecord(this.pool, "execution_context", parsed, {
      execution_id: parsed.executionId,
      current_skill_id: parsed.currentSkillId,
      updated_at: parsed.updatedAt,
    });
  }
  listExecutionContext(ownerId: string, limit: number) {
    return list(
      this.pool,
      "execution_context",
      ownerId,
      "updated_at",
      limit,
      ExecutionContextRecordSchema,
    );
  }
  async saveExecutionCondition(record: ExecutionConditionRecord) {
    const parsed = ExecutionConditionRecordSchema.parse(record);
    await insertRecord(this.pool, "execution_conditions", parsed, {
      execution_id: parsed.executionId,
      step_id: parsed.stepId,
      status: parsed.status,
      evaluated_at: parsed.evaluatedAt,
    });
  }
  listExecutionConditions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "execution_conditions",
      ownerId,
      "evaluated_at",
      limit,
      ExecutionConditionRecordSchema,
    );
  }
  async saveExecutionDependency(record: ExecutionDependencyRecord) {
    const parsed = ExecutionDependencyRecordSchema.parse(record);
    await insertRecord(this.pool, "execution_dependencies", parsed, {
      execution_id: parsed.executionId,
      from_step_id: parsed.fromStepId,
      to_step_id: parsed.toStepId,
      satisfied: parsed.satisfied,
      updated_at: parsed.updatedAt,
    });
  }
  listExecutionDependencies(ownerId: string, limit: number) {
    return list(
      this.pool,
      "execution_dependencies",
      ownerId,
      "updated_at",
      limit,
      ExecutionDependencyRecordSchema,
    );
  }
  async saveApprovalCheckpoint(record: ApprovalCheckpointRecord) {
    const parsed = ApprovalCheckpointRecordSchema.parse(record);
    await insertRecord(this.pool, "approval_checkpoints", parsed, {
      execution_id: parsed.executionId,
      step_id: parsed.stepId,
      status: parsed.status,
      requested_at: parsed.requestedAt,
    });
  }
  listApprovalCheckpoints(ownerId: string, limit: number) {
    return list(
      this.pool,
      "approval_checkpoints",
      ownerId,
      "requested_at",
      limit,
      ApprovalCheckpointRecordSchema,
    );
  }
  async saveWorkflowFailure(record: WorkflowFailureRecord) {
    const parsed = WorkflowFailureRecordSchema.parse(record);
    await insertRecord(this.pool, "workflow_failures", parsed, {
      execution_id: parsed.executionId,
      step_id: parsed.stepId,
      recoverable: parsed.recoverable,
      occurred_at: parsed.occurredAt,
    });
  }
  listWorkflowFailures(ownerId: string, limit: number) {
    return list(
      this.pool,
      "workflow_failures",
      ownerId,
      "occurred_at",
      limit,
      WorkflowFailureRecordSchema,
    );
  }
  async saveWorkflowRecovery(record: WorkflowRecoveryRecord) {
    const parsed = WorkflowRecoveryRecordSchema.parse(record);
    await insertRecord(this.pool, "workflow_recovery", parsed, {
      execution_id: parsed.executionId,
      step_id: parsed.stepId,
      action: parsed.action,
      status: parsed.status,
      created_at: parsed.createdAt,
    });
  }
  listWorkflowRecovery(ownerId: string, limit: number) {
    return list(
      this.pool,
      "workflow_recovery",
      ownerId,
      "created_at",
      limit,
      WorkflowRecoveryRecordSchema,
    );
  }
  async saveDesktopWorkflowMetric(record: DesktopWorkflowMetricRecord) {
    const parsed = DesktopWorkflowMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_workflow_metrics", parsed, {
      execution_id: parsed.executionId,
      skill_id: parsed.skillId,
      metric_name: parsed.metricName,
      measured_at: parsed.measuredAt,
    });
  }
  listDesktopWorkflowMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_workflow_metrics",
      ownerId,
      "measured_at",
      limit,
      DesktopWorkflowMetricRecordSchema,
    );
  }
}

import {
  CommandDependencyRecordSchema,
  CommandParameterRecordSchema,
  CommandVersionRecordSchema,
  DemonstrationSessionRecordSchema,
  GeneratedSkillRecordSchema,
  GeneratedCommandRecordSchema,
  IntentRecordingRecordSchema,
  OptimizationSuggestionRecordSchema,
  RecordedEventRecordSchema,
  SemanticRecordingRecordSchema,
  SkillParameterRecordSchema,
  SkillUsageRecordSchema,
  SkillVersionRecordSchema,
  WorkflowConditionRecordSchema,
  WorkflowDependencyRecordSchema,
  WorkflowTimelineRecordSchema,
  WorkflowValidationRecordSchema,
  WorkflowAnalyticsRecordSchema,
  WorkflowTemplateRecordSchema,
  type CommandDependencyRecord,
  type CommandParameterRecord,
  type CommandVersionRecord,
  type DemonstrationSessionRecord,
  type GeneratedSkillRecord,
  type GeneratedCommandRecord,
  type IntentRecordingRecord,
  type OptimizationSuggestionRecord,
  type RecordedEventRecord,
  type SemanticRecordingRecord,
  type SkillParameterRecord,
  type SkillUsageRecord,
  type SkillVersionRecord,
  type WorkflowConditionRecord,
  type WorkflowDependencyRecord,
  type WorkflowTimelineRecord,
  type WorkflowValidationRecord,
  type WorkflowAnalyticsRecord,
  type WorkflowTemplateRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { IntentRecordingStore } from "./store.js";

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
  await pool.query(
    `INSERT INTO ${table}(${names.join(",")}) VALUES (${placeholders})
     ON CONFLICT (owner_id, id) DO UPDATE SET record=EXCLUDED.record`,
    values,
  );
};

export class PostgresIntentRecordingStore implements IntentRecordingStore {
  constructor(readonly pool: Pool) {}

  async saveRecording(record: IntentRecordingRecord) {
    const parsed = IntentRecordingRecordSchema.parse(record);
    await insertRecord(this.pool, "intent_recordings", parsed, {
      status: parsed.status,
      source: parsed.source,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listRecordings(ownerId: string, limit: number) {
    return list(
      this.pool,
      "intent_recordings",
      ownerId,
      "updated_at",
      limit,
      IntentRecordingRecordSchema,
    );
  }
  async getRecording(ownerId: string, recordingId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM intent_recordings WHERE owner_id=$1 AND id=$2",
      [ownerId, recordingId],
    );
    return result.rows[0]
      ? IntentRecordingRecordSchema.parse(result.rows[0].record)
      : null;
  }
  async saveEvent(record: RecordedEventRecord) {
    const parsed = RecordedEventRecordSchema.parse(record);
    await insertRecord(this.pool, "recorded_events", parsed, {
      recording_id: parsed.recordingId,
      sequence: parsed.sequence,
      source: parsed.source,
      event_type: parsed.type,
      occurred_at: parsed.occurredAt,
    });
  }
  async listEvents(ownerId: string, recordingId: string | null, limit: number) {
    if (recordingId) {
      const result = await this.pool.query<{ record: unknown }>(
        "SELECT record FROM recorded_events WHERE owner_id=$1 AND recording_id=$2 ORDER BY sequence ASC LIMIT $3",
        [ownerId, recordingId, limit],
      );
      return result.rows.map((row) => RecordedEventRecordSchema.parse(row.record));
    }
    return list(
      this.pool,
      "recorded_events",
      ownerId,
      "occurred_at",
      limit,
      RecordedEventRecordSchema,
    );
  }
  async saveTemplate(record: WorkflowTemplateRecord) {
    const parsed = WorkflowTemplateRecordSchema.parse(record);
    await insertRecord(this.pool, "workflow_templates", parsed, {
      recording_id: parsed.recordingId,
      category: parsed.category,
      risk_level: parsed.riskLevel,
      updated_at: parsed.updatedAt,
    });
  }
  listTemplates(ownerId: string, limit: number) {
    return list(
      this.pool,
      "workflow_templates",
      ownerId,
      "updated_at",
      limit,
      WorkflowTemplateRecordSchema,
    );
  }
  async saveGeneratedCommand(record: GeneratedCommandRecord) {
    const parsed = GeneratedCommandRecordSchema.parse(record);
    await insertRecord(this.pool, "generated_commands", parsed, {
      recording_id: parsed.recordingId,
      template_id: parsed.templateId,
      status: parsed.status,
      risk_level: parsed.riskLevel,
      updated_at: parsed.updatedAt,
    });
  }
  listGeneratedCommands(ownerId: string, limit: number) {
    return list(
      this.pool,
      "generated_commands",
      ownerId,
      "updated_at",
      limit,
      GeneratedCommandRecordSchema,
    );
  }
  async getGeneratedCommand(ownerId: string, generatedCommandId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM generated_commands WHERE owner_id=$1 AND id=$2",
      [ownerId, generatedCommandId],
    );
    return result.rows[0]
      ? GeneratedCommandRecordSchema.parse(result.rows[0].record)
      : null;
  }
  async saveParameter(record: CommandParameterRecord) {
    const parsed = CommandParameterRecordSchema.parse(record);
    await insertRecord(this.pool, "command_parameters", parsed, {
      generated_command_id: parsed.generatedCommandId,
      name: parsed.name,
      updated_at: parsed.updatedAt,
    });
  }
  listParameters(ownerId: string, limit: number) {
    return list(
      this.pool,
      "command_parameters",
      ownerId,
      "updated_at",
      limit,
      CommandParameterRecordSchema,
    );
  }
  async saveVersion(record: CommandVersionRecord) {
    const parsed = CommandVersionRecordSchema.parse(record);
    await insertRecord(this.pool, "command_versions", parsed, {
      generated_command_id: parsed.generatedCommandId,
      version: parsed.version,
      created_at: parsed.createdAt,
    });
  }
  listVersions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "command_versions",
      ownerId,
      "created_at",
      limit,
      CommandVersionRecordSchema,
    );
  }
  async saveAnalytics(record: WorkflowAnalyticsRecord) {
    const parsed = WorkflowAnalyticsRecordSchema.parse(record);
    await insertRecord(this.pool, "workflow_analytics", parsed, {
      generated_command_id: parsed.generatedCommandId,
      recording_id: parsed.recordingId,
      measured_at: parsed.measuredAt,
    });
  }
  listAnalytics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "workflow_analytics",
      ownerId,
      "measured_at",
      limit,
      WorkflowAnalyticsRecordSchema,
    );
  }
  async saveDemonstrationSession(record: DemonstrationSessionRecord) {
    const parsed = DemonstrationSessionRecordSchema.parse(record);
    await insertRecord(this.pool, "demonstration_sessions", parsed, {
      recording_id: parsed.recordingId,
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  listDemonstrationSessions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "demonstration_sessions",
      ownerId,
      "updated_at",
      limit,
      DemonstrationSessionRecordSchema,
    );
  }
  async saveOptimizationSuggestion(record: OptimizationSuggestionRecord) {
    const parsed = OptimizationSuggestionRecordSchema.parse(record);
    await insertRecord(this.pool, "optimization_suggestions", parsed, {
      generated_command_id: parsed.generatedCommandId,
      recording_id: parsed.recordingId,
      status: parsed.status,
      created_at: parsed.createdAt,
    });
  }
  listOptimizationSuggestions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "optimization_suggestions",
      ownerId,
      "created_at",
      limit,
      OptimizationSuggestionRecordSchema,
    );
  }
  async saveDependency(record: CommandDependencyRecord) {
    const parsed = CommandDependencyRecordSchema.parse(record);
    await insertRecord(this.pool, "command_dependencies", parsed, {
      generated_command_id: parsed.generatedCommandId,
      dependency_type: parsed.dependencyType,
      dependency_id: parsed.dependencyId,
      updated_at: parsed.updatedAt,
    });
  }
  listDependencies(ownerId: string, limit: number) {
    return list(
      this.pool,
      "command_dependencies",
      ownerId,
      "updated_at",
      limit,
      CommandDependencyRecordSchema,
    );
  }
  async saveSemanticRecording(record: SemanticRecordingRecord) {
    const parsed = SemanticRecordingRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_recordings", parsed, {
      recording_id: parsed.recordingId,
      stage: parsed.stage,
      updated_at: parsed.updatedAt,
    });
  }
  listSemanticRecordings(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_recordings",
      ownerId,
      "updated_at",
      limit,
      SemanticRecordingRecordSchema,
    );
  }
  async saveWorkflowTimeline(record: WorkflowTimelineRecord) {
    const parsed = WorkflowTimelineRecordSchema.parse(record);
    await insertRecord(this.pool, "workflow_timelines", parsed, {
      recording_id: parsed.recordingId,
      generated_skill_id: parsed.generatedSkillId,
      generated_at: parsed.generatedAt,
      updated_at: parsed.updatedAt,
    });
  }
  listWorkflowTimelines(ownerId: string, limit: number) {
    return list(
      this.pool,
      "workflow_timelines",
      ownerId,
      "updated_at",
      limit,
      WorkflowTimelineRecordSchema,
    );
  }
  async getWorkflowTimeline(ownerId: string, timelineId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM workflow_timelines WHERE owner_id=$1 AND id=$2",
      [ownerId, timelineId],
    );
    return result.rows[0]
      ? WorkflowTimelineRecordSchema.parse(result.rows[0].record)
      : null;
  }
  async saveGeneratedSkill(record: GeneratedSkillRecord) {
    const parsed = GeneratedSkillRecordSchema.parse(record);
    await insertRecord(this.pool, "generated_skills", parsed, {
      recording_id: parsed.recordingId,
      timeline_id: parsed.timelineId,
      status: parsed.status,
      category: parsed.category,
      updated_at: parsed.updatedAt,
    });
  }
  listGeneratedSkills(ownerId: string, limit: number) {
    return list(
      this.pool,
      "generated_skills",
      ownerId,
      "updated_at",
      limit,
      GeneratedSkillRecordSchema,
    );
  }
  async getGeneratedSkill(ownerId: string, skillId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM generated_skills WHERE owner_id=$1 AND id=$2",
      [ownerId, skillId],
    );
    return result.rows[0]
      ? GeneratedSkillRecordSchema.parse(result.rows[0].record)
      : null;
  }
  async saveSkillParameter(record: SkillParameterRecord) {
    const parsed = SkillParameterRecordSchema.parse(record);
    await insertRecord(this.pool, "skill_parameters", parsed, {
      skill_id: parsed.skillId,
      name: parsed.name,
      updated_at: parsed.updatedAt,
    });
  }
  listSkillParameters(ownerId: string, limit: number) {
    return list(
      this.pool,
      "skill_parameters",
      ownerId,
      "updated_at",
      limit,
      SkillParameterRecordSchema,
    );
  }
  async saveSkillVersion(record: SkillVersionRecord) {
    const parsed = SkillVersionRecordSchema.parse(record);
    await insertRecord(this.pool, "skill_versions", parsed, {
      skill_id: parsed.skillId,
      version: parsed.version,
      created_at: parsed.createdAt,
    });
  }
  listSkillVersions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "skill_versions",
      ownerId,
      "created_at",
      limit,
      SkillVersionRecordSchema,
    );
  }
  async saveSkillUsage(record: SkillUsageRecord) {
    const parsed = SkillUsageRecordSchema.parse(record);
    await insertRecord(this.pool, "skill_usage", parsed, {
      skill_id: parsed.skillId,
      status: parsed.status,
      executed_at: parsed.executedAt,
    });
  }
  listSkillUsage(ownerId: string, limit: number) {
    return list(
      this.pool,
      "skill_usage",
      ownerId,
      "executed_at",
      limit,
      SkillUsageRecordSchema,
    );
  }
  async saveWorkflowValidation(record: WorkflowValidationRecord) {
    const parsed = WorkflowValidationRecordSchema.parse(record);
    await insertRecord(this.pool, "workflow_validation", parsed, {
      recording_id: parsed.recordingId,
      skill_id: parsed.skillId,
      status: parsed.status,
      validated_at: parsed.validatedAt,
    });
  }
  listWorkflowValidation(ownerId: string, limit: number) {
    return list(
      this.pool,
      "workflow_validation",
      ownerId,
      "validated_at",
      limit,
      WorkflowValidationRecordSchema,
    );
  }
  async saveWorkflowCondition(record: WorkflowConditionRecord) {
    const parsed = WorkflowConditionRecordSchema.parse(record);
    await insertRecord(this.pool, "demonstration_workflow_conditions", parsed, {
      skill_id: parsed.skillId,
      condition_type: parsed.conditionType,
      updated_at: parsed.updatedAt,
    });
  }
  listWorkflowConditions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "demonstration_workflow_conditions",
      ownerId,
      "updated_at",
      limit,
      WorkflowConditionRecordSchema,
    );
  }
  async saveWorkflowDependency(record: WorkflowDependencyRecord) {
    const parsed = WorkflowDependencyRecordSchema.parse(record);
    await insertRecord(this.pool, "demonstration_workflow_dependencies", parsed, {
      skill_id: parsed.skillId,
      dependency_type: parsed.dependencyType,
      dependency_id: parsed.dependencyId,
      updated_at: parsed.updatedAt,
    });
  }
  listWorkflowDependencies(ownerId: string, limit: number) {
    return list(
      this.pool,
      "demonstration_workflow_dependencies",
      ownerId,
      "updated_at",
      limit,
      WorkflowDependencyRecordSchema,
    );
  }
}

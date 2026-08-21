import {
  ClarificationSessionRecordSchema,
  CommandHistoryRecordSchema,
  CommandMetricRecordSchema,
  CommandRecordSchema,
  CommandSuggestionRecordSchema,
  CommandTemplateRecordSchema,
  ExecutionPlanRecordSchema,
  ExecutionStepRecordSchema,
  IntentAnalysisRecordSchema,
  MacroRecordSchema,
  SavedCommandRecordSchema,
  type ClarificationSessionRecord,
  type CommandHistoryRecord,
  type CommandMetricRecord,
  type CommandRecord,
  type CommandSuggestionRecord,
  type CommandTemplateRecord,
  type ExecutionPlanRecord,
  type ExecutionStepRecord,
  type IntentAnalysisRecord,
  type MacroRecord,
  type SavedCommandRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { IntentStore } from "./store.js";

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
     ON CONFLICT (id) DO UPDATE SET record=EXCLUDED.record`,
    values,
  );
};

export class PostgresIntentStore implements IntentStore {
  constructor(readonly pool: Pool) {}

  async saveCommand(record: CommandRecord) {
    const parsed = CommandRecordSchema.parse(record);
    await insertRecord(this.pool, "commands", parsed, {
      source: parsed.source,
      status: parsed.status,
      safety_level: parsed.safetyLevel,
      approval_required: parsed.approvalRequired,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listCommands(ownerId: string, limit: number) {
    return list(
      this.pool,
      "commands",
      ownerId,
      "created_at",
      limit,
      CommandRecordSchema,
    );
  }
  async saveIntent(record: IntentAnalysisRecord) {
    const parsed = IntentAnalysisRecordSchema.parse(record);
    await insertRecord(this.pool, "intent_analysis", parsed, {
      command_id: null,
      category: parsed.category,
      confidence: parsed.confidence,
      clarification_needed: parsed.clarificationNeeded,
      created_at: parsed.createdAt,
    });
  }
  listIntents(ownerId: string, limit: number) {
    return list(
      this.pool,
      "intent_analysis",
      ownerId,
      "created_at",
      limit,
      IntentAnalysisRecordSchema,
    );
  }
  async savePlan(record: ExecutionPlanRecord) {
    const parsed = ExecutionPlanRecordSchema.parse(record);
    await insertRecord(this.pool, "execution_plans", parsed, {
      command_id: parsed.commandId,
      status: parsed.status,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listPlans(ownerId: string, limit: number) {
    return list(
      this.pool,
      "execution_plans",
      ownerId,
      "created_at",
      limit,
      ExecutionPlanRecordSchema,
    );
  }
  async saveStep(record: ExecutionStepRecord) {
    const parsed = ExecutionStepRecordSchema.parse(record);
    await insertRecord(this.pool, "execution_steps", parsed, {
      plan_id: parsed.planId,
      command_id: parsed.commandId,
      sequence: parsed.sequence,
      status: parsed.status,
      approval_required: parsed.approvalRequired,
    });
  }
  listSteps(ownerId: string, limit: number) {
    return list(
      this.pool,
      "execution_steps",
      ownerId,
      "sequence",
      limit,
      ExecutionStepRecordSchema,
    );
  }
  async saveHistory(record: CommandHistoryRecord) {
    const parsed = CommandHistoryRecordSchema.parse(record);
    await insertRecord(this.pool, "command_history", parsed, {
      command_id: parsed.commandId,
      outcome: parsed.outcome,
      created_at: parsed.createdAt,
    });
  }
  listHistory(ownerId: string, limit: number) {
    return list(
      this.pool,
      "command_history",
      ownerId,
      "created_at",
      limit,
      CommandHistoryRecordSchema,
    );
  }
  async saveMacro(record: MacroRecord) {
    const parsed = MacroRecordSchema.parse(record);
    await insertRecord(this.pool, "macros", parsed, {
      mode: parsed.mode,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listMacros(ownerId: string) {
    return list(this.pool, "macros", ownerId, "updated_at", 200, MacroRecordSchema);
  }
  async saveSavedCommand(record: SavedCommandRecord) {
    const parsed = SavedCommandRecordSchema.parse(record);
    await insertRecord(this.pool, "saved_commands", parsed, {
      pinned: parsed.pinned,
      favorite: parsed.favorite,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listSavedCommands(ownerId: string) {
    return list(
      this.pool,
      "saved_commands",
      ownerId,
      "updated_at",
      500,
      SavedCommandRecordSchema,
    );
  }
  async saveTemplate(record: CommandTemplateRecord) {
    const parsed = CommandTemplateRecordSchema.parse(record);
    await insertRecord(this.pool, "command_templates", parsed, {
      category: parsed.category,
      version: parsed.version,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listTemplates(ownerId: string) {
    return list(
      this.pool,
      "command_templates",
      ownerId,
      "updated_at",
      500,
      CommandTemplateRecordSchema,
    );
  }
  async saveClarification(record: ClarificationSessionRecord) {
    const parsed = ClarificationSessionRecordSchema.parse(record);
    await insertRecord(this.pool, "clarification_sessions", parsed, {
      command_id: parsed.commandId,
      status: parsed.status,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listClarifications(ownerId: string, limit: number) {
    return list(
      this.pool,
      "clarification_sessions",
      ownerId,
      "created_at",
      limit,
      ClarificationSessionRecordSchema,
    );
  }
  async saveMetric(record: CommandMetricRecord) {
    const parsed = CommandMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "command_metrics", parsed, {
      metric_name: parsed.metricName,
      value: parsed.value,
      trend: parsed.trend,
      measured_at: parsed.measuredAt,
    });
  }
  listMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "command_metrics",
      ownerId,
      "measured_at",
      limit,
      CommandMetricRecordSchema,
    );
  }
  async saveSuggestion(record: CommandSuggestionRecord) {
    const parsed = CommandSuggestionRecordSchema.parse(record);
    await insertRecord(this.pool, "command_suggestions", parsed, {
      confidence: parsed.confidence,
      created_at: parsed.createdAt,
    });
  }
  listSuggestions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "command_suggestions",
      ownerId,
      "created_at",
      limit,
      CommandSuggestionRecordSchema,
    );
  }
}

import {
  BackgroundMonitorRecordSchema,
  ChecklistItemRecordSchema,
  ChecklistRecordSchema,
  GoalRecordSchema,
  RoutineRecordSchema,
  TaskConditionSchema,
  TaskDependencySchema,
  TaskMetricRecordSchema,
  TaskNotificationSchema,
  TaskRecordSchema,
  TaskRunSchema,
  TaskSuggestionRecordSchema,
  TaskTriggerSchema,
  type BackgroundMonitorRecord,
  type ChecklistItemRecord,
  type ChecklistRecord,
  type GoalRecord,
  type RoutineRecord,
  type TaskConditionRecord,
  type TaskDependencyRecord,
  type TaskMetricRecord,
  type TaskNotificationRecord,
  type TaskRecord,
  type TaskRun,
  type TaskSuggestionRecord,
  type TaskTriggerRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { TaskStore } from "./store.js";
import { companyScope } from "../companies/scope.js";

const list = async <T>(
  pool: Pool,
  table: string,
  ownerId: string,
  order: string,
  limit: number,
  schema: { parse: (value: unknown) => T },
) => {
  const result = await pool.query<{ record: unknown }>(
    `SELECT record FROM ${table} WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY ${order} DESC LIMIT $2`,
    [ownerId, limit, companyScope.companyId(ownerId) ?? null],
  );
  return result.rows.map((row) => schema.parse(row.record));
};

const insertRecord = async (
  pool: Pool,
  table: string,
  record: { id: string; ownerId: string },
  columns: Record<string, string | number | boolean | null>,
) => {
  const names = ["id", "owner_id", "company_id", ...Object.keys(columns), "record"];
  const values = [record.id, record.ownerId, companyScope.companyId(record.ownerId) ?? null, ...Object.values(columns), record];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
  await pool.query(
    `INSERT INTO ${table}(${names.join(",")}) VALUES (${placeholders})
     ON CONFLICT (id) DO UPDATE SET record=EXCLUDED.record`,
    values,
  );
};

export class PostgresTaskStore implements TaskStore {
  constructor(readonly pool: Pool) {}

  async saveTask(record: TaskRecord) {
    const parsed = TaskRecordSchema.parse(record);
    await insertRecord(this.pool, "tasks", parsed, {
      name: parsed.name,
      type: parsed.type,
      status: parsed.status,
      priority: parsed.priority,
      category: parsed.category,
      deadline_at: parsed.deadlineAt,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
    await insertRecord(this.pool, "task_schedules", parsed, {
      task_id: parsed.id,
      kind: parsed.schedule.kind,
      timezone: parsed.schedule.timezone,
      next_run_at: parsed.schedule.preview[0] ?? parsed.schedule.startAt,
    });
  }
  listTasks(ownerId: string, limit: number) {
    return list(this.pool, "tasks", ownerId, "created_at", limit, TaskRecordSchema);
  }
  async getTask(ownerId: string, taskId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM tasks WHERE owner_id=$1 AND id=$2 AND ($3::uuid IS NULL OR company_id=$3)",
      [ownerId, taskId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows[0] ? TaskRecordSchema.parse(result.rows[0].record) : null;
  }
  async saveRun(record: TaskRun) {
    const parsed = TaskRunSchema.parse(record);
    await insertRecord(this.pool, "task_runs", parsed, {
      task_id: parsed.taskId,
      status: parsed.status,
      command_id: parsed.commandId,
      started_at: parsed.startedAt,
      completed_at: parsed.completedAt,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listRuns(ownerId: string, limit: number) {
    return list(this.pool, "task_runs", ownerId, "created_at", limit, TaskRunSchema);
  }
  async saveTrigger(record: TaskTriggerRecord) {
    const parsed = TaskTriggerSchema.parse(record);
    await insertRecord(this.pool, "task_triggers", parsed, {
      task_id: parsed.taskId,
      type: parsed.type,
      source: parsed.source,
      enabled: parsed.enabled,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listTriggers(ownerId: string, limit: number) {
    return list(
      this.pool,
      "task_triggers",
      ownerId,
      "created_at",
      limit,
      TaskTriggerSchema,
    );
  }
  async saveCondition(record: TaskConditionRecord) {
    const parsed = TaskConditionSchema.parse(record);
    await insertRecord(this.pool, "task_conditions", parsed, {
      task_id: parsed.taskId,
      logic: parsed.logic,
      field: parsed.field,
      operator: parsed.operator,
      enabled: parsed.enabled,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listConditions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "task_conditions",
      ownerId,
      "created_at",
      limit,
      TaskConditionSchema,
    );
  }
  async saveDependency(record: TaskDependencyRecord) {
    const parsed = TaskDependencySchema.parse(record);
    await insertRecord(this.pool, "task_dependencies", parsed, {
      task_id: parsed.taskId,
      depends_on_task_id: parsed.dependsOnTaskId,
      kind: parsed.kind,
      optional: parsed.optional,
      created_at: parsed.createdAt,
    });
  }
  listDependencies(ownerId: string, limit: number) {
    return list(
      this.pool,
      "task_dependencies",
      ownerId,
      "created_at",
      limit,
      TaskDependencySchema,
    );
  }
  async saveNotification(record: TaskNotificationRecord) {
    const parsed = TaskNotificationSchema.parse(record);
    await insertRecord(this.pool, "task_notifications", parsed, {
      task_id: parsed.taskId,
      channel: parsed.channel,
      status: parsed.status,
      scheduled_for: parsed.scheduledFor,
      sent_at: parsed.sentAt,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listNotifications(ownerId: string, limit: number) {
    return list(
      this.pool,
      "task_notifications",
      ownerId,
      "created_at",
      limit,
      TaskNotificationSchema,
    );
  }
  async saveGoal(record: GoalRecord) {
    const parsed = GoalRecordSchema.parse(record);
    await insertRecord(this.pool, "goals", parsed, {
      status: parsed.status,
      priority: parsed.priority,
      completion_percent: parsed.completionPercent,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listGoals(ownerId: string, limit: number) {
    return list(this.pool, "goals", ownerId, "created_at", limit, GoalRecordSchema);
  }
  async saveChecklist(record: ChecklistRecord) {
    const parsed = ChecklistRecordSchema.parse(record);
    await insertRecord(this.pool, "checklists", parsed, {
      category: parsed.category,
      reusable: parsed.reusable,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listChecklists(ownerId: string, limit: number) {
    return list(
      this.pool,
      "checklists",
      ownerId,
      "created_at",
      limit,
      ChecklistRecordSchema,
    );
  }
  async saveChecklistItem(record: ChecklistItemRecord) {
    const parsed = ChecklistItemRecordSchema.parse(record);
    await insertRecord(this.pool, "checklist_items", parsed, {
      checklist_id: parsed.checklistId,
      sequence: parsed.sequence,
      status: parsed.status,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listChecklistItems(ownerId: string, limit: number) {
    return list(
      this.pool,
      "checklist_items",
      ownerId,
      "sequence",
      limit,
      ChecklistItemRecordSchema,
    );
  }
  async saveRoutine(record: RoutineRecord) {
    const parsed = RoutineRecordSchema.parse(record);
    await insertRecord(this.pool, "routines", parsed, {
      mode: parsed.mode,
      enabled: parsed.enabled,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listRoutines(ownerId: string, limit: number) {
    return list(
      this.pool,
      "routines",
      ownerId,
      "created_at",
      limit,
      RoutineRecordSchema,
    );
  }
  async saveMonitor(record: BackgroundMonitorRecord) {
    const parsed = BackgroundMonitorRecordSchema.parse(record);
    await insertRecord(this.pool, "background_monitors", parsed, {
      monitor_type: parsed.monitorType,
      status: parsed.status,
      last_checked_at: parsed.lastCheckedAt,
      next_check_at: parsed.nextCheckAt,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listMonitors(ownerId: string, limit: number) {
    return list(
      this.pool,
      "background_monitors",
      ownerId,
      "created_at",
      limit,
      BackgroundMonitorRecordSchema,
    );
  }
  async saveMetric(record: TaskMetricRecord) {
    const parsed = TaskMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "task_metrics", parsed, {
      metric_name: parsed.metricName,
      value: parsed.value,
      trend: parsed.trend,
      measured_at: parsed.measuredAt,
    });
  }
  listMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "task_metrics",
      ownerId,
      "measured_at",
      limit,
      TaskMetricRecordSchema,
    );
  }
  async saveSuggestion(record: TaskSuggestionRecord) {
    const parsed = TaskSuggestionRecordSchema.parse(record);
    await insertRecord(this.pool, "task_suggestions", parsed, {
      confidence: parsed.confidence,
      created_at: parsed.createdAt,
    });
  }
  listSuggestions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "task_suggestions",
      ownerId,
      "created_at",
      limit,
      TaskSuggestionRecordSchema,
    );
  }
}

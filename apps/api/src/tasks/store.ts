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

import type { Awaitable } from "../identity/store.js";

export interface TaskStore {
  saveTask(record: TaskRecord): Awaitable<void>;
  listTasks(ownerId: string, limit: number): Awaitable<TaskRecord[]>;
  getTask(ownerId: string, taskId: string): Awaitable<TaskRecord | null>;
  saveRun(record: TaskRun): Awaitable<void>;
  listRuns(ownerId: string, limit: number): Awaitable<TaskRun[]>;
  saveTrigger(record: TaskTriggerRecord): Awaitable<void>;
  listTriggers(ownerId: string, limit: number): Awaitable<TaskTriggerRecord[]>;
  saveCondition(record: TaskConditionRecord): Awaitable<void>;
  listConditions(ownerId: string, limit: number): Awaitable<TaskConditionRecord[]>;
  saveDependency(record: TaskDependencyRecord): Awaitable<void>;
  listDependencies(ownerId: string, limit: number): Awaitable<TaskDependencyRecord[]>;
  saveNotification(record: TaskNotificationRecord): Awaitable<void>;
  listNotifications(
    ownerId: string,
    limit: number,
  ): Awaitable<TaskNotificationRecord[]>;
  saveGoal(record: GoalRecord): Awaitable<void>;
  listGoals(ownerId: string, limit: number): Awaitable<GoalRecord[]>;
  saveChecklist(record: ChecklistRecord): Awaitable<void>;
  listChecklists(ownerId: string, limit: number): Awaitable<ChecklistRecord[]>;
  saveChecklistItem(record: ChecklistItemRecord): Awaitable<void>;
  listChecklistItems(ownerId: string, limit: number): Awaitable<ChecklistItemRecord[]>;
  saveRoutine(record: RoutineRecord): Awaitable<void>;
  listRoutines(ownerId: string, limit: number): Awaitable<RoutineRecord[]>;
  saveMonitor(record: BackgroundMonitorRecord): Awaitable<void>;
  listMonitors(ownerId: string, limit: number): Awaitable<BackgroundMonitorRecord[]>;
  saveMetric(record: TaskMetricRecord): Awaitable<void>;
  listMetrics(ownerId: string, limit: number): Awaitable<TaskMetricRecord[]>;
  saveSuggestion(record: TaskSuggestionRecord): Awaitable<void>;
  listSuggestions(ownerId: string, limit: number): Awaitable<TaskSuggestionRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryTaskStore implements TaskStore {
  readonly #tasks = new Map<string, TaskRecord>();
  readonly #runs = new Map<string, TaskRun>();
  readonly #triggers = new Map<string, TaskTriggerRecord>();
  readonly #conditions = new Map<string, TaskConditionRecord>();
  readonly #dependencies = new Map<string, TaskDependencyRecord>();
  readonly #notifications = new Map<string, TaskNotificationRecord>();
  readonly #goals = new Map<string, GoalRecord>();
  readonly #checklists = new Map<string, ChecklistRecord>();
  readonly #checklistItems = new Map<string, ChecklistItemRecord>();
  readonly #routines = new Map<string, RoutineRecord>();
  readonly #monitors = new Map<string, BackgroundMonitorRecord>();
  readonly #metrics = new Map<string, TaskMetricRecord>();
  readonly #suggestions = new Map<string, TaskSuggestionRecord>();

  saveTask(record: TaskRecord) {
    this.#tasks.set(record.id, clone(TaskRecordSchema.parse(record)));
  }
  listTasks(ownerId: string, limit: number) {
    return ordered(
      [...this.#tasks.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  getTask(ownerId: string, taskId: string) {
    const task = this.#tasks.get(taskId);
    return task?.ownerId === ownerId ? clone(task) : null;
  }
  saveRun(record: TaskRun) {
    this.#runs.set(record.id, clone(TaskRunSchema.parse(record)));
  }
  listRuns(ownerId: string, limit: number) {
    return ordered(
      [...this.#runs.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveTrigger(record: TaskTriggerRecord) {
    this.#triggers.set(record.id, clone(TaskTriggerSchema.parse(record)));
  }
  listTriggers(ownerId: string, limit: number) {
    return ordered(
      [...this.#triggers.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveCondition(record: TaskConditionRecord) {
    this.#conditions.set(record.id, clone(TaskConditionSchema.parse(record)));
  }
  listConditions(ownerId: string, limit: number) {
    return ordered(
      [...this.#conditions.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveDependency(record: TaskDependencyRecord) {
    this.#dependencies.set(record.id, clone(TaskDependencySchema.parse(record)));
  }
  listDependencies(ownerId: string, limit: number) {
    return ordered(
      [...this.#dependencies.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveNotification(record: TaskNotificationRecord) {
    this.#notifications.set(record.id, clone(TaskNotificationSchema.parse(record)));
  }
  listNotifications(ownerId: string, limit: number) {
    return ordered(
      [...this.#notifications.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveGoal(record: GoalRecord) {
    this.#goals.set(record.id, clone(GoalRecordSchema.parse(record)));
  }
  listGoals(ownerId: string, limit: number) {
    return ordered(
      [...this.#goals.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveChecklist(record: ChecklistRecord) {
    this.#checklists.set(record.id, clone(ChecklistRecordSchema.parse(record)));
  }
  listChecklists(ownerId: string, limit: number) {
    return ordered(
      [...this.#checklists.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveChecklistItem(record: ChecklistItemRecord) {
    this.#checklistItems.set(record.id, clone(ChecklistItemRecordSchema.parse(record)));
  }
  listChecklistItems(ownerId: string, limit: number) {
    return ordered(
      [...this.#checklistItems.values()].filter((item) => item.ownerId === ownerId),
      "sequence",
      limit,
    );
  }
  saveRoutine(record: RoutineRecord) {
    this.#routines.set(record.id, clone(RoutineRecordSchema.parse(record)));
  }
  listRoutines(ownerId: string, limit: number) {
    return ordered(
      [...this.#routines.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveMonitor(record: BackgroundMonitorRecord) {
    this.#monitors.set(record.id, clone(BackgroundMonitorRecordSchema.parse(record)));
  }
  listMonitors(ownerId: string, limit: number) {
    return ordered(
      [...this.#monitors.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveMetric(record: TaskMetricRecord) {
    this.#metrics.set(record.id, clone(TaskMetricRecordSchema.parse(record)));
  }
  listMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#metrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveSuggestion(record: TaskSuggestionRecord) {
    this.#suggestions.set(record.id, clone(TaskSuggestionRecordSchema.parse(record)));
  }
  listSuggestions(ownerId: string, limit: number) {
    return ordered(
      [...this.#suggestions.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
}

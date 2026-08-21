import { z } from "zod";

import { CommandSafetyLevelSchema, IntentCategorySchema } from "./intent.js";
import { MemoryEvidenceSchema } from "./memory.js";

export const TaskTypeSchema = z.enum([
  "immediate",
  "scheduled",
  "recurring",
  "background",
  "monitoring",
  "reminder",
  "goal_task",
  "checklist",
  "automation",
  "pipeline",
  "long_running_project",
  "multi_stage_workflow",
  "maintenance",
  "condition_watch",
  "custom",
]);

export const TaskStatusSchema = z.enum([
  "draft",
  "scheduled",
  "waiting_approval",
  "ready",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
  "blocked",
  "archived",
]);

export const ScheduleKindSchema = z.enum([
  "none",
  "once",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "cron",
  "interval",
  "business_days",
]);

export const TriggerTypeSchema = z.enum([
  "manual",
  "time",
  "calendar",
  "repository_change",
  "workflow_completion",
  "file_change",
  "database_event",
  "email_received",
  "webhook",
  "application_opened",
  "network_change",
  "vpn_status",
  "trusted_device",
  "user_activity",
  "agent_request",
  "custom_event",
]);

export const ConditionOperatorSchema = z.enum([
  "exists",
  "equals",
  "not_equals",
  "greater_than",
  "less_than",
  "contains",
  "within_window",
]);

export const ConditionLogicSchema = z.enum(["AND", "OR", "NOT"]);

export const DependencyKindSchema = z.enum([
  "sequential",
  "parallel",
  "conditional",
  "fan_out",
  "fan_in",
  "blocking",
  "optional",
  "soft",
]);

export const NotificationChannelSchema = z.enum([
  "desktop",
  "mobile",
  "email",
  "slack",
  "discord",
  "webhook",
  "push",
]);

export const TaskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);

export const TaskExecutionPolicySchema = z
  .object({
    safetyLevel: CommandSafetyLevelSchema,
    requiresApproval: z.boolean(),
    requiresRecentAuthentication: z.boolean(),
    requiresPrivateNetwork: z.boolean(),
    requiresTrustedDevice: z.boolean(),
    allowedProviders: z
      .array(
        z.enum([
          "intent_engine",
          "workflow_engine",
          "agent_society",
          "integration_registry",
          "read_only_execution",
          "validation_engine",
          "manual_owner",
        ]),
      )
      .max(20),
    autonomousExecutionAllowed: z.literal(false),
  })
  .strict();

export const TaskScheduleSchema = z
  .object({
    kind: ScheduleKindSchema,
    timezone: z.string().min(1).max(80),
    startAt: z.iso.datetime().nullable(),
    endAt: z.iso.datetime().nullable(),
    cronExpression: z.string().min(1).max(120).nullable(),
    intervalSeconds: z.number().int().positive().nullable(),
    quietHours: z
      .array(
        z
          .object({
            start: z.string().regex(/^\d{2}:\d{2}$/),
            end: z.string().regex(/^\d{2}:\d{2}$/),
          })
          .strict(),
      )
      .max(7),
    blackoutPeriods: z
      .array(
        z
          .object({
            startAt: z.iso.datetime(),
            endAt: z.iso.datetime(),
            reason: z.string().min(1).max(255),
          })
          .strict(),
      )
      .max(50),
    preview: z.array(z.iso.datetime()).max(10),
  })
  .strict();

export const TaskTriggerSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    taskId: z.string().uuid(),
    type: TriggerTypeSchema,
    source: z.string().min(1).max(120),
    eventName: z.string().min(1).max(160),
    enabled: z.boolean(),
    metadata: z.record(z.string().max(80), z.json()).default({}),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const TaskConditionSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    taskId: z.string().uuid(),
    logic: ConditionLogicSchema,
    field: z.string().min(1).max(160),
    operator: ConditionOperatorSchema,
    expected: z.json(),
    windowSeconds: z.number().int().positive().nullable(),
    enabled: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const TaskDependencySchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    taskId: z.string().uuid(),
    dependsOnTaskId: z.string().uuid(),
    kind: DependencyKindSchema,
    requiredStatus: z.enum(["completed", "ready", "approved", "not_failed"]),
    optional: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const TaskNotificationSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    taskId: z.string().uuid(),
    channel: NotificationChannelSchema,
    title: z.string().min(1).max(255),
    message: z.string().min(1).max(1_000),
    status: z.enum(["pending", "sent", "snoozed", "dismissed", "failed"]),
    escalationLevel: z.number().int().min(0).max(5),
    scheduledFor: z.iso.datetime().nullable(),
    sentAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const TaskRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(160),
    description: z.string().min(1).max(1_000),
    goal: z.string().min(1).max(1_000),
    priority: TaskPrioritySchema,
    category: IntentCategorySchema,
    type: TaskTypeSchema,
    status: TaskStatusSchema,
    schedule: TaskScheduleSchema,
    triggerSummary: z.string().min(1).max(500),
    conditionSummary: z.string().min(1).max(500),
    dependencyIds: z.array(z.string().uuid()).max(50),
    executionPolicy: TaskExecutionPolicySchema,
    approvalPolicy: z.enum([
      "none",
      "confirmation",
      "explicit",
      "recent_authentication",
    ]),
    assignedAgentIds: z.array(z.string().min(3).max(120)).max(50),
    retryPolicy: z
      .object({
        maxRetries: z.number().int().min(0).max(5),
        strategy: z.enum(["none", "linear", "exponential"]),
      })
      .strict(),
    timeoutSeconds: z.number().int().positive(),
    deadlineAt: z.iso.datetime().nullable(),
    successCriteria: z.array(z.string().min(1).max(500)).min(1).max(50),
    failureCriteria: z.array(z.string().min(1).max(500)).max(50),
    rollbackStrategy: z.string().min(1).max(1_000),
    metadata: z.record(z.string().max(80), z.json()).default({}),
    version: z.string().min(1).max(40),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const TaskRunSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    taskId: z.string().uuid(),
    status: z.enum([
      "queued",
      "waiting_approval",
      "running",
      "completed",
      "failed",
      "cancelled",
      "skipped",
    ]),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    commandId: z.string().uuid().nullable(),
    outcome: z.string().min(1).max(1_000),
    retryCount: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const GoalRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(1_000),
    status: z.enum(["active", "paused", "completed", "cancelled"]),
    priority: TaskPrioritySchema,
    completionPercent: z.number().int().min(0).max(100),
    supportingTaskIds: z.array(z.string().uuid()).max(100),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ChecklistRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(160),
    category: z.string().min(1).max(120),
    reusable: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ChecklistItemRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    checklistId: z.string().uuid(),
    label: z.string().min(1).max(255),
    status: z.enum(["open", "completed", "skipped"]),
    sequence: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const RoutineRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(160),
    description: z.string().min(1).max(1_000),
    mode: z.enum([
      "morning",
      "coding_session",
      "end_of_day",
      "weekly_review",
      "travel",
      "meeting_preparation",
      "deep_work",
      "sleep",
      "custom",
    ]),
    taskIds: z.array(z.string().uuid()).max(100),
    enabled: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const BackgroundMonitorRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(160),
    target: z.string().min(1).max(255),
    monitorType: z.enum([
      "workflow",
      "repository",
      "integration",
      "deployment",
      "api",
      "database",
      "memory",
      "custom",
    ]),
    status: z.enum(["active", "paused", "unavailable", "failed"]),
    lastCheckedAt: z.iso.datetime().nullable(),
    nextCheckAt: z.iso.datetime().nullable(),
    lightweight: z.literal(true),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const TaskMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    metricName: z.string().min(1).max(120),
    value: z.number(),
    trend: z.number().min(-1).max(1),
    summary: z.string().min(1).max(1_000),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const TaskSuggestionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    title: z.string().min(1).max(255),
    rationale: z.string().min(1).max(1_000),
    suggestedTask: z.string().min(1).max(1_000),
    confidence: z.number().min(0).max(1),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const TaskCenterResponseSchema = z
  .object({
    tasks: z.array(TaskRecordSchema).max(500),
    runs: z.array(TaskRunSchema).max(500),
    triggers: z.array(TaskTriggerSchema).max(500),
    conditions: z.array(TaskConditionSchema).max(500),
    dependencies: z.array(TaskDependencySchema).max(500),
    notifications: z.array(TaskNotificationSchema).max(500),
    goals: z.array(GoalRecordSchema).max(500),
    checklists: z.array(ChecklistRecordSchema).max(500),
    checklistItems: z.array(ChecklistItemRecordSchema).max(1_000),
    routines: z.array(RoutineRecordSchema).max(500),
    monitors: z.array(BackgroundMonitorRecordSchema).max(500),
    metrics: z.array(TaskMetricRecordSchema).max(500),
    suggestions: z.array(TaskSuggestionRecordSchema).max(500),
    proactive: z.literal(true),
    autonomousExecutionBypassesGovernance: z.literal(false),
  })
  .strict();

export const CreateTaskRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(1_000),
    goal: z.string().trim().min(1).max(1_000),
    type: TaskTypeSchema.default("scheduled"),
    priority: TaskPrioritySchema.default("normal"),
    category: IntentCategorySchema.default("productivity"),
    scheduleKind: ScheduleKindSchema.default("once"),
    startAt: z.iso.datetime().nullable().default(null),
    timezone: z.string().trim().min(1).max(80).default("UTC"),
    triggerType: TriggerTypeSchema.default("manual"),
    condition: z.string().trim().max(500).default("No additional condition."),
    deadlineAt: z.iso.datetime().nullable().default(null),
  })
  .strict();

export const TaskTriggerRequestSchema = z
  .object({
    taskId: z.string().uuid(),
    reason: z.string().trim().min(1).max(500).default("Manual trigger."),
  })
  .strict();

export const CreateGoalRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(1_000),
    priority: TaskPrioritySchema.default("normal"),
  })
  .strict();

export const CreateRoutineRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(1_000),
    mode: RoutineRecordSchema.shape.mode.default("custom"),
    taskIds: z.array(z.string().uuid()).max(100).default([]),
  })
  .strict();

export const CreateChecklistRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    category: z.string().trim().min(1).max(120).default("general"),
    items: z.array(z.string().trim().min(1).max(255)).min(1).max(50),
    reusable: z.boolean().default(true),
  })
  .strict();

export type TaskType = z.infer<typeof TaskTypeSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskRecord = z.infer<typeof TaskRecordSchema>;
export type TaskRun = z.infer<typeof TaskRunSchema>;
export type TaskTriggerRecord = z.infer<typeof TaskTriggerSchema>;
export type TaskConditionRecord = z.infer<typeof TaskConditionSchema>;
export type TaskDependencyRecord = z.infer<typeof TaskDependencySchema>;
export type TaskNotificationRecord = z.infer<typeof TaskNotificationSchema>;
export type GoalRecord = z.infer<typeof GoalRecordSchema>;
export type ChecklistRecord = z.infer<typeof ChecklistRecordSchema>;
export type ChecklistItemRecord = z.infer<typeof ChecklistItemRecordSchema>;
export type RoutineRecord = z.infer<typeof RoutineRecordSchema>;
export type BackgroundMonitorRecord = z.infer<typeof BackgroundMonitorRecordSchema>;
export type TaskMetricRecord = z.infer<typeof TaskMetricRecordSchema>;
export type TaskSuggestionRecord = z.infer<typeof TaskSuggestionRecordSchema>;
export type TaskCenterResponse = z.infer<typeof TaskCenterResponseSchema>;
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;
export type TaskTriggerRequest = z.infer<typeof TaskTriggerRequestSchema>;
export type CreateGoalRequest = z.infer<typeof CreateGoalRequestSchema>;
export type CreateRoutineRequest = z.infer<typeof CreateRoutineRequestSchema>;
export type CreateChecklistRequest = z.infer<typeof CreateChecklistRequestSchema>;

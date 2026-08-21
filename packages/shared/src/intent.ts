import { z } from "zod";

import { MemoryEvidenceSchema } from "./memory.js";

export const IntentCategorySchema = z.enum([
  "application_control",
  "repository_operations",
  "software_development",
  "file_management",
  "communication",
  "calendar",
  "productivity",
  "research",
  "planning",
  "knowledge_retrieval",
  "media",
  "system_control",
  "automation",
  "personal_tasks",
  "integrations",
  "system_administration",
  "monitoring",
  "notifications",
  "shopping",
  "travel",
  "finance",
  "custom_user_command",
]);

export const CommandSafetyLevelSchema = z.enum([
  "informational",
  "read_only",
  "low_risk",
  "moderate_risk",
  "high_risk",
  "critical",
]);

export const CommandStatusSchema = z.enum([
  "parsed",
  "needs_clarification",
  "planned",
  "waiting_approval",
  "ready",
  "running",
  "completed",
  "failed",
  "cancelled",
  "archived",
]);

export const ExecutionStepStatusSchema = z.enum([
  "pending",
  "waiting_approval",
  "ready",
  "running",
  "completed",
  "failed",
  "skipped",
  "cancelled",
]);

export const InternalCommandSchema = z
  .object({
    action: z.string().min(1).max(160),
    target: z.string().min(1).max(255),
    context: z.record(z.string().max(80), z.json()).default({}),
    constraints: z.array(z.string().min(1).max(500)).max(50),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    approvalLevel: z.enum([
      "none",
      "confirmation",
      "explicit",
      "recent_authentication",
    ]),
    expectedResult: z.string().min(1).max(1_000),
    dependencies: z.array(z.string().uuid()).max(50),
    retryPolicy: z
      .object({
        maxRetries: z.number().int().min(0).max(5),
        strategy: z.enum(["none", "linear", "exponential"]),
      })
      .strict(),
  })
  .strict();

export const IntentAnalysisRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    originalRequest: z.string().min(1).max(4_000),
    primaryGoal: z.string().min(1).max(1_000),
    secondaryGoals: z.array(z.string().min(1).max(1_000)).max(25),
    category: IntentCategorySchema,
    contextSummary: z.string().min(1).max(1_000),
    constraints: z.array(z.string().min(1).max(500)).max(50),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    urgency: z.enum(["low", "normal", "time_sensitive", "immediate"]),
    requiredPermissions: z.array(z.string().min(1).max(120)).max(50),
    requiredCapabilities: z.array(z.string().min(1).max(120)).max(50),
    expectedOutput: z.string().min(1).max(1_000),
    successCriteria: z.array(z.string().min(1).max(500)).min(1).max(50),
    confidence: z.number().min(0).max(1),
    clarificationNeeded: z.boolean(),
    clarificationQuestions: z.array(z.string().min(1).max(500)).max(5),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const CommandRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    source: z.enum([
      "desktop",
      "mobile",
      "voice",
      "scheduled_task",
      "gesture",
      "api",
      "integration",
    ]),
    originalRequest: z.string().min(1).max(4_000),
    status: CommandStatusSchema,
    safetyLevel: CommandSafetyLevelSchema,
    approvalRequired: z.boolean(),
    recentAuthenticationRequired: z.boolean(),
    privateNetworkRequired: z.boolean(),
    trustedDeviceRequired: z.boolean(),
    intentIds: z.array(z.string().uuid()).min(1).max(25),
    command: InternalCommandSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ExecutionPlanRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    commandId: z.string().uuid(),
    goal: z.string().min(1).max(1_000),
    summary: z.string().min(1).max(2_000),
    orderedStepIds: z.array(z.string().uuid()).max(100),
    parallelGroups: z.array(z.array(z.string().uuid()).max(20)).max(20),
    estimatedDurationSeconds: z.number().int().nonnegative(),
    approvalsRequired: z.array(z.string().min(1).max(120)).max(50),
    rollbackStrategy: z.string().min(1).max(2_000),
    validationStrategy: z.string().min(1).max(2_000),
    completionCriteria: z.array(z.string().min(1).max(500)).min(1).max(50),
    status: z.enum([
      "draft",
      "waiting_approval",
      "ready",
      "running",
      "completed",
      "failed",
      "cancelled",
    ]),
    inspectable: z.literal(true),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ExecutionStepRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    planId: z.string().uuid(),
    commandId: z.string().uuid(),
    sequence: z.number().int().positive(),
    title: z.string().min(1).max(255),
    description: z.string().min(1).max(1_000),
    assignedAgentIds: z.array(z.string().min(3).max(120)).max(20),
    requiredCapabilities: z.array(z.string().min(1).max(120)).max(50),
    executionProvider: z.enum([
      "agent_society",
      "workflow_engine",
      "approval_engine",
      "read_only_execution",
      "validation_engine",
      "integration_registry",
      "manual_owner",
      "none",
    ]),
    approvalRequired: z.boolean(),
    status: ExecutionStepStatusSchema,
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const CommandHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    commandId: z.string().uuid(),
    originalRequest: z.string().min(1).max(4_000),
    outcome: z.enum(["pending", "success", "failure", "cancelled", "needs_approval"]),
    durationSeconds: z.number().int().nonnegative(),
    agentsInvolved: z.array(z.string().min(3).max(120)).max(50),
    approvals: z.array(z.string().min(1).max(120)).max(50),
    lessonsLearned: z.array(z.string().min(1).max(1_000)).max(50),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const MacroRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(1_000),
    commandTemplateIds: z.array(z.string().uuid()).max(50),
    mode: z.enum([
      "work",
      "focus",
      "deployment",
      "research",
      "coding",
      "travel",
      "custom",
    ]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SavedCommandRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    requestTemplate: z.string().min(1).max(4_000),
    pinned: z.boolean(),
    favorite: z.boolean(),
    version: z.string().min(1).max(40),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CommandTemplateRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    category: IntentCategorySchema,
    template: z.string().min(1).max(4_000),
    version: z.string().min(1).max(40),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ClarificationSessionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    commandId: z.string().uuid(),
    questions: z.array(z.string().min(1).max(500)).min(1).max(5),
    status: z.enum(["open", "answered", "cancelled", "expired"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CommandMetricRecordSchema = z
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

export const CommandSuggestionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    title: z.string().min(1).max(255),
    rationale: z.string().min(1).max(1_000),
    suggestedCommand: z.string().min(1).max(4_000),
    confidence: z.number().min(0).max(1),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const CommandCenterResponseSchema = z
  .object({
    commands: z.array(CommandRecordSchema).max(500),
    intentAnalyses: z.array(IntentAnalysisRecordSchema).max(500),
    plans: z.array(ExecutionPlanRecordSchema).max(500),
    steps: z.array(ExecutionStepRecordSchema).max(1_000),
    history: z.array(CommandHistoryRecordSchema).max(500),
    macros: z.array(MacroRecordSchema).max(200),
    savedCommands: z.array(SavedCommandRecordSchema).max(500),
    templates: z.array(CommandTemplateRecordSchema).max(500),
    clarificationSessions: z.array(ClarificationSessionRecordSchema).max(200),
    metrics: z.array(CommandMetricRecordSchema).max(500),
    suggestions: z.array(CommandSuggestionRecordSchema).max(500),
    universalEntryPoint: z.literal(true),
    bypassesGovernance: z.literal(false),
  })
  .strict();

export const SubmitCommandRequestSchema = z
  .object({
    request: z.string().trim().min(1).max(4_000),
    source: CommandRecordSchema.shape.source.default("desktop"),
  })
  .strict();

export const SubmitCommandResponseSchema = z
  .object({
    command: CommandRecordSchema,
    intents: z.array(IntentAnalysisRecordSchema).min(1).max(25),
    plan: ExecutionPlanRecordSchema,
    steps: z.array(ExecutionStepRecordSchema).min(1).max(100),
    history: CommandHistoryRecordSchema,
  })
  .strict();

export const SaveCommandRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    requestTemplate: z.string().trim().min(1).max(4_000),
    pinned: z.boolean().default(false),
    favorite: z.boolean().default(false),
  })
  .strict();

export const MacroRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(1_000),
    mode: MacroRecordSchema.shape.mode,
    commandTemplateIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .strict();

export type IntentCategory = z.infer<typeof IntentCategorySchema>;
export type CommandSafetyLevel = z.infer<typeof CommandSafetyLevelSchema>;
export type CommandStatus = z.infer<typeof CommandStatusSchema>;
export type InternalCommand = z.infer<typeof InternalCommandSchema>;
export type IntentAnalysisRecord = z.infer<typeof IntentAnalysisRecordSchema>;
export type CommandRecord = z.infer<typeof CommandRecordSchema>;
export type ExecutionPlanRecord = z.infer<typeof ExecutionPlanRecordSchema>;
export type ExecutionStepRecord = z.infer<typeof ExecutionStepRecordSchema>;
export type CommandHistoryRecord = z.infer<typeof CommandHistoryRecordSchema>;
export type MacroRecord = z.infer<typeof MacroRecordSchema>;
export type SavedCommandRecord = z.infer<typeof SavedCommandRecordSchema>;
export type CommandTemplateRecord = z.infer<typeof CommandTemplateRecordSchema>;
export type ClarificationSessionRecord = z.infer<
  typeof ClarificationSessionRecordSchema
>;
export type CommandMetricRecord = z.infer<typeof CommandMetricRecordSchema>;
export type CommandSuggestionRecord = z.infer<typeof CommandSuggestionRecordSchema>;
export type CommandCenterResponse = z.infer<typeof CommandCenterResponseSchema>;
export type SubmitCommandRequest = z.infer<typeof SubmitCommandRequestSchema>;
export type SaveCommandRequest = z.infer<typeof SaveCommandRequestSchema>;
export type MacroRequest = z.infer<typeof MacroRequestSchema>;

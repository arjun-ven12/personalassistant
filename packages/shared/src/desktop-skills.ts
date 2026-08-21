import { z } from "zod";

import {
  AdapterCapabilitySchema,
  AdapterPermissionSchema,
  RegistryIdSchema,
} from "./applications.js";

export const DesktopSkillStatusSchema = z.enum([
  "draft",
  "approved",
  "healthy",
  "degraded",
  "disabled",
  "archived",
]);

export const DesktopWorkflowStatusSchema = z.enum([
  "pending",
  "running",
  "paused",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
  "recovered",
]);

export const DesktopWorkflowStepStatusSchema = z.enum([
  "pending",
  "ready",
  "running",
  "verified",
  "awaiting_approval",
  "skipped",
  "failed",
  "cancelled",
]);

export const DesktopWorkflowOriginSchema = z.enum([
  "planner",
  "agent",
  "voice",
  "gesture",
  "dashboard",
  "command",
]);

export const DesktopWorkflowNodeKindSchema = z.enum([
  "skill",
  "condition",
  "wait",
  "approval_checkpoint",
  "parallel_group",
  "recovery",
  "notification",
]);

export const DesktopWorkflowRecoveryActionSchema = z.enum([
  "retry",
  "rollback",
  "resume",
  "skip_with_approval",
  "abort",
  "alternative_skill",
]);

export const DesktopSkillRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    generatedSkillId: z.string().uuid().nullable(),
    name: z.string().min(1).max(160),
    description: z.string().min(1).max(1_000),
    capabilities: z.array(AdapterCapabilitySchema).max(100),
    inputSchema: z.record(z.string().min(1).max(80), z.json()).default({}),
    outputs: z.array(z.string().min(1).max(120)).max(50),
    dependencies: z.array(z.string().min(1).max(200)).max(100),
    permissions: z.array(AdapterPermissionSchema).max(100),
    estimatedRuntimeMs: z.number().int().nonnegative(),
    health: DesktopSkillStatusSchema,
    version: z.string().min(1).max(40),
    tags: z.array(z.string().min(1).max(80)).max(40),
    confidence: z.number().min(0).max(1),
    plannerAvailable: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SkillExecutionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    rootSkillId: z.string().uuid(),
    goal: z.string().min(1).max(1_000),
    origin: DesktopWorkflowOriginSchema,
    status: DesktopWorkflowStatusSchema,
    currentSkillId: z.string().uuid().nullable(),
    currentStepId: z.string().uuid().nullable(),
    variables: z.record(z.string().min(1).max(80), z.json()).default({}),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DesktopExecutionStepRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    executionId: z.string().uuid(),
    skillId: z.string().uuid(),
    sequence: z.number().int().positive(),
    title: z.string().min(1).max(240),
    nodeKind: DesktopWorkflowNodeKindSchema,
    capabilityId: z.string().min(1).max(160).nullable(),
    applicationId: RegistryIdSchema.nullable(),
    dependencies: z.array(z.string().uuid()).max(50),
    status: DesktopWorkflowStepStatusSchema,
    verification: z.string().min(1).max(500),
    retryCount: z.number().int().nonnegative(),
    maxRetries: z.number().int().nonnegative().max(5),
    timeoutMs: z.number().int().positive().max(3_600_000),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ExecutionGraphRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    executionId: z.string().uuid(),
    rootSkillId: z.string().uuid(),
    nodes: z.array(z.string().uuid()).max(500),
    edges: z
      .array(
        z
          .object({
            from: z.string().uuid(),
            to: z.string().uuid(),
            dependencyType: z.enum([
              "sequential",
              "parallel_join",
              "condition",
              "recovery",
            ]),
          })
          .strict(),
      )
      .max(1_000),
    deterministic: z.literal(true),
    pixelAutomationUsed: z.literal(false),
    coordinateReplayUsed: z.literal(false),
    ocrUsed: z.literal(false),
    generatedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ExecutionContextRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    executionId: z.string().uuid(),
    currentApplicationId: RegistryIdSchema.nullable(),
    currentWindowId: z.string().max(180).nullable(),
    currentRepository: z.string().max(180).nullable(),
    currentWorkspace: z.string().max(180).nullable(),
    currentWorkflowId: z.string().uuid(),
    currentVariables: z.record(z.string().min(1).max(80), z.json()).default({}),
    currentSkillId: z.string().uuid().nullable(),
    executionHistory: z.array(z.string().uuid()).max(500),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ExecutionConditionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    executionId: z.string().uuid(),
    stepId: z.string().uuid(),
    conditionType: z.enum(["if", "else", "wait", "retry", "timeout", "repeat", "loop"]),
    expression: z.string().min(1).max(500),
    status: z.enum(["pending", "satisfied", "failed", "timed_out"]),
    evaluatedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const ExecutionDependencyRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    executionId: z.string().uuid(),
    fromStepId: z.string().uuid(),
    toStepId: z.string().uuid(),
    dependencyType: z.enum([
      "sequential",
      "parallel",
      "condition",
      "approval",
      "recovery",
    ]),
    satisfied: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ApprovalCheckpointRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    executionId: z.string().uuid(),
    stepId: z.string().uuid(),
    reason: z.string().min(1).max(500),
    riskLevel: z.enum(["moderate", "high", "critical"]),
    status: z.enum(["pending", "approved", "rejected", "cancelled"]),
    requestedAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const WorkflowFailureRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    executionId: z.string().uuid(),
    stepId: z.string().uuid().nullable(),
    cause: z.string().min(1).max(500),
    recoverable: z.boolean(),
    occurredAt: z.iso.datetime(),
  })
  .strict();

export const WorkflowRecoveryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    executionId: z.string().uuid(),
    stepId: z.string().uuid().nullable(),
    action: DesktopWorkflowRecoveryActionSchema,
    status: z.enum(["suggested", "applied", "rejected", "failed"]),
    approvalRequired: z.boolean(),
    summary: z.string().min(1).max(500),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const DesktopWorkflowMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    executionId: z.string().uuid().nullable(),
    skillId: z.string().uuid().nullable(),
    metricName: z.string().min(1).max(120),
    value: z.number(),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const DesktopSkillExecutionRequestSchema = z
  .object({
    goal: z.string().trim().min(1).max(1_000),
    skillId: z.string().uuid().optional(),
    origin: DesktopWorkflowOriginSchema.default("dashboard"),
    variables: z.record(z.string().min(1).max(80), z.json()).default({}),
    preview: z.boolean().default(false),
  })
  .strict();

export const DesktopWorkflowIdRequestSchema = z
  .object({ executionId: z.string().uuid() })
  .strict();

export const DesktopSkillsCenterResponseSchema = z
  .object({
    desktopSkills: z.array(DesktopSkillRecordSchema).max(500),
    skillExecutions: z.array(SkillExecutionRecordSchema).max(500),
    executionSteps: z.array(DesktopExecutionStepRecordSchema).max(2_000),
    executionGraphs: z.array(ExecutionGraphRecordSchema).max(500),
    executionContext: z.array(ExecutionContextRecordSchema).max(500),
    executionConditions: z.array(ExecutionConditionRecordSchema).max(1_000),
    executionDependencies: z.array(ExecutionDependencyRecordSchema).max(2_000),
    approvalCheckpoints: z.array(ApprovalCheckpointRecordSchema).max(500),
    workflowFailures: z.array(WorkflowFailureRecordSchema).max(1_000),
    workflowRecovery: z.array(WorkflowRecoveryRecordSchema).max(1_000),
    desktopWorkflowMetrics: z.array(DesktopWorkflowMetricRecordSchema).max(1_000),
    autonomousDesktopSkillsAvailable: z.literal(true),
    deterministicWorkflowExecution: z.literal(true),
    pixelAutomationAvailable: z.literal(false),
    coordinateReplayAvailable: z.literal(false),
    ocrAutomationAvailable: z.literal(false),
    computerVisionRequired: z.literal(false),
    hiddenCapabilityExecutionAvailable: z.literal(false),
    skillsModifyAutomatically: z.literal(false),
  })
  .strict();

export type DesktopSkillRecord = z.infer<typeof DesktopSkillRecordSchema>;
export type DesktopWorkflowOrigin = z.infer<typeof DesktopWorkflowOriginSchema>;
export type SkillExecutionRecord = z.infer<typeof SkillExecutionRecordSchema>;
export type DesktopExecutionStepRecord = z.infer<
  typeof DesktopExecutionStepRecordSchema
>;
export type ExecutionGraphRecord = z.infer<typeof ExecutionGraphRecordSchema>;
export type ExecutionContextRecord = z.infer<typeof ExecutionContextRecordSchema>;
export type ExecutionConditionRecord = z.infer<typeof ExecutionConditionRecordSchema>;
export type ExecutionDependencyRecord = z.infer<typeof ExecutionDependencyRecordSchema>;
export type ApprovalCheckpointRecord = z.infer<typeof ApprovalCheckpointRecordSchema>;
export type WorkflowFailureRecord = z.infer<typeof WorkflowFailureRecordSchema>;
export type WorkflowRecoveryRecord = z.infer<typeof WorkflowRecoveryRecordSchema>;
export type DesktopWorkflowMetricRecord = z.infer<
  typeof DesktopWorkflowMetricRecordSchema
>;
export type DesktopSkillExecutionRequest = z.infer<
  typeof DesktopSkillExecutionRequestSchema
>;
export type DesktopSkillsCenterResponse = z.infer<
  typeof DesktopSkillsCenterResponseSchema
>;

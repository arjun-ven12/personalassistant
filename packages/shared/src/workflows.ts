import { z } from "zod";

import { RegistryIdSchema } from "./applications.js";
import { RepositorySchema } from "./repositories.js";

export const WorkflowStatusSchema = z.enum([
  "PLANNED",
  "ANALYSING",
  "READY",
  "WAITING_APPROVAL",
  "APPROVED",
  "GENERATING_PATCH",
  "EXECUTING",
  "VALIDATING",
  "FAILED",
  "BLOCKED",
  "CANCELLED",
  "COMPLETED",
  "ROLLED_BACK",
]);

export const WorkflowTaskStatusSchema = z.enum([
  "PENDING",
  "READY",
  "WAITING_APPROVAL",
  "IN_PROGRESS",
  "BLOCKED",
  "FAILED",
  "COMPLETED",
  "CANCELLED",
]);

export const WorkflowApprovalStrategySchema = z.enum([
  "approve_every_patch",
  "approve_every_task",
  "approve_every_stage",
  "approve_high_risk_only",
]);

export const WorkflowRiskLevelSchema = z.enum(["low", "medium", "high", "unknown"]);

export const WorkflowTaskSchema = z
  .object({
    id: z.string().uuid(),
    workflowId: z.string().uuid(),
    title: z.string().min(1).max(255),
    goal: z.string().min(1).max(1_000),
    status: WorkflowTaskStatusSchema,
    dependencies: z.array(z.string().uuid()).max(50),
    estimatedComplexity: z.enum(["low", "medium", "high", "unknown"]),
    affectedFiles: z.array(z.string().min(1).max(1_024)).max(200),
    riskLevel: WorkflowRiskLevelSchema,
    validationPlan: z.array(z.string().min(1).max(120)).max(20),
    rollbackPlan: z.string().min(1).max(2_000),
    patchId: z.string().uuid().nullable(),
    validationRunId: z.string().uuid().nullable(),
    approvalCheckpointId: z.string().uuid().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    failureCode: z.string().max(100).nullable(),
  })
  .strict();

export const WorkflowCheckpointSchema = z
  .object({
    id: z.string().uuid(),
    workflowId: z.string().uuid(),
    taskId: z.string().uuid().nullable(),
    kind: z.enum(["analysis", "approval", "patch", "validation", "review", "report"]),
    status: z.enum(["open", "passed", "failed", "cancelled"]),
    summary: z.string().min(1).max(2_000),
    patchId: z.string().uuid().nullable(),
    validationRunId: z.string().uuid().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const WorkflowEventSchema = z
  .object({
    id: z.string().uuid(),
    workflowId: z.string().uuid(),
    taskId: z.string().uuid().nullable(),
    eventType: z.string().min(1).max(100),
    message: z.string().min(1).max(1_000),
    createdAt: z.iso.datetime(),
    metadata: z.record(z.string().max(80), z.json()).default({}),
  })
  .strict();

export const WorkflowProgressSchema = z
  .object({
    totalTasks: z.number().int().nonnegative().max(10_000),
    completedTasks: z.number().int().nonnegative().max(10_000),
    runningTasks: z.number().int().nonnegative().max(10_000),
    blockedTasks: z.number().int().nonnegative().max(10_000),
    failedTasks: z.number().int().nonnegative().max(10_000),
    waitingApprovalTasks: z.number().int().nonnegative().max(10_000),
    remainingTasks: z.number().int().nonnegative().max(10_000),
    percentComplete: z.number().min(0).max(100),
    estimatedCompletion: z.string().max(120).nullable(),
  })
  .strict();

export const WorkflowReportSchema = z
  .object({
    workflowId: z.string().uuid(),
    title: z.string().min(1).max(255),
    summary: z.string().min(1).max(4_000),
    completedTasks: z.array(z.string().max(255)).max(500),
    blockedTasks: z.array(z.string().max(255)).max(500),
    risks: z.array(z.string().max(500)).max(100),
    validationSummary: z.string().max(2_000),
    remainingWork: z.array(z.string().max(500)).max(100),
    generatedAt: z.iso.datetime(),
  })
  .strict();

export const WorkflowRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    goal: z.string().min(1).max(1_000),
    repositoryIds: z.array(z.string().uuid()).min(1).max(20),
    workspaceIds: z.array(RegistryIdSchema).min(1).max(20),
    status: WorkflowStatusSchema,
    approvalStrategy: WorkflowApprovalStrategySchema,
    riskLevel: WorkflowRiskLevelSchema,
    difficulty: z.enum(["low", "medium", "high", "unknown"]),
    planSummary: z.string().min(1).max(4_000),
    architectureImpact: z.array(z.string().max(500)).max(100),
    validationRequirements: z.array(z.string().max(120)).max(50),
    currentTaskId: z.string().uuid().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    pausedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    failureCode: z.string().max(100).nullable(),
  })
  .strict();

export const CreateWorkflowRequestSchema = z
  .object({
    goal: z.string().trim().min(1).max(1_000),
    repositoryIds: z.array(z.string().uuid()).min(1).max(20),
    approvalStrategy: WorkflowApprovalStrategySchema.default("approve_every_patch"),
  })
  .strict();

export const WorkflowActionRequestSchema = z
  .object({ reason: z.string().max(500).optional() })
  .strict();

export const WorkflowResponseSchema = z
  .object({
    workflow: WorkflowRecordSchema,
    repositories: z.array(RepositorySchema).max(20),
    tasks: z.array(WorkflowTaskSchema).max(1_000),
    checkpoints: z.array(WorkflowCheckpointSchema).max(1_000),
    events: z.array(WorkflowEventSchema).max(1_000),
    progress: WorkflowProgressSchema,
    report: WorkflowReportSchema.nullable(),
  })
  .strict();

export const WorkflowListResponseSchema = z.array(WorkflowRecordSchema).max(100);

export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;
export type WorkflowTaskStatus = z.infer<typeof WorkflowTaskStatusSchema>;
export type WorkflowApprovalStrategy = z.infer<typeof WorkflowApprovalStrategySchema>;
export type WorkflowRecord = z.infer<typeof WorkflowRecordSchema>;
export type WorkflowTask = z.infer<typeof WorkflowTaskSchema>;
export type WorkflowCheckpoint = z.infer<typeof WorkflowCheckpointSchema>;
export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;
export type WorkflowProgress = z.infer<typeof WorkflowProgressSchema>;
export type WorkflowReport = z.infer<typeof WorkflowReportSchema>;
export type CreateWorkflowRequest = z.infer<typeof CreateWorkflowRequestSchema>;

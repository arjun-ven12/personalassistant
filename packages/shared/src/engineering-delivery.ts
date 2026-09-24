import { z } from "zod";

import { RegistryIdSchema } from "./applications.js";
import {
  EngineeringPreviewResultSchema,
  EngineeringRelativePathSchema,
  EngineeringRepositoryStatusSchema,
} from "./engineering-runtime.js";

export const EngineeringSoftwareIntentSchema = z.enum([
  "BUILD_SOFTWARE",
  "MODIFY_SOFTWARE",
  "FIX_SOFTWARE",
]);
export const EngineeringComplexitySchema = z.enum([
  "TRIVIAL",
  "SMALL",
  "MEDIUM",
  "LARGE",
  "HIGH_RISK",
]);
export const EngineeringDeliveryStatusSchema = z.enum([
  "RECEIVED",
  "INITIALIZING",
  "PLANNING",
  "IMPLEMENTING",
  "INTEGRATING",
  "REVIEWING",
  "PREVIEWING",
  "DONE",
  "DONE_WITH_WARNINGS",
  "PAUSED",
  "BLOCKED",
  "FAILED",
  "OWNER_INPUT_REQUIRED",
  "CANCELLED",
]);
export const EngineeringFeatureStatusSchema = z.enum([
  "QUEUED",
  "PLANNING",
  "IMPLEMENTING",
  "VALIDATING",
  "REVIEWING",
  "DONE",
  "BLOCKED",
  "FAILED",
]);

export const CreateSoftwareObjectiveRequestSchema = z
  .object({
    request: z.string().trim().min(5).max(8_000),
    repositoryId: z.string().uuid().nullable().default(null),
    developmentRootWorkspaceId: RegistryIdSchema.nullable().default(null),
    projectName: z.string().trim().min(1).max(100).nullable().default(null),
    acceptanceCriteria: z
      .array(z.string().trim().min(1).max(1_000))
      .max(30)
      .default([]),
    constraints: z.array(z.string().trim().min(1).max(1_000)).max(30).default([]),
    deadlineAt: z.iso.datetime().nullable().default(null),
    visibleMode: z.boolean().default(false),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.repositoryId && !value.developmentRootWorkspaceId)
      context.addIssue({
        code: "custom",
        path: ["developmentRootWorkspaceId"],
        message: "A governed development root is required for a new project.",
      });
    if (value.repositoryId && value.developmentRootWorkspaceId)
      context.addIssue({
        code: "custom",
        path: ["repositoryId"],
        message:
          "Choose either an existing repository or a new-project development root.",
      });
  });

export const AddEngineeringInstructionRequestSchema = z
  .object({
    instruction: z.string().trim().min(3).max(2_000),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const EngineeringFeatureProgressSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(160),
    acceptanceCriteria: z.array(z.string().min(1).max(1_000)).max(10),
    taskIds: z.array(z.string().uuid()).max(10),
    weight: z.number().int().min(1).max(100),
    status: EngineeringFeatureStatusSchema,
  })
  .strict();

export const EngineeringModelUsageSchema = z
  .object({
    tier: z.enum(["LUNA", "TERRA", "SOL", "ASTRA"]),
    calls: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.string().regex(/^\d+(\.\d{1,8})?$/),
  })
  .strict();

export const EngineeringDeliverySchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    objectiveId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    integrationRunId: z.string().uuid().nullable(),
    candidateId: z.string().uuid().nullable(),
    intent: EngineeringSoftwareIntentSchema,
    projectMode: z.enum(["NEW", "EXISTING"]),
    projectName: z.string().min(1).max(100),
    sourceRequest: z.string().min(5).max(8_000),
    complexity: EngineeringComplexitySchema,
    stack: z.array(z.string().min(1).max(80)).max(20),
    features: z.array(EngineeringFeatureProgressSchema).min(1).max(30),
    status: EngineeringDeliveryStatusSchema,
    visibleMode: z.boolean(),
    preview: EngineeringPreviewResultSchema.nullable(),
    validation: z
      .object({
        lint: z.enum(["WAITING", "RUNNING", "PASS", "FAIL", "NOT_CONFIGURED"]),
        typecheck: z.enum(["WAITING", "RUNNING", "PASS", "FAIL", "NOT_CONFIGURED"]),
        tests: z.enum(["WAITING", "RUNNING", "PASS", "FAIL", "NOT_CONFIGURED"]),
        build: z.enum(["WAITING", "RUNNING", "PASS", "FAIL", "NOT_CONFIGURED"]),
        review: z.enum(["WAITING", "RUNNING", "PASS", "PASS_WITH_WARNINGS", "FAIL"]),
      })
      .strict(),
    filesChanged: z.array(EngineeringRelativePathSchema).max(2_000),
    modelUsage: z.array(EngineeringModelUsageSchema).max(4),
    warnings: z.array(z.string().max(500)).max(50),
    instructionKeys: z.array(z.string().min(8).max(200)).max(100),
    planningStartedAt: z.iso.datetime(),
    firstCodeAt: z.iso.datetime().nullable(),
    firstPreviewAt: z.iso.datetime().nullable(),
    validatedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const EngineeringControlCenterSchema = z
  .object({
    delivery: EngineeringDeliverySchema,
    overallProgress: z.number().min(0).max(100),
    recoveryAvailable: z.boolean(),
    activeAgents: z
      .array(
        z
          .object({
            agentId: z.string().min(3).max(120),
            role: z.string().min(1).max(120),
            taskId: z.string().uuid(),
            taskTitle: z.string().min(1).max(255),
            status: z.string().min(1).max(40),
            modelTier: z.enum(["LUNA", "TERRA", "SOL", "ASTRA"]),
            workspaceId: z.string().uuid().nullable(),
            elapsedMs: z.number().int().nonnegative(),
            attempt: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(6),
    completedTasks: z.number().int().nonnegative(),
    blockedTasks: z.number().int().nonnegative(),
    blocker: z.object({
      category: z.enum(["CAPABILITY_UNAVAILABLE", "REPOSITORY_PERMISSION", "POLICY_APPROVAL_REQUIRED", "MODEL_PROVIDER_UNAVAILABLE", "VALIDATION_FAILURE", "MERGE_CONFLICT", "INTEGRATION_EVIDENCE_MISMATCH", "INTEGRATION_SCOPE_MISMATCH", "INTEGRATION_REPAIR_PENDING", "REVIEWER_UNAVAILABLE", "DEPENDENCY_PREPARATION_FAILED", "OWNER_CLARIFICATION_REQUIRED", "DEVICE_OFFLINE"]),
      message: z.string().min(1).max(300),
      action: z.string().min(1).max(300),
    }).strict().nullable(),
    totalTasks: z.number().int().nonnegative(),
    timeline: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            at: z.iso.datetime(),
            type: z.string().max(80),
            summary: z.string().max(1_000),
          })
          .strict(),
      )
      .max(200),
    elapsedMs: z.number().int().nonnegative(),
  })
  .strict();

export const EngineeringProjectRegistryEntrySchema = z
  .object({
    repositoryId: z.string().uuid(),
    companyId: z.string().uuid(),
    repositoryName: z.string().min(1).max(120),
    projectName: z.string().min(1).max(100),
    stack: z.array(z.string().min(1).max(80)).max(20),
    defaultBranch: z.string().min(1).max(200),
    repositoryStatus: EngineeringRepositoryStatusSchema,
    latestDeliveryId: z.string().uuid().nullable(),
    status: EngineeringDeliveryStatusSchema.nullable(),
    preview: EngineeringPreviewResultSchema.nullable(),
    lastModifiedAt: z.iso.datetime(),
  })
  .strict();

export type EngineeringDelivery = z.infer<typeof EngineeringDeliverySchema>;
export type EngineeringControlCenter = z.infer<typeof EngineeringControlCenterSchema>;
export type CreateSoftwareObjectiveRequest = z.infer<
  typeof CreateSoftwareObjectiveRequestSchema
>;

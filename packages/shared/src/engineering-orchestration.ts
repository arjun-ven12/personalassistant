import { z } from "zod";

import { EngineeringCapabilitySchema } from "./engineering-runtime.js";

export const EngineeringTaskTypeSchema = z.enum([
  "ARCHITECTURE",
  "BACKEND",
  "FRONTEND",
  "DATABASE",
  "ANDROID",
  "MAC_NATIVE",
  "TESTING",
  "SECURITY",
  "INFRASTRUCTURE",
  "DOCUMENTATION",
  "INTEGRATION_PREP",
]);

export const EngineeringAgentRoleSchema = z.enum([
  "ENGINEERING_MANAGER",
  "BACKEND_ENGINEER",
  "FRONTEND_ENGINEER",
  "DATABASE_ENGINEER",
  "MOBILE_ENGINEER",
  "TEST_QA_ENGINEER",
  "SECURITY_REVIEWER",
  "GENERALIST_ENGINEER",
  "MAC_NATIVE_ENGINEER",
  "DEVOPS_INFRASTRUCTURE_ENGINEER",
]);

export const EngineeringObjectiveStatusSchema = z.enum([
  "PLANNING",
  "READY",
  "RUNNING",
  "PAUSED",
  "BLOCKED",
  "NEEDS_CLARIFICATION",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const EngineeringTaskStatusSchema = z.enum([
  "PLANNED",
  "READY",
  "ACTIVE",
  "BLOCKED",
  "REVIEWING",
  "COMPLETE",
  "FAILED",
  "CANCELLED",
]);

export const EngineeringFailureCategorySchema = z.enum([
  "IMPLEMENTATION_ERROR",
  "TEST_FAILURE",
  "TYPE_ERROR",
  "BUILD_FAILURE",
  "MISSING_CONTEXT",
  "MISSING_CAPABILITY",
  "DEPENDENCY_NOT_READY",
  "CONFLICT",
  "POLICY_DENIED",
  "ENVIRONMENT_FAILURE",
  "MODEL_FAILURE",
  "AMBIGUOUS_REQUIREMENT",
]);

export const EngineeringModelTierSchema = z.enum([
  "LUNA",
  "TERRA",
  "SOL",
  "ASTRA",
]);

export const EngineeringRiskLevelSchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const EngineeringModelPolicySchema = z
  .object({
    initialTier: EngineeringModelTierSchema,
    currentTier: EngineeringModelTierSchema,
    maxTier: EngineeringModelTierSchema,
    escalationCount: z.number().int().min(0).max(3),
    reason: z.string().min(1).max(500),
  })
  .strict();

export const EngineeringObjectiveBudgetSchema = z
  .object({
    maxTokens: z.number().int().positive().max(100_000_000).nullable(),
    maxCostUsd: z.string().regex(/^\d+(\.\d{1,8})?$/).nullable(),
    maxPremiumCostUsd: z.string().regex(/^\d+(\.\d{1,8})?$/).nullable(),
  })
  .strict();

export const EngineeringClarificationSchema = z
  .object({
    id: z.string().uuid(),
    question: z.string().min(1).max(500),
    status: z.enum(["PENDING", "ANSWERED", "CANCELLED"]),
    answerSummary: z.string().min(1).max(2_000).nullable(),
    answerIdempotencyKey: z.string().min(8).max(200).nullable(),
    requestedAt: z.iso.datetime(),
    answeredAt: z.iso.datetime().nullable(),
  })
  .strict();

export const AnswerEngineeringClarificationRequestSchema = z
  .object({
    answer: z.string().trim().min(1).max(2_000),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const EngineeringObjectiveSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    workflowId: z.string().uuid().nullable(),
    managerAgentId: z.string().min(3).max(120),
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().min(1).max(8_000),
    acceptanceCriteria: z.array(z.string().min(1).max(1_000)).min(1).max(30),
    constraints: z.array(z.string().min(1).max(1_000)).max(30),
    protectedAreas: z.array(z.string().min(1).max(300)).max(100),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
    riskLevel: EngineeringRiskLevelSchema,
    budget: EngineeringObjectiveBudgetSchema.nullable(),
    deadlineAt: z.iso.datetime().nullable(),
    status: EngineeringObjectiveStatusSchema,
    clarificationQuestion: z.string().max(500).nullable(),
    clarification: EngineeringClarificationSchema.nullable().default(null),
    maxParallelTasks: z.number().int().min(3).max(6),
    maxReplans: z.number().int().min(0).max(2),
    replanCount: z.number().int().min(0).max(2),
    managerReasoningCount: z.number().int().nonnegative().max(20),
    totalInputTokens: z.number().int().nonnegative(),
    totalOutputTokens: z.number().int().nonnegative(),
    totalCostUsd: z.string().regex(/^\d+(\.\d{1,8})?$/),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const CreateEngineeringObjectiveRequestSchema = z
  .object({
    repositoryId: z.string().uuid(),
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().min(1).max(8_000),
    acceptanceCriteria: z.array(z.string().trim().min(1).max(1_000)).min(1).max(30),
    constraints: z.array(z.string().trim().min(1).max(1_000)).max(30).default([]),
    protectedAreas: z.array(z.string().min(1).max(300)).max(100).default([]),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
    riskLevel: EngineeringRiskLevelSchema.default("MEDIUM"),
    budget: EngineeringObjectiveBudgetSchema.nullable().default(null),
    deadlineAt: z.iso.datetime().nullable().default(null),
    maxParallelTasks: z.number().int().min(3).max(6).default(4),
  })
  .strict();

export const EngineeringTaskSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    objectiveId: z.string().uuid(),
    parentTaskId: z.string().uuid().nullable(),
    repositoryId: z.string().uuid(),
    workspaceId: z.string().uuid().nullable(),
    repairBaseCommit: z.string().regex(/^[0-9a-f]{40,64}$/).nullable().default(null),
    repairIntegrationWorkspaceId: z.string().uuid().nullable().default(null),
    title: z.string().min(1).max(255),
    description: z.string().min(1).max(4_000),
    acceptanceCriteria: z.array(z.string().min(1).max(1_000)).min(1).max(20),
    taskType: EngineeringTaskTypeSchema,
    requiredSkills: z.array(z.string().min(1).max(120)).max(30),
    requiredCapabilities: z.array(EngineeringCapabilitySchema).max(20),
    dependencies: z.array(z.string().uuid()).max(20),
    riskLevel: EngineeringRiskLevelSchema,
    estimatedDifficulty: z.enum(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]),
    assignedAgentId: z.string().min(3).max(120).nullable(),
    assignedRole: EngineeringAgentRoleSchema,
    reviewerAgentId: z.string().min(3).max(120).nullable(),
    agentSessionId: z.string().uuid().nullable().default(null),
    modelPolicy: EngineeringModelPolicySchema,
    readOnly: z.boolean(),
    reviewRequired: z.boolean(),
    status: EngineeringTaskStatusSchema,
    attempt: z.number().int().nonnegative().max(4),
    maxAttempts: z.number().int().min(2).max(4),
    leaseOwner: z.string().min(1).max(120).nullable(),
    leaseExpiresAt: z.iso.datetime().nullable(),
    leaseGeneration: z.number().int().nonnegative(),
    lastFailureCategory: EngineeringFailureCategorySchema.nullable(),
    lastFailureSummary: z.string().max(1_000).nullable(),
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const EngineeringArtifactTypeSchema = z.enum([
  "API_CONTRACT",
  "SCHEMA_CHANGE",
  "COMPONENT_INTERFACE",
  "TEST_EXPECTATIONS",
  "MIGRATION_NOTES",
  "ARCHITECTURE_DECISION",
  "VALIDATION_SUMMARY",
  "BLOCKER",
]);

export const EngineeringArtifactSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    objectiveId: z.string().uuid(),
    taskId: z.string().uuid(),
    type: EngineeringArtifactTypeSchema,
    title: z.string().min(1).max(255),
    summary: z.string().min(1).max(4_000),
    contract: z.record(z.string().max(80), z.json()).default({}),
    producerAgentId: z.string().min(3).max(120),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const EngineeringTaskResultSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    objectiveId: z.string().uuid(),
    taskId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    workspaceId: z.string().uuid().nullable(),
    workspaceBaseCommit: z.string().regex(/^[0-9a-f]{40,64}$/).nullable(),
    filesChanged: z.array(z.string().min(1).max(1_024)).max(500),
    diffSummary: z.string().max(4_000),
    validationStatus: z.enum(["PASS", "FAIL", "SKIPPED", "NOT_CONFIGURED", "ERROR"]),
    validationReportId: z.string().uuid().nullable(),
    reviewStatus: z.enum(["NOT_REQUIRED", "PENDING", "PASS", "FAIL"]),
    modelProvider: z.string().max(80).nullable(),
    modelName: z.string().max(160).nullable(),
    modelTier: EngineeringModelTierSchema,
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.string().regex(/^\d+(\.\d{1,8})?$/),
    attempts: z.number().int().min(1).max(4),
    durationMs: z.number().int().nonnegative(),
    status: z.enum(["SUCCEEDED", "FAILED", "CANCELLED", "BLOCKED"]),
    failureCategory: EngineeringFailureCategorySchema.nullable(),
    warnings: z.array(z.string().max(500)).max(30),
    completedAt: z.iso.datetime(),
  })
  .strict();

export const EngineeringEventTypeSchema = z.enum([
  "OBJECTIVE_DECOMPOSED",
  "TASK_CREATED",
  "AGENT_ASSIGNED",
  "WORKSPACE_ASSIGNED",
  "MODEL_SELECTED",
  "TASK_STARTED",
  "VALIDATION_FAILED",
  "TASK_RETRY",
  "TASK_REASSIGNED",
  "MODEL_ESCALATED",
  "REVIEW_REQUESTED",
  "CAPABILITY_REQUESTED",
  "DEPENDENCY_CHANGED",
  "TASK_COMPLETED",
  "OBJECTIVE_PAUSED",
  "OBJECTIVE_RESUMED",
  "OBJECTIVE_CANCELLED",
  "OBJECTIVE_BLOCKED",
  "OBJECTIVE_COMPLETED",
  "OBJECTIVE_RECOVERED",
  "OWNER_CLARIFICATION_REQUIRED",
  "OWNER_CLARIFICATION_ANSWERED",
]);

export const EngineeringEventSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    objectiveId: z.string().uuid(),
    taskId: z.string().uuid().nullable(),
    type: EngineeringEventTypeSchema,
    summary: z.string().min(1).max(1_000),
    metadata: z.record(z.string().max(80), z.json()).default({}),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const EngineeringContextPackageSchema = z
  .object({
    objectiveId: z.string().uuid(),
    taskId: z.string().uuid(),
    repositorySummary: z.string().max(4_000),
    relevantFiles: z.array(z.string().min(1).max(1_024)).max(50),
    dependencyArtifacts: z.array(EngineeringArtifactSchema).max(50),
    acceptanceCriteria: z.array(z.string().min(1).max(1_000)).max(20),
    constraints: z.array(z.string().min(1).max(1_000)).max(30),
    protectedPaths: z.array(z.string().min(1).max(300)).max(100),
    priorFailureSummaries: z.array(z.string().max(1_000)).max(4),
    memoryRefs: z.array(z.string().uuid()).max(20).default([]),
    memorySummaries: z.array(z.string().min(1).max(1_000)).max(20).default([]),
    maxTokens: z.number().int().min(1_000).max(32_000),
  })
  .strict();

export const EngineeringObjectiveViewSchema = z
  .object({
    objective: EngineeringObjectiveSchema,
    tasks: z.array(EngineeringTaskSchema).max(30),
    results: z.array(EngineeringTaskResultSchema).max(30),
    artifacts: z.array(EngineeringArtifactSchema).max(200),
    events: z.array(EngineeringEventSchema).max(500),
    readyForIntegration: z.boolean(),
  })
  .strict();

export type EngineeringObjective = z.infer<typeof EngineeringObjectiveSchema>;
export type EngineeringTask = z.infer<typeof EngineeringTaskSchema>;
export type EngineeringTaskResult = z.infer<typeof EngineeringTaskResultSchema>;
export type EngineeringArtifact = z.infer<typeof EngineeringArtifactSchema>;
export type EngineeringEvent = z.infer<typeof EngineeringEventSchema>;
export type EngineeringContextPackage = z.infer<typeof EngineeringContextPackageSchema>;
export type EngineeringFailureCategory = z.infer<typeof EngineeringFailureCategorySchema>;
export type EngineeringModelTier = z.infer<typeof EngineeringModelTierSchema>;
export type EngineeringAgentRole = z.infer<typeof EngineeringAgentRoleSchema>;
export type EngineeringTaskType = z.infer<typeof EngineeringTaskTypeSchema>;
export type CreateEngineeringObjectiveRequest = z.infer<
  typeof CreateEngineeringObjectiveRequestSchema
>;
export type AnswerEngineeringClarificationRequest = z.infer<
  typeof AnswerEngineeringClarificationRequestSchema
>;

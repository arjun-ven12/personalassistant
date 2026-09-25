import { z } from "zod";

import { EngineeringRelativePathSchema } from "./engineering-runtime.js";

const CommitSchema = z.string().regex(/^[0-9a-f]{40,64}$/);
const MoneySchema = z.string().regex(/^\d+(\.\d{1,8})?$/);

export const EngineeringIntegrationStatusSchema = z.enum([
  "PLANNING",
  "INTEGRATING",
  "CONFLICTED",
  "REPAIRING",
  "VALIDATING",
  "REVIEWING",
  "READY",
  "FAILED",
  "BLOCKED",
  "CANCELLED",
]);

export const EngineeringRegressionClassificationSchema = z.enum([
  "PRE_EXISTING",
  "NEW_REGRESSION",
  "RESOLVED",
  "UNKNOWN",
]);

export const EngineeringRegressionEvidenceSchema = z.object({
  commandId: z.string().max(128),
  file: EngineeringRelativePathSchema.nullable(),
  testName: z.string().max(300).nullable(),
  classification: EngineeringRegressionClassificationSchema,
}).strict();

export const EngineeringContractFindingSchema = z.object({
  kind: z.enum(["GENERATED_CLIENT_MISMATCH", "CONFLICTING_CONTRACT_ARTIFACT"]),
  paths: z.array(EngineeringRelativePathSchema).max(20),
  taskIds: z.array(z.string().uuid()).max(30),
  summary: z.string().max(500),
}).strict();

export const EngineeringConflictTypeSchema = z.enum([
  "TEXTUAL_SAFE",
  "STRUCTURAL",
  "CONTRACT",
  "SCHEMA",
  "MIGRATION",
  "SECURITY_SENSITIVE",
  "DELETE_MODIFY",
  "RENAME",
  "GENERATED_FILE",
  "UNKNOWN",
]);

export const EngineeringChangeKindSchema = z.enum([
  "MODIFIED",
  "ADDED",
  "DELETED",
  "RENAMED",
]);

export const EngineeringChangeMapEntrySchema = z
  .object({
    path: EngineeringRelativePathSchema,
    taskIds: z.array(z.string().uuid()).min(1).max(30),
    kinds: z.array(EngineeringChangeKindSchema).min(1).max(30),
    overlap: z.enum(["NONE", "SAME_FILE", "SAME_REGION", "UNKNOWN"]),
    protectedPath: z.boolean(),
    generated: z.boolean(),
  })
  .strict();

export const EngineeringIntegrationConflictSchema = z
  .object({
    id: z.string().uuid(),
    path: EngineeringRelativePathSchema,
    hunks: z.array(z.object({
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
    }).strict()).max(100).default([]),
    taskIds: z.array(z.string().uuid()).min(2).max(30),
    type: EngineeringConflictTypeSchema,
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    status: z.enum(["DETECTED", "RESOLVED", "ESCALATED", "SUPERSEDED"]),
    attempts: z.number().int().min(0).max(2),
    resolverModel: z.string().max(160).nullable(),
    resolverProviderId: z.string().max(80).nullable().default(null),
    resolverInputTokens: z.number().int().nonnegative().default(0),
    resolverOutputTokens: z.number().int().nonnegative().default(0),
    resolverAgentId: z.string().uuid().nullable().default(null),
    resolutionResult: z.enum(["NOT_ATTEMPTED", "REJECTED", "APPLIED", "VALIDATED"]).default("NOT_ATTEMPTED"),
    validationReportId: z.string().uuid().nullable().default(null),
    summary: z.string().min(1).max(1_000),
  })
  .strict();

export const EngineeringAcceptanceEvidenceSchema = z
  .object({
    criterion: z.string().min(1).max(1_000),
    evidence: z.array(z.string().min(1).max(500)).max(20),
    satisfied: z.boolean(),
  })
  .strict();

export const EngineeringIntegrationReviewSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    runId: z.string().uuid(),
    reviewerAgentId: z.string().min(3).max(120),
    providerId: z.string().max(80).nullable(),
    modelId: z.string().max(160).nullable(),
    verdict: z.enum(["PASS", "PASS_WITH_WARNINGS", "CHANGES_REQUIRED", "BLOCK"]),
    dimensions: z
      .object({
        correctness: z.number().int().min(0).max(100),
        scopeAdherence: z.number().int().min(0).max(100),
        architectureConsistency: z.number().int().min(0).max(100),
        maintainability: z.number().int().min(0).max(100),
        security: z.number().int().min(0).max(100),
        tests: z.number().int().min(0).max(100),
        regressionRisk: z.number().int().min(0).max(100),
        acceptanceCoverage: z.number().int().min(0).max(100),
      })
      .strict(),
    findings: z.array(z.string().min(1).max(1_000)).max(50),
    evidence: z.array(z.string().min(1).max(500)).max(100),
    acceptanceEvidence: z.array(EngineeringAcceptanceEvidenceSchema).max(30),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: MoneySchema,
    headCommit: CommitSchema,
    createdAt: z.iso.datetime(),
  })
  .strict();

export const EngineeringIntegrationRunSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    objectiveId: z.string().uuid(),
    idempotencyKey: z.string().min(8).max(200),
    baseCommit: CommitSchema,
    integrationBranch: z.string().regex(/^alexa\/[a-z0-9][a-z0-9-]{0,119}$/),
    integrationWorkspaceId: z.string().uuid(),
    taskIds: z.array(z.string().uuid()).min(1).max(30),
    sourceWorkspaceIds: z.array(z.string().uuid()).min(1).max(30),
    integrationOrder: z.array(z.string().uuid()).min(1).max(30),
    changeMap: z.array(EngineeringChangeMapEntrySchema).max(2_000),
    conflicts: z.array(EngineeringIntegrationConflictSchema).max(500),
    regressionEvidence: z.array(EngineeringRegressionEvidenceSchema).max(500).default([]),
    contractFindings: z.array(EngineeringContractFindingSchema).max(100).default([]),
    status: EngineeringIntegrationStatusSchema,
    securityReviewRequired: z.boolean(),
    validationReportId: z.string().uuid().nullable(),
    baselineValidationReportId: z.string().uuid().nullable(),
    reviewId: z.string().uuid().nullable(),
    securityReviewId: z.string().uuid().nullable(),
    repairCycles: z.number().int().min(0).max(3),
    maxRepairCycles: z.number().int().min(1).max(3),
    repairTaskIds: z.array(z.string().uuid()).max(3).default([]),
    repairEvidence: z.array(z.object({
      cycle: z.number().int().min(1).max(3),
      taskId: z.string().uuid(),
      parentTaskId: z.string().uuid(),
      category: z.enum(["REGRESSION", "CONTRACT_MISMATCH", "TYPE_BUILD_FAILURE", "TEST_FAILURE", "REVIEW_CHANGES_REQUIRED", "CONFLICT_RESOLUTION_DEFECT"]),
      summary: z.string().max(1_000),
      validationReportId: z.string().uuid().nullable(),
      reviewId: z.string().uuid().nullable(),
    }).strict()).max(3).default([]),
    leaseOwner: z.string().min(1).max(120).nullable(),
    leaseExpiresAt: z.iso.datetime().nullable(),
    leaseGeneration: z.number().int().nonnegative(),
    integrationDurationMs: z.number().int().nonnegative(),
    validationDurationMs: z.number().int().nonnegative(),
    reviewDurationMs: z.number().int().nonnegative(),
    integrationCostUsd: MoneySchema,
    reviewCostUsd: MoneySchema,
    securityReviewCostUsd: MoneySchema,
    repairCostUsd: MoneySchema,
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const EngineeringMergeCandidateSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    runId: z.string().uuid(),
    objectiveId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    integrationWorkspaceId: z.string().uuid(),
    branch: z.string().max(200),
    baseCommit: CommitSchema,
    headCommit: CommitSchema,
    tasksIncluded: z.array(z.string().uuid()).min(1).max(30),
    validationReportId: z.string().uuid(),
    reviewReportId: z.string().uuid(),
    securityReviewId: z.string().uuid().nullable(),
    acceptanceEvidence: z.array(EngineeringAcceptanceEvidenceSchema).max(30),
    filesChanged: z.array(EngineeringRelativePathSchema).max(2_000),
    diffSummary: z.string().max(4_000),
    risks: z.array(z.string().max(500)).max(50),
    warnings: z.array(z.string().max(500)).max(50),
    dependencyChanges: z.array(z.string().max(500)).max(100),
    status: z.enum([
      "PREPARING",
      "VALIDATING",
      "REVIEWING",
      "READY",
      "CHANGES_REQUIRED",
      "BLOCKED",
      "STALE",
      "MERGING",
      "MERGED",
      "CANCELLED",
    ]),
    validatedHeadCommit: CommitSchema,
    reviewedHeadCommit: CommitSchema,
    mergeIdempotencyKey: z.string().min(8).max(200).nullable().default(null),
    mergedAt: z.iso.datetime().nullable().default(null),
    mergedHeadCommit: CommitSchema.nullable().default(null),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CreateEngineeringIntegrationRequestSchema = z
  .object({
    objectiveId: z.string().uuid(),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const MergeEngineeringCandidateRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict();

export const EngineeringIntegrationViewSchema = z
  .object({
    run: EngineeringIntegrationRunSchema,
    candidate: EngineeringMergeCandidateSchema.nullable(),
    reviews: z.array(EngineeringIntegrationReviewSchema).max(10),
  })
  .strict();

export type EngineeringIntegrationRun = z.infer<typeof EngineeringIntegrationRunSchema>;
export type EngineeringMergeCandidate = z.infer<typeof EngineeringMergeCandidateSchema>;
export type EngineeringIntegrationReview = z.infer<
  typeof EngineeringIntegrationReviewSchema
>;
export type EngineeringChangeMapEntry = z.infer<typeof EngineeringChangeMapEntrySchema>;
export type EngineeringIntegrationConflict = z.infer<
  typeof EngineeringIntegrationConflictSchema
>;

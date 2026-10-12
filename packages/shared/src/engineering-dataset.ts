import { z } from "zod";
import {
  EngineeringRepositoryMetadataSchema,
  EngineeringRelativePathSchema,
} from "./engineering-runtime.js";
import { EngineeringBenchmarkRunSchema } from "./engineering-benchmark.js";
import { EngineeringContextPackageSchema } from "./engineering-orchestration.js";

const Scope = { ownerId: z.string().uuid(), companyId: z.string().uuid() };
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const commit = z.string().regex(/^[a-f0-9]{40,64}$/);
export const EngineeringTrainingScopeSchema = z.enum([
  "ATHENA_INTERNAL",
  "COMPANY_PRIVATE",
  "GLOBAL_SAFE",
  "EXCLUDED",
]);
export const EngineeringDatasetCategorySchema = z.enum([
  "UI",
  "CRUD",
  "BUGFIX",
  "TESTS",
  "REFACTOR",
  "MULTI_FILE",
  "CONVENTIONS",
  "DOCS",
  "OTHER",
]);
export const EngineeringDatasetPolicySchema = z
  .object({
    kind: z.literal("POLICY"),
    ...Scope,
    key: z.string().uuid(),
    scope: EngineeringTrainingScopeSchema,
    approvedByOwnerAt: z.iso.datetime(),
  })
  .strict();
export const EngineeringExperienceSchema = z
  .object({
    kind: z.literal("EXPERIENCE"),
    ...Scope,
    key: digest,
    objectiveId: z.string().uuid(),
    taskId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    workspaceId: z.string().uuid().nullable(),
    attempt: z.number().int().min(0).max(4),
    generation: z.number().int().nonnegative(),
    context: EngineeringContextPackageSchema.nullable(),
    rounds: z
      .array(
        z
          .object({
            requestId: z.string().uuid(),
            context: z.string().max(131072),
            provider: z.string().max(128).nullable(),
            model: z.string().max(128).nullable(),
            outcome: z.string().max(80),
          })
          .strict(),
      )
      .max(12),
    toolActions: z
      .array(
        z
          .object({
            capability: z
              .string()
              .regex(/^repository\.[a-z_]+$/)
              .max(100),
            input: z.string().max(65536),
            observation: z.string().max(16000),
          })
          .strict(),
      )
      .max(240),
    inspectedFiles: z.array(EngineeringRelativePathSchema).max(100),
    failures: z.array(z.string().max(1000)).max(30),
    outcome: z.enum(["SUCCEEDED", "FAILED", "BLOCKED", "CANCELLED"]),
    integrity: z.enum(["CLEAN", "SECRET_DETECTED", "INCOMPLETE"]),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
  })
  .strict();
export const EngineeringDatasetDiffSchema = z
  .object({
    kind: z.literal("DIFF"),
    ...Scope,
    key: digest,
    runId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    baseCommit: commit,
    headCommit: commit,
    patch: z.string().min(1).max(131072),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const EngineeringDatasetExampleSchema = z
  .object({
    kind: z.literal("EXAMPLE"),
    ...Scope,
    key: digest,
    schemaVersion: z.literal("1"),
    objectiveId: z.string().uuid(),
    taskId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    candidateId: z.string().uuid(),
    integrationRunId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    baseCommit: commit,
    headCommit: commit,
    taskCategory: EngineeringDatasetCategorySchema,
    risk: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    complexity: z.enum(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]),
    instruction: z.string().min(1).max(16000),
    repositoryMetadata: EngineeringRepositoryMetadataSchema,
    experienceKeys: z.array(digest).min(1).max(30),
    experienceHashes: z.array(digest).min(1).max(30),
    acceptedPatchHash: digest,
    acceptedPatchKey: digest,
    validationId: z.string().uuid(),
    reviewIds: z.array(z.string().uuid()).min(1).max(3),
    repairTaskIds: z.array(z.string().uuid()).max(30),
    provider: z.string().max(128).nullable(),
    model: z.string().max(128).nullable(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    paidModelCostUsd: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .nullable(),
    workspaceCostUsd: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .nullable(),
    durationMs: z.number().int().nonnegative(),
    accepted: z.literal(true),
    outcome: z.literal("SUCCEEDED"),
    createdAt: z.iso.datetime(),
    contentHash: digest,
  })
  .strict();
export const EngineeringDatasetExclusionSchema = z
  .object({
    kind: z.literal("EXCLUSION"),
    ...Scope,
    key: digest,
    reason: z.enum(["OWNER_EXCLUDED", "SOURCE_POLICY_REVOKED", "SECURITY_FINDING"]),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const EngineeringDatasetSnapshotSchema = z
  .object({
    kind: z.literal("SNAPSHOT"),
    ...Scope,
    key: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    schemaVersion: z.literal("1"),
    members: z.array(z.object({ key: digest, hash: digest }).strict()).max(10000),
    contentHash: digest,
    createdAt: z.iso.datetime(),
    evidence: z.enum(["EMPTY", "ACCEPTED_ENGINEERING"]),
  })
  .strict();
export const EngineeringDatasetOwnerBenchmarkSchema = z
  .object({
    kind: z.literal("OWNER_BENCHMARK"),
    ...Scope,
    key: digest,
    run: EngineeringBenchmarkRunSchema,
  })
  .strict()
  .refine(
    (v) => v.run.source === "OWNER_ENTERED" && v.run.system === "CODEX",
    "Only owner-entered Codex timings are accepted.",
  );
export const EngineeringDatasetRecordSchema = z.discriminatedUnion("kind", [
  EngineeringDatasetPolicySchema,
  EngineeringExperienceSchema,
  EngineeringDatasetDiffSchema,
  EngineeringDatasetExampleSchema,
  EngineeringDatasetExclusionSchema,
  EngineeringDatasetSnapshotSchema,
  EngineeringDatasetOwnerBenchmarkSchema,
]);
export type EngineeringDatasetRecord = z.infer<typeof EngineeringDatasetRecordSchema>;
export type EngineeringExperience = z.infer<typeof EngineeringExperienceSchema>;
export type EngineeringDatasetExample = z.infer<typeof EngineeringDatasetExampleSchema>;
export type EngineeringDatasetSnapshot = z.infer<
  typeof EngineeringDatasetSnapshotSchema
>;
export type EngineeringTrainingScope = z.infer<typeof EngineeringTrainingScopeSchema>;

export const EngineeringDatasetStatsSchema = z
  .object({
    eligibleExamples: z.number().int().nonnegative(),
    excludedExamples: z.number().int().nonnegative(),
    failedAttempts: z.number().int().nonnegative(),
    categories: z.record(z.string(), z.number().int().nonnegative()),
    models: z.record(z.string(), z.number().int().nonnegative()),
    languages: z.record(z.string(), z.number().int().nonnegative()),
    frameworks: z.record(z.string(), z.number().int().nonnegative()),
    risks: z.record(z.string(), z.number().int().nonnegative()),
    averagePaidModelCostUsd: z.number().nonnegative().nullable(),
    averageDurationMs: z.number().nonnegative().nullable(),
    snapshots: z.array(EngineeringDatasetSnapshotSchema).max(10000),
    comparisonStatus: z.literal("PENDING_LIVE_BASELINE"),
  })
  .strict();

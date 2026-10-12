import { z } from "zod";
import { EngineeringDatasetCategorySchema } from "./engineering-dataset.js";

export const DistillationScopeSchema = z.object({ ownerId: z.string().uuid(), companyId: z.string().uuid() }).strict();
export const DistillationDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const DistillationKeySchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
export const DistillationTrainingConfigSchema = z.object({
  method: z.enum(["LORA", "QLORA"]), seed: z.number().int().min(0).max(2147483647),
  rank: z.number().int().min(4).max(64), alpha: z.number().int().min(4).max(128),
  epochs: z.number().int().min(1).max(5), learningRate: z.number().min(0.000001).max(0.001),
  maxSequenceTokens: z.number().int().min(128).max(4096),
}).strict();
export const DistillationStartSchema = z.object({
  datasetVersion: DistillationKeySchema, baseModelId: DistillationKeySchema,
  idempotencyKey: DistillationKeySchema, config: DistillationTrainingConfigSchema,
}).strict();
export const DistillationBaseSchema = z.object({ id: DistillationKeySchema, digest: DistillationDigestSchema,
  family: z.literal("QWEN2_CAUSAL_LM"), licenseReviewed: z.literal(true), trainingReviewed: z.literal(true),
}).strict();
export const DistillationSampleSchema = z.object({
  key: DistillationDigestSchema, objectiveId: z.string().uuid(), candidateId: z.string().uuid(),
  repositoryId: z.string().uuid(), taskId: z.string().uuid(), category: EngineeringDatasetCategorySchema,
  instruction: z.string().min(1).max(16000), context: z.string().min(1).max(131072),
  response: z.string().min(1).max(131072), contentHash: DistillationDigestSchema,
}).strict();
export const DistillationPreparedSchema = z.object({
  ...DistillationScopeSchema.shape, datasetVersion: DistillationKeySchema, datasetDigest: DistillationDigestSchema,
  formatVersion: z.literal("ATHENA_PATCH_V1"), manifestDigest: DistillationDigestSchema,
  train: z.array(DistillationSampleSchema).min(1).max(10000),
  validation: z.array(DistillationSampleSchema).min(1).max(10000),
  evaluation: z.array(DistillationSampleSchema).min(1).max(10000),
}).strict();
export const DistillationArtifactSchema = z.object({
  adapterDigest: DistillationDigestSchema, baseDigest: DistillationDigestSchema,
  manifestDigest: DistillationDigestSchema, evidence: z.enum(["REAL", "SYNTHETIC"]),
  hardware: z.string().min(1).max(160), runtime: z.string().min(1).max(160),
  durationMs: z.number().int().nonnegative(), computeCostUsd: z.number().nonnegative().nullable(),
  trainLoss: z.number().nonnegative().nullable(), validationLoss: z.number().nonnegative().nullable(),
}).strict();
export const DistillationEvaluationCaseSchema = z.object({
  caseId: DistillationKeySchema,
  category: z.enum(["UI", "CRUD", "BUGFIX", "TESTS", "REFACTOR", "MULTI_FILE", "CONVENTIONS", "SECURITY"]),
  taskId: z.string().uuid(), validationPass: z.boolean(), reviewPass: z.boolean(), completed: z.boolean(),
  securityPass: z.boolean(), durationMs: z.number().int().nonnegative(),
  modelDurationMs: z.number().int().nonnegative().nullable(), retries: z.number().int().min(0).max(30),
  escalated: z.boolean(), inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(), paidCostUsd: z.number().nonnegative().nullable(),
  computeCostUsd: z.number().nonnegative().nullable(), ownerInterventions: z.number().int().nonnegative().nullable(),
}).strict();
export const DistillationEvaluationSchema = z.object({
  suiteVersion: z.literal("PHASE28_ENGINEERING_V1"), artifactDigest: DistillationDigestSchema,
  evidence: z.enum(["REAL", "SYNTHETIC"]), evaluatedAt: z.iso.datetime(),
  cases: z.array(DistillationEvaluationCaseSchema).min(8).max(200),
  lunaBaseline: z.array(DistillationEvaluationCaseSchema).min(8).max(200).nullable(),
  currentBaseline: z.array(DistillationEvaluationCaseSchema).min(8).max(200).nullable(),
  currentVersionId: z.string().uuid().nullable(), currentArtifactDigest: DistillationDigestSchema.nullable(),
}).strict();
export const DistillationPromotionPolicySchema = z.object({
  minimumCases: z.number().int().min(8).max(200), minimumPassRate: z.number().min(0.8).max(1),
  maximumRegressions: z.literal(0), maximumDurationRatio: z.number().min(1).max(2),
}).strict();
export const DistillationRecordSchema = z.object({
  ...DistillationScopeSchema.shape, id: z.string().uuid(), version: z.number().int().nonnegative(),
  request: DistillationStartSchema, requestDigest: DistillationDigestSchema, base: DistillationBaseSchema,
  state: z.enum(["PREPARING", "PENDING_REAL_DATASET", "PREPARED", "TRAINING", "TRAINER_UNAVAILABLE", "TRAINED", "FAILED", "CANCELLED", "INDETERMINATE"]),
  datasetDigest: DistillationDigestSchema.nullable(), manifestDigest: DistillationDigestSchema.nullable(),
  sampleCounts: z.object({ train: z.number().int().nonnegative(), validation: z.number().int().nonnegative(), evaluation: z.number().int().nonnegative() }).strict(),
  artifact: DistillationArtifactSchema.nullable(), evaluation: DistillationEvaluationSchema.nullable(),
  promotion: z.enum(["NOT_EVALUATED", "BLOCKED", "ELIGIBLE"]), promotionReasons: z.array(DistillationKeySchema).max(30),
  activation: z.enum(["INACTIVE", "ACTIVE", "RETIRED"]), rollout: z.enum(["NONE", "OWNER_ACTIVATED"]),
  rollbackTarget: z.string().uuid().nullable(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  trainingStartedAt: z.iso.datetime().nullable(), trainedAt: z.iso.datetime().nullable(),
}).strict();
export const DistillationModelActionSchema = z.object({
  action: z.enum(["TRAIN", "EVALUATE", "ACTIVATE", "DEACTIVATE", "ROLLBACK", "RETIRE", "CANCEL"]),
  runId: z.string().uuid(),
}).strict();
export type DistillationScope = z.infer<typeof DistillationScopeSchema>;
export type DistillationRecord = z.infer<typeof DistillationRecordSchema>;
export type DistillationPrepared = z.infer<typeof DistillationPreparedSchema>;
export type DistillationSample = z.infer<typeof DistillationSampleSchema>;
export type DistillationArtifact = z.infer<typeof DistillationArtifactSchema>;
export type DistillationEvaluation = z.infer<typeof DistillationEvaluationSchema>;
export type DistillationPromotionPolicy = z.infer<typeof DistillationPromotionPolicySchema>;
export type DistillationBase = z.infer<typeof DistillationBaseSchema>;
export type DistillationTrainingConfig = z.infer<typeof DistillationTrainingConfigSchema>;

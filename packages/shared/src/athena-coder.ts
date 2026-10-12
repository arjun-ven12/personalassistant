import { z } from "zod";

/** Reviewed metadata only. No endpoint, credential, command, or executable path is client supplied. */
export const AthenaCoderRuntimePlacementSchema = z.enum(["MAC_OLLAMA", "CLOUD_OPEN_WEIGHT"]);
export const AthenaCoderRuntimeMetadataSchema = z.object({
  placement: AthenaCoderRuntimePlacementSchema,
  backend: z.enum(["OLLAMA", "REVIEWED_CLOUD"]),
  availability: z.enum(["DISABLED", "AVAILABLE", "UNAVAILABLE"]),
  modelId: z.string().min(1).max(160),
  baseModel: z.string().min(1).max(160),
  artifactDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable(),
  version: z.string().min(1).max(80),
  quantization: z.string().min(1).max(40),
  contextLimit: z.number().int().positive().max(131_072),
  maxConcurrentRequests: z.number().int().min(1).max(8),
  memoryRequirementMb: z.number().int().positive().nullable(),
  expectedLatencyMs: z.number().int().positive().nullable(),
  observedSuccessRate: z.number().min(0).max(1).nullable(),
  infrastructureCostUsdPerHour: z.number().nonnegative().nullable(),
  benchmarkStatus: z.enum(["PENDING_LIVE_BASELINE", "MEASURED"]),
  reviewed: z.boolean(),
  distillation: z.object({
    runId: z.string().uuid(), ownerId: z.string().uuid(), companyId: z.string().uuid(),
    baseDigest: z.string().regex(/^[a-f0-9]{64}$/), adapterDigest: z.string().regex(/^[a-f0-9]{64}$/),
    inferenceDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }).strict().optional(),
}).strict();

export const AthenaCoderEligibilitySchema = z.object({
  source: z.literal("TRUSTED_ENGINEERING_POLICY"),
  activeModelId: z.string().min(1).max(160),
  size: z.enum(["TRIVIAL", "SMALL", "MEDIUM", "LARGE"]),
  category: z.enum(["DOCS", "TESTS", "UI", "CRUD", "BUGFIX", "REFACTOR", "OTHER"]),
  risk: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  securitySensitive: z.boolean(),
  authenticationRelated: z.boolean(),
  tenantIsolationRelated: z.boolean(),
  approvalRelated: z.boolean(),
  migrationRelated: z.boolean(),
  measuredP95LatencyMs: z.number().int().positive().nullable(),
  measuredSuccessRate: z.number().min(0).max(1).nullable(),
  maxAcceptableP95LatencyMs: z.number().int().positive(),
  minAcceptableSuccessRate: z.number().min(0).max(1),
}).strict();

/** Bounded per-attempt telemetry. Missing model-server timing and compute cost stay null. */
export const AthenaCoderAttemptTelemetrySchema = z.object({
  placement: AthenaCoderRuntimePlacementSchema,
  backend: z.enum(["OLLAMA", "REVIEWED_CLOUD"]),
  modelVersion: z.string().min(1).max(80),
  artifactDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable().optional(),
  distillationRunId: z.string().uuid().optional(),
  selectionReason: z.literal("MEASURED_ROUTINE_ENGINEERING"),
  providerCallMs: z.number().int().nonnegative().nullable(),
  coldStartMs: z.number().int().nonnegative().nullable(),
  promptIngestionMs: z.number().int().nonnegative().nullable(),
  generationMs: z.number().int().nonnegative().nullable(),
  paidApiCostUsd: z.number().nonnegative().nullable(),
  infrastructureCostUsd: z.number().nonnegative().nullable(),
}).strict();

export type AthenaCoderRuntimeMetadata = z.infer<typeof AthenaCoderRuntimeMetadataSchema>;
export type AthenaCoderEligibility = z.infer<typeof AthenaCoderEligibilitySchema>;
export type AthenaCoderAttemptTelemetry = z.infer<typeof AthenaCoderAttemptTelemetrySchema>;

export const AthenaCoderControlStateSchema = z.object({
  ownerId: z.string().uuid(),
  enabled: z.boolean(),
  selectedModelId: z.string().min(1).max(160).nullable(),
  allowedCategories: z.array(AthenaCoderEligibilitySchema.shape.category).max(6),
  updatedAt: z.iso.datetime().nullable(),
}).strict();
export const AthenaCoderControlMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("DISABLE") }).strict(),
  z.object({ action: z.literal("SELECT_VERSION"), modelId: z.string().min(1).max(160) }).strict(),
  z.object({ action: z.literal("SET_CATEGORIES"), categories: z.array(AthenaCoderEligibilitySchema.shape.category).max(6) }).strict(),
  z.object({ action: z.literal("ENABLE") }).strict(),
]);
export type AthenaCoderControlState = z.infer<typeof AthenaCoderControlStateSchema>;
export type AthenaCoderControlMutation = z.infer<typeof AthenaCoderControlMutationSchema>;

export const isAthenaCoderEligible = (input: AthenaCoderEligibility): boolean => {
  const value = AthenaCoderEligibilitySchema.parse(input);
  return (value.size === "TRIVIAL" || value.size === "SMALL") &&
    value.category !== "OTHER" && value.risk === "LOW" &&
    !value.securitySensitive && !value.authenticationRelated &&
    !value.tenantIsolationRelated && !value.approvalRelated &&
    !value.migrationRelated &&
    value.measuredP95LatencyMs !== null &&
    value.measuredSuccessRate !== null &&
    value.measuredP95LatencyMs <= value.maxAcceptableP95LatencyMs &&
    value.measuredSuccessRate >= value.minAcceptableSuccessRate;
};

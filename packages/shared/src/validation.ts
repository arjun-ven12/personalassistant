import { z } from "zod";

import { RegistryIdSchema } from "./applications.js";
import { RepositorySchema } from "./repositories.js";

export const ValidationProfileIdSchema = z.enum([
  "pnpm_format_check",
  "pnpm_typecheck",
  "pnpm_lint",
  "pnpm_test",
  "pnpm_build",
  "pnpm_security_check",
  "pnpm_verify_production_config",
]);

export const ValidationProfileSchema = z
  .object({
    id: ValidationProfileIdSchema,
    label: z.string().min(1).max(120),
    category: z.enum(["format", "typecheck", "lint", "test", "build", "security"]),
    commandDisplay: z.string().min(1).max(200),
    timeoutMs: z.number().int().positive().max(120_000),
    network: z.literal("disabled"),
    immutable: z.literal(true),
  })
  .strict();

export const ValidationClassificationSchema = z.enum([
  "PASSED",
  "PASSED_WITH_WARNINGS",
  "FAILED_BUILD",
  "FAILED_TESTS",
  "FAILED_LINT",
  "FAILED_TYPECHECK",
  "FAILED_TIMEOUT",
  "FAILED_ENVIRONMENT",
  "FAILED_POLICY",
  "CANCELLED",
]);

export const ValidationRunStatusSchema = z.enum([
  "PLANNED",
  "EXECUTION_REQUESTED",
  "RUNNING",
  "PASSED",
  "PASSED_WITH_WARNINGS",
  "FAILED",
  "CANCELLED",
]);

export const ValidationStepStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "PASSED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
]);

export const ValidationStepResultSchema = z
  .object({
    stepId: z.string().uuid(),
    profileId: ValidationProfileIdSchema,
    status: ValidationStepStatusSchema,
    classification: ValidationClassificationSchema.nullable(),
    exitCode: z.number().int().min(-1).max(255).nullable(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    durationMs: z.number().int().nonnegative().max(120_000).nullable(),
    stdout: z.string().max(32_768),
    stderr: z.string().max(32_768),
    truncated: z.boolean(),
    warnings: z.array(z.string().max(500)).max(50),
    errors: z.array(z.string().max(500)).max(50),
  })
  .strict();

export const ValidationRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    workspaceId: RegistryIdSchema,
    patchId: z.string().uuid().nullable(),
    repositoryGeneration: z.number().int().positive().nullable(),
    status: ValidationRunStatusSchema,
    classification: ValidationClassificationSchema.nullable(),
    profileIds: z.array(ValidationProfileIdSchema).min(1).max(12),
    planSummary: z.string().min(1).max(2_000),
    executionRequestId: z.string().uuid().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    steps: z.array(ValidationStepResultSchema).max(12),
    summary: z.string().max(4_000),
    failureCode: z.string().max(100).nullable(),
  })
  .strict();

export const CreateValidationRequestSchema = z
  .object({
    repositoryId: z.string().uuid(),
    patchId: z.string().uuid().optional(),
    profileIds: z.array(ValidationProfileIdSchema).min(1).max(12).optional(),
    deviceId: z.string().uuid().optional(),
  })
  .strict();

export const StartValidationRequestSchema = z
  .object({ deviceId: z.string().uuid().optional() })
  .strict();

export const WorkspaceValidateProfileInputSchema = z
  .object({
    workspaceId: RegistryIdSchema,
    validationRunId: z.string().uuid(),
    repositoryGeneration: z.number().int().positive().nullable(),
    profiles: z.array(ValidationProfileSchema).min(1).max(12),
  })
  .strict();

export const ValidationExecutionResultSchema = z
  .object({
    workspaceId: RegistryIdSchema,
    validationRunId: z.string().uuid(),
    status: ValidationRunStatusSchema,
    classification: ValidationClassificationSchema,
    steps: z.array(ValidationStepResultSchema).max(12),
    summary: z.string().max(4_000),
    sandbox: z
      .object({
        isolated: z.boolean(),
        cleanedUp: z.boolean(),
        network: z.literal("disabled"),
      })
      .strict(),
    metrics: z
      .object({
        durationMs: z.number().int().nonnegative().max(600_000),
        stepCount: z.number().int().nonnegative().max(12),
      })
      .strict(),
  })
  .strict();

export const ValidationResponseSchema = z
  .object({ repository: RepositorySchema, validation: ValidationRecordSchema })
  .strict();

export const ValidationListResponseSchema = z.array(ValidationRecordSchema).max(100);

export const ValidationProfileListResponseSchema = z
  .array(ValidationProfileSchema)
  .max(50);

export type ValidationProfileId = z.infer<typeof ValidationProfileIdSchema>;
export type ValidationProfile = z.infer<typeof ValidationProfileSchema>;
export type ValidationStepResult = z.infer<typeof ValidationStepResultSchema>;
export type ValidationRecord = z.infer<typeof ValidationRecordSchema>;
export type ValidationExecutionResult = z.infer<typeof ValidationExecutionResultSchema>;
export type CreateValidationRequest = z.infer<typeof CreateValidationRequestSchema>;

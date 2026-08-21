import { z } from "zod";

import { RegistryIdSchema } from "./applications.js";
import { RepositorySchema } from "./repositories.js";

const RelativePatchPathSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((value) => !value.startsWith("/") && !/^[A-Za-z]:/.test(value))
  .refine((value) => !value.includes("\0") && !/[?*[\]{}]/.test(value))
  .refine((value) =>
    value
      .split("/")
      .every((segment) => segment !== "" && segment !== "." && segment !== ".."),
  );

export const PatchOperationSchema = z
  .object({
    operationId: z.string().uuid(),
    kind: z.enum(["create", "modify", "delete", "rename"]),
    relativePath: RelativePatchPathSchema,
    newRelativePath: RelativePatchPathSchema.optional(),
    expectedOriginalSha256: z.string().length(64).nullable(),
    expectedOriginalContent: z.string().max(131_072).nullable(),
    newContent: z.string().max(131_072).nullable(),
  })
  .strict()
  .superRefine((operation, context) => {
    if (operation.kind === "create" && operation.newContent === null) {
      context.addIssue({
        code: "custom",
        path: ["newContent"],
        message: "Created files require new content.",
      });
    }
    if (operation.kind === "modify" && operation.newContent === null) {
      context.addIssue({
        code: "custom",
        path: ["newContent"],
        message: "Modified files require new content.",
      });
    }
    if (operation.kind === "rename" && !operation.newRelativePath) {
      context.addIssue({
        code: "custom",
        path: ["newRelativePath"],
        message: "Renamed files require a destination path.",
      });
    }
  });

export const PatchStatusSchema = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "EXECUTION_REQUESTED",
  "APPLIED",
  "FAILED",
  "ROLLED_BACK",
]);

export const PatchRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    workspaceId: RegistryIdSchema,
    repositoryGeneration: z.number().int().positive().nullable(),
    title: z.string().min(1).max(255),
    summary: z.string().min(1).max(2_000),
    status: PatchStatusSchema,
    riskScore: z.number().int().min(0).max(100),
    complexity: z.enum(["low", "medium", "high", "unknown"]),
    operations: z.array(PatchOperationSchema).min(1).max(50),
    unifiedDiff: z.string().min(1).max(500_000),
    changedSymbols: z.array(z.string().min(1).max(255)).max(200),
    affectedApis: z.array(z.string().min(1).max(255)).max(200),
    architectureImpact: z.array(z.string().min(1).max(255)).max(200),
    databaseImpact: z.array(z.string().min(1).max(255)).max(200),
    frontendImpact: z.array(z.string().min(1).max(255)).max(200),
    backendImpact: z.array(z.string().min(1).max(255)).max(200),
    patchDigest: z.string().length(64),
    approvalTokenHash: z.string().length(64).nullable(),
    executionRequestId: z.string().uuid().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
    appliedAt: z.iso.datetime().nullable(),
    failureCode: z.string().max(100).nullable(),
  })
  .strict();

export const GeneratePatchRequestSchema = z
  .object({
    repositoryId: z.string().uuid(),
    title: z.string().min(1).max(255),
    summary: z.string().min(1).max(2_000),
    operations: z.array(PatchOperationSchema).min(1).max(50),
  })
  .strict();

export const PatchDecisionResponseSchema = z
  .object({
    patch: PatchRecordSchema,
    approvalToken: z.string().min(32).max(200).optional(),
  })
  .strict();

export const PatchResponseSchema = z
  .object({
    repository: RepositorySchema,
    patch: PatchRecordSchema,
  })
  .strict();

export const PatchListResponseSchema = z.array(PatchRecordSchema).max(100);

export const ApprovePatchRequestSchema = z
  .object({
    decision: z.enum(["approve", "reject", "cancel"]),
    reason: z.string().max(500).optional(),
  })
  .strict();

export const ExecutePatchRequestSchema = z
  .object({
    approvalToken: z.string().min(32).max(200),
    deviceId: z.string().uuid().optional(),
  })
  .strict();

export const PatchExecutionResultSchema = z
  .object({
    workspaceId: RegistryIdSchema,
    patchId: z.string().uuid(),
    patchDigest: z.string().length(64),
    appliedOperations: z.number().int().nonnegative().max(50),
    rollbackSnapshots: z
      .array(
        z
          .object({
            relativePath: RelativePatchPathSchema,
            existed: z.boolean(),
            sha256: z.string().length(64).nullable(),
            content: z.string().max(131_072).nullable(),
          })
          .strict(),
      )
      .max(50),
    validation: z
      .object({
        astValid: z.boolean(),
        syntaxValid: z.boolean(),
        formattingValid: z.boolean(),
        dependencyValid: z.boolean(),
        importValid: z.boolean(),
        typecheckConfigured: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type PatchOperation = z.infer<typeof PatchOperationSchema>;
export type PatchRecord = z.infer<typeof PatchRecordSchema>;
export type GeneratePatchRequest = z.infer<typeof GeneratePatchRequestSchema>;
export type PatchExecutionResult = z.infer<typeof PatchExecutionResultSchema>;

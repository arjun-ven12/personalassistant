import { z } from "zod";

import { RegistryIdSchema } from "./applications.js";
import {
  NativeCapabilityDispatchRequestSchema,
  NativeProviderExecutionTransportResultSchema,
} from "./native-providers.js";
import { PatchExecutionResultSchema, PatchOperationSchema } from "./patches.js";
import { RepositoryScanResultSchema } from "./repositories.js";
import {
  ValidationExecutionResultSchema,
  WorkspaceValidateProfileInputSchema,
} from "./validation.js";

export const ReadOnlyToolNameSchema = z.enum([
  "workspace.inspect_metadata",
  "workspace.read_file",
  "git.status",
  "git.diff",
  "git.current_branch",
  "repository.scan_metadata",
  "workspace.apply_patch",
  "workspace.validate_profile",
  "native.provider_capability",
]);

export const ExecutionRequestStatusSchema = z.enum([
  "PENDING",
  "CLAIMED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
  "EXPIRED",
  "REJECTED",
]);

export const GitDiffModeSchema = z.enum([
  "unstaged_summary",
  "staged_summary",
  "unstaged_name_status",
  "staged_name_status",
]);

const RelativePathSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((value) => !value.startsWith("/") && !/^[A-Za-z]:/.test(value))
  .refine((value) => !value.includes("\0") && !/[?*[\]{}]/.test(value))
  .refine((value) => {
    const segments = value.split("/");
    return segments.every(
      (segment) => segment !== "" && segment !== "." && segment !== "..",
    );
  }, "Path must be a normalised relative path.");

export const WorkspaceInspectMetadataInputSchema = z
  .object({ workspaceId: RegistryIdSchema })
  .strict();
export const WorkspaceReadFileInputSchema = z
  .object({
    workspaceId: RegistryIdSchema,
    relativePath: RelativePathSchema,
    maxBytes: z.number().int().positive().max(131_072).optional(),
  })
  .strict();
export const GitStatusInputSchema = z
  .object({ workspaceId: RegistryIdSchema })
  .strict();
export const GitCurrentBranchInputSchema = GitStatusInputSchema;
export const GitDiffInputSchema = z
  .object({ workspaceId: RegistryIdSchema, mode: GitDiffModeSchema })
  .strict();
export const RepositoryScanMetadataInputSchema = z
  .object({ workspaceId: RegistryIdSchema })
  .strict();
export const WorkspaceApplyPatchInputSchema = z
  .object({
    workspaceId: RegistryIdSchema,
    patchId: z.string().uuid(),
    patchDigest: z.string().length(64),
    approvalToken: z.string().min(32).max(200),
    repositoryGeneration: z.number().int().positive().nullable(),
    operations: z.array(PatchOperationSchema).min(1).max(50),
  })
  .strict();

export const ReadOnlyCapabilityArgumentsSchema = z.discriminatedUnion("toolName", [
  z.object({
    toolName: z.literal("workspace.inspect_metadata"),
    arguments: WorkspaceInspectMetadataInputSchema,
  }),
  z.object({
    toolName: z.literal("workspace.read_file"),
    arguments: WorkspaceReadFileInputSchema,
  }),
  z.object({ toolName: z.literal("git.status"), arguments: GitStatusInputSchema }),
  z.object({ toolName: z.literal("git.diff"), arguments: GitDiffInputSchema }),
  z.object({
    toolName: z.literal("git.current_branch"),
    arguments: GitCurrentBranchInputSchema,
  }),
  z.object({
    toolName: z.literal("repository.scan_metadata"),
    arguments: RepositoryScanMetadataInputSchema,
  }),
  z.object({
    toolName: z.literal("workspace.apply_patch"),
    arguments: WorkspaceApplyPatchInputSchema,
  }),
  z.object({
    toolName: z.literal("workspace.validate_profile"),
    arguments: WorkspaceValidateProfileInputSchema,
  }),
  z.object({
    toolName: z.literal("native.provider_capability"),
    arguments: NativeCapabilityDispatchRequestSchema,
  }),
]);

export const WorkspaceMetadataResultSchema = z
  .object({
    workspaceId: RegistryIdSchema,
    registeredRootPath: z.string().min(1).max(1_024),
    canonicalRootPath: z.string().min(1).max(1_024),
    exists: z.boolean(),
    isDirectory: z.boolean(),
    isGitRepository: z.boolean(),
    rootEntryCount: z.number().int().nonnegative().max(100_000),
    rootFileCount: z.number().int().nonnegative().max(100_000),
    rootDirectoryCount: z.number().int().nonnegative().max(100_000),
    warnings: z.array(z.string().max(200)).max(20),
    inspectedAt: z.iso.datetime(),
  })
  .strict();

export const WorkspaceFileResultSchema = z
  .object({
    workspaceId: RegistryIdSchema,
    relativePath: RelativePathSchema,
    canonicalRelativePath: RelativePathSchema,
    sizeBytes: z.number().int().nonnegative().max(131_072),
    returnedBytes: z.number().int().nonnegative().max(131_072),
    encoding: z.literal("utf-8"),
    content: z.string().max(131_072),
    truncated: z.boolean(),
    redactionsApplied: z.array(z.string().max(100)).max(20),
    modifiedAt: z.iso.datetime().optional(),
  })
  .strict();

export const GitStatusEntrySchema = z
  .object({
    path: z.string().min(1).max(1_024),
    originalPath: z.string().min(1).max(1_024).optional(),
    indexStatus: z.string().max(10),
    worktreeStatus: z.string().max(10),
    kind: z.enum([
      "modified",
      "added",
      "deleted",
      "renamed",
      "copied",
      "untracked",
      "ignored",
      "conflicted",
      "unknown",
    ]),
  })
  .strict();

export const GitStatusResultSchema = z
  .object({
    workspaceId: RegistryIdSchema,
    branch: z
      .object({
        head: z.string().max(500).nullable(),
        upstream: z.string().max(500).nullable(),
        ahead: z.number().int().nonnegative(),
        behind: z.number().int().nonnegative(),
        detached: z.boolean(),
      })
      .strict(),
    entries: z.array(GitStatusEntrySchema).max(1_000),
    summary: z
      .object({
        modified: z.number().int().nonnegative(),
        added: z.number().int().nonnegative(),
        deleted: z.number().int().nonnegative(),
        renamed: z.number().int().nonnegative(),
        copied: z.number().int().nonnegative(),
        untracked: z.number().int().nonnegative(),
        ignored: z.number().int().nonnegative(),
        conflicted: z.number().int().nonnegative(),
        unknown: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    truncated: z.boolean(),
    durationMs: z.number().int().nonnegative().max(60_000),
  })
  .strict();

export const GitDiffResultSchema = z
  .object({
    workspaceId: RegistryIdSchema,
    mode: GitDiffModeSchema,
    files: z
      .array(
        z
          .object({
            path: z.string().min(1).max(1_024),
            status: z.string().max(20).optional(),
            additions: z.number().int().nonnegative().optional(),
            deletions: z.number().int().nonnegative().optional(),
            binary: z.boolean().optional(),
          })
          .strict(),
      )
      .max(1_000),
    totalFiles: z.number().int().nonnegative(),
    additions: z.number().int().nonnegative().optional(),
    deletions: z.number().int().nonnegative().optional(),
    truncated: z.boolean(),
    durationMs: z.number().int().nonnegative().max(60_000),
  })
  .strict();

export const GitBranchResultSchema = z
  .object({
    workspaceId: RegistryIdSchema,
    branchName: z.string().max(500).nullable(),
    detached: z.boolean(),
    durationMs: z.number().int().nonnegative().max(60_000),
  })
  .strict();

export const ReadOnlyCapabilityResultSchema = z.union([
  WorkspaceMetadataResultSchema,
  WorkspaceFileResultSchema,
  GitStatusResultSchema,
  GitDiffResultSchema,
  GitBranchResultSchema,
  RepositoryScanResultSchema,
  PatchExecutionResultSchema,
  ValidationExecutionResultSchema,
  NativeProviderExecutionTransportResultSchema,
]);

export const ReadOnlyExecutionRequestSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    deviceId: z.string().uuid(),
    actionId: z.string().uuid(),
    policyEvaluationId: z.string().uuid(),
    approvalRequestId: z.string().uuid().optional(),
    toolName: ReadOnlyToolNameSchema,
    workspaceId: RegistryIdSchema,
    arguments: z.record(z.string(), z.json()),
    workspaceRootPath: z.string().min(2).max(1_024),
    blockedPatterns: z.array(z.string().min(1).max(200)).max(100),
    actionDigest: z.string().min(32).max(128),
    status: ExecutionRequestStatusSchema,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    claimedAt: z.iso.datetime().nullable(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    cancellationRequestedAt: z.iso.datetime().nullable(),
    failureCode: z.string().max(100).nullable(),
    attemptCount: z.number().int().nonnegative().max(10),
    serverKeyFingerprint: z.string().min(16).max(200).nullable().optional(),
    workspaceRootHash: z.string().length(64).nullable().optional(),
    agentLastHeartbeatAt: z.iso.datetime().nullable().optional(),
  })
  .strict();
export const ExecutionRequestViewSchema = ReadOnlyExecutionRequestSchema.omit({
  workspaceRootPath: true,
  blockedPatterns: true,
});

export const ExecutionTerminalStatusSchema = z.enum([
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
]);

export const UnsignedExecutionResultSchema = z
  .object({
    commandId: z.string().uuid(),
    executionRequestId: z.string().uuid(),
    deviceId: z.string().uuid(),
    toolName: ReadOnlyToolNameSchema,
    status: ExecutionTerminalStatusSchema,
    result: ReadOnlyCapabilityResultSchema.optional(),
    failureCode: z.string().min(1).max(100).optional(),
    safeMessage: z.string().min(1).max(500).optional(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    durationMs: z.number().int().nonnegative().max(60_000),
    truncated: z.boolean(),
    resultDigest: z.string().min(32).max(128),
    nonce: z.string().min(16).max(128),
  })
  .strict();
export const ReadOnlyExecutionResultSchema = UnsignedExecutionResultSchema.extend({
  deviceSignature: z.string().min(32).max(256),
}).strict();

export const UnsignedServerExecutionEnvelopeSchema = z
  .object({
    request: ReadOnlyExecutionRequestSchema,
    issuedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    nonce: z.string().min(16).max(128),
    securityStateVersion: z.number().int().positive(),
  })
  .strict();
export const ServerExecutionEnvelopeSchema =
  UnsignedServerExecutionEnvelopeSchema.extend({
    signature: z.string().min(32).max(256),
    signatureAlgorithm: z.literal("Ed25519"),
  }).strict();

export const CreateExecutionRequestSchema = ReadOnlyCapabilityArgumentsSchema.and(
  z.object({ deviceId: z.string().uuid().optional() }).strict(),
);
export const ExecutionListResponseSchema = z.array(ExecutionRequestViewSchema).max(100);
export const ExecutionCancelResponseSchema = z
  .object({ request: ExecutionRequestViewSchema })
  .strict();
export const AgentPollResponseSchema = z
  .object({
    envelope: ServerExecutionEnvelopeSchema.nullable(),
    emergencyStopActive: z.boolean(),
    cancellations: z
      .array(
        z
          .object({
            executionRequestId: z.string().uuid(),
            cancelledAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict();

export const ExecutionProvenanceSchema = z
  .object({
    executionRequestId: z.string().uuid(),
    ownerId: z.string().uuid(),
    deviceId: z.string().uuid(),
    workspaceId: RegistryIdSchema,
    toolName: ReadOnlyToolNameSchema,
    actionDigest: z.string().min(32).max(128),
    policyEvaluationId: z.string().uuid(),
    approvalRequestId: z.string().uuid().nullable(),
    serverKeyFingerprint: z.string().min(16).max(200).nullable(),
    workspaceRootHash: z.string().length(64).nullable(),
    resultDigest: z.string().min(32).max(128).nullable(),
    resultExpiresAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const ExecutionDetailResponseSchema = z
  .object({
    request: ExecutionRequestViewSchema,
    result: ReadOnlyExecutionResultSchema.nullable(),
    provenance: ExecutionProvenanceSchema,
    readOnlyCapabilityExecution: z.enum(["available", "unavailable"]),
    privilegedExecutionAvailable: z.literal(false),
    writeExecutionAvailable: z.literal(false),
  })
  .strict();

export const ExecutionExportResponseSchema = z
  .object({
    request: ExecutionRequestViewSchema,
    result: ReadOnlyExecutionResultSchema.nullable(),
    provenance: ExecutionProvenanceSchema,
    exportedAt: z.iso.datetime(),
    privilegedExecutionAvailable: z.literal(false),
    writeExecutionAvailable: z.literal(false),
  })
  .strict();

export const ExecutionCleanupResponseSchema = z
  .object({
    expiredRequests: z.number().int().nonnegative(),
    expiredResults: z.number().int().nonnegative(),
  })
  .strict();

const canonicalJson = (value: unknown): string => {
  if (value === null || ["boolean", "string"].includes(typeof value))
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  throw new TypeError("Canonical payload must contain JSON values.");
};
export const canonicalizeExecutionPayload = canonicalJson;

export type ReadOnlyToolName = z.infer<typeof ReadOnlyToolNameSchema>;
export type ExecutionRequestStatus = z.infer<typeof ExecutionRequestStatusSchema>;
export type ReadOnlyExecutionRequest = z.infer<typeof ReadOnlyExecutionRequestSchema>;
export type ExecutionRequestView = z.infer<typeof ExecutionRequestViewSchema>;
export type ReadOnlyExecutionResult = z.infer<typeof ReadOnlyExecutionResultSchema>;
export type CreateExecutionRequest = z.infer<typeof CreateExecutionRequestSchema>;
export type ServerExecutionEnvelope = z.infer<typeof ServerExecutionEnvelopeSchema>;
export type ReadOnlyCapabilityResult = z.infer<typeof ReadOnlyCapabilityResultSchema>;
export type ExecutionProvenance = z.infer<typeof ExecutionProvenanceSchema>;

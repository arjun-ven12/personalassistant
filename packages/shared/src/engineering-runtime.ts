import { z } from "zod";

import { RegistryIdSchema } from "./applications.js";

export const EngineeringRepositoryStatusSchema = z.enum([
  "INITIALIZING",
  "ACTIVE",
  "DISABLED",
  "ARCHIVED",
]);

export const EngineeringWorkspaceStateSchema = z.enum([
  "CREATING",
  "READY",
  "DIRTY",
  "VALIDATING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "CLEANING_UP",
  "ARCHIVED",
]);

export const EngineeringCapabilitySchema = z.enum([
  "repository.initialize_project",
  "repository.inspect",
  "repository.search",
  "repository.file_read",
  "repository.file_create",
  "repository.file_patch",
  "repository.file_delete",
  "repository.git_status",
  "repository.git_diff",
  "repository.integration_diff",
  "repository.git_log",
  "repository.worktree_create",
  "repository.worktree_inspect",
  "repository.worktree_remove",
  "repository.run_command",
  "repository.validate",
  "repository.install_dependencies",
  "repository.add_dependency",
  "repository.remove_dependency",
  "repository.dev_server_start",
  "repository.dev_server_status",
  "repository.dev_server_stop",
  "repository.dev_server_restart",
  "repository.prepare_commit",
  "repository.integrate_commit",
  "repository.resolve_additive_docs_conflict",
  "repository.merge_candidate",
  "repository.revert_commit",
]);

export const EngineeringErrorCodeSchema = z.enum([
  "REPOSITORY_NOT_FOUND",
  "REPOSITORY_NOT_AUTHORIZED",
  "WORKSPACE_NOT_FOUND",
  "WORKSPACE_BUSY",
  "PATH_OUTSIDE_REPOSITORY",
  "CAPABILITY_DENIED",
  "COMMAND_NOT_ALLOWED",
  "COMMAND_TIMEOUT",
  "COMMAND_SANDBOX_UNAVAILABLE",
  "VALIDATION_FAILED",
  "GIT_ERROR",
  "WORKTREE_ERROR",
  "PROTECTED_PATH",
  "DIRTY_REPOSITORY",
  "SYMLINK_REJECTED",
  "BINARY_FILE",
  "OUTPUT_LIMIT",
  "CANCELLED",
  "INCONSISTENT_STATE",
  "DEPENDENCY_INSTALL_FAILED",
  "DEV_SERVER_FAILED",
  "PORT_UNAVAILABLE",
]);

export const EngineeringRelativePathSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((value) => !value.startsWith("/") && !/^[A-Za-z]:/.test(value))
  .refine((value) => !value.includes("\0") && !/[?*[\]{}]/.test(value))
  .refine(
    (value) =>
      value
        .replaceAll("\\", "/")
        .split("/")
        .every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    "Path must be a normalized repository-relative path.",
  );

const SafeIdentifierSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);

export const EngineeringRepositoryMetadataSchema = z
  .object({
    languages: z.array(z.string().min(1).max(80)).max(30),
    packageManagers: z.array(z.string().min(1).max(40)).max(10),
    frameworks: z.array(z.string().min(1).max(80)).max(20),
    importantFiles: z.array(EngineeringRelativePathSchema).max(50),
    contractBindings: z
      .array(
        z
          .object({
            sourcePath: EngineeringRelativePathSchema,
            generatedPathPrefix: EngineeringRelativePathSchema,
          })
          .strict(),
      )
      .max(30)
      .default([]),
  })
  .strict();

export const EngineeringRepositorySchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    displayName: z.string().trim().min(1).max(120),
    workspaceLocatorId: RegistryIdSchema,
    defaultBranch: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/),
    protectedBranches: z.array(z.string().min(1).max(200)).min(1).max(20),
    protectedPaths: z.array(z.string().min(1).max(300)).max(100),
    generatedPaths: z.array(z.string().min(1).max(300)).max(100),
    commandProfileId: SafeIdentifierSchema,
    capabilityProfileId: SafeIdentifierSchema,
    authorizedAgentIds: z.array(z.string().uuid()).max(100),
    metadata: EngineeringRepositoryMetadataSchema,
    status: EngineeringRepositoryStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.protectedBranches.includes(value.defaultBranch))
      context.addIssue({
        code: "custom",
        path: ["protectedBranches"],
        message: "The default branch must be protected.",
      });
    for (const [index, binding] of value.metadata.contractBindings.entries()) {
      if (
        !value.generatedPaths.some(
          (pattern) =>
            binding.generatedPathPrefix === pattern.replace(/\/\*\*?$/, "") ||
            binding.generatedPathPrefix.startsWith(
              `${pattern.replace(/\/\*\*?$/, "")}/`,
            ),
        )
      )
        context.addIssue({
          code: "custom",
          path: ["metadata", "contractBindings", index],
          message: "Contract output must be inside a registered generated path.",
        });
    }
  });

export const CreateEngineeringRepositoryRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    workspaceLocatorId: RegistryIdSchema,
    defaultBranch: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/),
    protectedBranches: z.array(z.string().min(1).max(200)).max(20).default([]),
    protectedPaths: z.array(z.string().min(1).max(300)).max(100).default([]),
    generatedPaths: z.array(z.string().min(1).max(300)).max(100).default([]),
    commandProfileId: SafeIdentifierSchema,
    capabilityProfileId: SafeIdentifierSchema,
    authorizedAgentIds: z.array(z.string().uuid()).max(100).default([]),
  })
  .strict();

export const EngineeringWorkspaceSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    taskId: z.string().uuid().nullable(),
    agentId: z.string().uuid().nullable(),
    idempotencyKey: SafeIdentifierSchema,
    branchName: z.string().regex(/^alexa\/[a-z0-9][a-z0-9-]{0,119}$/),
    worktreeLocator: SafeIdentifierSchema,
    baseCommit: z.string().regex(/^[0-9a-f]{40,64}$/),
    headCommit: z
      .string()
      .regex(/^[0-9a-f]{40,64}$/)
      .nullable(),
    state: EngineeringWorkspaceStateSchema,
    leaseOwner: SafeIdentifierSchema.nullable(),
    leaseExpiresAt: z.iso.datetime().nullable(),
    leaseGeneration: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().nullable(),
  })
  .strict();

export const CreateEngineeringWorkspaceRequestSchema = z
  .object({
    repositoryId: z.string().uuid(),
    taskId: z.string().uuid().nullable().default(null),
    agentId: z.string().uuid().nullable().default(null),
    idempotencyKey: SafeIdentifierSchema,
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/),
    expiresAt: z.iso.datetime().nullable().default(null),
  })
  .strict();

export const EngineeringSearchRequestSchema = z
  .object({
    query: z.string().min(1).max(300),
    mode: z.enum(["TEXT", "FILE_NAME"]),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .strict();

export const EngineeringSearchResultSchema = z
  .object({
    path: EngineeringRelativePathSchema,
    line: z.number().int().positive().nullable(),
    preview: z.string().max(500),
  })
  .strict();

export const EngineeringFileReadRequestSchema = z
  .object({
    path: EngineeringRelativePathSchema,
    startLine: z.number().int().positive().default(1),
    endLine: z.number().int().positive().max(20_000).optional(),
    maxBytes: z.number().int().min(1).max(131_072).default(32_768),
  })
  .strict()
  .refine((value) => value.endLine === undefined || value.endLine >= value.startLine, {
    message: "endLine must not precede startLine.",
  });

export const EngineeringFileReadResultSchema = z
  .object({
    path: EngineeringRelativePathSchema,
    startLine: z.number().int().positive(),
    endLine: z.number().int().nonnegative(),
    content: z.string().max(131_072),
    sha256: z.string().length(64),
    truncated: z.boolean(),
    redactions: z.array(z.string().max(80)).max(20),
  })
  .strict();

export const EngineeringPatchSchema = z
  .object({
    path: EngineeringRelativePathSchema,
    expectedSha256: z.string().length(64),
    hunks: z
      .array(
        z
          .object({
            startLine: z.number().int().positive(),
            endLine: z.number().int().nonnegative(),
            replacement: z.string().max(131_072),
          })
          .strict()
          .refine((value) => value.endLine >= value.startLine - 1),
      )
      .min(1)
      .max(50),
  })
  .strict();

export const EngineeringFileCreateRequestSchema = z
  .object({
    path: EngineeringRelativePathSchema,
    content: z.string().max(131_072),
  })
  .strict();

export const EngineeringFileDeleteRequestSchema = z
  .object({
    path: EngineeringRelativePathSchema,
    expectedSha256: z.string().length(64),
    approvalId: z.string().uuid(),
  })
  .strict();

export const EngineeringCommandDefinitionSchema = z
  .object({
    id: SafeIdentifierSchema,
    executable: z.enum(["pnpm", "npm", "pytest", "ruff", "mypy", "gradle"]),
    args: z
      .array(
        z
          .string()
          .min(1)
          .max(120)
          .regex(/^[a-zA-Z0-9@%+=:,./_-]+$/),
      )
      .max(20),
    kind: z.enum(["LINT", "TYPECHECK", "TEST", "BUILD", "OTHER"]),
    timeoutMs: z
      .number()
      .int()
      .min(1_000)
      .max(30 * 60_000),
    maxOutputBytes: z.number().int().min(1_024).max(1_048_576),
    networkPolicy: z.literal("DENY"),
  })
  .strict();

export const EngineeringDevServerDefinitionSchema = z
  .object({
    id: SafeIdentifierSchema,
    executable: z.enum(["pnpm", "npm", "yarn", "python", "gradle"]),
    args: z
      .array(
        z
          .string()
          .min(1)
          .max(120)
          .regex(/^[a-zA-Z0-9@%+=:,./_-]+$/),
      )
      .max(20),
    portFlag: z.enum(["--port", "-p", "--server.port"]).nullable(),
    hostFlag: z.enum(["--host", "--hostname"]).nullable(),
    healthPath: z
      .string()
      .regex(/^\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]*$/)
      .max(300),
    startupTimeoutMs: z.number().int().min(1_000).max(120_000),
    maxLifetimeMs: z
      .number()
      .int()
      .min(60_000)
      .max(24 * 60 * 60_000),
  })
  .strict();

export const EngineeringCommandProfileSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: SafeIdentifierSchema,
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    displayName: z.string().min(1).max(120),
    commands: z.array(EngineeringCommandDefinitionSchema).min(1).max(30),
    validationOrder: z.array(SafeIdentifierSchema).max(20),
    dependencyManager: z
      .enum(["pnpm", "npm", "yarn", "pip", "uv", "gradle"])
      .nullable()
      .default(null),
    developmentServers: z
      .array(EngineeringDevServerDefinitionSchema)
      .max(10)
      .default([]),
    status: z.enum(["ACTIVE", "DISABLED"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set(value.commands.map((command) => command.id));
    if (ids.size !== value.commands.length)
      context.addIssue({
        code: "custom",
        path: ["commands"],
        message: "Command IDs must be unique.",
      });
    for (const id of value.validationOrder)
      if (!ids.has(id))
        context.addIssue({
          code: "custom",
          path: ["validationOrder"],
          message: `Unknown command: ${id}`,
        });
    const serverIds = new Set(value.developmentServers.map((server) => server.id));
    if (serverIds.size !== value.developmentServers.length)
      context.addIssue({
        code: "custom",
        path: ["developmentServers"],
        message: "Development server IDs must be unique.",
      });
  });

export const EngineeringProjectTemplateSchema = z.enum([
  "REACT_VITE_TYPESCRIPT",
  "EMPTY_TYPESCRIPT",
]);

export const EngineeringDependencyPackageSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(
    /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@(?:\^|~)?[0-9][0-9A-Za-z.+-]*)?$/,
  );

export const EngineeringDependencyOperationResultSchema = z
  .object({
    packageManager: z.enum(["pnpm", "npm", "yarn", "pip", "uv", "gradle"]),
    operation: z.enum(["INSTALL", "ADD", "REMOVE"]),
    packages: z.array(EngineeringDependencyPackageSchema).max(20),
    exitCode: z.number().int().nullable(),
    durationMs: z.number().int().nonnegative(),
    stdout: z.string().max(131_072),
    stderr: z.string().max(131_072),
    timedOut: z.boolean(),
    lockfileChanged: z.boolean(),
  })
  .strict();

export const EngineeringPreviewStateSchema = z.enum([
  "STARTING",
  "RUNNING",
  "FAILED",
  "STOPPED",
]);
export const EngineeringPreviewResultSchema = z
  .object({
    previewId: z.string().uuid(),
    serverId: SafeIdentifierSchema,
    state: EngineeringPreviewStateSchema,
    pid: z.number().int().positive().nullable(),
    port: z.number().int().min(1024).max(65535).nullable(),
    url: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)
        );
      })
      .nullable(),
    healthStatus: z.enum(["PENDING", "PASS", "FAIL"]),
    startedAt: z.iso.datetime().nullable(),
    checkedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().nullable(),
    failureSummary: z.string().max(1_000).nullable(),
  })
  .strict();

export const EngineeringCommandResultSchema = z
  .object({
    commandId: SafeIdentifierSchema,
    exitCode: z.number().int().nullable(),
    stdout: z.string().max(1_048_576),
    stderr: z.string().max(1_048_576),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    durationMs: z.number().int().nonnegative(),
    timedOut: z.boolean(),
    cancelled: z.boolean(),
    truncated: z.boolean(),
    networkIsolated: z.literal(true),
  })
  .strict();

export const EngineeringValidationStepStatusSchema = z.enum([
  "PASS",
  "FAIL",
  "SKIPPED",
  "NOT_CONFIGURED",
  "ERROR",
]);

export const EngineeringValidationReportSchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
    status: z.enum(["PASS", "FAIL", "ERROR", "CANCELLED"]),
    steps: z
      .array(
        z
          .object({
            commandId: SafeIdentifierSchema,
            kind: z.enum(["LINT", "TYPECHECK", "TEST", "BUILD", "OTHER"]),
            status: EngineeringValidationStepStatusSchema,
            result: EngineeringCommandResultSchema.nullable(),
            failures: z
              .array(
                z
                  .object({
                    file: EngineeringRelativePathSchema.nullable(),
                    testName: z.string().max(300).nullable(),
                    message: z.string().max(1_000),
                  })
                  .strict(),
              )
              .max(50),
          })
          .strict(),
      )
      .max(20),
    durationMs: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const EngineeringGitStatusSchema = z
  .object({
    branch: z.string().max(200),
    entries: z
      .array(
        z
          .object({
            path: EngineeringRelativePathSchema,
            originalPath: EngineeringRelativePathSchema.nullable(),
            kind: z.enum([
              "MODIFIED",
              "ADDED",
              "DELETED",
              "RENAMED",
              "UNTRACKED",
              "CONFLICTED",
            ]),
          })
          .strict(),
      )
      .max(2_000),
    dirty: z.boolean(),
    truncated: z.boolean(),
  })
  .strict();

export const EngineeringDiffResultSchema = z
  .object({
    patch: z.string().max(524_288),
    files: z
      .array(
        z
          .object({
            path: EngineeringRelativePathSchema,
            additions: z.number().int().nonnegative(),
            deletions: z.number().int().nonnegative(),
            binary: z.boolean(),
          })
          .strict(),
      )
      .max(2_000),
    truncated: z.boolean(),
    redactions: z.array(z.string().max(80)).max(20),
  })
  .strict();

export const EngineeringPreparedCommitSchema = z
  .object({
    commit: z.string().regex(/^[0-9a-f]{40,64}$/),
    files: z.array(EngineeringRelativePathSchema).min(1).max(2_000),
    redactions: z.array(z.string().max(80)).max(20),
  })
  .strict();

export const EngineeringCommitIntegrationResultSchema = z
  .object({
    integrated: z.boolean(),
    commit: z.string().regex(/^[0-9a-f]{40,64}$/),
    headCommit: z.string().regex(/^[0-9a-f]{40,64}$/),
    conflictPaths: z.array(EngineeringRelativePathSchema).max(500),
    conflictHunks: z
      .array(
        z
          .object({
            path: EngineeringRelativePathSchema,
            startLine: z.number().int().positive(),
            endLine: z.number().int().positive(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict();

export const EngineeringCandidateMergeResultSchema = z
  .object({
    merged: z.boolean(),
    alreadyMerged: z.boolean(),
    headCommit: z.string().regex(/^[0-9a-f]{40,64}$/),
    targetBranch: z.string().max(200),
  })
  .strict();

export const EngineeringExecutionRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    taskId: z.string().uuid().nullable(),
    agentId: z.string().uuid().nullable(),
    capability: EngineeringCapabilitySchema,
    modelProvider: z.string().max(80).nullable(),
    modelId: z.string().max(120).nullable(),
    aiRequestId: z.string().uuid().nullable(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    costMinor: z.number().int().nonnegative().nullable(),
    status: z.enum(["RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]),
    filesTouched: z.array(EngineeringRelativePathSchema).max(200),
    commandIds: z.array(SafeIdentifierSchema).max(50),
    validationAttempt: z.number().int().nonnegative(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
    failureCode: EngineeringErrorCodeSchema.nullable(),
  })
  .strict();

export const EngineeringExecutionResultSchema = z
  .object({
    repository: EngineeringRepositorySchema,
    workspace: EngineeringWorkspaceSchema,
    filesChanged: z.array(EngineeringRelativePathSchema).max(2_000),
    diffSummary: EngineeringDiffResultSchema,
    validation: EngineeringValidationReportSchema.nullable(),
    commandsRun: z.array(EngineeringCommandResultSchema).max(50),
    warnings: z.array(z.string().max(500)).max(50),
    status: z.enum(["SUCCEEDED", "FAILED", "CANCELLED"]),
  })
  .strict();

const EngineeringTransportScopeSchema = z
  .object({
    schemaVersion: z.literal("1"),
    companyId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    engineeringWorkspaceId: z.string().uuid().nullable(),
    workspaceLocatorId: RegistryIdSchema,
    worktreeLocator: SafeIdentifierSchema.nullable(),
    taskId: z.string().uuid().nullable(),
    agentId: z.string().uuid().nullable(),
    operationId: z.string().uuid(),
    idempotencyKey: SafeIdentifierSchema,
    requestId: z.string().uuid(),
  })
  .strict();

const EngineeringTransportOperationSchema = z.discriminatedUnion("capability", [
  z
    .object({
      capability: z.literal("repository.initialize_project"),
      input: z
        .object({
          template: EngineeringProjectTemplateSchema,
          projectSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
          defaultBranch: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.inspect"),
      input: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.worktree_create"),
      input: z
        .object({
          branchName: z.string().regex(/^alexa\/[a-z0-9][a-z0-9-]{0,119}$/),
          baseCommit: z.string().regex(/^[0-9a-f]{40,64}$/),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.worktree_inspect"),
      input: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.worktree_remove"),
      input: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.search"),
      input: EngineeringSearchRequestSchema,
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.file_read"),
      input: EngineeringFileReadRequestSchema,
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.file_patch"),
      input: z
        .object({
          patch: EngineeringPatchSchema,
          protectedPaths: z.array(z.string().min(1).max(300)).max(100),
          protectedPathApproved: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.file_create"),
      input: EngineeringFileCreateRequestSchema.extend({
        protectedPaths: z.array(z.string().min(1).max(300)).max(100),
        protectedPathApproved: z.boolean(),
      }).strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.file_delete"),
      input: EngineeringFileDeleteRequestSchema.omit({ approvalId: true })
        .extend({
          protectedPaths: z.array(z.string().min(1).max(300)).max(100),
          protectedPathApproved: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.git_status"),
      input: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.git_diff"),
      input: z.object({ maxBytes: z.number().int().min(1_024).max(524_288) }).strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.integration_diff"),
      input: z
        .object({
          baseCommit: z.string().regex(/^[0-9a-f]{40,64}$/),
          maxBytes: z.number().int().min(1_024).max(524_288),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.prepare_commit"),
      input: z
        .object({
          taskId: z.string().uuid(),
          agentId: z.string().uuid(),
          baseCommit: z.string().regex(/^[0-9a-f]{40,64}$/),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.integrate_commit"),
      input: z
        .object({
          commit: z.string().regex(/^[0-9a-f]{40,64}$/),
          sourceWorkspaceId: z.string().uuid(),
          sourceWorktreeLocator: z.string().regex(/^ew-[0-9a-f-]{36}$/),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.resolve_additive_docs_conflict"),
      input: z
        .object({
          commit: z.string().regex(/^[0-9a-f]{40,64}$/),
          sourceWorkspaceId: z.string().uuid(),
          sourceWorktreeLocator: z.string().regex(/^ew-[0-9a-f-]{36}$/),
          path: EngineeringRelativePathSchema,
          expectedHead: z.string().regex(/^[0-9a-f]{40,64}$/),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.merge_candidate"),
      input: z
        .object({
          candidateId: z.string().uuid(),
          integrationRunId: z.string().uuid(),
          expectedBase: z.string().regex(/^[0-9a-f]{40,64}$/),
          candidateHead: z.string().regex(/^[0-9a-f]{40,64}$/),
          targetBranch: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/),
          mergeIdempotencyKey: z.string().min(8).max(200),
          leaseGeneration: z.number().int().positive(),
          leaseExpiresAt: z.iso.datetime(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.run_command"),
      input: z.object({ command: EngineeringCommandDefinitionSchema }).strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.revert_commit"),
      input: z.object({
        targetCommit: z.string().regex(/^[0-9a-f]{40,64}$/),
        expectedHead: z.string().regex(/^[0-9a-f]{40,64}$/),
      }).strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.install_dependencies"),
      input: z
        .object({
          packageManager: z.enum(["pnpm", "npm", "yarn", "pip", "uv", "gradle"]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.add_dependency"),
      input: z
        .object({
          packageManager: z.enum(["pnpm", "npm", "yarn", "pip", "uv", "gradle"]),
          packages: z.array(EngineeringDependencyPackageSchema).min(1).max(20),
          development: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.remove_dependency"),
      input: z
        .object({
          packageManager: z.enum(["pnpm", "npm", "yarn", "pip", "uv", "gradle"]),
          packages: z.array(EngineeringDependencyPackageSchema).min(1).max(20),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.dev_server_start"),
      input: z
        .object({
          previewId: z.string().uuid(),
          server: EngineeringDevServerDefinitionSchema,
          preferredPort: z.number().int().min(1024).max(65535).nullable(),
          portRangeStart: z.number().int().min(1024).max(65535),
          portRangeEnd: z.number().int().min(1024).max(65535),
        })
        .strict()
        .refine(
          (value) =>
            value.portRangeEnd >= value.portRangeStart &&
            value.portRangeEnd - value.portRangeStart <= 100,
        ),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.dev_server_status"),
      input: z.object({ previewId: z.string().uuid() }).strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.dev_server_stop"),
      input: z.object({ previewId: z.string().uuid() }).strict(),
    })
    .strict(),
  z
    .object({
      capability: z.literal("repository.dev_server_restart"),
      input: z
        .object({
          previewId: z.string().uuid(),
          server: EngineeringDevServerDefinitionSchema,
          preferredPort: z.number().int().min(1024).max(65535).nullable(),
          portRangeStart: z.number().int().min(1024).max(65535),
          portRangeEnd: z.number().int().min(1024).max(65535),
        })
        .strict()
        .refine(
          (value) =>
            value.portRangeEnd >= value.portRangeStart &&
            value.portRangeEnd - value.portRangeStart <= 100,
        ),
    })
    .strict(),
]);

/**
 * Finite payload carried by the existing server-signed Mac Agent execution
 * channel. Root paths and executables remain server/runtime-owned fields.
 */
export const EngineeringTransportRequestSchema = z.intersection(
  EngineeringTransportScopeSchema,
  EngineeringTransportOperationSchema,
);

export const EngineeringRepositoryInspectionSchema = z
  .object({
    baseCommit: z.string().regex(/^[0-9a-f]{40,64}$/),
    branch: z.string().max(200),
    dirty: z.boolean(),
    metadata: EngineeringRepositoryMetadataSchema,
  })
  .strict();
export const EngineeringWorktreeInspectionSchema = z
  .object({
    exists: z.boolean(),
    baseCommit: z
      .string()
      .regex(/^[0-9a-f]{40,64}$/)
      .nullable(),
    headCommit: z
      .string()
      .regex(/^[0-9a-f]{40,64}$/)
      .nullable(),
    dirty: z.boolean(),
    branch: z.string().max(200).nullable(),
  })
  .strict();
export const EngineeringMutationResultSchema = z
  .object({ path: EngineeringRelativePathSchema, sha256: z.string().length(64) })
  .strict();
export const EngineeringQuarantineResultSchema = z
  .object({
    path: EngineeringRelativePathSchema,
    recoveryLocator: z.string().min(1).max(300),
  })
  .strict();
export const EngineeringTransportOutputSchema = z.union([
  EngineeringRepositoryInspectionSchema,
  EngineeringWorktreeInspectionSchema,
  z.object({ completed: z.literal(true) }).strict(),
  z.array(EngineeringSearchResultSchema).max(200),
  EngineeringFileReadResultSchema,
  EngineeringMutationResultSchema,
  EngineeringQuarantineResultSchema,
  EngineeringGitStatusSchema,
  EngineeringDiffResultSchema,
  EngineeringPreparedCommitSchema,
  EngineeringCommitIntegrationResultSchema,
  EngineeringCandidateMergeResultSchema,
  EngineeringCommandResultSchema,
  EngineeringDependencyOperationResultSchema,
  EngineeringPreviewResultSchema,
]);
export const EngineeringTransportResultSchema = z
  .object({
    schemaVersion: z.literal("1"),
    operationId: z.string().uuid(),
    capability: EngineeringCapabilitySchema,
    output: EngineeringTransportOutputSchema,
  })
  .strict();

export type EngineeringRepository = z.infer<typeof EngineeringRepositorySchema>;
export type EngineeringWorkspace = z.infer<typeof EngineeringWorkspaceSchema>;
export type EngineeringCommandProfile = z.infer<typeof EngineeringCommandProfileSchema>;
export type EngineeringCommandDefinition = z.infer<
  typeof EngineeringCommandDefinitionSchema
>;
export type EngineeringCommandResult = z.infer<typeof EngineeringCommandResultSchema>;
export type EngineeringDependencyOperationResult = z.infer<
  typeof EngineeringDependencyOperationResultSchema
>;
export type EngineeringPreviewResult = z.infer<typeof EngineeringPreviewResultSchema>;
export type EngineeringValidationReport = z.infer<
  typeof EngineeringValidationReportSchema
>;
export type EngineeringExecutionRecord = z.infer<
  typeof EngineeringExecutionRecordSchema
>;
export type EngineeringCapability = z.infer<typeof EngineeringCapabilitySchema>;
export type EngineeringErrorCode = z.infer<typeof EngineeringErrorCodeSchema>;
export type EngineeringTransportRequest = z.infer<
  typeof EngineeringTransportRequestSchema
>;
export type EngineeringTransportResult = z.infer<
  typeof EngineeringTransportResultSchema
>;

import {
  CreateEngineeringRepositoryRequestSchema,
  CreateEngineeringWorkspaceRequestSchema,
  EngineeringCommandProfileSchema,
  EngineeringErrorCodeSchema,
  EngineeringExecutionRecordSchema,
  EngineeringFileCreateRequestSchema,
  EngineeringFileDeleteRequestSchema,
  EngineeringFileReadRequestSchema,
  EngineeringPatchSchema,
  EngineeringRepositorySchema,
  EngineeringSearchRequestSchema,
  EngineeringValidationReportSchema,
  EngineeringWorkspaceSchema,
  type EngineeringCapability,
  type EngineeringCommandDefinition,
  type EngineeringCommandProfile,
  type EngineeringCommandResult,
  type EngineeringDiffResultSchema,
  type EngineeringErrorCode,
  type EngineeringFileReadResultSchema,
  type EngineeringGitStatusSchema,
  type EngineeringRepositoryMetadataSchema,
  type EngineeringSearchResultSchema,
  type EngineeringValidationReport,
  type EngineeringWorkspace,
} from "@alexa-control/shared";
import type { z } from "zod";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { EngineeringRuntimeStore } from "./store.js";

type RepositoryMetadata = z.infer<typeof EngineeringRepositoryMetadataSchema>;
type SearchResult = z.infer<typeof EngineeringSearchResultSchema>;
type FileReadResult = z.infer<typeof EngineeringFileReadResultSchema>;
type GitStatus = z.infer<typeof EngineeringGitStatusSchema>;
type DiffResult = z.infer<typeof EngineeringDiffResultSchema>;

export class EngineeringRuntimeError extends Error {
  constructor(
    readonly code: EngineeringErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EngineeringRuntimeError";
  }
}

export interface EngineeringWorkspaceLocatorResolver {
  resolve(
    ownerId: string,
    companyId: string,
    workspaceLocatorId: string,
  ): Promise<
    | {
        rootPath: string;
        enabled: boolean;
        read: boolean;
        write: boolean;
      }
    | undefined
  >;
}

export interface EngineeringCapabilityAuthorizer {
  authorize(input: {
    ownerId: string;
    companyId: string;
    agentId: string | null;
    repositoryId: string;
    workspaceId: string;
    capabilityProfileId: string;
    capability: EngineeringCapability;
    protectedPath: boolean;
    approvalId?: string;
  }): Promise<{ allowed: boolean; protectedPathApproved: boolean }>;
}

/** Native operations are implemented by the trusted Mac Agent, never a model provider. */
export interface EngineeringRuntimeProvider {
  inspectRepository(input: { repositoryRootPath: string }): Promise<{
    baseCommit: string;
    branch: string;
    dirty: boolean;
    metadata: RepositoryMetadata;
  }>;
  createWorktree(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    branchName: string;
    baseCommit: string;
  }): Promise<void>;
  inspectWorktree(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
  }): Promise<{
    exists: boolean;
    baseCommit: string | null;
    headCommit: string | null;
    dirty: boolean;
    branch: string | null;
  }>;
  removeWorktree(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
  }): Promise<void>;
  search(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    query: string;
    mode: "TEXT" | "FILE_NAME";
    limit: number;
    signal?: AbortSignal;
  }): Promise<SearchResult[]>;
  readFile(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    path: string;
    startLine: number;
    endLine?: number;
    maxBytes: number;
    signal?: AbortSignal;
  }): Promise<FileReadResult>;
  applyPatch(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    patch: unknown;
    protectedPaths: string[];
    protectedPathApproved: boolean;
  }): Promise<{ path: string; sha256: string }>;
  createFile(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    path: string;
    content: string;
    protectedPaths: string[];
    protectedPathApproved: boolean;
  }): Promise<{ path: string; sha256: string }>;
  quarantineFile(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    path: string;
    expectedSha256: string;
    protectedPaths: string[];
    protectedPathApproved: boolean;
  }): Promise<{ path: string; recoveryLocator: string }>;
  gitStatus(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
  }): Promise<GitStatus>;
  gitDiff(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    maxBytes: number;
  }): Promise<DiffResult>;
  runCommand(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    command: EngineeringCommandDefinition;
    signal?: AbortSignal;
  }): Promise<EngineeringCommandResult>;
}

type RequestContext = {
  ownerId: string;
  companyId: string;
  agentId: string | null;
  requestId: string;
  ipAddress: string;
  workerId: string;
  model?: {
    provider: string;
    modelId: string;
    aiRequestId?: string;
    inputTokens?: number;
    outputTokens?: number;
    costMinor?: number;
  };
};

const protectedPath = (relativePath: string, patterns: string[]) => {
  const normalized = relativePath.replaceAll("\\", "/");
  return patterns.some((pattern) => {
    const clean = pattern
      .replace(/^\//, "")
      .replace(/\*\*$/, "")
      .replace(/\*$/, "")
      .replace(/\/$/, "");
    return normalized === clean || normalized.startsWith(`${clean}/`);
  });
};

const branchName = (taskId: string | null, slug: string, workspaceId: string) => {
  const safeSlug =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 55) || "task";
  const source = (taskId ?? workspaceId).replaceAll("-", "").slice(0, 12);
  const collisionSuffix = workspaceId.replaceAll("-", "").slice(-6);
  return `alexa/${source}-${collisionSuffix}-${safeSlug}`;
};
const combineSignals = (external: AbortSignal | undefined, lease: AbortSignal) =>
  external ? AbortSignal.any([external, lease]) : lease;

export class EngineeringRuntimeService {
  constructor(
    readonly store: EngineeringRuntimeStore,
    readonly locatorResolver: EngineeringWorkspaceLocatorResolver,
    readonly authorizer: EngineeringCapabilityAuthorizer,
    readonly provider: EngineeringRuntimeProvider | undefined,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
    readonly leaseMs = 60_000,
  ) {}

  async registerRepository(
    context: Omit<RequestContext, "agentId" | "workerId">,
    body: unknown,
  ) {
    const request = CreateEngineeringRepositoryRequestSchema.parse(body);
    const locator = await this.locatorResolver.resolve(
      context.ownerId,
      context.companyId,
      request.workspaceLocatorId,
    );
    if (!locator?.enabled || !locator.read)
      throw new EngineeringRuntimeError(
        "REPOSITORY_NOT_AUTHORIZED",
        "The registered workspace locator is unavailable or not readable.",
      );
    if (!this.provider)
      throw new EngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "The trusted engineering runtime provider is unavailable.",
      );
    const profile = await this.store.findCommandProfile(
      context.ownerId,
      context.companyId,
      request.commandProfileId,
    );
    if (!profile || profile.status !== "ACTIVE")
      throw new EngineeringRuntimeError(
        "COMMAND_NOT_ALLOWED",
        "The registered command profile is unavailable.",
      );
    const inspection = await this.provider.inspectRepository({
      repositoryRootPath: locator.rootPath,
    });
    if (inspection.branch !== request.defaultBranch)
      throw new EngineeringRuntimeError(
        "GIT_ERROR",
        "The registered default branch does not match the repository checkout.",
      );
    const at = this.now().toISOString();
    const repository = EngineeringRepositorySchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      ...request,
      protectedBranches: [
        ...new Set([request.defaultBranch, ...request.protectedBranches]),
      ],
      metadata: inspection.metadata,
      status: "ACTIVE",
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveRepository(repository);
    await this.writeAudit(
      context,
      "ENGINEERING_REPOSITORY_REGISTERED",
      "Engineering repository registered from an existing governed workspace locator.",
      {
        repositoryId: repository.id,
        workspaceLocatorId: repository.workspaceLocatorId,
      },
    );
    return repository;
  }

  /** Command profiles are governance/admin records and are never created by capability invocation. */
  async saveGovernedCommandProfile(value: EngineeringCommandProfile) {
    await this.store.saveCommandProfile(EngineeringCommandProfileSchema.parse(value));
  }

  async createWorkspace(context: RequestContext, body: unknown) {
    const request = CreateEngineeringWorkspaceRequestSchema.parse(body);
    const existing = await this.store.findWorkspaceByIdempotencyKey(
      context.ownerId,
      context.companyId,
      request.repositoryId,
      request.idempotencyKey,
    );
    if (existing) return this.resumeWorkspaceCreation(context, existing);
    const repository = await this.requireRepository(context, request.repositoryId);
    this.assertAgent(repository.authorizedAgentIds, context.agentId);
    if (request.agentId) {
      this.assertAgent(repository.authorizedAgentIds, request.agentId);
      if (context.agentId && request.agentId !== context.agentId)
        throw new EngineeringRuntimeError(
          "REPOSITORY_NOT_AUTHORIZED",
          "An engineering agent cannot assign a workspace to another agent.",
        );
    }
    const locator = await this.requireLocator(
      context,
      repository.workspaceLocatorId,
      false,
    );
    if (!this.provider)
      throw new EngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "The trusted engineering runtime provider is unavailable.",
      );
    const inspection = await this.provider.inspectRepository({
      repositoryRootPath: locator.rootPath,
    });
    if (inspection.dirty)
      throw new EngineeringRuntimeError(
        "DIRTY_REPOSITORY",
        "The source checkout has uncommitted human changes; no stash, commit, or overwrite was attempted.",
      );
    if (inspection.branch !== repository.defaultBranch)
      throw new EngineeringRuntimeError(
        "GIT_ERROR",
        "Workspace creation requires the registered default branch checkout.",
      );
    const at = this.now().toISOString();
    const id = crypto.randomUUID();
    const workspace = EngineeringWorkspaceSchema.parse({
      schemaVersion: "1",
      id,
      ownerId: context.ownerId,
      companyId: context.companyId,
      repositoryId: repository.id,
      taskId: request.taskId,
      agentId: request.agentId,
      idempotencyKey: request.idempotencyKey,
      branchName: branchName(request.taskId, request.slug, id),
      worktreeLocator: `ew-${id}`,
      baseCommit: inspection.baseCommit,
      headCommit: null,
      state: "CREATING",
      leaseOwner: null,
      leaseExpiresAt: null,
      leaseGeneration: 0,
      createdAt: at,
      updatedAt: at,
      expiresAt: request.expiresAt,
    });
    const authorization = await this.authorizer.authorize({
      ownerId: context.ownerId,
      companyId: context.companyId,
      agentId: context.agentId,
      repositoryId: repository.id,
      workspaceId: id,
      capabilityProfileId: repository.capabilityProfileId,
      capability: "repository.worktree_create",
      protectedPath: false,
    });
    if (!authorization.allowed)
      throw new EngineeringRuntimeError(
        "CAPABILITY_DENIED",
        "Worktree creation was denied by the existing governance boundary.",
      );
    const created = await this.store.createWorkspace(workspace);
    if (created.id !== workspace.id) return created;
    try {
      await this.provider.createWorktree({
        repositoryRootPath: locator.rootPath,
        worktreeLocator: workspace.worktreeLocator,
        branchName: workspace.branchName,
        baseCommit: workspace.baseCommit,
      });
      const ready = EngineeringWorkspaceSchema.parse({
        ...workspace,
        state: "READY",
        updatedAt: this.now().toISOString(),
      });
      await this.store.saveWorkspace(ready);
      await this.writeAudit(
        context,
        "ENGINEERING_WORKSPACE_CREATED",
        "An isolated Git worktree was created from the recorded base commit.",
        {
          repositoryId: repository.id,
          workspaceId: ready.id,
          branchName: ready.branchName,
        },
      );
      return ready;
    } catch (error) {
      await this.store.saveWorkspace(
        EngineeringWorkspaceSchema.parse({
          ...workspace,
          state: "FAILED",
          updatedAt: this.now().toISOString(),
        }),
      );
      throw error;
    }
  }

  search(
    context: RequestContext,
    workspaceId: string,
    body: unknown,
    signal?: AbortSignal,
  ) {
    const request = EngineeringSearchRequestSchema.parse(body);
    return this.execute(
      context,
      workspaceId,
      "repository.search",
      [],
      undefined,
      async (provider, rootPath, workspace, _repository, _approved, leaseSignal) =>
        provider.search({
          repositoryRootPath: rootPath,
          worktreeLocator: workspace.worktreeLocator,
          ...request,
          signal: combineSignals(signal, leaseSignal),
        }),
    );
  }

  readFile(
    context: RequestContext,
    workspaceId: string,
    body: unknown,
    signal?: AbortSignal,
  ) {
    const request = EngineeringFileReadRequestSchema.parse(body);
    return this.execute(
      context,
      workspaceId,
      "repository.file_read",
      [],
      undefined,
      async (provider, rootPath, workspace, _repository, _approved, leaseSignal) =>
        provider.readFile({
          repositoryRootPath: rootPath,
          worktreeLocator: workspace.worktreeLocator,
          path: request.path,
          startLine: request.startLine,
          maxBytes: request.maxBytes,
          ...(request.endLine === undefined ? {} : { endLine: request.endLine }),
          signal: combineSignals(signal, leaseSignal),
        }),
    );
  }

  applyPatch(
    context: RequestContext,
    workspaceId: string,
    body: unknown,
    approvalId?: string,
  ) {
    const patch = EngineeringPatchSchema.parse(body);
    return this.execute(
      context,
      workspaceId,
      "repository.file_patch",
      [patch.path],
      approvalId,
      async (provider, rootPath, workspace, repository, approved) =>
        provider.applyPatch({
          repositoryRootPath: rootPath,
          worktreeLocator: workspace.worktreeLocator,
          patch,
          protectedPaths: repository.protectedPaths,
          protectedPathApproved: approved,
        }),
    );
  }

  createFile(
    context: RequestContext,
    workspaceId: string,
    body: unknown,
    approvalId?: string,
  ) {
    const request = EngineeringFileCreateRequestSchema.parse(body);
    return this.execute(
      context,
      workspaceId,
      "repository.file_create",
      [request.path],
      approvalId,
      async (provider, rootPath, workspace, repository, approved) =>
        provider.createFile({
          repositoryRootPath: rootPath,
          worktreeLocator: workspace.worktreeLocator,
          ...request,
          protectedPaths: repository.protectedPaths,
          protectedPathApproved: approved,
        }),
    );
  }

  deleteFile(context: RequestContext, workspaceId: string, body: unknown) {
    const request = EngineeringFileDeleteRequestSchema.parse(body);
    return this.execute(
      context,
      workspaceId,
      "repository.file_delete",
      [request.path],
      request.approvalId,
      async (provider, rootPath, workspace, repository, approved) =>
        provider.quarantineFile({
          repositoryRootPath: rootPath,
          worktreeLocator: workspace.worktreeLocator,
          path: request.path,
          expectedSha256: request.expectedSha256,
          protectedPaths: repository.protectedPaths,
          protectedPathApproved: approved,
        }),
    );
  }

  gitStatus(context: RequestContext, workspaceId: string) {
    return this.execute(
      context,
      workspaceId,
      "repository.git_status",
      [],
      undefined,
      (provider, rootPath, workspace) =>
        provider.gitStatus({
          repositoryRootPath: rootPath,
          worktreeLocator: workspace.worktreeLocator,
        }),
    );
  }

  gitDiff(context: RequestContext, workspaceId: string, maxBytes = 262_144) {
    return this.execute(
      context,
      workspaceId,
      "repository.git_diff",
      [],
      undefined,
      (provider, rootPath, workspace) =>
        provider.gitDiff({
          repositoryRootPath: rootPath,
          worktreeLocator: workspace.worktreeLocator,
          maxBytes: Math.min(Math.max(maxBytes, 1_024), 524_288),
        }),
    );
  }

  async runCommand(
    context: RequestContext,
    workspaceId: string,
    commandId: string,
    signal?: AbortSignal,
  ) {
    return this.execute(
      context,
      workspaceId,
      "repository.run_command",
      [],
      undefined,
      async (provider, rootPath, workspace, repository, _approved, leaseSignal) => {
        const profile = await this.requireCommandProfile(
          context,
          repository.commandProfileId,
        );
        const command = profile.commands.find((item) => item.id === commandId);
        if (!command)
          throw new EngineeringRuntimeError(
            "COMMAND_NOT_ALLOWED",
            "The command is not registered in this repository's governed profile.",
          );
        return provider.runCommand({
          repositoryRootPath: rootPath,
          worktreeLocator: workspace.worktreeLocator,
          command,
          signal: combineSignals(signal, leaseSignal),
        });
      },
    );
  }

  async validate(context: RequestContext, workspaceId: string, signal?: AbortSignal) {
    const started = Date.now();
    const report = await this.execute(
      context,
      workspaceId,
      "repository.validate",
      [],
      undefined,
      async (provider, rootPath, workspace, repository, _approved, leaseSignal) => {
        const profile = await this.requireCommandProfile(
          context,
          repository.commandProfileId,
        );
        const steps: EngineeringValidationReport["steps"] = [];
        for (const commandId of profile.validationOrder) {
          const command = profile.commands.find((item) => item.id === commandId);
          if (!command) continue;
          const result = await provider.runCommand({
            repositoryRootPath: rootPath,
            worktreeLocator: workspace.worktreeLocator,
            command,
            signal: combineSignals(signal, leaseSignal),
          });
          const status = result.cancelled
            ? "ERROR"
            : result.exitCode === 0 && !result.timedOut
              ? "PASS"
              : "FAIL";
          steps.push({
            commandId,
            kind: command.kind,
            status,
            result,
            failures: this.parseFailures(result),
          });
          if (status !== "PASS") break;
        }
        return EngineeringValidationReportSchema.parse({
          id: crypto.randomUUID(),
          workspaceId: workspace.id,
          status: signal?.aborted
            ? "CANCELLED"
            : steps.every((step) => step.status === "PASS")
              ? "PASS"
              : "FAIL",
          steps,
          durationMs: Date.now() - started,
          createdAt: this.now().toISOString(),
        });
      },
    );
    await this.store.saveValidation(report, context.ownerId, context.companyId);
    return report;
  }

  async reconcile(context: RequestContext) {
    if (!this.provider)
      throw new EngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "The trusted engineering runtime provider is unavailable.",
      );
    const workspaces = await this.store.listWorkspaces(
      context.ownerId,
      context.companyId,
    );
    const reconciled: EngineeringWorkspace[] = [];
    for (const workspace of workspaces) {
      if (workspace.state === "ARCHIVED") continue;
      const repository = await this.requireRepository(context, workspace.repositoryId);
      const locator = await this.requireLocator(
        context,
        repository.workspaceLocatorId,
        false,
      );
      const actual = await this.provider.inspectWorktree({
        repositoryRootPath: locator.rootPath,
        worktreeLocator: workspace.worktreeLocator,
      });
      const state = !actual.exists
        ? "FAILED"
        : actual.dirty
          ? "DIRTY"
          : workspace.state === "CREATING"
            ? "READY"
            : workspace.state;
      const updated = EngineeringWorkspaceSchema.parse({
        ...workspace,
        state,
        headCommit: actual.headCommit,
        updatedAt: this.now().toISOString(),
      });
      await this.store.saveWorkspace(updated);
      reconciled.push(updated);
    }
    await this.writeAudit(
      context,
      "ENGINEERING_WORKSPACE_RECONCILED",
      "Durable engineering workspace records were reconciled with provider state.",
      { workspaceCount: reconciled.length },
    );
    return reconciled;
  }

  async archiveWorkspace(context: RequestContext, workspaceId: string) {
    const workspace = await this.requireWorkspace(context, workspaceId);
    const repository = await this.requireRepository(context, workspace.repositoryId);
    this.assertAgent(repository.authorizedAgentIds, context.agentId);
    const authorization = await this.authorizer.authorize({
      ownerId: context.ownerId,
      companyId: context.companyId,
      agentId: context.agentId,
      repositoryId: repository.id,
      workspaceId,
      capabilityProfileId: repository.capabilityProfileId,
      capability: "repository.worktree_remove",
      protectedPath: false,
    });
    if (!authorization.allowed)
      throw new EngineeringRuntimeError(
        "CAPABILITY_DENIED",
        "Worktree archival was denied by the existing governance boundary.",
      );
    const locator = await this.requireLocator(
      context,
      repository.workspaceLocatorId,
      true,
    );
    if (!this.provider)
      throw new EngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "The trusted engineering runtime provider is unavailable.",
      );
    const state = await this.provider.inspectWorktree({
      repositoryRootPath: locator.rootPath,
      worktreeLocator: workspace.worktreeLocator,
    });
    if (state.dirty)
      throw new EngineeringRuntimeError(
        "WORKTREE_ERROR",
        "Dirty workspaces are preserved for inspection and cannot be archived automatically.",
      );
    await this.provider.removeWorktree({
      repositoryRootPath: locator.rootPath,
      worktreeLocator: workspace.worktreeLocator,
    });
    const archived = EngineeringWorkspaceSchema.parse({
      ...workspace,
      state: "ARCHIVED",
      updatedAt: this.now().toISOString(),
    });
    await this.store.saveWorkspace(archived);
    await this.writeAudit(
      context,
      "ENGINEERING_WORKSPACE_ARCHIVED",
      "A clean isolated worktree was removed and its durable record archived.",
      { repositoryId: repository.id, workspaceId },
    );
    return archived;
  }

  private async execute<T>(
    context: RequestContext,
    workspaceId: string,
    capability: EngineeringCapability,
    filesTouched: string[],
    approvalId: string | undefined,
    operation: (
      provider: EngineeringRuntimeProvider,
      rootPath: string,
      workspace: EngineeringWorkspace,
      repository: Awaited<ReturnType<EngineeringRuntimeService["requireRepository"]>>,
      protectedApproved: boolean,
      leaseSignal: AbortSignal,
    ) => Promise<T>,
  ): Promise<T> {
    const workspace = await this.requireWorkspace(context, workspaceId);
    const repository = await this.requireRepository(context, workspace.repositoryId);
    this.assertAgent(repository.authorizedAgentIds, context.agentId);
    if (!["READY", "DIRTY"].includes(workspace.state))
      throw new EngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "The workspace is not ready for engineering capabilities.",
      );
    const touchesProtected = filesTouched.some((path) =>
      protectedPath(path, repository.protectedPaths),
    );
    const authorization = await this.authorizer.authorize({
      ownerId: context.ownerId,
      companyId: context.companyId,
      agentId: context.agentId,
      repositoryId: repository.id,
      workspaceId,
      capabilityProfileId: repository.capabilityProfileId,
      capability,
      protectedPath: touchesProtected,
      ...(approvalId ? { approvalId } : {}),
    });
    if (
      !authorization.allowed ||
      (touchesProtected && !authorization.protectedPathApproved)
    ) {
      await this.writeAudit(
        context,
        "ENGINEERING_CAPABILITY_DENIED",
        "Engineering capability denied by the existing governance boundary.",
        { repositoryId: repository.id, workspaceId, capability },
        "DENIED",
      );
      throw new EngineeringRuntimeError(
        touchesProtected ? "PROTECTED_PATH" : "CAPABILITY_DENIED",
        "The engineering capability was denied.",
      );
    }
    if (!this.provider)
      throw new EngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "The trusted engineering runtime provider is unavailable.",
      );
    const locator = await this.requireLocator(
      context,
      repository.workspaceLocatorId,
      capability !== "repository.file_read" &&
        capability !== "repository.search" &&
        capability !== "repository.git_status" &&
        capability !== "repository.git_diff",
    );
    const at = this.now();
    const execution = EngineeringExecutionRecordSchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      repositoryId: repository.id,
      workspaceId,
      taskId: workspace.taskId,
      agentId: context.agentId,
      capability,
      modelProvider: context.model?.provider ?? null,
      modelId: context.model?.modelId ?? null,
      aiRequestId: context.model?.aiRequestId ?? null,
      inputTokens: context.model?.inputTokens ?? null,
      outputTokens: context.model?.outputTokens ?? null,
      costMinor: context.model?.costMinor ?? null,
      status: "RUNNING",
      filesTouched,
      commandIds: [],
      validationAttempt: capability === "repository.validate" ? 1 : 0,
      startedAt: at.toISOString(),
      completedAt: null,
      durationMs: null,
      failureCode: null,
    });
    const lease = await this.store.acquireWorkspaceLease({
      ownerId: context.ownerId,
      companyId: context.companyId,
      workspaceId,
      workerId: context.workerId,
      now: at.toISOString(),
      expiresAt: new Date(at.getTime() + this.leaseMs).toISOString(),
    });
    if (!lease)
      throw new EngineeringRuntimeError(
        "WORKSPACE_BUSY",
        "Another worker owns the workspace lease.",
      );
    await this.store.saveExecution(execution);
    const leaseAbort = new AbortController();
    let leaseLost = false;
    let renewalPromise: Promise<void> | null = null;
    const renewLease = () => {
      if (leaseLost) return Promise.resolve();
      if (renewalPromise) return renewalPromise;
      renewalPromise = (async () => {
        try {
          const renewedAt = this.now();
          const renewed = await this.store.renewWorkspaceLease({
            ownerId: context.ownerId,
            companyId: context.companyId,
            workspaceId,
            workerId: context.workerId,
            generation: lease.leaseGeneration,
            now: renewedAt.toISOString(),
            expiresAt: new Date(renewedAt.getTime() + this.leaseMs).toISOString(),
          });
          if (renewed) return;
          leaseLost = true;
          leaseAbort.abort();
        } catch {
          leaseLost = true;
          leaseAbort.abort();
        } finally {
          renewalPromise = null;
        }
      })();
      return renewalPromise;
    };
    const renewalTimer = setInterval(
      () => void renewLease(),
      Math.max(250, Math.floor(this.leaseMs / 3)),
    );
    renewalTimer.unref();
    try {
      const result = await operation(
        this.provider,
        locator.rootPath,
        lease,
        repository,
        touchesProtected && authorization.protectedPathApproved,
        leaseAbort.signal,
      );
      await renewLease();
      if (leaseLost)
        throw new EngineeringRuntimeError(
          "WORKSPACE_BUSY",
          "The workspace lease was lost before capability completion.",
        );
      const completed = this.now();
      await this.store.saveExecution(
        EngineeringExecutionRecordSchema.parse({
          ...execution,
          status: "SUCCEEDED",
          completedAt: completed.toISOString(),
          durationMs: completed.getTime() - at.getTime(),
        }),
      );
      await this.writeAudit(
        context,
        capability === "repository.file_patch"
          ? "ENGINEERING_FILE_PATCHED"
          : capability === "repository.file_create"
            ? "ENGINEERING_FILE_CREATED"
            : capability === "repository.file_delete"
              ? "ENGINEERING_FILE_DELETE_QUARANTINED"
              : capability === "repository.run_command"
                ? "ENGINEERING_COMMAND_RUN"
                : capability === "repository.validate"
                  ? "ENGINEERING_VALIDATION_RUN"
                  : "ENGINEERING_CAPABILITY_INVOKED",
        "A finite governed engineering capability completed.",
        {
          repositoryId: repository.id,
          workspaceId,
          capability,
          durationMs: completed.getTime() - at.getTime(),
        },
      );
      return result;
    } catch (error) {
      const completed = this.now();
      const parsedFailure = EngineeringErrorCodeSchema.safeParse(
        leaseLost
          ? "WORKSPACE_BUSY"
          : typeof error === "object" && error !== null && "code" in error
            ? error.code
            : undefined,
      );
      const failureCode = parsedFailure.success
        ? parsedFailure.data
        : "INCONSISTENT_STATE";
      await this.store.saveExecution(
        EngineeringExecutionRecordSchema.parse({
          ...execution,
          status: failureCode === "CANCELLED" ? "CANCELLED" : "FAILED",
          completedAt: completed.toISOString(),
          durationMs: completed.getTime() - at.getTime(),
          failureCode,
        }),
      );
      await this.writeAudit(
        context,
        "ENGINEERING_CAPABILITY_INVOKED",
        `A finite engineering capability failed closed with ${failureCode}.`,
        {
          repositoryId: repository.id,
          workspaceId,
          capability,
          durationMs: completed.getTime() - at.getTime(),
          failureCode,
        },
        "FAILURE",
      );
      if (leaseLost)
        throw new EngineeringRuntimeError(
          "WORKSPACE_BUSY",
          "The workspace lease was lost and the active capability was cancelled.",
        );
      throw error;
    } finally {
      clearInterval(renewalTimer);
      await this.store.releaseWorkspaceLease({
        ownerId: context.ownerId,
        companyId: context.companyId,
        workspaceId,
        workerId: context.workerId,
        generation: lease.leaseGeneration,
        now: this.now().toISOString(),
      });
    }
  }

  private async requireRepository(
    context: Pick<RequestContext, "ownerId" | "companyId">,
    id: string,
  ) {
    const repository = await this.store.findRepository(
      context.ownerId,
      context.companyId,
      id,
    );
    if (!repository || repository.status !== "ACTIVE")
      throw new EngineeringRuntimeError(
        "REPOSITORY_NOT_FOUND",
        "The company-scoped engineering repository was not found.",
      );
    return repository;
  }

  private async resumeWorkspaceCreation(
    context: RequestContext,
    workspace: EngineeringWorkspace,
  ) {
    if (workspace.state !== "CREATING") return workspace;
    const repository = await this.requireRepository(context, workspace.repositoryId);
    this.assertAgent(repository.authorizedAgentIds, context.agentId);
    const locator = await this.requireLocator(
      context,
      repository.workspaceLocatorId,
      true,
    );
    if (!this.provider)
      throw new EngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "The trusted engineering runtime provider is unavailable.",
      );
    const actual = await this.provider.inspectWorktree({
      repositoryRootPath: locator.rootPath,
      worktreeLocator: workspace.worktreeLocator,
    });
    if (
      actual.exists &&
      (actual.branch !== workspace.branchName ||
        actual.baseCommit !== workspace.baseCommit)
    )
      throw new EngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "The existing worktree does not match the durable branch and base commit.",
      );
    if (!actual.exists)
      await this.provider.createWorktree({
        repositoryRootPath: locator.rootPath,
        worktreeLocator: workspace.worktreeLocator,
        branchName: workspace.branchName,
        baseCommit: workspace.baseCommit,
      });
    const ready = EngineeringWorkspaceSchema.parse({
      ...workspace,
      state: "READY",
      headCommit: actual.headCommit ?? workspace.baseCommit,
      updatedAt: this.now().toISOString(),
    });
    await this.store.saveWorkspace(ready);
    return ready;
  }

  private async requireWorkspace(
    context: Pick<RequestContext, "ownerId" | "companyId">,
    id: string,
  ) {
    const workspace = await this.store.findWorkspace(
      context.ownerId,
      context.companyId,
      id,
    );
    if (!workspace)
      throw new EngineeringRuntimeError(
        "WORKSPACE_NOT_FOUND",
        "The company-scoped engineering workspace was not found.",
      );
    return workspace;
  }

  private async requireCommandProfile(
    context: Pick<RequestContext, "ownerId" | "companyId">,
    id: string,
  ) {
    const profile = await this.store.findCommandProfile(
      context.ownerId,
      context.companyId,
      id,
    );
    if (!profile || profile.status !== "ACTIVE")
      throw new EngineeringRuntimeError(
        "COMMAND_NOT_ALLOWED",
        "The governed command profile is unavailable.",
      );
    return profile;
  }

  private async requireLocator(
    context: Pick<RequestContext, "ownerId" | "companyId">,
    id: string,
    write: boolean,
  ) {
    const locator = await this.locatorResolver.resolve(
      context.ownerId,
      context.companyId,
      id,
    );
    if (!locator?.enabled || !locator.read || (write && !locator.write))
      throw new EngineeringRuntimeError(
        "REPOSITORY_NOT_AUTHORIZED",
        "The repository workspace locator is not authorized for this operation.",
      );
    return locator;
  }

  private assertAgent(authorized: string[], agentId: string | null) {
    if (agentId && !authorized.includes(agentId))
      throw new EngineeringRuntimeError(
        "REPOSITORY_NOT_AUTHORIZED",
        "The agent is not assigned to this repository.",
      );
  }

  private parseFailures(result: EngineeringCommandResult) {
    const lines = `${result.stderr}\n${result.stdout}`.split("\n").filter(Boolean);
    const parsed = lines.flatMap((line) => {
      const match =
        /(?:^|\s)([^\s:]+\.(?:ts|tsx|js|jsx|py|kt|java))(?::(\d+))?[:\s-]+(.+)/.exec(
          line,
        );
      return match
        ? [
            {
              file: match[1] ?? null,
              testName: null,
              message: (match[3] ?? line).slice(0, 1_000),
            },
          ]
        : [];
    });
    return parsed.length
      ? parsed.slice(0, 50)
      : lines.slice(0, 5).map((line) => ({
          file: null,
          testName: null,
          message: line.slice(0, 1_000),
        }));
  }

  private writeAudit(
    context: Pick<RequestContext, "ownerId" | "companyId" | "requestId" | "ipAddress">,
    eventType: Parameters<GovernanceAuditWriter>[0]["eventType"],
    reason: string,
    metadata: Record<string, string | number | boolean | null>,
    outcome: "SUCCESS" | "FAILURE" | "DENIED" = "SUCCESS",
  ) {
    return this.audit({
      eventType,
      ownerId: context.ownerId,
      companyId: context.companyId,
      outcome,
      reason,
      metadata,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
    });
  }
}

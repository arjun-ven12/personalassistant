import {
  EngineeringCommandResultSchema,
  EngineeringCommandDefinitionSchema,
  EngineeringDependencyOperationResultSchema,
  EngineeringTransportRequestSchema,
  EngineeringTransportResultSchema,
  EngineeringValidationReportSchema,
  EngineeringWorktreeInspectionSchema,
  EngineeringWorkspaceSchema,
  type EngineeringCapability,
  type EngineeringTransportRequest,
  type EngineeringTransportResult,
  type NetworkVerificationState,
} from "@alexa-control/shared";

import type { ExecutionService } from "../execution/service.js";
import type { ExecutionStore } from "../execution/store.js";
import type { EngineeringRuntimeStore } from "../engineering-runtime/store.js";
import type { GovernedEngineeringActionGateway } from "./ai-worker.js";
import type { EngineeringWorkspaceGateway } from "./service.js";

type Transport = {
  sessionId: string;
  requestId: string;
  ipAddress: string;
  networkState: NetworkVerificationState;
  deviceId?: string;
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "task";

/** Enqueues every operation on the existing server-signed Mac-agent channel. */
export class SignedExecutionEngineeringGateway
  implements GovernedEngineeringActionGateway, EngineeringWorkspaceGateway
{
  constructor(
    readonly executions: ExecutionService,
    readonly executionStore: ExecutionStore,
    readonly runtimeStore: EngineeringRuntimeStore,
    readonly now: () => Date = () => new Date(),
    readonly waitTimeoutMs = 120_000,
  ) {}

  prepare(input: Parameters<EngineeringWorkspaceGateway["prepare"]>[0]) {
    return this.prepareDependencies(input);
  }

  async initializeProject(input: {
    ownerId: string;
    companyId: string;
    repositoryId: string;
    agentId: string;
    template: "REACT_VITE_TYPESCRIPT" | "EMPTY_TYPESCRIPT";
    projectSlug: string;
    defaultBranch: string;
    transport: Transport;
  }) {
    const repository = await this.repository(
      input.ownerId,
      input.companyId,
      input.repositoryId,
      true,
    );
    if (
      repository.status !== "INITIALIZING" ||
      !repository.authorizedAgentIds.includes(input.agentId)
    )
      throw Object.assign(new Error("Project initialization scope is unavailable."), {
        code: "REPOSITORY_NOT_AUTHORIZED",
      });
    const approvedRequest = await this.executions.findApprovedProjectInitialization({
      ownerId: input.ownerId,
      companyId: input.companyId,
      repositoryId: input.repositoryId,
      workspaceLocatorId: repository.workspaceLocatorId,
      agentId: input.agentId,
      template: input.template,
      projectSlug: input.projectSlug,
      defaultBranch: input.defaultBranch,
    });
    if (approvedRequest)
      return this.enqueueAndWait({
        ownerId: input.ownerId,
        transport: input.transport,
        signal: new AbortController().signal,
        request: approvedRequest,
      });
    return this.dispatch({
      ownerId: input.ownerId,
      companyId: input.companyId,
      repositoryId: input.repositoryId,
      workspaceId: null,
      taskId: repository.id,
      agentId: input.agentId,
      capability: "repository.initialize_project",
      operationInput: {
        template: input.template,
        projectSlug: input.projectSlug,
        defaultBranch: input.defaultBranch,
      },
      signal: new AbortController().signal,
      transport: input.transport,
    });
  }

  async create(input: {
    ownerId: string;
    companyId: string;
    repositoryId: string;
    taskId: string;
    agentId: string;
    idempotencyKey: string;
    slug: string;
    transport: Transport;
  }) {
    const existing = await this.runtimeStore.findWorkspaceByIdempotencyKey(
      input.ownerId,
      input.companyId,
      input.repositoryId,
      input.idempotencyKey,
    );
    if (existing) {
      if (existing.state !== "CREATING" && existing.state !== "READY")
        throw Object.assign(new Error("The existing engineering workspace is not ready for reuse."), { code: "WORKSPACE_NOT_READY" });
      if (existing.agentId !== input.agentId || existing.taskId !== input.taskId)
        throw Object.assign(new Error("The existing worktree belongs to another task or agent."), { code: "REPOSITORY_NOT_AUTHORIZED" });
      if (existing.state === "CREATING") {
        const inspection = EngineeringWorktreeInspectionSchema.parse((await this.dispatch({
          ownerId: input.ownerId, companyId: input.companyId,
          repositoryId: input.repositoryId, workspaceId: existing.id,
          taskId: input.taskId, agentId: input.agentId,
          capability: "repository.worktree_inspect", operationInput: {},
          signal: new AbortController().signal, transport: input.transport,
        })).output);
        if (inspection.exists) {
          if (inspection.baseCommit !== existing.baseCommit || inspection.branch !== existing.branchName)
            throw Object.assign(new Error("The saved worktree no longer matches its registered base and branch."), { code: "INCONSISTENT_STATE" });
        } else {
          await this.dispatch({
            ownerId: input.ownerId, companyId: input.companyId,
            repositoryId: input.repositoryId, workspaceId: existing.id,
            taskId: input.taskId, agentId: input.agentId,
            capability: "repository.worktree_create",
            operationInput: { branchName: existing.branchName, baseCommit: existing.baseCommit },
            signal: new AbortController().signal, transport: input.transport,
          });
        }
      }
      await this.prepareDependencies({ ...input, workspaceId: existing.id, signal: new AbortController().signal });
      const prepared = await this.runtimeStore.findWorkspace(input.ownerId, input.companyId, existing.id);
      if (!prepared?.dependenciesPreparedAt)
        throw Object.assign(new Error("Dependency preparation did not persist."), { code: "INCONSISTENT_STATE" });
      await this.runtimeStore.saveWorkspace(EngineeringWorkspaceSchema.parse({
        ...prepared, state: "READY", updatedAt: this.now().toISOString(),
      }));
      return { id: existing.id, baseCommit: existing.baseCommit };
    }
    const repository = await this.repository(
      input.ownerId,
      input.companyId,
      input.repositoryId,
    );
    if (!repository.authorizedAgentIds.includes(input.agentId))
      throw Object.assign(new Error("Agent assignment is outside repository scope."), {
        code: "REPOSITORY_NOT_AUTHORIZED",
      });
    const inspection = await this.dispatch({
      ownerId: input.ownerId,
      companyId: input.companyId,
      repositoryId: input.repositoryId,
      workspaceId: null,
      taskId: input.taskId,
      agentId: input.agentId,
      capability: "repository.inspect",
      operationInput: {},
      signal: new AbortController().signal,
      transport: input.transport,
    });
    const output = inspection.output as {
      baseCommit?: string;
      branch?: string;
      dirty?: boolean;
    };
    if (
      !output.baseCommit ||
      output.branch !== repository.defaultBranch ||
      output.dirty
    )
      throw Object.assign(
        new Error(
          "Repository inspection did not yield a clean registered base commit.",
        ),
        { code: "DIRTY_REPOSITORY" },
      );
    const id = crypto.randomUUID();
    const branchName =
      `alexa/${input.taskId.replaceAll("-", "").slice(0, 12)}-${id.replaceAll("-", "").slice(-6)}-${slug(input.slug)}`.slice(
        0,
        126,
      );
    const at = this.now().toISOString();
    const workspace = EngineeringWorkspaceSchema.parse({
      schemaVersion: "1",
      id,
      ownerId: input.ownerId,
      companyId: input.companyId,
      repositoryId: repository.id,
      taskId: input.taskId,
      agentId: input.agentId,
      idempotencyKey: input.idempotencyKey,
      branchName,
      worktreeLocator: `ew-${id}`,
      baseCommit: output.baseCommit,
      headCommit: null,
      state: "CREATING",
      leaseOwner: null,
      leaseExpiresAt: null,
      leaseGeneration: 0,
      createdAt: at,
      updatedAt: at,
      expiresAt: null,
    });
    const stored = await this.runtimeStore.createWorkspace(workspace);
    if (stored.id !== workspace.id)
      throw Object.assign(new Error("The existing worktree must be recovered through its saved identity."), { code: "INCONSISTENT_STATE" });
    await this.dispatch({
      ownerId: input.ownerId,
      companyId: input.companyId,
      repositoryId: input.repositoryId,
      workspaceId: stored.id,
      taskId: input.taskId,
      agentId: input.agentId,
      capability: "repository.worktree_create",
      operationInput: { branchName: stored.branchName, baseCommit: stored.baseCommit },
      signal: new AbortController().signal,
      transport: input.transport,
    });
    await this.prepareDependencies({ ...input, workspaceId: stored.id, signal: new AbortController().signal });
    const prepared = await this.runtimeStore.findWorkspace(input.ownerId, input.companyId, stored.id);
    if (!prepared?.dependenciesPreparedAt)
      throw Object.assign(new Error("Dependency preparation did not persist."), { code: "INCONSISTENT_STATE" });
    await this.runtimeStore.saveWorkspace(
      EngineeringWorkspaceSchema.parse({
        ...prepared,
        state: "READY",
        updatedAt: this.now().toISOString(),
      }),
    );
    return { id: stored.id, baseCommit: stored.baseCommit };
  }

  async invoke(input: {
    ownerId: string;
    companyId: string;
    repositoryId: string;
    workspaceId: string | null;
    taskId: string;
    agentId: string;
    capability: EngineeringCapability;
    operationInput: Record<string, unknown>;
    signal: AbortSignal;
    transport: Transport;
  }) {
    if (input.capability === "repository.validate") return this.validate(input);
    const result = await this.dispatch(input);
    const output = result.output as Record<string, unknown>;
    if (input.workspaceId &&
      (["repository.file_create", "repository.file_patch"].includes(input.capability) &&
        typeof output.path === "string" &&
        ["package.json", "pnpm-lock.yaml", "package-lock.json"].includes(output.path))) {
      const workspace = await this.runtimeStore.findWorkspace(input.ownerId, input.companyId, input.workspaceId);
      if (workspace)
        await this.runtimeStore.saveWorkspace(EngineeringWorkspaceSchema.parse({
          ...workspace, dependenciesPreparedAt: null, updatedAt: this.now().toISOString(),
        }));
    }
    const revertedFiles = input.capability === "repository.revert_commit" && Array.isArray(output.entries)
      ? output.entries.flatMap((entry: unknown) => {
          if (!entry || typeof entry !== "object" || !("path" in entry)) return [];
          const path = (entry as { path?: unknown }).path;
          return typeof path === "string" ? [path] : [];
        })
      : [];
    return {
      output,
      ...(input.capability === "repository.git_diff"
        ? {
            diffSummary: typeof output.patch === "string" ? output.patch : "",
          }
        : {}),
      ...(["repository.file_create", "repository.file_patch"].includes(
        input.capability,
      ) && typeof output.path === "string"
        ? { filesChanged: [output.path] }
        : {}),
      ...(input.capability === "repository.revert_commit"
        ? { filesChanged: revertedFiles }
        : {}),
    };
  }

  async cancelExecutions(input: {
    ownerId: string;
    workspaceId: string;
    reason: string;
  }) {
    const requests = await this.executionStore.list(input.ownerId, 500);
    for (const request of requests) {
      const args = request.arguments as { engineeringWorkspaceId?: unknown };
      if (
        args.engineeringWorkspaceId === input.workspaceId &&
        ["PENDING", "CLAIMED", "RUNNING"].includes(request.status)
      )
        await this.executionStore.cancel(
          request.id,
          input.ownerId,
          this.now().toISOString(),
        );
    }
    void input.reason;
  }

  private async validate(
    input: Parameters<SignedExecutionEngineeringGateway["invoke"]>[0],
  ) {
    if (!input.workspaceId)
      throw Object.assign(new Error("Validation requires an engineering workspace."), {
        code: "WORKSPACE_NOT_FOUND",
      });
    const startedAt = this.now().getTime();
    const repository = await this.repository(
      input.ownerId,
      input.companyId,
      input.repositoryId,
    );
    const profile = await this.runtimeStore.findCommandProfile(
      input.ownerId,
      input.companyId,
      repository.commandProfileId,
    );
    if (!profile || profile.status !== "ACTIVE")
      return { output: {}, validationStatus: "NOT_CONFIGURED" as const };
    await this.prepareDependencies({ ...input, workspaceId: input.workspaceId });
    const steps: Array<{
      commandId: string;
      kind: "LINT" | "TYPECHECK" | "TEST" | "BUILD" | "OTHER";
      status: "PASS" | "FAIL";
      result: ReturnType<typeof EngineeringCommandResultSchema.parse>;
      failures: Array<{ file: null; testName: null; message: string }>;
    }> = [];
    for (const commandId of profile.validationOrder) {
      const command = profile.commands.find((value) => value.id === commandId);
      if (!command) continue;
      const result = await this.dispatch({
        ...input,
        capability: "repository.run_command",
        operationInput: { commandId: command.id },
      });
      const output = EngineeringCommandResultSchema.parse(result.output);
      const passed = output.exitCode === 0 && !output.timedOut && !output.cancelled;
      steps.push({
        commandId: command.id,
        kind: command.kind,
        status: passed ? "PASS" : "FAIL",
        result: output,
        failures: passed
          ? []
          : `${output.stderr}\n${output.stdout}`
              .split("\n")
              .filter(Boolean)
              .slice(0, 5)
              .map((message) => ({
                file: null,
                testName: null,
                message: message.slice(0, 1_000),
              })),
      });
      if (!passed) {
        const report = EngineeringValidationReportSchema.parse({
          id: crypto.randomUUID(),
          workspaceId: input.workspaceId,
          status: output.cancelled ? "CANCELLED" : "FAIL",
          steps,
          durationMs: Math.max(0, this.now().getTime() - startedAt),
          createdAt: this.now().toISOString(),
        });
        await this.runtimeStore.saveValidation(report, input.ownerId, input.companyId);
        return {
          output,
          validationStatus: "FAIL" as const,
          validationReportId: report.id,
        };
      }
    }
    const report = EngineeringValidationReportSchema.parse({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      status: "PASS",
      steps,
      durationMs: Math.max(0, this.now().getTime() - startedAt),
      createdAt: this.now().toISOString(),
    });
    await this.runtimeStore.saveValidation(report, input.ownerId, input.companyId);
    return {
      output: {},
      validationStatus: "PASS" as const,
      validationReportId: report.id,
    };
  }

  private async prepareDependencies(input: {
    ownerId: string;
    companyId: string;
    repositoryId: string;
    workspaceId: string;
    taskId: string;
    agentId: string;
    signal: AbortSignal;
    transport: Transport;
  }) {
    const workspace = await this.runtimeStore.findWorkspace(input.ownerId, input.companyId, input.workspaceId);
    if (!workspace || workspace.repositoryId !== input.repositoryId || workspace.taskId !== input.taskId || workspace.agentId !== input.agentId)
      throw Object.assign(new Error("Dependency preparation workspace scope is invalid."), { code: "WORKSPACE_NOT_FOUND" });
    const repository = await this.repository(input.ownerId, input.companyId, input.repositoryId);
    const profile = await this.runtimeStore.findCommandProfile(input.ownerId, input.companyId, repository.commandProfileId);
    if (!profile || profile.status !== "ACTIVE")
      throw Object.assign(new Error("An active registered command profile is required for dependency preparation."), { code: "COMMAND_NOT_ALLOWED" });
    if (workspace.dependenciesPreparedAt && workspace.dependenciesPreparedAt >= profile.updatedAt) return;
    if (profile.dependencyManager) {
      const result = EngineeringDependencyOperationResultSchema.parse((await this.dispatch({
        ...input,
        capability: "repository.install_dependencies",
        operationInput: { packageManager: profile.dependencyManager },
      })).output);
      if (result.exitCode !== 0 || result.timedOut || result.lockfileChanged)
        throw Object.assign(new Error("Governed dependency preparation failed. Check the package lockfile and reviewed dependency container before retrying."), { code: "DEPENDENCY_INSTALL_FAILED" });
    } else if (repository.metadata.packageManagers.length > 0) {
      throw Object.assign(new Error("Register a supported dependency manager before running offline project validation."), { code: "COMMAND_NOT_ALLOWED" });
    }
    await this.runtimeStore.saveWorkspace(EngineeringWorkspaceSchema.parse({
      ...workspace, dependenciesPreparedAt: this.now().toISOString(), updatedAt: this.now().toISOString(),
    }));
  }

  private async dispatch(input: {
    ownerId: string;
    companyId: string;
    repositoryId: string;
    workspaceId: string | null;
    taskId: string;
    agentId: string;
    capability: EngineeringCapability;
    operationInput: Record<string, unknown>;
    signal: AbortSignal;
    transport: Transport;
  }): Promise<EngineeringTransportResult> {
    const repository = await this.repository(
      input.ownerId,
      input.companyId,
      input.repositoryId,
      input.capability === "repository.initialize_project",
    );
    if (!repository.authorizedAgentIds.includes(input.agentId))
      throw Object.assign(new Error("Agent assignment is outside repository scope."), {
        code: "REPOSITORY_NOT_AUTHORIZED",
      });
    const workspace = input.workspaceId
      ? await this.runtimeStore.findWorkspace(
          input.ownerId,
          input.companyId,
          input.workspaceId,
        )
      : undefined;
    if (input.workspaceId && !workspace)
      throw Object.assign(new Error("Engineering workspace was not found."), {
        code: "WORKSPACE_NOT_FOUND",
      });
    const operationId = crypto.randomUUID();
    let operationInput: Record<string, unknown> = input.operationInput;
    if (input.capability === "repository.run_command") {
      const profile = await this.runtimeStore.findCommandProfile(
        input.ownerId,
        input.companyId,
        repository.commandProfileId,
      );
      const commandId =
        typeof input.operationInput.commandId === "string"
          ? input.operationInput.commandId
          : "";
      const command = profile?.commands.find((value) => value.id === commandId);
      if (!command)
        throw Object.assign(new Error("Registered command not found."), {
          code: "COMMAND_NOT_ALLOWED",
        });
      operationInput = { command: EngineeringCommandDefinitionSchema.parse(command) };
    }
    if (
      input.capability === "repository.install_dependencies" ||
      input.capability === "repository.add_dependency" ||
      input.capability === "repository.remove_dependency"
    ) {
      const profile = await this.runtimeStore.findCommandProfile(
        input.ownerId,
        input.companyId,
        repository.commandProfileId,
      );
      if (!profile?.dependencyManager)
        throw Object.assign(new Error("A registered dependency manager is required."), {
          code: "COMMAND_NOT_ALLOWED",
        });
      operationInput = {
        ...input.operationInput,
        packageManager: profile.dependencyManager,
      };
    }
    if (
      input.capability === "repository.dev_server_start" ||
      input.capability === "repository.dev_server_restart"
    ) {
      const profile = await this.runtimeStore.findCommandProfile(
        input.ownerId,
        input.companyId,
        repository.commandProfileId,
      );
      const serverId =
        typeof input.operationInput.serverId === "string"
          ? input.operationInput.serverId
          : "";
      const server = profile?.developmentServers.find((value) => value.id === serverId);
      if (!server)
        throw Object.assign(new Error("Registered development server not found."), {
          code: "COMMAND_NOT_ALLOWED",
        });
      operationInput = {
        previewId: input.operationInput.previewId,
        server,
        preferredPort:
          typeof input.operationInput.preferredPort === "number"
            ? input.operationInput.preferredPort
            : null,
        portRangeStart: 4173,
        portRangeEnd: 4273,
      };
    }
    if (input.capability === "repository.prepare_commit") {
      if (
        !workspace ||
        workspace.idempotencyKey.startsWith("integration-") ||
        workspace.taskId !== input.taskId ||
        workspace.agentId !== input.agentId
      )
        throw Object.assign(new Error("Task commit workspace binding failed."), {
          code: "WORKSPACE_NOT_FOUND",
        });
      operationInput = {
        taskId: input.taskId,
        agentId: input.agentId,
        baseCommit: workspace.baseCommit,
      };
    }
    if (input.capability === "repository.integration_diff") {
      if (!workspace || !workspace.idempotencyKey.startsWith("integration-"))
        throw Object.assign(
          new Error("Integration diff requires a dedicated workspace."),
          { code: "WORKSPACE_NOT_FOUND" },
        );
      operationInput = { baseCommit: workspace.baseCommit, maxBytes: 131_072 };
    }
    if (
      input.capability === "repository.integrate_commit" ||
      input.capability === "repository.resolve_additive_docs_conflict"
    ) {
      const sourceWorkspaceId = input.operationInput.sourceWorkspaceId;
      const source =
        typeof sourceWorkspaceId === "string"
          ? await this.runtimeStore.findWorkspace(
              input.ownerId,
              input.companyId,
              sourceWorkspaceId,
            )
          : undefined;
      if (
        !workspace ||
        !workspace.idempotencyKey.startsWith("integration-") ||
        !source ||
        !source.taskId ||
        source.taskId === workspace.taskId ||
        source.idempotencyKey.startsWith("integration-") ||
        source.repositoryId !== repository.id ||
        source.baseCommit !== workspace.baseCommit ||
        !source.agentId ||
        !repository.authorizedAgentIds.includes(source.agentId) ||
        source.id === workspace.id ||
        (source.state !== "READY" &&
          source.state !== "DIRTY" &&
          source.state !== "COMPLETED")
      )
        throw Object.assign(new Error("Source task workspace binding failed."), {
          code: "WORKSPACE_NOT_FOUND",
        });
      operationInput = {
        commit: input.operationInput.commit,
        sourceWorkspaceId: source.id,
        sourceWorktreeLocator: source.worktreeLocator,
        ...(input.capability === "repository.resolve_additive_docs_conflict"
          ? {
              path: input.operationInput.path,
              expectedHead: input.operationInput.expectedHead,
            }
          : {}),
      };
    }
    if (
      [
        "repository.file_patch",
        "repository.file_create",
        "repository.file_delete",
      ].includes(input.capability)
    )
      operationInput = {
        ...(input.capability === "repository.file_patch"
          ? { patch: input.operationInput.patch }
          : input.operationInput),
        protectedPaths: repository.protectedPaths,
        protectedPathApproved: false,
      };
    const requestId = crypto.randomUUID();
    const request = EngineeringTransportRequestSchema.parse({
      schemaVersion: "1",
      companyId: input.companyId,
      repositoryId: input.repositoryId,
      engineeringWorkspaceId: workspace?.id ?? null,
      workspaceLocatorId: repository.workspaceLocatorId,
      worktreeLocator: workspace?.worktreeLocator ?? null,
      taskId: input.taskId,
      agentId: input.agentId,
      operationId,
      idempotencyKey: workspace?.idempotencyKey ?? operationId,
      requestId,
      capability: input.capability,
      input: operationInput,
    });
    const approved = request.capability === "repository.worktree_create"
      ? await this.executions.findApprovedWorktreeCreation(input.ownerId, request)
      : undefined;
    return this.enqueueAndWait({
      ownerId: input.ownerId,
      transport: input.transport,
      signal: input.signal,
      request: approved ?? request,
    });
  }

  private async enqueueAndWait(input: {
    ownerId: string;
    transport: Transport;
    signal: AbortSignal;
    request: EngineeringTransportRequest;
  }): Promise<EngineeringTransportResult> {
    const queued = await this.executions.createEngineeringExecution({
      ownerId: input.ownerId,
      sessionId: input.transport.sessionId,
      request: input.request,
      networkState: input.transport.networkState,
      ipAddress: input.transport.ipAddress,
      requestId: input.request.requestId,
      ...(input.transport.deviceId ? { deviceId: input.transport.deviceId } : {}),
    });
    const deadline = this.now().getTime() +
      (input.request.capability === "repository.install_dependencies"
        ? Math.max(this.waitTimeoutMs, 11 * 60_000)
        : this.waitTimeoutMs);
    while (this.now().getTime() < deadline) {
      if (input.signal.aborted) {
        await this.executionStore.cancel(
          queued.id,
          input.ownerId,
          this.now().toISOString(),
        );
        throw Object.assign(new Error("Engineering execution cancelled."), {
          code: "CANCELLED",
        });
      }
      const result = await this.executionStore.getResult(queued.id);
      if (result?.status === "SUCCEEDED" && result.result)
        return EngineeringTransportResultSchema.parse(result.result);
      const state = await this.executionStore.find(queued.id);
      if (
        state &&
        ["FAILED", "TIMED_OUT", "CANCELLED", "EXPIRED", "REJECTED"].includes(
          state.status,
        )
      )
        throw Object.assign(
          new Error(
            result?.safeMessage ??
              "The trusted Mac Agent could not complete the engineering operation.",
          ),
          {
            code: state.failureCode ?? "ENVIRONMENT_FAILURE",
            statusCode: 503,
          },
        );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await this.executionStore.cancel(
      queued.id,
      input.ownerId,
      this.now().toISOString(),
    );
    throw Object.assign(new Error("Signed engineering execution timed out."), {
      code: "COMMAND_TIMEOUT",
    });
  }

  private async repository(
    ownerId: string,
    companyId: string,
    repositoryId: string,
    allowInitializing = false,
  ) {
    const repository = await this.runtimeStore.findRepository(
      ownerId,
      companyId,
      repositoryId,
    );
    if (
      !repository ||
      (repository.status !== "ACTIVE" &&
        !(allowInitializing && repository.status === "INITIALIZING"))
    )
      throw Object.assign(new Error("Engineering repository is unavailable."), {
        code: "REPOSITORY_NOT_AUTHORIZED",
      });
    return repository;
  }
}

import {
  CreateExecutionRequestSchema,
  NativeCapabilityDispatchRequestSchema,
  ProposedActionSchema,
  SignedCommandEnvelopeSchema,
  WorkspaceMetadataResultSchema,
  WorkspaceFileResultSchema,
  GitStatusResultSchema,
  GitDiffResultSchema,
  GitBranchResultSchema,
  RepositoryScanResultSchema,
  ReadOnlyExecutionRequestSchema,
  ReadOnlyExecutionResultSchema,
  ExecutionProvenanceSchema,
  ValidationExecutionResultSchema,
  NativeProviderExecutionTransportResultSchema,
  EngineeringTransportRequestSchema,
  EngineeringTransportResultSchema,
  BLOCKED_WORKSPACE_PATTERNS,
  AllowedWorkspaceSchema,
  canonicalizeExecutionPayload,
  type CreateExecutionRequest,
  type NativeCapabilityDispatchRequest,
  type NativeProviderCapability,
  type NetworkVerificationState,
  type ReadOnlyToolName,
  WorkspaceApplyPatchInputSchema,
  WorkspaceValidateProfileInputSchema,
  type AllowedApplication,
  type EngineeringTransportRequest,
} from "@alexa-control/shared";
import { createHash } from "node:crypto";

import { digestProposedAction } from "../governance/digest.js";
import type { GovernanceService } from "../governance/service.js";
import type { IdentityStore } from "../identity/store.js";
import type { StoredDevice } from "../identity/types.js";
import { verifyEnvelopeSignature } from "../identity/crypto.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { ExecutionError } from "./errors.js";
import type { ExecutionStore } from "./store.js";
import type { ServerExecutionSigner } from "./server-key-store.js";

const supported = new Set<ReadOnlyToolName>([
  "workspace.inspect_metadata",
  "workspace.read_file",
  "git.status",
  "git.diff",
  "git.current_branch",
  "repository.scan_metadata",
  "workspace.apply_patch",
  "workspace.validate_profile",
  "engineering.repository_capability",
]);
const blockedByPattern = (relativePath: string, patterns: string[]) => {
  const segments = relativePath.split("/");
  return patterns.some((pattern) => {
    const clean = pattern.replace(/\/$/, "");
    if (clean.startsWith("*."))
      return segments.some((part) => part.endsWith(clean.slice(1)));
    if (clean.includes("*")) {
      const [prefix = "", suffix = ""] = clean.split("*");
      return segments.some((part) => part.startsWith(prefix) && part.endsWith(suffix));
    }
    return (
      relativePath === clean ||
      relativePath.startsWith(`${clean}/`) ||
      segments.includes(clean)
    );
  });
};
const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");
const nativeProviderWorkspaceId = (ownerId: string) =>
  `native-provider-${ownerId.replaceAll("-", "").slice(0, 12)}`;
const deviceActivityTime = (device: StoredDevice) =>
  new Date(device.lastSeen ?? device.createdAt).getTime();
const selectPreferredMacAgent = (
  devices: StoredDevice[],
  explicitDeviceId?: string,
) => {
  if (explicitDeviceId)
    return devices.find((candidate) => candidate.id === explicitDeviceId);
  return [...devices].sort((left, right) => {
    if (left.lastSeen && !right.lastSeen) return -1;
    if (right.lastSeen && !left.lastSeen) return 1;
    const activityDelta = deviceActivityTime(right) - deviceActivityTime(left);
    if (activityDelta !== 0) return activityDelta;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  })[0];
};

const nativeProviderPolicyTool = (
  capability: NativeProviderCapability,
  applicationId?: string,
): string | null => {
  if (capability === "launch") return "app.open";
  if (
    [
      "focus",
      "focus_explorer",
      "focus_search",
      "focus_terminal",
      "focus_downloads",
      "focus_desktop",
      "focus_sidebar",
      "focus_session",
      "show_problems",
      "show_extensions",
      "open_profile",
      "focus_semantic_control",
    ].includes(capability)
  ) {
    return "app.focus";
  }
  if (
    [
      "open_file",
      "open_folder",
      "open_repository",
      "open_workspace",
      "reveal_file",
      "open_selected_resource",
    ].includes(capability)
  ) {
    return "app.open";
  }
  if (["open_url", "new_tab", "reload", "switch_tab"].includes(capability)) {
    return "browser.navigate";
  }
  if (["find", "search"].includes(capability)) return "browser.read_page";
  if (
    ["bookmark", "close_tab", "save_file", "new_folder", "clear_terminal"].includes(
      capability,
    )
  ) {
    return "browser.interact";
  }
  if (
    ["insert_text", "replace_selection", "activate_semantic_control"].includes(
      capability,
    )
  )
    return "browser.interact";
  if (capability === "submit_composer") {
    return ["chatgpt", "codex"].includes(applicationId ?? "")
      ? "application.submit_ai_composer"
      : "browser.submit_form";
  }
  if (["run_approved_command", "interrupt_command"].includes(capability)) {
    return "project.run_registered_script";
  }
  return null;
};

export interface ExecutionLimits {
  requestTtlSeconds: number;
  resultRetentionSeconds: number;
  maxFileReadBytes: number;
  maxExecutionResultBytes: number;
  maxRepositoryScanResultBytes: number;
}

export interface EngineeringExecutionScopeVerifier {
  verify(input: {
    ownerId: string;
    request: EngineeringTransportRequest;
  }): Promise<boolean>;
}

export class ExecutionService {
  constructor(
    readonly store: ExecutionStore,
    readonly identityStore: IdentityStore,
    readonly governance: GovernanceService,
    readonly audit: GovernanceAuditWriter,
    readonly signer: ServerExecutionSigner | undefined,
    readonly enabled: boolean,
    readonly limits: ExecutionLimits,
    readonly now = () => new Date(),
    readonly onGovernedInteractionSettled?: (input: {
      ownerId: string;
      proposalId: string;
      executionRequestId: string;
      status: "SUCCEEDED" | "FAILED" | "CANCELLED" | "TIMED_OUT";
    }) => Promise<void>,
    readonly privateNetworkRequired = true,
    readonly engineeringScopeVerifier?: EngineeringExecutionScopeVerifier,
  ) {}

  async create(input: {
    ownerId: string;
    sessionId: string;
    request: CreateExecutionRequest;
    networkState: NetworkVerificationState;
    ipAddress: string;
    requestId: string;
    allowPatchExecution?: boolean;
    allowValidationExecution?: boolean;
    allowEngineeringExecution?: boolean;
  }) {
    if (!this.enabled || !this.signer)
      throw new ExecutionError(
        503,
        "READ_ONLY_EXECUTION_UNAVAILABLE",
        "Read-only execution is unavailable.",
      );
    const parsed = CreateExecutionRequestSchema.parse(input.request);
    if (parsed.toolName === "native.provider_capability")
      throw new ExecutionError(
        403,
        "NATIVE_PROVIDER_SERVICE_REQUIRED",
        "Native provider execution must be requested through the native provider dispatcher.",
      );
    const engineeringInput =
      parsed.toolName === "engineering.repository_capability"
        ? EngineeringTransportRequestSchema.parse(parsed.arguments)
        : null;
    if (engineeringInput && !input.allowEngineeringExecution)
      throw new ExecutionError(
        403,
        "ENGINEERING_RUNTIME_SERVICE_REQUIRED",
        "Engineering execution must be requested through the governed engineering runtime.",
      );
    if (
      engineeringInput &&
      (!this.engineeringScopeVerifier ||
        !(await this.engineeringScopeVerifier.verify({
          ownerId: input.ownerId,
          request: engineeringInput,
        })))
    )
      throw new ExecutionError(
        403,
        "ENGINEERING_SCOPE_DENIED",
        "The company, repository, workspace, agent, or capability scope is invalid.",
      );
    if (!supported.has(parsed.toolName))
      throw new ExecutionError(
        400,
        "UNSUPPORTED_EXECUTION_TOOL",
        "The tool is not supported.",
      );
    if (parsed.toolName === "workspace.apply_patch" && !input.allowPatchExecution)
      throw new ExecutionError(
        403,
        "PATCH_SERVICE_REQUIRED",
        "Approved patch execution must be requested through the patch service.",
      );
    if (
      parsed.toolName === "workspace.validate_profile" &&
      !input.allowValidationExecution
    )
      throw new ExecutionError(
        403,
        "VALIDATION_SERVICE_REQUIRED",
        "Validation execution must be requested through the validation service.",
      );
    if (this.privateNetworkRequired && input.networkState !== "PRIVATE_NETWORK")
      throw new ExecutionError(
        403,
        "PRIVATE_NETWORK_REQUIRED",
        "Private-network verification is required.",
      );
    const requestedWorkspaceId =
      parsed.toolName === "engineering.repository_capability"
        ? parsed.arguments.workspaceLocatorId
        : parsed.arguments.workspaceId;
    const workspace = await this.governance.registry.getWorkspace(
      input.ownerId,
      requestedWorkspaceId,
    );
    if (!workspace.enabled)
      throw new ExecutionError(403, "WORKSPACE_DISABLED", "The workspace is disabled.");
    if (engineeringInput) {
      const readCapabilities = new Set([
        "repository.inspect",
        "repository.search",
        "repository.file_read",
        "repository.git_status",
        "repository.git_diff",
        "repository.integration_diff",
      ]);
      const writeCapabilities = new Set([
        "repository.initialize_project",
        "repository.file_create",
        "repository.file_patch",
        "repository.file_delete",
        "repository.worktree_create",
        "repository.worktree_inspect",
        "repository.worktree_remove",
        "repository.prepare_commit",
        "repository.integrate_commit",
        "repository.resolve_additive_docs_conflict",
        "repository.merge_candidate",
      ]);
      const scriptCapabilities = new Set([
        "repository.run_command",
        "repository.install_dependencies",
        "repository.add_dependency",
        "repository.remove_dependency",
        "repository.dev_server_start",
        "repository.dev_server_status",
        "repository.dev_server_stop",
        "repository.dev_server_restart",
      ]);
      if (
        readCapabilities.has(engineeringInput.capability) &&
        !workspace.permissions.read
      )
        throw new ExecutionError(
          403,
          "WORKSPACE_READ_NOT_ALLOWED",
          "Workspace read permission is required.",
        );
      if (
        writeCapabilities.has(engineeringInput.capability) &&
        (!workspace.permissions.write || !workspace.permissions.modifyFile)
      )
        throw new ExecutionError(
          403,
          "WORKSPACE_WRITE_NOT_ALLOWED",
          "Workspace write and modify-file permissions are required.",
        );
      if (
        scriptCapabilities.has(engineeringInput.capability) &&
        !workspace.permissions.runScripts
      )
        throw new ExecutionError(
          403,
          "WORKSPACE_SCRIPT_NOT_ALLOWED",
          "Registered script permission is required.",
        );
      if (
        engineeringInput.capability === "repository.worktree_create" &&
        !workspace.gitPermissions.createBranch
      )
        throw new ExecutionError(
          403,
          "WORKSPACE_GIT_BRANCH_NOT_ALLOWED",
          "Git branch creation permission is required.",
        );
      if (
        engineeringInput.capability === "repository.initialize_project" &&
        (!workspace.permissions.createFile ||
          !workspace.gitPermissions.createBranch ||
          !workspace.gitPermissions.commit)
      )
        throw new ExecutionError(
          403,
          "WORKSPACE_PROJECT_INITIALIZATION_NOT_ALLOWED",
          "Project initialization requires create-file, branch, and commit permissions on the derived workspace.",
        );
    }
    if (
      (parsed.toolName.startsWith("workspace.") ||
        parsed.toolName === "repository.scan_metadata") &&
      parsed.toolName !== "workspace.apply_patch" &&
      !workspace.permissions.read
    )
      throw new ExecutionError(
        403,
        "WORKSPACE_READ_NOT_ALLOWED",
        "Workspace read permission is required.",
      );
    if (
      parsed.toolName === "workspace.apply_patch" &&
      (!workspace.permissions.write || !workspace.permissions.modifyFile)
    )
      throw new ExecutionError(
        403,
        "WORKSPACE_WRITE_NOT_ALLOWED",
        "Workspace write and modify-file permissions are required.",
      );
    if (
      ["git.status", "git.current_branch"].includes(parsed.toolName) &&
      !workspace.gitPermissions.status
    )
      throw new ExecutionError(
        403,
        "WORKSPACE_GIT_STATUS_NOT_ALLOWED",
        "Git status permission is required.",
      );
    if (parsed.toolName === "git.diff" && !workspace.gitPermissions.diff)
      throw new ExecutionError(
        403,
        "WORKSPACE_GIT_DIFF_NOT_ALLOWED",
        "Git diff permission is required.",
      );
    if (
      parsed.toolName === "workspace.read_file" &&
      blockedByPattern(parsed.arguments.relativePath, workspace.blockedPatterns)
    )
      throw new ExecutionError(
        403,
        "WORKSPACE_PATH_BLOCKED",
        "The file is blocked by workspace policy.",
      );

    const devices = (await this.identityStore.listDevices(input.ownerId)).filter(
      (device) => device.deviceType === "MAC_AGENT" && device.trustStatus === "TRUSTED",
    );
    const device = selectPreferredMacAgent(devices, parsed.deviceId);
    if (!device)
      throw new ExecutionError(
        403,
        "TRUSTED_DEVICE_REQUIRED",
        "A trusted Mac agent is required.",
      );

    const effectiveArguments =
      parsed.toolName === "workspace.read_file"
        ? {
            ...parsed.arguments,
            maxBytes: Math.min(
              parsed.arguments.maxBytes ?? this.limits.maxFileReadBytes,
              this.limits.maxFileReadBytes,
            ),
          }
        : parsed.arguments;
    const patchInput =
      parsed.toolName === "workspace.apply_patch"
        ? WorkspaceApplyPatchInputSchema.parse(parsed.arguments)
        : null;
    const validationInput =
      parsed.toolName === "workspace.validate_profile"
        ? WorkspaceValidateProfileInputSchema.parse(parsed.arguments)
        : null;
    const actionId =
      engineeringInput?.operationId ??
      patchInput?.patchId ??
      validationInput?.validationRunId ??
      crypto.randomUUID();
    const action = ProposedActionSchema.parse({
      actionId,
      toolName: engineeringInput?.capability ?? parsed.toolName,
      workspaceId: workspace.id,
      arguments: effectiveArguments,
    });
    const mergePolicyAction =
      engineeringInput?.capability === "repository.merge_candidate"
        ? ProposedActionSchema.parse({
            actionId: engineeringInput.input.candidateId,
            toolName: "engineering.merge_candidate",
            workspaceId: workspace.id,
            arguments: {
              companyId: engineeringInput.companyId,
              repositoryId: engineeringInput.repositoryId,
              runId: engineeringInput.input.integrationRunId,
              candidateId: engineeringInput.input.candidateId,
              baseCommit: engineeringInput.input.expectedBase,
              headCommit: engineeringInput.input.candidateHead,
              targetBranch: engineeringInput.input.targetBranch,
              idempotencyKey: engineeringInput.input.mergeIdempotencyKey,
            },
            requestedCapabilities: ["repository.merge_candidate"],
          })
        : null;
    const actionDigest = digestProposedAction(action);
    const existing = await this.store.findByActionId(input.ownerId, actionId);
    if (existing) {
      if (
        existing.toolName !== parsed.toolName ||
        existing.actionDigest !== actionDigest
      )
        throw new ExecutionError(
          409,
          "EXECUTION_IDEMPOTENCY_CONFLICT",
          "The operation ID is already bound to a different engineering action.",
        );
      return existing;
    }
    const tool = await this.governance.store.findToolByName(
      mergePolicyAction?.toolName ?? engineeringInput?.capability ?? parsed.toolName,
    );
    const securityState = await this.governance.store.getSecurityState();
    const evaluation = await this.governance.policyEngine.evaluate({
      ownerId: input.ownerId,
      sessionId: input.sessionId,
      deviceId: device.id,
      deviceTrusted: true,
      signedEnvelopeVerified: true,
      networkVerification: input.networkState,
      recentAuthentication: false,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      action: mergePolicyAction ?? action,
      ...(tool ? { tool } : {}),
      workspace,
      emergencyStopActive: securityState.emergencyStopActive,
    });
    if (evaluation.decision !== "allow") {
      await this.audit({
        eventType: "EXECUTION_REQUEST_DENIED",
        ownerId: input.ownerId,
        deviceId: device.id,
        ipAddress: input.ipAddress,
        outcome: "DENIED",
        reason: evaluation.reasonCode,
        requestId: input.requestId,
        metadata: { toolName: parsed.toolName, workspaceId: workspace.id },
      });
      throw new ExecutionError(
        evaluation.decision === "require_approval" ? 409 : 403,
        evaluation.reasonCode,
        evaluation.humanReadableReason,
        evaluation.approvalRequestId
          ? { approvalRequestId: evaluation.approvalRequestId }
          : undefined,
      );
    }

    const createdAt = this.now();
    const request = ReadOnlyExecutionRequestSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      deviceId: device.id,
      actionId,
      policyEvaluationId: evaluation.id,
      ...(evaluation.approvalRequestId
        ? { approvalRequestId: evaluation.approvalRequestId }
        : {}),
      toolName: parsed.toolName,
      workspaceId: workspace.id,
      arguments: effectiveArguments,
      workspaceRootPath: workspace.rootPath,
      blockedPatterns: workspace.blockedPatterns,
      actionDigest,
      status: "PENDING",
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(
        createdAt.getTime() +
          (engineeringInput?.capability === "repository.install_dependencies"
            ? 600
            : engineeringInput?.capability === "repository.dev_server_start" ||
                engineeringInput?.capability === "repository.dev_server_restart"
              ? Math.max(this.limits.requestTtlSeconds, 300)
              : this.limits.requestTtlSeconds) * 1_000,
      ).toISOString(),
      claimedAt: null,
      startedAt: null,
      completedAt: null,
      cancellationRequestedAt: null,
      failureCode: null,
      attemptCount: 0,
      serverKeyFingerprint: this.signer.fingerprint,
      workspaceRootHash: sha256Hex(workspace.rootPath),
      agentLastHeartbeatAt: null,
    });
    await this.store.create(request);
    await this.audit({
      eventType: "EXECUTION_REQUEST_CREATED",
      ownerId: input.ownerId,
      deviceId: device.id,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Bounded read-only execution request created.",
      requestId: input.requestId,
      metadata: {
        executionRequestId: request.id,
        toolName: request.toolName,
        workspaceId: request.workspaceId,
      },
    });
    return request;
  }

  /** Internal Agent OS integration point; no generic engineering HTTP executor. */
  createEngineeringExecution(input: {
    ownerId: string;
    sessionId: string;
    request: EngineeringTransportRequest;
    networkState: NetworkVerificationState;
    ipAddress: string;
    requestId: string;
    deviceId?: string;
  }) {
    if (input.request.requestId !== input.requestId)
      throw new ExecutionError(
        409,
        "ENGINEERING_REQUEST_ID_MISMATCH",
        "The engineering payload must remain bound to its originating request ID.",
      );
    return this.create({
      ownerId: input.ownerId,
      sessionId: input.sessionId,
      request: {
        toolName: "engineering.repository_capability",
        arguments: input.request,
        ...(input.deviceId ? { deviceId: input.deviceId } : {}),
      },
      networkState: input.networkState,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      allowEngineeringExecution: true,
    });
  }

  async findApprovedProjectInitialization(input: {
    ownerId: string;
    companyId: string;
    repositoryId: string;
    workspaceLocatorId: string;
    agentId: string;
    template: "REACT_VITE_TYPESCRIPT" | "EMPTY_TYPESCRIPT";
    projectSlug: string;
    defaultBranch: string;
  }): Promise<EngineeringTransportRequest | undefined> {
    const approvals = await this.governance.store.listApprovals(
      input.ownerId,
      "APPROVED",
    );
    for (const approval of approvals) {
      if (
        approval.toolName !== "repository.initialize_project" ||
        approval.action.toolName !== "repository.initialize_project" ||
        approval.action.workspaceId !== input.workspaceLocatorId
      )
        continue;
      const request = EngineeringTransportRequestSchema.safeParse(
        approval.action.arguments,
      );
      if (
        !request.success ||
        request.data.capability !== "repository.initialize_project"
      )
        continue;
      const candidate = request.data;
      if (
        approval.action.actionId !== candidate.operationId ||
        candidate.companyId !== input.companyId ||
        candidate.repositoryId !== input.repositoryId ||
        candidate.workspaceLocatorId !== input.workspaceLocatorId ||
        candidate.engineeringWorkspaceId !== null ||
        candidate.worktreeLocator !== null ||
        candidate.taskId !== input.repositoryId ||
        candidate.agentId !== input.agentId ||
        candidate.idempotencyKey !== candidate.operationId ||
        candidate.input.template !== input.template ||
        candidate.input.projectSlug !== input.projectSlug ||
        candidate.input.defaultBranch !== input.defaultBranch
      )
        continue;
      const exactApproval = await this.governance.approvals.findMatchingApproved(
        input.ownerId,
        approval.action,
      );
      if (exactApproval?.status === "APPROVED") return candidate;
    }
    return undefined;
  }

  async findApprovedWorktreeCreation(ownerId: string, expected: EngineeringTransportRequest): Promise<EngineeringTransportRequest | undefined> {
    if (expected.capability !== "repository.worktree_create") return undefined;
    for (const approval of await this.governance.store.listApprovals(ownerId, "APPROVED")) {
      if (approval.toolName !== expected.capability || approval.action.toolName !== expected.capability ||
          approval.action.workspaceId !== expected.workspaceLocatorId) continue;
      const parsed = EngineeringTransportRequestSchema.safeParse(approval.action.arguments);
      if (!parsed.success || parsed.data.capability !== "repository.worktree_create") continue;
      const candidate = parsed.data;
      if (approval.action.actionId !== candidate.operationId ||
          candidate.companyId !== expected.companyId || candidate.repositoryId !== expected.repositoryId ||
          candidate.workspaceLocatorId !== expected.workspaceLocatorId || candidate.engineeringWorkspaceId !== expected.engineeringWorkspaceId ||
          candidate.worktreeLocator !== expected.worktreeLocator || candidate.taskId !== expected.taskId ||
          candidate.agentId !== expected.agentId || candidate.idempotencyKey !== expected.idempotencyKey ||
          candidate.input.branchName !== expected.input.branchName || candidate.input.baseCommit !== expected.input.baseCommit) continue;
      const exact = await this.governance.approvals.findMatchingApproved(ownerId, approval.action);
      if (exact?.status === "APPROVED") return candidate;
    }
    return undefined;
  }

  async createNativeProviderExecution(input: {
    ownerId: string;
    sessionId: string;
    request: NativeCapabilityDispatchRequest;
    networkState: NetworkVerificationState;
    ipAddress: string;
    requestId: string;
    deviceId?: string;
    policyApplication?: AllowedApplication;
  }) {
    if (!this.enabled || !this.signer)
      throw new ExecutionError(
        503,
        "TRUSTED_NATIVE_EXECUTION_UNAVAILABLE",
        "Trusted native execution transport is unavailable.",
      );
    if (this.privateNetworkRequired && input.networkState !== "PRIVATE_NETWORK")
      throw new ExecutionError(
        403,
        "PRIVATE_NETWORK_REQUIRED",
        "Private-network verification is required.",
      );
    const parsed = NativeCapabilityDispatchRequestSchema.parse(input.request);
    const policyToolName = nativeProviderPolicyTool(
      parsed.capability,
      parsed.applicationId,
    );
    if (!policyToolName)
      throw new ExecutionError(
        403,
        "NATIVE_CAPABILITY_POLICY_UNAVAILABLE",
        "This native capability does not yet have a reviewed policy mapping.",
      );
    const devices = (await this.identityStore.listDevices(input.ownerId)).filter(
      (device) => device.deviceType === "MAC_AGENT" && device.trustStatus === "TRUSTED",
    );
    const device = selectPreferredMacAgent(devices, input.deviceId);
    if (!device)
      throw new ExecutionError(
        403,
        "TRUSTED_DEVICE_REQUIRED",
        "A trusted Mac agent is required.",
      );
    const tool = await this.governance.store.findToolByName(policyToolName);
    const application =
      (await this.governance.store.findApplicationById(parsed.applicationId)) ??
      input.policyApplication;
    // A confirmed interaction must retain its identity while it moves through
    // proposal, approval, and execution. The full request remains digest-bound,
    // so changing the target or arguments still requires a new approval.
    const actionId = parsed.interactionProposalId ?? crypto.randomUUID();
    const action = ProposedActionSchema.parse({
      actionId,
      toolName: policyToolName,
      applicationId: parsed.applicationId,
      arguments: parsed,
      // Policy tools and finite capabilities are distinct identifiers. For
      // example, browser.submit_form is governed by browser.interact.
      requestedCapabilities: tool?.requiredCapabilities ?? [],
    });
    const securityState = await this.governance.store.getSecurityState();
    const evaluation = await this.governance.policyEngine.evaluate({
      ownerId: input.ownerId,
      sessionId: input.sessionId,
      deviceId: device.id,
      deviceTrusted: true,
      signedEnvelopeVerified: true,
      networkVerification: input.networkState,
      recentAuthentication: false,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      action,
      ...(tool ? { tool } : {}),
      ...(application ? { application } : {}),
      emergencyStopActive: securityState.emergencyStopActive,
    });
    if (evaluation.decision !== "allow") {
      await this.audit({
        eventType: "EXECUTION_REQUEST_DENIED",
        ownerId: input.ownerId,
        deviceId: device.id,
        ipAddress: input.ipAddress,
        outcome: "DENIED",
        reason: evaluation.reasonCode,
        requestId: input.requestId,
        metadata: {
          toolName: "native.provider_capability",
          applicationId: parsed.applicationId,
          providerId: parsed.providerId,
          capability: parsed.capability,
        },
      });
      throw new ExecutionError(
        evaluation.decision === "require_approval" ? 409 : 403,
        evaluation.reasonCode,
        evaluation.humanReadableReason,
        evaluation.approvalRequestId
          ? { approvalRequestId: evaluation.approvalRequestId }
          : undefined,
      );
    }
    const workspaceId = await this.ensureNativeProviderWorkspace(input.ownerId);
    const createdAt = this.now();
    const request = ReadOnlyExecutionRequestSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      deviceId: device.id,
      actionId,
      policyEvaluationId: evaluation.id,
      ...(evaluation.approvalRequestId
        ? { approvalRequestId: evaluation.approvalRequestId }
        : {}),
      toolName: "native.provider_capability",
      workspaceId,
      arguments: parsed,
      workspaceRootPath: `/__native_provider__/${workspaceId}`,
      blockedPatterns: [],
      actionDigest: digestProposedAction(action),
      status: "PENDING",
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(
        createdAt.getTime() + this.limits.requestTtlSeconds * 1_000,
      ).toISOString(),
      claimedAt: null,
      startedAt: null,
      completedAt: null,
      cancellationRequestedAt: null,
      failureCode: null,
      attemptCount: 0,
      serverKeyFingerprint: this.signer.fingerprint,
      workspaceRootHash: sha256Hex(workspaceId),
      agentLastHeartbeatAt: null,
    });
    await this.store.create(request);
    await this.audit({
      eventType: "EXECUTION_REQUEST_CREATED",
      ownerId: input.ownerId,
      deviceId: device.id,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Trusted native provider execution request queued.",
      requestId: input.requestId,
      metadata: {
        executionRequestId: request.id,
        toolName: request.toolName,
        applicationId: parsed.applicationId,
        providerId: parsed.providerId,
        capability: parsed.capability,
      },
    });
    return request;
  }

  private async ensureNativeProviderWorkspace(ownerId: string) {
    const id = nativeProviderWorkspaceId(ownerId);
    if (await this.governance.store.findWorkspaceById(id)) return id;
    const now = this.now().toISOString();
    await this.governance.store.createWorkspace(
      AllowedWorkspaceSchema.parse({
        id,
        ownerId,
        displayName: "Native provider execution sentinel",
        rootPath: `/__native_provider__/${id}`,
        enabled: true,
        permissions: {
          read: false,
          write: false,
          createFile: false,
          modifyFile: false,
          moveFile: false,
          deleteFile: false,
          runScripts: false,
        },
        blockedPatterns: BLOCKED_WORKSPACE_PATTERNS,
        allowedScripts: [],
        gitPermissions: {
          status: false,
          diff: false,
          createBranch: false,
          commit: false,
          push: false,
        },
        createdAt: now,
        updatedAt: now,
      }),
    );
    return id;
  }

  async provenance(executionRequestId: string) {
    const request = await this.store.find(executionRequestId);
    if (!request) return undefined;
    const result = await this.store.getResult(executionRequestId);
    return ExecutionProvenanceSchema.parse({
      executionRequestId: request.id,
      ownerId: request.ownerId,
      deviceId: request.deviceId,
      workspaceId: request.workspaceId,
      toolName: request.toolName,
      actionDigest: request.actionDigest,
      policyEvaluationId: request.policyEvaluationId,
      approvalRequestId: request.approvalRequestId ?? null,
      serverKeyFingerprint: request.serverKeyFingerprint ?? null,
      workspaceRootHash: request.workspaceRootHash ?? null,
      resultDigest: result?.resultDigest ?? null,
      resultExpiresAt: (await this.store.getResultExpiry(executionRequestId)) ?? null,
      createdAt: request.createdAt,
      completedAt: request.completedAt,
    });
  }

  async cleanupExpired() {
    return this.store.cleanupExpired(this.now().toISOString());
  }

  async poll(deviceId: string) {
    if (!this.enabled || !this.signer) return null;
    const security = await this.governance.store.getSecurityState();
    if (security.emergencyStopActive) return null;
    await this.cleanupExpired();
    const request = await this.store.poll(deviceId, this.now().toISOString());
    if (!request) return null;
    return this.signer.sign({
      request,
      issuedAt: this.now().toISOString(),
      expiresAt: request.expiresAt,
      nonce: crypto.randomUUID(),
      securityStateVersion: Math.max(
        1,
        Math.floor(new Date(security.updatedAt).getTime() / 1_000),
      ),
    });
  }

  async acceptResult(ownerId: string, resultInput: unknown) {
    const result = ReadOnlyExecutionResultSchema.parse(resultInput);
    if (result.status === "SUCCEEDED" && !result.result)
      throw new ExecutionError(
        400,
        "CAPABILITY_RESULT_INVALID",
        "A successful result payload is required.",
      );
    if (result.result) {
      const schema =
        result.toolName === "workspace.inspect_metadata"
          ? WorkspaceMetadataResultSchema
          : result.toolName === "workspace.read_file"
            ? WorkspaceFileResultSchema
            : result.toolName === "git.status"
              ? GitStatusResultSchema
              : result.toolName === "git.diff"
                ? GitDiffResultSchema
                : result.toolName === "git.current_branch"
                  ? GitBranchResultSchema
                  : result.toolName === "repository.scan_metadata"
                    ? RepositoryScanResultSchema
                    : result.toolName === "workspace.validate_profile"
                      ? ValidationExecutionResultSchema
                      : result.toolName === "native.provider_capability"
                        ? NativeProviderExecutionTransportResultSchema
                        : result.toolName === "engineering.repository_capability"
                          ? EngineeringTransportResultSchema
                          : RepositoryScanResultSchema;
      if (!schema.safeParse(result.result).success)
        throw new ExecutionError(
          400,
          "CAPABILITY_RESULT_INVALID",
          "The result does not match the tool.",
        );
    }
    const request = await this.store.find(result.executionRequestId);
    if (!request || request.ownerId !== ownerId)
      throw new ExecutionError(
        404,
        "EXECUTION_REQUEST_NOT_FOUND",
        "Execution request was not found.",
      );
    if (request.deviceId !== result.deviceId || request.toolName !== result.toolName)
      throw new ExecutionError(
        403,
        "EXECUTION_DEVICE_MISMATCH",
        "The result does not match the assigned request.",
      );
    if (request.expiresAt <= this.now().toISOString())
      throw new ExecutionError(
        409,
        "EXECUTION_REQUEST_EXPIRED",
        "The execution request expired.",
      );
    const security = await this.governance.store.getSecurityState();
    if (security.emergencyStopActive)
      throw new ExecutionError(
        409,
        "EMERGENCY_STOP_ACTIVE",
        "Emergency stop is active.",
      );
    const device = await this.identityStore.findDeviceById(result.deviceId);
    if (!device || device.trustStatus !== "TRUSTED")
      throw new ExecutionError(
        403,
        "TRUSTED_DEVICE_REQUIRED",
        "The device is not trusted.",
      );

    const { deviceSignature, ...unsigned } = result;
    const expectedDigest = createHash("sha256")
      .update(canonicalizeExecutionPayload(unsigned.result ?? null))
      .digest("hex");
    if (result.resultDigest !== expectedDigest)
      throw new ExecutionError(
        400,
        "EXECUTION_RESULT_DIGEST_MISMATCH",
        "The result digest is invalid.",
      );
    const safePayload: unknown = JSON.parse(JSON.stringify(unsigned)) as unknown;
    const signedCommand = SignedCommandEnvelopeSchema.parse({
      commandId: result.commandId,
      deviceId: result.deviceId,
      issuedAt: result.startedAt,
      expiresAt: new Date(
        new Date(result.completedAt).getTime() + 120_000,
      ).toISOString(),
      nonce: result.nonce,
      payload: safePayload,
      signature: deviceSignature,
      signatureAlgorithm: "Ed25519" as const,
      protocolVersion: "1" as const,
    });
    if (!(await verifyEnvelopeSignature(device.publicKey, signedCommand)))
      throw new ExecutionError(
        401,
        "EXECUTION_RESULT_SIGNATURE_INVALID",
        "The result signature is invalid.",
      );
    if (
      !(await this.identityStore.consumeNonce(
        device.id,
        result.nonce,
        new Date(signedCommand.expiresAt),
        this.now(),
      ))
    )
      throw new ExecutionError(
        409,
        "DUPLICATE_NONCE",
        "The result was already submitted.",
      );
    const maxResultBytes =
      result.toolName === "repository.scan_metadata"
        ? this.limits.maxRepositoryScanResultBytes
        : this.limits.maxExecutionResultBytes;
    if (JSON.stringify(result).length > maxResultBytes)
      throw new ExecutionError(
        413,
        "CAPABILITY_RESULT_INVALID",
        "The result exceeds the configured limit.",
      );
    if (
      result.result &&
      "returnedBytes" in result.result &&
      result.result.returnedBytes > this.limits.maxFileReadBytes
    )
      throw new ExecutionError(
        413,
        "CAPABILITY_RESULT_INVALID",
        "The file result exceeds the configured limit.",
      );
    if (request.status === "CANCELLED" && result.status === "CANCELLED") {
      const saved = await this.store.saveResult(
        ownerId,
        result,
        new Date(
          this.now().getTime() + this.limits.resultRetentionSeconds * 1_000,
        ).toISOString(),
      );
      if (!saved)
        throw new ExecutionError(
          409,
          "EXECUTION_REQUEST_ALREADY_COMPLETED",
          "A result already exists.",
        );
      return request;
    }
    const terminal = await this.store.transition(
      request.id,
      device.id,
      ["RUNNING", "CLAIMED"],
      result.status,
      result.completedAt,
      result.failureCode,
    );
    if (!terminal)
      throw new ExecutionError(
        409,
        "EXECUTION_REQUEST_ALREADY_COMPLETED",
        "The request is no longer active.",
      );
    const saved = await this.store.saveResult(
      ownerId,
      result,
      new Date(
        this.now().getTime() + this.limits.resultRetentionSeconds * 1_000,
      ).toISOString(),
    );
    if (!saved)
      throw new ExecutionError(
        409,
        "EXECUTION_REQUEST_ALREADY_COMPLETED",
        "A result already exists.",
      );
    if (request.toolName === "native.provider_capability") {
      const nativeRequest = NativeCapabilityDispatchRequestSchema.parse(
        request.arguments,
      );
      if (nativeRequest.interactionProposalId && this.onGovernedInteractionSettled)
        await this.onGovernedInteractionSettled({
          ownerId,
          proposalId: nativeRequest.interactionProposalId,
          executionRequestId: request.id,
          status: result.status,
        });
    }
    return terminal;
  }
}

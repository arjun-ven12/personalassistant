import {
  ApprovePatchRequestSchema,
  ExecutePatchRequestSchema,
  GeneratePatchRequestSchema,
  PatchDecisionResponseSchema,
  PatchListResponseSchema,
  PatchRecordSchema,
  PatchResponseSchema,
  type PatchOperation,
  type NetworkVerificationState,
  type Repository,
} from "@alexa-control/shared";
import { createHash, randomBytes } from "node:crypto";

import { ExecutionError } from "../execution/errors.js";
import type { ExecutionService } from "../execution/service.js";
import type {
  ApprovalService,
  GovernanceAuditWriter,
} from "../governance/approval-service.js";
import type { RepositoryStore } from "../repositories/store.js";
import type { PatchStore } from "./store.js";

const sha256Hex = (value: unknown) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");

const patchDigest = (operations: PatchOperation[]) =>
  sha256Hex(
    operations.map((operation) => ({
      kind: operation.kind,
      relativePath: operation.relativePath,
      newRelativePath: operation.newRelativePath ?? null,
      expectedOriginalSha256: operation.expectedOriginalSha256,
      newContent: operation.newContent,
    })),
  );

const executionOperations = (operations: PatchOperation[]) =>
  operations.map((operation) => ({
    operationId: operation.operationId,
    kind: operation.kind,
    relativePath: operation.relativePath,
    ...(operation.newRelativePath
      ? { newRelativePath: operation.newRelativePath }
      : {}),
    expectedOriginalSha256: operation.expectedOriginalSha256,
    expectedOriginalContent: operation.expectedOriginalContent,
    newContent: operation.newContent,
  }));

const diffForOperation = (operation: PatchOperation) => {
  const destination = operation.newRelativePath ?? operation.relativePath;
  const before = operation.expectedOriginalContent?.split("\n") ?? [];
  const after = operation.newContent?.split("\n") ?? [];
  return [
    `diff --git a/${operation.relativePath} b/${destination}`,
    operation.kind === "create" ? "new file mode 100644" : "",
    operation.kind === "delete" ? "deleted file mode 100644" : "",
    operation.kind === "rename" ? `rename to ${destination}` : "",
    `--- ${operation.kind === "create" ? "/dev/null" : `a/${operation.relativePath}`}`,
    `+++ ${operation.kind === "delete" ? "/dev/null" : `b/${destination}`}`,
    `@@ -1,${before.length} +1,${after.length} @@`,
    ...before.slice(0, 200).map((line) => `-${line}`),
    ...after.slice(0, 200).map((line) => `+${line}`),
  ]
    .filter(Boolean)
    .join("\n");
};

const changedSymbols = (operations: PatchOperation[]) =>
  operations
    .map(
      (operation) => operation.relativePath.split("/").at(-1) ?? operation.relativePath,
    )
    .slice(0, 200);

const reverseOperation = (operation: PatchOperation): PatchOperation => {
  if (operation.kind === "create")
    return {
      operationId: crypto.randomUUID(),
      kind: "delete",
      relativePath: operation.relativePath,
      expectedOriginalSha256: null,
      expectedOriginalContent: operation.newContent,
      newContent: null,
    };
  if (operation.kind === "delete") {
    if (operation.expectedOriginalContent === null)
      throw new ExecutionError(
        409,
        "ROLLBACK_SNAPSHOT_UNAVAILABLE",
        "Rollback requires original file content for deleted files.",
      );
    return {
      operationId: crypto.randomUUID(),
      kind: "create",
      relativePath: operation.relativePath,
      expectedOriginalSha256: null,
      expectedOriginalContent: null,
      newContent: operation.expectedOriginalContent,
    };
  }
  if (operation.kind === "rename") {
    if (!operation.newRelativePath)
      throw new ExecutionError(
        409,
        "ROLLBACK_SNAPSHOT_UNAVAILABLE",
        "Rollback requires the renamed path.",
      );
    return {
      operationId: crypto.randomUUID(),
      kind: "rename",
      relativePath: operation.newRelativePath,
      newRelativePath: operation.relativePath,
      expectedOriginalSha256: null,
      expectedOriginalContent: operation.newContent,
      newContent: operation.expectedOriginalContent,
    };
  }
  if (operation.expectedOriginalContent === null)
    throw new ExecutionError(
      409,
      "ROLLBACK_SNAPSHOT_UNAVAILABLE",
      "Rollback requires original file content for modified files.",
    );
  return {
    operationId: crypto.randomUUID(),
    kind: "modify",
    relativePath: operation.relativePath,
    expectedOriginalSha256: null,
    expectedOriginalContent: operation.newContent,
    newContent: operation.expectedOriginalContent,
  };
};

export class PatchService {
  constructor(
    readonly store: PatchStore,
    readonly repositoryStore: RepositoryStore,
    readonly executions: ExecutionService,
    readonly approvals: ApprovalService,
    readonly audit: GovernanceAuditWriter,
    readonly now = () => new Date(),
  ) {}

  async generate(input: {
    ownerId: string;
    body: unknown;
    ipAddress: string;
    requestId: string;
  }) {
    const parsed = GeneratePatchRequestSchema.parse(input.body);
    const repository = await this.requireRepository(input.ownerId, parsed.repositoryId);
    const at = this.now().toISOString();
    const digest = patchDigest(parsed.operations);
    const unifiedDiff = parsed.operations.map(diffForOperation).join("\n");
    const fileCount = new Set(
      parsed.operations.flatMap((operation) => [
        operation.relativePath,
        operation.newRelativePath ?? operation.relativePath,
      ]),
    ).size;
    const patch = PatchRecordSchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      repositoryId: repository.id,
      workspaceId: repository.workspaceId,
      repositoryGeneration: repository.activeGeneration,
      title: parsed.title,
      summary: parsed.summary,
      status: "PENDING_APPROVAL",
      riskScore: Math.min(100, 30 + fileCount * 10),
      complexity: fileCount > 10 ? "high" : fileCount > 3 ? "medium" : "low",
      operations: parsed.operations,
      unifiedDiff,
      changedSymbols: changedSymbols(parsed.operations),
      affectedApis: [],
      architectureImpact: [`${fileCount} file(s) changed`],
      databaseImpact: parsed.operations.some((operation) =>
        operation.relativePath.includes("migration"),
      )
        ? ["Migration path touched"]
        : [],
      frontendImpact: parsed.operations
        .filter((operation) => /\.(tsx|jsx|css)$/.test(operation.relativePath))
        .map((operation) => operation.relativePath),
      backendImpact: parsed.operations
        .filter((operation) => /\.(ts|js)$/.test(operation.relativePath))
        .map((operation) => operation.relativePath),
      patchDigest: digest,
      approvalTokenHash: null,
      executionRequestId: null,
      createdAt: at,
      updatedAt: at,
      decidedAt: null,
      appliedAt: null,
      failureCode: null,
    });
    const created = await this.store.create(patch);
    await this.audit({
      eventType: "APPROVAL_REQUESTED",
      ownerId: input.ownerId,
      outcome: "SUCCESS",
      reason: "Patch generated and queued for explicit owner approval.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: { patchId: created.id, repositoryId: repository.id },
    });
    return PatchResponseSchema.parse({ repository, patch: created });
  }

  async list(ownerId: string) {
    return PatchListResponseSchema.parse(await this.store.list(ownerId, 100));
  }

  async get(ownerId: string, patchId: string) {
    const patch = await this.requirePatch(ownerId, patchId);
    const repository = await this.requireRepository(ownerId, patch.repositoryId);
    return PatchResponseSchema.parse({ repository, patch });
  }

  async decide(input: {
    ownerId: string;
    patchId: string;
    sessionId: string;
    body: unknown;
    ipAddress: string;
    requestId: string;
  }) {
    const decision = ApprovePatchRequestSchema.parse(input.body);
    const patch = await this.requirePatch(input.ownerId, input.patchId);
    if (patch.status !== "PENDING_APPROVAL")
      throw new ExecutionError(
        409,
        "PATCH_NOT_PENDING",
        "Patch is not pending approval.",
      );
    const at = this.now().toISOString();
    if (decision.decision !== "approve") {
      const next = PatchRecordSchema.parse({
        ...patch,
        status: decision.decision === "reject" ? "REJECTED" : "CANCELLED",
        updatedAt: at,
        decidedAt: at,
      });
      await this.store.update(next);
      return PatchDecisionResponseSchema.parse({ patch: next });
    }
    const approvalToken = randomBytes(32).toString("base64url");
    const next = PatchRecordSchema.parse({
      ...patch,
      status: "APPROVED",
      approvalTokenHash: sha256Hex(approvalToken),
      updatedAt: at,
      decidedAt: at,
    });
    await this.store.update(next);
    await this.audit({
      eventType: "APPROVAL_REQUESTED",
      ownerId: input.ownerId,
      outcome: "SUCCESS",
      reason: "Owner explicitly approved a patch for execution.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: { patchId: next.id, patchDigest: next.patchDigest },
    });
    return PatchDecisionResponseSchema.parse({ patch: next, approvalToken });
  }

  async execute(input: {
    ownerId: string;
    sessionId: string;
    patchId: string;
    body: unknown;
    networkState: NetworkVerificationState;
    ipAddress: string;
    requestId: string;
  }) {
    const parsed = ExecutePatchRequestSchema.parse(input.body);
    const patch = await this.requirePatch(input.ownerId, input.patchId);
    if (patch.status !== "APPROVED" || !patch.approvalTokenHash)
      throw new ExecutionError(409, "PATCH_NOT_APPROVED", "Patch is not approved.");
    if (sha256Hex(parsed.approvalToken) !== patch.approvalTokenHash)
      throw new ExecutionError(
        403,
        "PATCH_APPROVAL_TOKEN_INVALID",
        "Patch approval token is invalid.",
      );
    const repository = await this.requireRepository(input.ownerId, patch.repositoryId);
    const action = {
      actionId: patch.id,
      toolName: "workspace.apply_patch",
      workspaceId: patch.workspaceId,
      arguments: {
        workspaceId: patch.workspaceId,
        patchId: patch.id,
        patchDigest: patch.patchDigest,
        approvalToken: parsed.approvalToken,
        repositoryGeneration: patch.repositoryGeneration,
        operations: executionOperations(patch.operations),
      },
    };
    const approval = await this.approvals.create({
      ownerId: input.ownerId,
      action,
      riskLevel: "medium",
      approvalRequirement: "explicit",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
    });
    await this.approvals.approve(input.ownerId, approval.id, input.sessionId, {
      ipAddress: input.ipAddress,
      requestId: input.requestId,
    });
    const execution = await this.executions.create({
      ownerId: input.ownerId,
      sessionId: input.sessionId,
      request: {
        toolName: "workspace.apply_patch",
        ...(parsed.deviceId ? { deviceId: parsed.deviceId } : {}),
        arguments: action.arguments,
      },
      networkState: input.networkState,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      allowPatchExecution: true,
    });
    const next = PatchRecordSchema.parse({
      ...patch,
      status: "EXECUTION_REQUESTED",
      executionRequestId: execution.id,
      updatedAt: this.now().toISOString(),
    });
    await this.store.update(next);
    return PatchResponseSchema.parse({ repository, patch: next });
  }

  async rollback(input: {
    ownerId: string;
    patchId: string;
    ipAddress: string;
    requestId: string;
  }) {
    const patch = await this.requirePatch(input.ownerId, input.patchId);
    if (!["EXECUTION_REQUESTED", "APPLIED", "FAILED"].includes(patch.status))
      throw new ExecutionError(
        409,
        "PATCH_NOT_ROLLBACK_ELIGIBLE",
        "Only executed patches can produce a rollback patch.",
      );
    const repository = await this.requireRepository(input.ownerId, patch.repositoryId);
    const operations = patch.operations.map(reverseOperation).reverse();
    const at = this.now().toISOString();
    const digest = patchDigest(operations);
    const rollbackPatch = PatchRecordSchema.parse({
      ...patch,
      id: crypto.randomUUID(),
      title: `Rollback: ${patch.title}`,
      summary: `Restores files changed by patch ${patch.id}. This rollback still requires explicit owner approval before execution.`,
      status: "PENDING_APPROVAL",
      operations,
      unifiedDiff: operations.map(diffForOperation).join("\n"),
      changedSymbols: changedSymbols(operations),
      architectureImpact: [`Rollback for patch ${patch.id}`],
      patchDigest: digest,
      approvalTokenHash: null,
      executionRequestId: null,
      createdAt: at,
      updatedAt: at,
      decidedAt: null,
      appliedAt: null,
      failureCode: null,
    });
    const created = await this.store.create(rollbackPatch);
    await this.audit({
      eventType: "APPROVAL_REQUESTED",
      ownerId: input.ownerId,
      outcome: "SUCCESS",
      reason: "Rollback patch generated and queued for explicit owner approval.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: { patchId: created.id, rollbackOfPatchId: patch.id },
    });
    return PatchResponseSchema.parse({ repository, patch: created });
  }

  private async requireRepository(
    ownerId: string,
    repositoryId: string,
  ): Promise<Repository> {
    const repository = await this.repositoryStore.findRepository(repositoryId);
    if (!repository || repository.ownerId !== ownerId)
      throw new ExecutionError(
        404,
        "REPOSITORY_NOT_FOUND",
        "Repository was not found.",
      );
    return repository;
  }

  private async requirePatch(ownerId: string, patchId: string) {
    const patch = await this.store.find(patchId);
    if (!patch || patch.ownerId !== ownerId)
      throw new ExecutionError(404, "PATCH_NOT_FOUND", "Patch was not found.");
    return patch;
  }
}

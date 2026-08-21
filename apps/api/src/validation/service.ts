import {
  CreateValidationRequestSchema,
  StartValidationRequestSchema,
  ValidationExecutionResultSchema,
  ValidationListResponseSchema,
  ValidationProfileListResponseSchema,
  ValidationRecordSchema,
  ValidationResponseSchema,
  type NetworkVerificationState,
  type ReadOnlyExecutionResult,
  type ValidationRecord,
} from "@alexa-control/shared";

import { ExecutionError } from "../execution/errors.js";
import type { ExecutionService } from "../execution/service.js";
import type {
  ApprovalService,
  GovernanceAuditWriter,
} from "../governance/approval-service.js";
import type { PatchStore } from "../patches/store.js";
import type { RepositoryStore } from "../repositories/store.js";
import { getValidationProfiles, requireValidationProfiles } from "./profiles.js";
import type { ValidationStore } from "./store.js";

const defaultProfileIds = [
  "pnpm_format_check",
  "pnpm_typecheck",
  "pnpm_lint",
  "pnpm_test",
  "pnpm_build",
] as const;

export class ValidationService {
  constructor(
    readonly store: ValidationStore,
    readonly repositoryStore: RepositoryStore,
    readonly patchStore: PatchStore,
    readonly executions: ExecutionService,
    readonly approvals: ApprovalService,
    readonly audit: GovernanceAuditWriter,
    readonly now = () => new Date(),
  ) {}

  profiles() {
    return ValidationProfileListResponseSchema.parse(getValidationProfiles());
  }

  async create(input: {
    ownerId: string;
    body: unknown;
    ipAddress: string;
    requestId: string;
  }) {
    const parsed = CreateValidationRequestSchema.parse(input.body);
    const repository = await this.requireRepository(input.ownerId, parsed.repositoryId);
    if (parsed.patchId) {
      const patch = await this.patchStore.find(parsed.patchId);
      if (!patch || patch.ownerId !== input.ownerId)
        throw new ExecutionError(404, "PATCH_NOT_FOUND", "Patch was not found.");
      if (!["EXECUTION_REQUESTED", "APPLIED"].includes(patch.status))
        throw new ExecutionError(
          409,
          "PATCH_NOT_EXECUTED",
          "Only executed patches can be validated.",
        );
    }
    const profileIds = parsed.profileIds ?? [...defaultProfileIds];
    requireValidationProfiles(profileIds);
    const at = this.now().toISOString();
    const validation = ValidationRecordSchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      repositoryId: repository.id,
      workspaceId: repository.workspaceId,
      patchId: parsed.patchId ?? null,
      repositoryGeneration: repository.activeGeneration,
      status: "PLANNED",
      classification: null,
      profileIds,
      planSummary: `Run ${profileIds.length} immutable validation profile(s): ${profileIds.join(", ")}.`,
      executionRequestId: null,
      createdAt: at,
      updatedAt: at,
      startedAt: null,
      completedAt: null,
      steps: [],
      summary: "",
      failureCode: null,
    });
    const created = await this.store.create(validation);
    await this.audit({
      eventType: "EXECUTION_REQUEST_CREATED",
      ownerId: input.ownerId,
      outcome: "SUCCESS",
      reason: "Validation run planned; no execution has started.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: { validationRunId: created.id, repositoryId: repository.id },
    });
    return ValidationResponseSchema.parse({ repository, validation: created });
  }

  async start(input: {
    ownerId: string;
    sessionId: string;
    validationRunId: string;
    body: unknown;
    networkState: NetworkVerificationState;
    ipAddress: string;
    requestId: string;
  }) {
    const parsed = StartValidationRequestSchema.parse(input.body);
    const validation = await this.requireValidation(
      input.ownerId,
      input.validationRunId,
    );
    if (validation.status !== "PLANNED")
      throw new ExecutionError(
        409,
        "VALIDATION_NOT_PLANNED",
        "Validation has already been started or completed.",
      );
    const repository = await this.requireRepository(
      input.ownerId,
      validation.repositoryId,
    );
    const profiles = requireValidationProfiles(validation.profileIds);
    const action = {
      actionId: validation.id,
      toolName: "workspace.validate_profile",
      workspaceId: validation.workspaceId,
      arguments: {
        workspaceId: validation.workspaceId,
        validationRunId: validation.id,
        repositoryGeneration: validation.repositoryGeneration,
        profiles,
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
        toolName: "workspace.validate_profile",
        ...(parsed.deviceId ? { deviceId: parsed.deviceId } : {}),
        arguments: action.arguments,
      },
      networkState: input.networkState,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      allowValidationExecution: true,
    });
    const next = ValidationRecordSchema.parse({
      ...validation,
      status: "EXECUTION_REQUESTED",
      executionRequestId: execution.id,
      updatedAt: this.now().toISOString(),
    });
    await this.store.update(next);
    return ValidationResponseSchema.parse({ repository, validation: next });
  }

  async publishExecutionResult(input: {
    ownerId: string;
    executionRequestId: string;
    result: ReadOnlyExecutionResult;
    ipAddress: string;
    requestId: string;
  }) {
    const validation = await this.store.findByExecutionRequestId(
      input.executionRequestId,
    );
    if (!validation || validation.ownerId !== input.ownerId) return;
    const payload =
      input.result.status === "SUCCEEDED" && input.result.result
        ? ValidationExecutionResultSchema.parse(input.result.result)
        : null;
    const at = this.now().toISOString();
    const next = ValidationRecordSchema.parse({
      ...validation,
      status:
        input.result.status === "CANCELLED"
          ? "CANCELLED"
          : payload?.status === "PASSED"
            ? "PASSED"
            : payload?.status === "PASSED_WITH_WARNINGS"
              ? "PASSED_WITH_WARNINGS"
              : "FAILED",
      classification:
        payload?.classification ??
        (input.result.status === "TIMED_OUT"
          ? "FAILED_TIMEOUT"
          : input.result.status === "CANCELLED"
            ? "CANCELLED"
            : "FAILED_ENVIRONMENT"),
      startedAt: input.result.startedAt,
      completedAt: input.result.completedAt,
      steps: payload?.steps ?? [],
      summary:
        payload?.summary ??
        input.result.safeMessage ??
        "Validation execution failed before a structured result was returned.",
      failureCode: input.result.failureCode ?? null,
      updatedAt: at,
    });
    await this.store.update(next);
    await this.audit({
      eventType: next.status === "PASSED" ? "EXECUTION_SUCCEEDED" : "EXECUTION_FAILED",
      ownerId: input.ownerId,
      outcome: next.status === "PASSED" ? "SUCCESS" : "FAILURE",
      reason: `Validation completed with ${next.classification}.`,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: {
        validationRunId: next.id,
        executionRequestId: input.executionRequestId,
        classification: next.classification,
      },
    });
  }

  async cancel(ownerId: string, validationRunId: string, at: string) {
    const validation = await this.requireValidation(ownerId, validationRunId);
    if (!validation.executionRequestId)
      throw new ExecutionError(
        409,
        "VALIDATION_NOT_STARTED",
        "Validation has not started.",
      );
    await this.executions.store.cancel(validation.executionRequestId, ownerId, at);
    const next = ValidationRecordSchema.parse({
      ...validation,
      status: "CANCELLED",
      classification: "CANCELLED",
      completedAt: at,
      updatedAt: at,
      failureCode: "CAPABILITY_CANCELLED",
    });
    await this.store.update(next);
    return next;
  }

  async get(ownerId: string, validationRunId: string) {
    const validation = await this.requireValidation(ownerId, validationRunId);
    const repository = await this.requireRepository(ownerId, validation.repositoryId);
    return ValidationResponseSchema.parse({ repository, validation });
  }

  async list(ownerId: string) {
    return ValidationListResponseSchema.parse(await this.store.list(ownerId, 100));
  }

  private async requireRepository(ownerId: string, repositoryId: string) {
    const repository = await this.repositoryStore.findRepository(repositoryId);
    if (!repository || repository.ownerId !== ownerId)
      throw new ExecutionError(
        404,
        "REPOSITORY_NOT_FOUND",
        "Repository was not found.",
      );
    return repository;
  }

  private async requireValidation(
    ownerId: string,
    validationRunId: string,
  ): Promise<ValidationRecord> {
    const validation = await this.store.find(validationRunId);
    if (!validation || validation.ownerId !== ownerId)
      throw new ExecutionError(
        404,
        "VALIDATION_NOT_FOUND",
        "Validation run was not found.",
      );
    return validation;
  }
}

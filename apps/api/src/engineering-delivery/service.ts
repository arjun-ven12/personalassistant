import { createHash } from "node:crypto";
import path from "node:path";

import {
  AddEngineeringInstructionRequestSchema,
  CreateSoftwareObjectiveRequestSchema,
  EngineeringCommandProfileSchema,
  EngineeringControlCenterSchema,
  EngineeringDeliverySchema,
  EngineeringProjectRegistryEntrySchema,
  EngineeringRepositorySchema,
  type EngineeringDelivery,
  type EngineeringModelTier,
  type NetworkVerificationState,
} from "@alexa-control/shared";

import type { ExecutiveNotificationService } from "../notifications/service.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { RegistryService } from "../governance/registry-service.js";
import type { EngineeringRuntimeStore } from "../engineering-runtime/store.js";
import type { EngineeringManagerService } from "../engineering-orchestration/service.js";
import type { EngineeringIntegrationService } from "../engineering-integration/service.js";
import type { SignedExecutionEngineeringGateway } from "../engineering-orchestration/signed-gateway.js";
import type { EngineeringDeliveryStore } from "./store.js";

export type EngineeringDeliveryContext = {
  ownerId: string;
  companyId: string;
  requestId: string;
  ipAddress: string;
  sessionId: string;
  networkState: NetworkVerificationState;
  deviceId?: string;
};

export class EngineeringDeliveryError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code:
      | "DELIVERY_NOT_FOUND"
      | "INVALID_STATE"
      | "DEVELOPMENT_ROOT_DENIED"
      | "IDEMPOTENCY_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "EngineeringDeliveryError";
    this.statusCode =
      code === "DELIVERY_NOT_FOUND"
        ? 404
        : code === "DEVELOPMENT_ROOT_DENIED"
          ? 403
          : 409;
  }
}

const money = (value: number) =>
  value.toFixed(8).replace(/0+$/, "").replace(/\.$/, ".0");
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "software-project";
const terminal = new Set([
  "DONE",
  "DONE_WITH_WARNINGS",
  "BLOCKED",
  "FAILED",
  "OWNER_INPUT_REQUIRED",
  "CANCELLED",
]);
const recoverableIntegrationWarnings = new Set([
  "Source workspace changes differ from the completed task result.",
  "Governed dependency preparation failed. Check the package lockfile and reviewed dependency container before retrying.",
  "The dependency container exited unexpectedly. Check Docker Desktop resources, then retry this same run.",
]);
const recoverableIntegrationScopeWarning =
  "The company, repository, workspace, agent, or capability scope is invalid.";
const recoverableReviewWarning =
  "No independent repository-authorized reviewer is available.";
const recoverableExistingRunWarnings = new Set([
  recoverableIntegrationScopeWarning,
  recoverableReviewWarning,
  "Independent integration review requires changes.",
  "Integration ended in REPAIRING.",
  "Integration ended in CONFLICTED.",
  "The reviewed integration head changed before applying its scoped repair.",
]);

export class EngineeringDeliveryService {
  readonly terminalListeners = new Set<(context: EngineeringDeliveryContext, deliveryId: string) => Promise<void>>();
  constructor(
    readonly store: EngineeringDeliveryStore,
    readonly runtime: EngineeringRuntimeStore,
    readonly registry: RegistryService,
    readonly manager: EngineeringManagerService,
    readonly integration: EngineeringIntegrationService,
    readonly gateway: SignedExecutionEngineeringGateway,
    readonly authorizedAgents: (
      context: EngineeringDeliveryContext,
    ) => Promise<string[]>,
    readonly notifications: ExecutiveNotificationService,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  onTerminal(listener: (context: EngineeringDeliveryContext, deliveryId: string) => Promise<void>) {
    this.terminalListeners.add(listener);
  }

  private async notifyTerminal(context: EngineeringDeliveryContext, deliveryId: string) {
    await Promise.allSettled([...this.terminalListeners].map((listener) => listener(context, deliveryId)));
  }

  async create(context: EngineeringDeliveryContext, body: unknown) {
    const request = CreateSoftwareObjectiveRequestSchema.parse(body);
    const existing = await this.store.findByIdempotencyKey(
      context.ownerId,
      context.companyId,
      request.idempotencyKey,
    );
    if (existing) {
      if (
        existing.sourceRequest !== request.request ||
        (existing.repositoryId !== request.repositoryId &&
          request.repositoryId !== null)
      )
        throw new EngineeringDeliveryError(
          "IDEMPOTENCY_CONFLICT",
          "This delivery identity is already bound to another software request.",
        );
      return this.controlCenter(context.ownerId, context.companyId, existing.id);
    }
    const interpretation = this.interpret(
      request.request,
      request.projectName,
      Boolean(request.repositoryId),
    );
    const repository = request.repositoryId
      ? await this.requireRepository(context, request.repositoryId)
      : await this.initializeRepository(
          context,
          request.developmentRootWorkspaceId!,
          interpretation.projectName,
          interpretation.stack,
        );
    const acceptanceCriteria = [
      ...new Set([
        ...request.acceptanceCriteria,
        ...interpretation.features.map(
          (feature) => `${feature} is implemented and usable.`,
        ),
        ...(interpretation.stack.includes("React")
          ? ["The interface is responsive and preserves basic accessibility."]
          : []),
        "Configured lint, typecheck, tests, and build complete successfully.",
      ]),
    ].slice(0, 30);
    const objectiveView = await this.manager.create(context, {
      repositoryId: repository.id,
      title: interpretation.projectName,
      description: request.request,
      acceptanceCriteria,
      constraints: request.constraints,
      protectedAreas: repository.protectedPaths,
      priority: request.deadlineAt ? "HIGH" : "NORMAL",
      riskLevel: interpretation.complexity === "HIGH_RISK" ? "HIGH" : "MEDIUM",
      budget: null,
      deadlineAt: request.deadlineAt,
      maxParallelTasks:
        interpretation.complexity === "TRIVIAL" || interpretation.complexity === "SMALL"
          ? 3
          : interpretation.complexity === "MEDIUM"
            ? 4
            : 5,
    });
    const objective = objectiveView.objective;
    const at = this.now().toISOString();
    const implementationIds = objectiveView.tasks
      .filter(
        (task) =>
          !task.readOnly && !["TESTING", "INTEGRATION_PREP"].includes(task.taskType),
      )
      .map((task) => task.id);
    const featureWeight = Math.max(1, Math.floor(100 / interpretation.features.length));
    const delivery = EngineeringDeliverySchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      objectiveId: objective.id,
      repositoryId: repository.id,
      integrationRunId: null,
      candidateId: null,
      intent: interpretation.intent,
      projectMode: request.repositoryId ? "EXISTING" : "NEW",
      projectName: interpretation.projectName,
      sourceRequest: request.request,
      complexity: interpretation.complexity,
      stack: interpretation.stack,
      features: interpretation.features.map((name) => ({
        id: crypto.randomUUID(),
        name,
        acceptanceCriteria: acceptanceCriteria
          .filter((criterion) => criterion.toLowerCase().includes(name.toLowerCase()))
          .slice(0, 10),
        taskIds: implementationIds.slice(0, 10),
        weight: featureWeight,
        status: "PLANNING",
      })),
      status:
        objective.status === "NEEDS_CLARIFICATION"
          ? "OWNER_INPUT_REQUIRED"
          : "PLANNING",
      visibleMode: request.visibleMode,
      preview: null,
      validation: {
        lint: "WAITING",
        typecheck: "WAITING",
        tests: "WAITING",
        build: "WAITING",
        review: "WAITING",
      },
      filesChanged: [],
      modelUsage: [],
      warnings: [],
      instructionKeys: [request.idempotencyKey],
      planningStartedAt: at,
      firstCodeAt: null,
      firstPreviewAt: null,
      validatedAt: null,
      completedAt: null,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.save(delivery);
    await this.writeAudit(context, "ENGINEERING_DELIVERY_CREATED", delivery, {
      projectMode: delivery.projectMode,
      complexity: delivery.complexity,
    });
    if (delivery.status !== "OWNER_INPUT_REQUIRED")
      void this.drive(context, delivery.id).catch((error) =>
        this.fail(context, delivery.id, error),
      );
    return this.controlCenter(context.ownerId, context.companyId, delivery.id);
  }

  async drive(context: EngineeringDeliveryContext, deliveryId: string) {
    let delivery = await this.require(context.ownerId, context.companyId, deliveryId);
    if (["PAUSED", "CANCELLED", "OWNER_INPUT_REQUIRED"].includes(delivery.status))
      return this.controlCenter(context.ownerId, context.companyId, delivery.id);
    delivery = await this.update(delivery, { status: "IMPLEMENTING" });
    const objectiveView = await this.manager.runReady(
      context,
      delivery.objectiveId,
      `delivery-${delivery.id.slice(0, 8)}`,
    );
    if (objectiveView.objective.status !== "COMPLETED") {
      const status =
        objectiveView.objective.status === "NEEDS_CLARIFICATION"
          ? "OWNER_INPUT_REQUIRED"
          : objectiveView.objective.status === "PAUSED"
            ? "PAUSED"
            : objectiveView.objective.status === "CANCELLED"
              ? "CANCELLED"
              : "BLOCKED";
      await this.update(delivery, { status });
      if (["BLOCKED", "OWNER_INPUT_REQUIRED", "CANCELLED"].includes(status)) await this.notifyTerminal(context, delivery.id);
      return this.controlCenter(context.ownerId, context.companyId, delivery.id);
    }
    const integrationView = delivery.integrationRunId
      ? await this.integration.view(
          context.ownerId,
          context.companyId,
          delivery.integrationRunId,
        )
      : await this.integration.create(context, {
          objectiveId: delivery.objectiveId,
          idempotencyKey: `delivery-integration-${delivery.id}`,
        });
    delivery = await this.update(delivery, {
      status: "INTEGRATING",
      integrationRunId: integrationView.run.id,
    });
    let integrated = delivery.candidateId && integrationView.run.status === "READY" &&
      integrationView.candidate?.status === "READY"
      && integrationView.candidate.id === delivery.candidateId
      ? integrationView
      : await this.integration.execute(
          context,
          integrationView.run.id,
          `delivery-${delivery.id.slice(0, 8)}`,
        );
    for (let repairCycle = 0; integrated.run.status === "REPAIRING" && repairCycle < 3; repairCycle += 1) {
      const repaired = await this.manager.runReady(
        context,
        delivery.objectiveId,
        `delivery-repair-${delivery.id.slice(0, 8)}-${repairCycle}`,
      );
      if (repaired.objective.status !== "COMPLETED") {
        const status = repaired.objective.status === "NEEDS_CLARIFICATION"
          ? "OWNER_INPUT_REQUIRED" : "BLOCKED";
        await this.update(delivery, { status });
        await this.notifyTerminal(context, delivery.id);
        return this.controlCenter(context.ownerId, context.companyId, delivery.id);
      }
      integrated = await this.integration.execute(
        context,
        integrationView.run.id,
        `delivery-repair-${delivery.id.slice(0, 8)}-${repairCycle}`,
      );
    }
    if (
      integrated.run.status !== "READY" ||
      !integrated.candidate ||
      integrated.candidate.status !== "READY"
    ) {
      await this.update(delivery, {
        status: integrated.run.status === "BLOCKED" ? "BLOCKED" : "FAILED",
        warnings: [
          ...delivery.warnings,
          `Integration ended in ${integrated.run.status}.`,
        ].slice(0, 50),
      });
      await this.notifyTerminal(context, delivery.id);
      return this.controlCenter(context.ownerId, context.companyId, delivery.id);
    }
    const validationReport = await this.runtime.findValidation(
      context.ownerId,
      context.companyId,
      integrated.candidate.validationReportId,
    );
    const validationStatus = (kind: "LINT" | "TYPECHECK" | "TEST" | "BUILD") => {
      const step = validationReport?.steps.find((item) => item.kind === kind);
      return step?.status === "PASS" ? "PASS" as const
        : step?.status === "FAIL" || step?.status === "ERROR" ? "FAIL" as const
          : "NOT_CONFIGURED" as const;
    };
    delivery = await this.update(delivery, {
      status: "PREVIEWING",
      candidateId: integrated.candidate.id,
      filesChanged: integrated.candidate.filesChanged,
      validatedAt: this.now().toISOString(),
      validation: {
        lint: validationStatus("LINT"),
        typecheck: validationStatus("TYPECHECK"),
        tests: validationStatus("TEST"),
        build: validationStatus("BUILD"),
        review: integrated.reviews.some(
          (review) => review.verdict === "PASS_WITH_WARNINGS",
        )
          ? "PASS_WITH_WARNINGS"
          : "PASS",
      },
    });
    const repository = await this.requireRepository(context, delivery.repositoryId);
    const profile = await this.runtime.findCommandProfile(
      context.ownerId,
      context.companyId,
      repository.commandProfileId,
    );
    const agentId = await this.previewAgent(context, delivery, integrated.run.integrationWorkspaceId);
    let preview = null;
    const warnings = [...delivery.warnings];
    if (profile?.developmentServers[0] && agentId) {
      const previewId = delivery.preview?.previewId ?? crypto.randomUUID();
      const result = await this.gateway.invoke({
        ownerId: context.ownerId,
        companyId: context.companyId,
        repositoryId: repository.id,
        workspaceId: integrated.run.integrationWorkspaceId,
        taskId: delivery.objectiveId,
        agentId,
        capability: "repository.dev_server_start",
        operationInput: {
          previewId,
          serverId: profile.developmentServers[0].id,
          preferredPort: 4173,
        },
        signal: new AbortController().signal,
        transport: context,
      });
      preview = result.output as EngineeringDelivery["preview"];
      if (preview?.state !== "RUNNING" || preview.healthStatus !== "PASS") {
        delivery = await this.update(delivery, {
          status: "FAILED",
          preview,
          warnings: [...warnings, "Local preview did not pass its bounded health check."].slice(0, 50),
          completedAt: this.now().toISOString(),
        });
        await this.notifyTerminal(context, delivery.id);
        return this.controlCenter(context.ownerId, context.companyId, delivery.id);
      }
    } else
      warnings.push(
        "No registered development server profile is available for this repository.",
      );
    const doneAt = this.now().toISOString();
    delivery = await this.update(delivery, {
      status: warnings.length ? "DONE_WITH_WARNINGS" : "DONE",
      preview,
      warnings: warnings.slice(0, 50),
      firstPreviewAt: preview?.state === "RUNNING" ? doneAt : null,
      completedAt: doneAt,
    });
    const recordedCost = objectiveView.results.reduce(
      (sum, result) => sum + Number(result.costUsd),
      0,
    );
    const durationMinutes = Math.max(
      0,
      Math.round(
        (new Date(doneAt).getTime() - new Date(delivery.createdAt).getTime()) / 60_000,
      ),
    );
    const notificationTitle = [
      `${delivery.projectName} ${warnings.length ? "ready with warnings" : "ready"}`,
      `${delivery.filesChanged.length} files`,
      "validation PASS",
      `$${recordedCost.toFixed(4)}`,
      `${durationMinutes}m`,
      preview?.state === "RUNNING" ? preview.url : null,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 100);
    await this.notifications.dispatch({
      ownerId: context.ownerId,
      eventId: `engineering-delivery:${delivery.id}:${delivery.updatedAt}`,
      category: "IMPORTANT_OBJECTIVE_COMPLETED",
      severity: warnings.length ? "NORMAL" : "LOW",
      objectKind: "OBJECTIVE",
      objectId: delivery.id,
      stateVersion: delivery.updatedAt,
      title: notificationTitle,
    });
    await this.writeAudit(context, "ENGINEERING_DELIVERY_COMPLETED", delivery, {
      previewReady: preview?.state === "RUNNING",
      filesChanged: delivery.filesChanged.length,
    });
    await this.notifyTerminal(context, delivery.id);
    return this.controlCenter(context.ownerId, context.companyId, delivery.id);
  }

  async addInstruction(
    context: EngineeringDeliveryContext,
    deliveryId: string,
    body: unknown,
  ) {
    const input = AddEngineeringInstructionRequestSchema.parse(body);
    let delivery = await this.require(context.ownerId, context.companyId, deliveryId);
    if (delivery.instructionKeys.includes(input.idempotencyKey))
      return this.controlCenter(context.ownerId, context.companyId, delivery.id);
    if (["DONE", "DONE_WITH_WARNINGS", "CANCELLED", "FAILED"].includes(delivery.status))
      throw new EngineeringDeliveryError(
        "INVALID_STATE",
        "A terminal delivery cannot accept in-flight instructions. Start a new modification objective for this repository.",
      );
    const objectiveView = await this.manager.view(
      context.ownerId,
      context.companyId,
      delivery.objectiveId,
    );
    if (
      delivery.status === "OWNER_INPUT_REQUIRED" &&
      objectiveView.objective.clarification?.status === "PENDING"
    ) {
      await this.manager.answerClarification(
        context,
        delivery.objectiveId,
        objectiveView.objective.clarification.id,
        {
          answer: input.instruction,
          idempotencyKey: input.idempotencyKey,
        },
      );
    } else {
      await this.manager.addInstruction(
        context,
        delivery.objectiveId,
        input.instruction,
        input.idempotencyKey,
      );
    }
    delivery = await this.update(delivery, {
      status: "IMPLEMENTING",
      instructionKeys: [...delivery.instructionKeys, input.idempotencyKey].slice(
        0,
        100,
      ),
      completedAt: null,
    });
    void this.drive(context, delivery.id).catch((error) =>
      this.fail(context, delivery.id, error),
    );
    return this.controlCenter(context.ownerId, context.companyId, delivery.id);
  }

  async pause(context: EngineeringDeliveryContext, id: string) {
    const delivery = await this.require(context.ownerId, context.companyId, id);
    await this.manager.pause(context, delivery.objectiveId);
    await this.update(delivery, { status: "PAUSED" });
    return this.controlCenter(context.ownerId, context.companyId, id);
  }
  async resume(context: EngineeringDeliveryContext, id: string) {
    const delivery = await this.require(context.ownerId, context.companyId, id);
    const previewRecovery = ["FAILED", "DONE_WITH_WARNINGS"].includes(delivery.status) &&
      !!delivery.integrationRunId && !!delivery.candidateId && !!delivery.validatedAt
      ? await this.integration.view(context.ownerId, context.companyId, delivery.integrationRunId)
      : null;
    const recoverablePreviewFailure = previewRecovery?.run.status === "READY" &&
      previewRecovery.candidate?.status === "READY" &&
      previewRecovery.candidate.id === delivery.candidateId &&
      (delivery.status === "FAILED" || delivery.preview?.healthStatus === "FAIL" ||
        delivery.warnings.at(-1) === "Local preview did not pass its bounded health check.");
    const recoverableIntegrationFailure = delivery.status === "FAILED" &&
      !delivery.integrationRunId &&
      recoverableIntegrationWarnings.has(delivery.warnings.at(-1) ?? "");
    const recoverableExistingRunFailure = delivery.status === "FAILED" &&
      !!delivery.integrationRunId &&
      recoverableExistingRunWarnings.has(delivery.warnings.at(-1) ?? "");
    if (!["PAUSED", "BLOCKED"].includes(delivery.status) &&
        !recoverableIntegrationFailure && !recoverableExistingRunFailure &&
        !recoverablePreviewFailure)
      throw new EngineeringDeliveryError(
        "INVALID_STATE",
        "Only a paused or recoverable delivery can resume.",
      );
    if (recoverableIntegrationFailure || recoverableExistingRunFailure || recoverablePreviewFailure) {
      const view = await this.manager.view(context.ownerId, context.companyId, delivery.objectiveId);
      if (view.objective.status !== "COMPLETED" &&
          !(delivery.warnings.at(-1) === "Integration ended in REPAIRING." &&
            ["READY", "RUNNING"].includes(view.objective.status)))
        throw new EngineeringDeliveryError("INVALID_STATE", "The engineering objective is not complete.");
      if (recoverableExistingRunFailure && !recoverablePreviewFailure) {
        const integration = await this.integration.view(
          context.ownerId, context.companyId, delivery.integrationRunId!,
        );
        const conflictedRepair = delivery.warnings.at(-1) === "Integration ended in CONFLICTED." &&
          integration.run.status === "CONFLICTED" &&
          integration.run.repairCycles < integration.run.maxRepairCycles &&
          integration.run.repairTaskIds.length > 0 &&
          integration.run.conflicts.some((conflict) => conflict.status === "ESCALATED" &&
            conflict.taskIds.includes(integration.run.repairTaskIds.at(-1)!));
        if ((!conflictedRepair && !["FAILED", "REPAIRING"].includes(integration.run.status)) ||
            integration.run.objectiveId !== delivery.objectiveId ||
            integration.run.repositoryId !== delivery.repositoryId ||
            integration.candidate)
          throw new EngineeringDeliveryError("INVALID_STATE", "The failed integration run cannot be safely retried.");
        if (delivery.warnings.at(-1) === "Independent integration review requires changes.") {
          const review = integration.reviews.at(-1);
          if (!review || review.verdict !== "BLOCK" || review.providerId || review.modelId)
            throw new EngineeringDeliveryError("INVALID_STATE", "The independent review requires changes before retrying.");
        }
      }
    }
    await this.update(delivery, {
      status: "IMPLEMENTING",
      completedAt: null,
      warnings: recoverablePreviewFailure ? delivery.warnings.slice(0, -1) : delivery.warnings,
    });
    const continuation = recoverableIntegrationFailure || recoverableExistingRunFailure || recoverablePreviewFailure
      ? this.drive(context, id)
      : Promise.resolve().then(() => this.manager.resume(context, delivery.objectiveId))
          .then(() => this.drive(context, id));
    void continuation.catch((error) => this.fail(context, id, error));
    return this.controlCenter(context.ownerId, context.companyId, id);
  }
  async recover(context: EngineeringDeliveryContext, id: string) {
    const delivery = await this.require(context.ownerId, context.companyId, id);
    if (delivery.status !== "IMPLEMENTING")
      throw new EngineeringDeliveryError("INVALID_STATE", "Only a stalled implementation can be recovered.");
    const view = await this.manager.view(context.ownerId, context.companyId, delivery.objectiveId);
    if (!view.tasks.some((task) => task.status === "ACTIVE" && task.leaseExpiresAt && new Date(task.leaseExpiresAt).getTime() <= this.now().getTime()))
      throw new EngineeringDeliveryError("INVALID_STATE", "No expired engineering task lease is available for recovery.");
    void this.manager.recover(context, delivery.objectiveId)
      .then(() => this.drive(context, id))
      .catch((error) => this.fail(context, id, error));
    return this.controlCenter(context.ownerId, context.companyId, id);
  }
  async cancel(context: EngineeringDeliveryContext, id: string) {
    const delivery = await this.require(context.ownerId, context.companyId, id);
    await this.manager.cancel(context, delivery.objectiveId);
    if (delivery.preview?.previewId)
      await this.previewAction(context, delivery, "repository.dev_server_stop");
    await this.update(delivery, {
      status: "CANCELLED",
      completedAt: this.now().toISOString(),
    });
    await this.notifyTerminal(context, delivery.id);
    return this.controlCenter(context.ownerId, context.companyId, id);
  }

  async previewControl(
    context: EngineeringDeliveryContext,
    id: string,
    action: "status" | "restart" | "stop",
  ) {
    const delivery = await this.require(context.ownerId, context.companyId, id);
    if (!delivery.preview?.previewId)
      throw new EngineeringDeliveryError(
        "INVALID_STATE",
        "This delivery has no preview identity.",
      );
    const capability =
      action === "status"
        ? "repository.dev_server_status"
        : action === "restart"
          ? "repository.dev_server_restart"
          : "repository.dev_server_stop";
    const preview = await this.previewAction(context, delivery, capability);
    await this.update(delivery, { preview });
    return this.controlCenter(context.ownerId, context.companyId, id);
  }

  async startPreview(context: EngineeringDeliveryContext, id: string) {
    const delivery = await this.require(context.ownerId, context.companyId, id);
    if (!delivery.integrationRunId)
      throw new EngineeringDeliveryError("INVALID_STATE", "A validated integration workspace is required before starting preview.");
    if (delivery.preview?.previewId) return this.previewControl(context, id, "restart");
    const [integration, repository] = await Promise.all([
      this.integration.view(context.ownerId, context.companyId, delivery.integrationRunId),
      this.requireRepository(context, delivery.repositoryId),
    ]);
    const profile = await this.runtime.findCommandProfile(context.ownerId, context.companyId, repository.commandProfileId);
    const server = profile?.developmentServers[0];
    const agentId = await this.previewAgent(context, delivery, integration.run.integrationWorkspaceId);
    if (!server || !agentId)
      throw new EngineeringDeliveryError("INVALID_STATE", "A registered development server and authorized Mac Agent are required.");
    const result = await this.gateway.invoke({
      ownerId: context.ownerId, companyId: context.companyId, repositoryId: repository.id,
      workspaceId: integration.run.integrationWorkspaceId, taskId: delivery.objectiveId, agentId,
      capability: "repository.dev_server_start",
      operationInput: { previewId: crypto.randomUUID(), serverId: server.id, preferredPort: 4173 },
      signal: new AbortController().signal, transport: context,
    });
    const preview = result.output as NonNullable<EngineeringDelivery["preview"]>;
    if (preview.state !== "RUNNING" || preview.healthStatus !== "PASS" || !preview.url)
      throw new EngineeringDeliveryError("INVALID_STATE", "The development server did not pass its bounded health check.");
    await this.update(delivery, { preview, firstPreviewAt: this.now().toISOString() });
    return this.controlCenter(context.ownerId, context.companyId, id);
  }

  async controlCenter(ownerId: string, companyId: string, id: string) {
    const delivery = await this.require(ownerId, companyId, id);
    const view = await this.manager.view(ownerId, companyId, delivery.objectiveId);
    const features = delivery.features.map((feature) => {
      const tasks = feature.taskIds
        .map((taskId) => view.tasks.find((task) => task.id === taskId))
        .filter(Boolean);
      const statuses = tasks.map((task) => task!.status);
      const status =
        statuses.length && statuses.every((value) => value === "COMPLETE")
          ? "DONE"
          : statuses.some((value) => value === "ACTIVE")
            ? "IMPLEMENTING"
            : statuses.some((value) => ["BLOCKED", "FAILED"].includes(value))
              ? "BLOCKED"
              : statuses.some((value) => value === "REVIEWING")
                ? "REVIEWING"
                : "QUEUED";
      return { ...feature, status };
    });
    const usage = (["LUNA", "TERRA", "SOL", "ASTRA"] as EngineeringModelTier[]).map(
      (tier) => {
        const values = view.results.filter((result) => result.modelTier === tier);
        return {
          tier,
          calls: values.length,
          inputTokens: values.reduce((sum, value) => sum + value.inputTokens, 0),
          outputTokens: values.reduce((sum, value) => sum + value.outputTokens, 0),
          costUsd: money(values.reduce((sum, value) => sum + Number(value.costUsd), 0)),
        };
      },
    );
    const refreshed = EngineeringDeliverySchema.parse({
      ...delivery,
      status: delivery.status === "BLOCKED" && view.objective.status === "RUNNING" &&
        view.tasks.some((task) => ["ACTIVE", "REVIEWING"].includes(task.status))
        ? "IMPLEMENTING" : delivery.status,
      features,
      modelUsage: usage,
      firstCodeAt:
        delivery.firstCodeAt ??
        view.results.find((result) => result.filesChanged.length)?.completedAt ??
        null,
    });
    if (JSON.stringify(refreshed) !== JSON.stringify(delivery))
      await this.store.save(refreshed);
    const integrationFailureView = ["FAILED", "BLOCKED", "DONE_WITH_WARNINGS"].includes(refreshed.status) && refreshed.integrationRunId
      ? await this.integration.view(ownerId, companyId, refreshed.integrationRunId)
      : null;
    const escalatedConflict = integrationFailureView?.run.conflicts?.find(
      (conflict) => conflict.status === "ESCALATED");
    const recoverableRepairConflict = Boolean(escalatedConflict && integrationFailureView &&
      integrationFailureView.run.repairCycles < integrationFailureView.run.maxRepairCycles &&
      integrationFailureView.run.repairTaskIds.at(-1) &&
      escalatedConflict.taskIds.includes(integrationFailureView.run.repairTaskIds.at(-1)!));
    const latestReviewBlocker = integrationFailureView?.reviews?.filter(
      (review) => review.verdict === "BLOCK" || review.verdict === "CHANGES_REQUIRED")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.findings[0];
    const progress = view.tasks.length
      ? Math.round(
          (view.tasks.reduce(
            (sum, task) =>
              sum +
              (task.status === "COMPLETE"
                ? 1
                : task.status === "ACTIVE" || task.status === "REVIEWING"
                  ? 0.5
                  : 0),
            0,
          ) /
            view.tasks.length) *
            100,
        )
      : 0;
    return EngineeringControlCenterSchema.parse({
      delivery: refreshed,
      overallProgress: progress,
      recoveryAvailable: refreshed.status === "IMPLEMENTING" && view.tasks.some(
        (task) => task.status === "ACTIVE" && task.leaseExpiresAt &&
          new Date(task.leaseExpiresAt).getTime() <= this.now().getTime(),
      ),
      blocker: (() => {
        if (
          view.objective.status === "NEEDS_CLARIFICATION" &&
          view.objective.clarification?.status === "PENDING"
        )
          return {
            category: "OWNER_CLARIFICATION_REQUIRED",
            message: view.objective.clarification.question,
            action:
              "Answer this question in Add instruction. The same delivery will resume automatically.",
          };
        const blockedTasks = view.tasks.filter((item) => ["BLOCKED", "FAILED"].includes(item.status));
        const task = blockedTasks.find((item) => item.lastFailureCategory && item.lastFailureCategory !== "DEPENDENCY_NOT_READY") ?? blockedTasks[0];
        if (!task) {
          if (["FAILED", "DONE_WITH_WARNINGS"].includes(refreshed.status) &&
              (refreshed.status === "FAILED" || refreshed.preview?.healthStatus === "FAIL" ||
                refreshed.warnings.at(-1) === "Local preview did not pass its bounded health check.") &&
              refreshed.candidateId && refreshed.validatedAt &&
              integrationFailureView?.run.status === "READY" &&
              integrationFailureView.candidate?.status === "READY" &&
              integrationFailureView.candidate.id === refreshed.candidateId) return {
            category: "PREVIEW_FAILED",
            message: "The reviewed candidate is ready, but its local preview did not finish starting.",
            action: "Check the trusted Mac Agent and Docker Desktop, then Retry. The same validated candidate will be used; no code generation or merge is required.",
          };
          if (refreshed.status === "BLOCKED" && integrationFailureView?.run.status === "BLOCKED" &&
              integrationFailureView.run.repairCycles >= integrationFailureView.run.maxRepairCycles &&
              latestReviewBlocker) return {
            category: "REVIEW_CHANGES_REQUIRED",
            message: latestReviewBlocker.slice(0, 300),
            action: "The bounded repair limit is reached. Review the independent findings and start a new governed modification; this run cannot be retried or merged automatically.",
          };
          if (escalatedConflict) return {
            category: recoverableRepairConflict ? "MERGE_CONFLICT" : "MERGE_CONFLICT_REVIEW_REQUIRED",
            message: `The reviewed repair conflicts with existing changes in ${escalatedConflict.path}.`,
            action: recoverableRepairConflict
              ? "Retry creates a bounded repair from the reviewed integration head. The conflicting repair remains in the audit history; validation and independent review still apply."
              : "Automatic repair is not safely available. Review this integration conflict and its repair history before starting another governed change.",
          };
          if (refreshed.status === "FAILED" && refreshed.integrationRunId &&
              refreshed.warnings.at(-1) === "Integration ended in REPAIRING.") return {
            category: "INTEGRATION_REPAIR_PENDING",
            message: "The independent reviewer requested a bounded code repair.",
            action: "Retry resumes the existing repair task, then revalidates and reviews the same integration run.",
          };
          if (refreshed.status === "FAILED" && refreshed.integrationRunId &&
              refreshed.warnings.at(-1) === "The reviewed integration head changed before applying its scoped repair.") return {
            category: "INTEGRATION_REPAIR_PENDING",
            message: "A reviewed repair is ready to integrate from its recorded base commit.",
            action: "Retry this same run. The integration head and signed workspace will be checked again before applying the repair.",
          };
          if (refreshed.status === "FAILED" && refreshed.integrationRunId &&
              refreshed.warnings.at(-1) === "Independent integration review requires changes.") return {
            category: "MODEL_PROVIDER_UNAVAILABLE",
            message: latestReviewBlocker?.slice(0, 500) ?? "Independent integration review did not complete successfully.",
            action: "Resolve the review failure, then Retry this run. A completed review still requires its findings to be addressed.",
          };
          if (
            refreshed.status === "FAILED" && refreshed.integrationRunId &&
            refreshed.warnings.at(-1) === recoverableIntegrationScopeWarning
          ) return {
            category: "INTEGRATION_SCOPE_MISMATCH",
            message: "The integration worktree's signed agent scope did not match the operation.",
            action: "Retry this same run after the agent binding is repaired. The signed scope check remains enforced.",
          };
          if (
            refreshed.status === "FAILED" && refreshed.integrationRunId &&
            refreshed.warnings.at(-1) === recoverableReviewWarning
          ) return {
            category: "REVIEWER_UNAVAILABLE",
            message: "No independent repository-authorized reviewer could be selected.",
            action: "Retry this same run after a separate review agent is available. Authors cannot review their own changes.",
          };
          if (
            ["FAILED", "BLOCKED"].includes(refreshed.status) &&
            !refreshed.integrationRunId &&
            [
              "Governed dependency preparation failed. Check the package lockfile and reviewed dependency container before retrying.",
              "The dependency container exited unexpectedly. Check Docker Desktop resources, then retry this same run.",
            ].includes(refreshed.warnings.at(-1) ?? "")
          ) return {
            category: "DEPENDENCY_PREPARATION_FAILED",
            message: "The isolated integration workspace could not finish preparing dependencies.",
            action: "Check Docker Desktop and available memory, then Retry this same run. Its completed tasks remain intact.",
          };
          if (
            ["FAILED", "BLOCKED"].includes(refreshed.status) &&
            !refreshed.integrationRunId &&
            refreshed.warnings.at(-1) === "Source workspace changes differ from the completed task result."
          ) return {
            category: "INTEGRATION_EVIDENCE_MISMATCH",
            message: "An isolated worktree contains changes outside its completed task result.",
            action: "Check the changed-file evidence in that worktree, then Retry this same run. Completed tasks are preserved.",
          };
          return null;
        }
        if (task.lastFailureCategory === "ENVIRONMENT_FAILURE" &&
            task.lastFailureSummary === "The dependency container exited unexpectedly. Check Docker Desktop resources, then retry this same run.")
          return {
            category: "DEPENDENCY_PREPARATION_FAILED",
            message: task.lastFailureSummary,
            action: "Check the trusted agent heartbeat and Docker Desktop, then Retry this same run. Validation remains offline and sandboxed.",
          };
        switch (task.lastFailureCategory) {
          case "MISSING_CAPABILITY":
            return { category: "CAPABILITY_UNAVAILABLE", message: task.lastFailureSummary ?? "A required engineering capability or eligible agent is unavailable.", action: "Retry rechecks the registered workforce and repository permissions. It preserves completed tasks and does not grant new capabilities." };
          case "POLICY_DENIED":
            return { category: "POLICY_APPROVAL_REQUIRED", message: task.lastFailureSummary ?? "Governance did not permit this change.", action: "Open Approvals and review this project's pending operation. After approval, Retry the same run; all permissions are checked again." };
          case "MODEL_FAILURE":
            if (/^Budget policy [0-9a-f-]+ would be exceeded\.$/i.test(task.lastFailureSummary ?? "") ||
                task.lastFailureSummary === "The engineering task budget is exhausted.")
              return {
                category: "BUDGET_EXCEEDED",
                message: "The configured AI budget would be exceeded by the next model call.",
                action: "Review the AI budget policy or wait for its reset. Retry this same run after funding is available; completed work is preserved.",
              };
            return {
              category: "MODEL_PROVIDER_UNAVAILABLE",
              message:
                task.lastFailureSummary ?? "No eligible model completed this task.",
              action:
                "Resolve the displayed model-provider error, then Retry this run. Existing task and workspace state will be preserved.",
            };
          case "AMBIGUOUS_REQUIREMENT":
          case "MISSING_CONTEXT":
            return { category: "OWNER_CLARIFICATION_REQUIRED", message: "The task needs more project context or a clearer requirement.", action: "Clarify the requested change in the project session, then retry." };
          case "CONFLICT":
            return { category: "MERGE_CONFLICT", message: "The proposed change conflicts with the current project state.", action: "Review the conflicting files and integration candidate before retrying." };
          case "TEST_FAILURE":
          case "TYPE_ERROR":
          case "BUILD_FAILURE":
            return { category: "VALIDATION_FAILURE", message: task.lastFailureSummary?.slice(0, 300) ?? "Project validation failed.", action: "Inspect the affected file and validation report, then retry the same run. Completed work is preserved." };
          case "ENVIRONMENT_FAILURE":
            return { category: "DEVICE_OFFLINE", message: "The trusted engineering environment could not complete the task.", action: "Check Mac Agent connectivity and project access, then retry." };
          default:
            return { category: "CAPABILITY_UNAVAILABLE", message: "The task stopped before a safe change could complete.", action: "Review the run activity and Engineering configuration before retrying." };
        }
      })(),
      activeAgents: view.tasks
        .filter(
          (task) =>
            ["ACTIVE", "REVIEWING"].includes(task.status) && task.assignedAgentId,
        )
        .slice(0, 6)
        .map((task) => ({
          agentId: task.assignedAgentId!,
          role: task.assignedRole,
          taskId: task.id,
          taskTitle: task.title,
          status: task.status,
          modelTier: task.modelPolicy.currentTier,
          workspaceId: task.workspaceId,
          elapsedMs: task.startedAt
            ? Math.max(0, this.now().getTime() - new Date(task.startedAt).getTime())
            : 0,
          attempt: task.attempt,
        })),
      completedTasks: view.tasks.filter((task) => task.status === "COMPLETE").length,
      blockedTasks: view.tasks.filter((task) =>
        ["BLOCKED", "FAILED"].includes(task.status),
      ).length,
      totalTasks: view.tasks.length,
      timeline: view.events.slice(-200).map((event) => ({
        id: event.id,
        at: event.createdAt,
        type: event.type,
        summary: event.summary,
      })),
      elapsedMs: Math.max(
        0,
        this.now().getTime() - new Date(delivery.createdAt).getTime(),
      ),
    });
  }

  list(ownerId: string, companyId: string) {
    return this.store.list(ownerId, companyId, 100);
  }
  async projects(ownerId: string, companyId: string) {
    const records = await this.store.list(ownerId, companyId, 500);
    const byRepo = new Map<string, EngineeringDelivery>();
    for (const item of records)
      if (!byRepo.has(item.repositoryId)) byRepo.set(item.repositoryId, item);
    const repositories = await this.runtime.listRepositories(ownerId, companyId);
    return repositories
      .filter((repository) => repository.status === "ACTIVE")
      .map((repository) => {
        const latest = byRepo.get(repository.id);
        return EngineeringProjectRegistryEntrySchema.parse({
          repositoryId: repository.id,
          companyId: repository.companyId,
          repositoryName: repository.displayName,
          projectName: latest?.projectName ?? repository.displayName,
          stack: latest?.stack.length
            ? latest.stack
            : [...new Set([
                ...repository.metadata.frameworks,
                ...repository.metadata.languages,
              ])].slice(0, 20),
          defaultBranch: repository.defaultBranch,
          repositoryStatus: repository.status,
          latestDeliveryId: latest?.id ?? null,
          status: latest?.status ?? null,
          preview: latest?.preview ?? null,
          lastModifiedAt: latest?.updatedAt ?? repository.updatedAt,
        });
      });
  }

  private async initializeRepository(
    context: EngineeringDeliveryContext,
    rootId: string,
    projectName: string,
    stack: string[],
  ) {
    const root = await this.registry.getWorkspace(context.ownerId, rootId);
    if (
      !root.enabled ||
      !root.permissions.write ||
      !root.permissions.createFile ||
      !root.permissions.modifyFile ||
      !root.permissions.runScripts ||
      !root.gitPermissions.createBranch ||
      !root.gitPermissions.commit
    )
      throw new EngineeringDeliveryError(
        "DEVELOPMENT_ROOT_DENIED",
        "The registered development root lacks explicit project creation permissions.",
      );
    const projectSlug = slug(projectName);
    const workspaceId = `eng-${createHash("sha256").update(`${context.companyId}:${projectSlug}`).digest("hex").slice(0, 24)}`;
    const target = path.join(root.rootPath, projectSlug);
    const existingWorkspace = (
      await this.registry.listWorkspaces(context.ownerId)
    ).find((item) => item.id === workspaceId);
    if (!existingWorkspace)
      await this.registry.createWorkspace(context.ownerId, {
        id: workspaceId,
        displayName: projectName,
        rootPath: target,
        enabled: true,
        permissions: {
          read: true,
          write: true,
          createFile: true,
          modifyFile: true,
          moveFile: false,
          deleteFile: false,
          runScripts: true,
        },
        blockedPatterns: root.blockedPatterns,
        allowedScripts: [],
        gitPermissions: {
          status: true,
          diff: true,
          createBranch: true,
          commit: true,
          push: false,
        },
      });
    const agents = await this.authorizedAgents(context);
    const existingRepositories = (
      await this.runtime.listRepositories(context.ownerId, context.companyId)
    ).filter((item) => item.workspaceLocatorId === workspaceId);
    if (existingRepositories.length > 1)
      throw new EngineeringDeliveryError(
        "INVALID_STATE",
        "Multiple engineering repositories are bound to the same governed workspace.",
      );
    let repository = existingRepositories[0];
    if (repository) {
      if (
        repository.status !== "INITIALIZING" ||
        repository.displayName !== projectName
      )
        throw new EngineeringDeliveryError(
          "INVALID_STATE",
          "The derived project destination is already registered. Select it as an existing repository.",
        );
      const profile = await this.runtime.findCommandProfile(
        context.ownerId,
        context.companyId,
        repository.commandProfileId,
      );
      const expectsReact = stack.includes("React");
      const hasReactPreview = Boolean(
        profile?.developmentServers.some((server) => server.id === "vite"),
      );
      if (!profile || profile.status !== "ACTIVE" || expectsReact !== hasReactPreview)
        throw new EngineeringDeliveryError(
          "INVALID_STATE",
          "The initializing project no longer matches the requested reviewed template.",
        );
    }
    const agentId = repository
      ? repository.authorizedAgentIds.find((id) => agents.includes(id))
      : agents[0];
    if (!agentId)
      throw new EngineeringDeliveryError(
        "INVALID_STATE",
        "No company-scoped engineering agent is available.",
      );
    if (!repository) {
      const id = crypto.randomUUID();
      const profileId = `delivery-${id.replaceAll("-", "").slice(0, 24)}`;
      const at = this.now().toISOString();
      await this.runtime.saveCommandProfile(
        EngineeringCommandProfileSchema.parse({
          schemaVersion: "1",
          id: profileId,
          ownerId: context.ownerId,
          companyId: context.companyId,
          displayName: `${projectName} autonomous delivery`,
          commands: [
            ...(stack.includes("React") ? [{
              id: "lint",
              executable: "pnpm",
              args: ["run", "lint"],
              kind: "LINT",
              timeoutMs: 120_000,
              maxOutputBytes: 262_144,
              networkPolicy: "DENY",
            }] : []),
            {
              id: "typecheck",
              executable: "pnpm",
              args: ["run", "typecheck"],
              kind: "TYPECHECK",
              timeoutMs: 120_000,
              maxOutputBytes: 262_144,
              networkPolicy: "DENY",
            },
            {
              id: "test",
              executable: "pnpm",
              args: ["run", "test"],
              kind: "TEST",
              timeoutMs: 180_000,
              maxOutputBytes: 262_144,
              networkPolicy: "DENY",
            },
            {
              id: "build",
              executable: "pnpm",
              args: ["run", "build"],
              kind: "BUILD",
              timeoutMs: 180_000,
              maxOutputBytes: 524_288,
              networkPolicy: "DENY",
            },
          ],
          validationOrder: stack.includes("React")
            ? ["lint", "typecheck", "test", "build"]
            : ["typecheck", "test", "build"],
          dependencyManager: "pnpm",
          developmentServers: stack.includes("React")
            ? [
                {
                  id: "vite",
                  executable: "pnpm",
                  args: ["run", "dev"],
                  portFlag: "--port",
                  hostFlag: "--host",
                  healthPath: "/",
                  startupTimeoutMs: 60_000,
                  maxLifetimeMs: 8 * 60 * 60_000,
                },
              ]
            : [],
          status: "ACTIVE",
          createdAt: at,
          updatedAt: at,
        }),
      );
      repository = EngineeringRepositorySchema.parse({
        schemaVersion: "1",
        id,
        ownerId: context.ownerId,
        companyId: context.companyId,
        displayName: projectName,
        workspaceLocatorId: workspaceId,
        defaultBranch: "main",
        protectedBranches: ["main"],
        protectedPaths: [".git", ".env", ".env.*"],
        generatedPaths: ["dist/**"],
        commandProfileId: profileId,
        capabilityProfileId: "engineering-autonomous-v1",
        authorizedAgentIds: agents.slice(0, 100),
        metadata: {
          languages: [],
          packageManagers: [],
          frameworks: [],
          importantFiles: [],
          contractBindings: [],
        },
        status: "INITIALIZING",
        createdAt: at,
        updatedAt: at,
      });
      await this.runtime.saveRepository(repository);
    }
    const initialized = await this.gateway.initializeProject({
      ownerId: context.ownerId,
      companyId: context.companyId,
      repositoryId: repository.id,
      agentId,
      template: stack.includes("React") ? "REACT_VITE_TYPESCRIPT" : "EMPTY_TYPESCRIPT",
      projectSlug,
      defaultBranch: "main",
      transport: context,
    });
    const inspection = initialized.output as {
      metadata?: unknown;
      branch?: string;
      dirty?: boolean;
    };
    if (!inspection.metadata || inspection.branch !== "main" || inspection.dirty)
      throw new EngineeringDeliveryError(
        "INVALID_STATE",
        "Initialized project did not return a clean registered repository.",
      );
    repository = EngineeringRepositorySchema.parse({
      ...repository,
      metadata: inspection.metadata,
      status: "ACTIVE",
      updatedAt: this.now().toISOString(),
    });
    await this.runtime.saveRepository(repository);
    return repository;
  }

  private async previewAgent(context: EngineeringDeliveryContext, delivery: EngineeringDelivery, workspaceId: string) {
    const [workspace, repository] = await Promise.all([
      this.runtime.findWorkspace(context.ownerId, context.companyId, workspaceId),
      this.requireRepository(context, delivery.repositoryId),
    ]);
    if (!workspace || !workspace.agentId || workspace.repositoryId !== delivery.repositoryId ||
        workspace.taskId !== delivery.objectiveId ||
        !repository.authorizedAgentIds.includes(workspace.agentId))
      throw new EngineeringDeliveryError("INVALID_STATE", "The preview workspace has no matching authorized agent.");
    return workspace.agentId;
  }

  private async previewAction(
    context: EngineeringDeliveryContext,
    delivery: EngineeringDelivery,
    capability:
      | "repository.dev_server_status"
      | "repository.dev_server_restart"
      | "repository.dev_server_stop",
  ) {
    if (!delivery.integrationRunId || !delivery.preview?.previewId)
      throw new EngineeringDeliveryError(
        "INVALID_STATE",
        "Preview scope is unavailable.",
      );
    const [view, repository] = await Promise.all([
      this.integration.view(
        context.ownerId,
        context.companyId,
        delivery.integrationRunId,
      ),
      this.requireRepository(context, delivery.repositoryId),
    ]);
    const agentId = await this.previewAgent(context, delivery, view.run.integrationWorkspaceId);
    if (!agentId)
      throw new EngineeringDeliveryError(
        "INVALID_STATE",
        "No preview agent is authorized.",
      );
    const result = await this.gateway.invoke({
      ownerId: context.ownerId,
      companyId: context.companyId,
      repositoryId: repository.id,
      workspaceId: view.run.integrationWorkspaceId,
      taskId: delivery.objectiveId,
      agentId,
      capability,
      operationInput: {
        previewId: delivery.preview.previewId,
        ...(capability === "repository.dev_server_restart"
          ? {
              serverId: delivery.preview.serverId,
              preferredPort: delivery.preview.port,
            }
          : {}),
      },
      signal: new AbortController().signal,
      transport: context,
    });
    return result.output as NonNullable<EngineeringDelivery["preview"]>;
  }

  private interpret(text: string, name: string | null, existing: boolean) {
    const lower = text.toLowerCase();
    const intent = existing
      ? /\bfix|repair|broken|bug\b/.test(lower)
        ? "FIX_SOFTWARE"
        : "MODIFY_SOFTWARE"
      : "BUILD_SOFTWARE";
    const complexity =
      /auth|authorization|payment|billing|tenant|security|migration/.test(lower)
        ? "HIGH_RISK"
        : /platform|marketplace|microservice|multi-tenant/.test(lower)
          ? "LARGE"
          : /dashboard|database|api|crud|persist/.test(lower)
            ? "MEDIUM"
            : /website|landing|portfolio|site/.test(lower)
              ? "SMALL"
              : "TRIVIAL";
    const candidates: Array<[RegExp, string]> = [
      [/hero|landing/, "Hero"],
      [/navigation|navbar|menu/, "Navigation"],
      [/feature/, "Features"],
      [/pricing/, "Pricing"],
      [/testimonial/, "Testimonials"],
      [/faq/, "FAQ"],
      [/contact/, "Contact"],
      [/trainer|team|profile/, "Profiles"],
      [/dark/, "Dark design"],
      [/setting/, "Settings"],
      [/auth|login|sign[ -]?in/, "Authentication"],
      [/dashboard/, "Dashboard"],
    ];
    const features = candidates
      .filter(([pattern]) => pattern.test(lower))
      .map(([, feature]) => feature);
    if (!features.length) features.push("Requested implementation");
    const stack = /website|landing|portfolio|frontend|react|page|dashboard/.test(lower)
      ? ["React", "Vite", "TypeScript"]
      : ["TypeScript"];
    const inferredName =
      name ??
      text.match(/(?:build|create|make)(?: me)? (?:a|an|the)?\s*([^,.]{3,60})/i)?.[1] ??
      (existing ? "Software modification" : "Software project");
    return {
      intent,
      complexity,
      features: [...new Set(features)],
      stack,
      projectName: inferredName.trim().slice(0, 100),
    } as const;
  }

  private async update(
    delivery: EngineeringDelivery,
    patch: Partial<EngineeringDelivery>,
  ) {
    const updated = EngineeringDeliverySchema.parse({
      ...delivery,
      ...patch,
      updatedAt: this.now().toISOString(),
    });
    await this.store.save(updated);
    return updated;
  }
  private async fail(context: EngineeringDeliveryContext, id: string, error: unknown) {
    const delivery = await this.require(context.ownerId, context.companyId, id).catch(
      () => null,
    );
    if (!delivery || terminal.has(delivery.status)) return;
    await this.update(delivery, {
      status: "FAILED",
      warnings: [
        ...delivery.warnings,
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Unknown autonomous delivery failure.",
      ].slice(0, 50),
      completedAt: this.now().toISOString(),
    });
    await this.notifyTerminal(context, delivery.id);
  }
  private async require(ownerId: string, companyId: string, id: string) {
    const delivery = await this.store.find(ownerId, companyId, id);
    if (!delivery)
      throw new EngineeringDeliveryError(
        "DELIVERY_NOT_FOUND",
        "Engineering delivery was not found in this company scope.",
      );
    return delivery;
  }
  private async requireRepository(
    context: Pick<EngineeringDeliveryContext, "ownerId" | "companyId">,
    id: string,
  ) {
    const repository = await this.runtime.findRepository(
      context.ownerId,
      context.companyId,
      id,
    );
    if (!repository || repository.status !== "ACTIVE")
      throw new EngineeringDeliveryError(
        "INVALID_STATE",
        "The engineering repository is not active in this company scope.",
      );
    return repository;
  }
  private writeAudit(
    context: EngineeringDeliveryContext,
    eventType: "ENGINEERING_DELIVERY_CREATED" | "ENGINEERING_DELIVERY_COMPLETED",
    delivery: EngineeringDelivery,
    metadata: Record<string, unknown>,
  ) {
    return this.audit({
      eventType,
      ownerId: context.ownerId,
      ipAddress: context.ipAddress,
      outcome: "SUCCESS",
      reason:
        eventType === "ENGINEERING_DELIVERY_CREATED"
          ? "Autonomous engineering delivery accepted."
          : "Autonomous engineering delivery completed with verified state.",
      requestId: context.requestId,
      metadata: {
        companyId: context.companyId,
        deliveryId: delivery.id,
        objectiveId: delivery.objectiveId,
        repositoryId: delivery.repositoryId,
        ...metadata,
      },
    });
  }
}

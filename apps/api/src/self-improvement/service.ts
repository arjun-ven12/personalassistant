import {
  AnswerEngineeringClarificationRequestSchema,
  AddEngineeringInstructionRequestSchema,
  CreateSelfImprovementRequestSchema,
  RejectSelfImprovementCandidateRequestSchema,
  SelfImprovementViewSchema,
  type SelfImprovementView,
} from "@alexa-control/shared";

import type { EngineeringDeliveryContext, EngineeringDeliveryService } from "../engineering-delivery/service.js";
import type { EngineeringManagerService } from "../engineering-orchestration/service.js";
import type { EngineeringIntegrationService } from "../engineering-integration/service.js";
import type { EngineeringRuntimeStore } from "../engineering-runtime/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { UnitOfWork } from "../persistence/unit-of-work.js";
import { classifySelfImprovement, escalateSelfImprovementPaths } from "./policy.js";

export class SelfImprovementError extends Error {
  readonly statusCode: number;
  constructor(readonly code: "REPOSITORY_UNAVAILABLE" | "NOT_FOUND" | "RISK_ESCALATION", message: string) {
    super(message);
    this.name = "SelfImprovementError";
    this.statusCode = code === "NOT_FOUND" ? 404 : code === "REPOSITORY_UNAVAILABLE" ? 403 : 409;
  }
}

export type SelfImprovementRepositoryResolver = (ownerId: string, companyId: string) => Promise<string | null>;
const creationLocks = new Map<string, Promise<void>>();

/** A server-owned facade over the existing durable delivery, manager, and integration records. */
export class SelfImprovementService {
  #transaction?: UnitOfWork;
  setTransaction(transaction: UnitOfWork) { this.#transaction = transaction; }
  constructor(
    readonly delivery: EngineeringDeliveryService,
    readonly manager: EngineeringManagerService,
    readonly integration: EngineeringIntegrationService,
    readonly runtime: EngineeringRuntimeStore,
    readonly resolveRepository: SelfImprovementRepositoryResolver,
    readonly audit: GovernanceAuditWriter,
  ) {}

  async create(context: EngineeringDeliveryContext, body: unknown): Promise<SelfImprovementView> {
    const request = CreateSelfImprovementRequestSchema.parse(body);
    const key = `self-improvement:${context.ownerId}:${context.companyId}`;
    const createAtomic = async () => {
    const repositoryId = await this.resolveRepository(context.ownerId, context.companyId);
    const repository = repositoryId
      ? await this.runtime.findRepository(context.ownerId, context.companyId, repositoryId)
      : undefined;
    if (!repository || repository.status !== "ACTIVE" || repository.ownerId !== context.ownerId || repository.companyId !== context.companyId)
      throw new SelfImprovementError("REPOSITORY_UNAVAILABLE", "No active owner-scoped Athena repository is registered for this company.");
    const decision = classifySelfImprovement(request.request, request.acceptanceCriteria, repository.protectedPaths);
    const requestDigest = createHash("sha256").update(JSON.stringify([request.request, request.acceptanceCriteria])).digest("hex");
    const existing = await this.delivery.store.findByIdempotencyKey(context.ownerId, context.companyId, request.idempotencyKey);
    const center = await this.delivery.create(context, {
      request: request.request,
      repositoryId: repository.id,
      acceptanceCriteria: request.acceptanceCriteria,
      idempotencyKey: request.idempotencyKey,
      visibleMode: false,
    }, { selfImprovement: {
      riskLevel: decision.riskLevel,
      engineeringMode: decision.engineeringMode,
      targetAreas: decision.targetAreas,
      requestDigest,
    }, deferDrive: true });
    return { id: center.delivery.id, created: !existing && center.delivery.status !== "OWNER_INPUT_REQUIRED" };
    };
    let result: { id: string; created: boolean };
    if (this.#transaction) result = await this.#transaction(key, createAtomic);
    else {
      const prior = creationLocks.get(key) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const queued = prior.then(() => gate);
      creationLocks.set(key, queued);
      await prior;
      try { result = await createAtomic(); }
      finally { release(); if (creationLocks.get(key) === queued) creationLocks.delete(key); }
    }
    if (result.created) this.delivery.start(context, result.id);
    return this.view(context.ownerId, context.companyId, result.id);
  }

  async view(ownerId: string, companyId: string, deliveryId: string): Promise<SelfImprovementView> {
    const center = await this.delivery.controlCenter(ownerId, companyId, deliveryId);
    const record = center.delivery;
    if (record.intent !== "SELF_IMPROVEMENT" || !record.selfImprovement)
      throw new SelfImprovementError("NOT_FOUND", "Self-improvement objective was not found in this company scope.");
    if (await this.resolveRepository(ownerId, companyId) !== record.repositoryId)
      throw new SelfImprovementError("REPOSITORY_UNAVAILABLE", "The self-improvement objective is no longer bound to the configured Athena repository.");
    const repository = await this.runtime.findRepository(ownerId, companyId, record.repositoryId);
    if (!repository || repository.status !== "ACTIVE")
      throw new SelfImprovementError("REPOSITORY_UNAVAILABLE", "The registered Athena repository is unavailable.");
    const [objectiveView, integration] = await Promise.all([
      this.manager.view(ownerId, companyId, record.objectiveId),
      record.integrationRunId
        ? this.integration.view(ownerId, companyId, record.integrationRunId)
        : Promise.resolve(null),
    ]);
    const changed = integration?.candidate?.filesChanged ?? record.filesChanged;
    const decision = escalateSelfImprovementPaths({
      ...record.selfImprovement,
      requiresOwnerApproval: record.selfImprovement.riskLevel === "HIGH",
    }, changed, repository.protectedPaths);
    const requiredSecurityReview = decision.riskLevel === "HIGH";
    const candidate = integration?.candidate;
    const validation = candidate
      ? await this.runtime.findValidation(ownerId, companyId, candidate.validationReportId)
      : undefined;
    const missingSecurityReview = Boolean(candidate?.status === "READY" && requiredSecurityReview &&
      (!integration?.run.securityReviewRequired || !candidate.securityReviewId));
    return SelfImprovementViewSchema.parse({
      objectiveId: record.objectiveId,
      deliveryId: record.id,
      repositoryId: record.repositoryId,
      riskLevel: decision.riskLevel,
      engineeringMode: decision.engineeringMode,
      complexity: decision.riskLevel === "HIGH" ? "HIGH_RISK" : record.complexity,
      status: missingSecurityReview || candidate?.status === "BLOCKED" ? "BLOCKED" : record.status,
      requiresOwnerApproval: decision.requiresOwnerApproval,
      trainingEligible: Boolean(candidate?.status === "MERGED" && !missingSecurityReview &&
        candidate.headCommit === candidate.validatedHeadCommit &&
        candidate.headCommit === candidate.reviewedHeadCommit &&
        candidate.mergedHeadCommit === candidate.headCommit &&
        validation?.status === "PASS" && validation.workspaceId === candidate.integrationWorkspaceId &&
        integration?.reviews.some((review) => review.id === candidate.reviewReportId &&
          review.headCommit === candidate.headCommit &&
          ["PASS", "PASS_WITH_WARNINGS"].includes(review.verdict)) &&
        (!requiredSecurityReview || integration?.reviews.some((review) => review.id === candidate.securityReviewId &&
          review.headCommit === candidate.headCommit &&
          ["PASS", "PASS_WITH_WARNINGS"].includes(review.verdict)))),
      controlCenter: center,
      objective: objectiveView.objective,
      integration,
    });
  }

  async list(ownerId: string, companyId: string): Promise<SelfImprovementView[]> {
    const records = await this.delivery.list(ownerId, companyId);
    return Promise.all(records.filter((record) => record.intent === "SELF_IMPROVEMENT")
      .map((record) => this.view(ownerId, companyId, record.id)));
  }

  private async scoped(context: EngineeringDeliveryContext, id: string) {
    return this.view(context.ownerId, context.companyId, id);
  }

  async pause(context: EngineeringDeliveryContext, id: string) {
    await this.scoped(context, id);
    await this.delivery.pause(context, id);
    return this.scoped(context, id);
  }
  async resume(context: EngineeringDeliveryContext, id: string) {
    await this.scoped(context, id);
    await this.delivery.resume(context, id);
    return this.scoped(context, id);
  }
  async recover(context: EngineeringDeliveryContext, id: string) {
    await this.scoped(context, id);
    await this.delivery.recover(context, id);
    return this.scoped(context, id);
  }
  async cancel(context: EngineeringDeliveryContext, id: string) {
    const current = await this.scoped(context, id);
    if (current.integration?.candidate?.status === "READY")
      await this.integration.rejectCandidate(context, current.integration.run.id, null);
    else if (current.integration && !["READY", "CANCELLED"].includes(current.integration.run.status))
      await this.integration.cancel(context, current.integration.run.id);
    await this.delivery.cancel(context, id);
    return this.scoped(context, id);
  }
  async addInstruction(context: EngineeringDeliveryContext, id: string, body: unknown) {
    const existing = await this.scoped(context, id);
    const input = AddEngineeringInstructionRequestSchema.parse(body);
    const instruction = input.instruction;
    const repository = await this.runtime.findRepository(context.ownerId, context.companyId, existing.repositoryId);
    if (!repository) throw new SelfImprovementError("REPOSITORY_UNAVAILABLE", "The registered Athena repository is unavailable.");
    const delta = classifySelfImprovement(instruction, [], repository.protectedPaths);
    const levels = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
    if (levels[delta.riskLevel] > levels[existing.riskLevel] ||
        (delta.engineeringMode === "FULL" && existing.engineeringMode === "FAST"))
      throw new SelfImprovementError("RISK_ESCALATION", "This instruction expands the risk or scope; submit it as a separate self-improvement objective.");
    await this.delivery.addInstruction(context, id, body);
    return this.scoped(context, id);
  }
  async answerClarification(context: EngineeringDeliveryContext, id: string, body: unknown) {
    const current = await this.scoped(context, id);
    if (current.objective.clarification?.status !== "PENDING")
      throw new SelfImprovementError("RISK_ESCALATION", "No owner clarification is pending for this objective.");
    const input = AnswerEngineeringClarificationRequestSchema.parse(body);
    const repository = await this.runtime.findRepository(context.ownerId, context.companyId, current.repositoryId);
    if (!repository) throw new SelfImprovementError("REPOSITORY_UNAVAILABLE", "The registered Athena repository is unavailable.");
    if (classifySelfImprovement(input.answer, [], repository.protectedPaths).riskLevel === "HIGH" && current.riskLevel !== "HIGH")
      throw new SelfImprovementError("RISK_ESCALATION", "Clarification increases the authority risk; submit a separate high-risk objective.");
    await this.delivery.addInstruction(context, id, { instruction: input.answer, idempotencyKey: input.idempotencyKey });
    return this.scoped(context, id);
  }
  async reject(context: EngineeringDeliveryContext, id: string, body: unknown) {
    const current = await this.scoped(context, id);
    const { reason } = RejectSelfImprovementCandidateRequestSchema.parse(body);
    const runId = current.integration?.run.id;
    if (!runId || current.integration?.candidate?.status !== "READY")
      throw new SelfImprovementError("RISK_ESCALATION", "A READY self-improvement candidate is required for rejection.");
    await this.integration.rejectCandidate(context, runId, reason);
    return this.scoped(context, id);
  }
}
import { createHash } from "node:crypto";

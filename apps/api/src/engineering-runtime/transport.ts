import {
  EngineeringCommandDefinitionSchema,
  type EngineeringTransportRequest,
} from "@alexa-control/shared";

import type { EngineeringExecutionScopeVerifier } from "../execution/service.js";
import type { EngineeringRuntimeStore } from "./store.js";
import type { EngineeringIntegrationStore } from "../engineering-integration/store.js";
import type { ApprovalService } from "../governance/approval-service.js";
import { engineeringMergeAction } from "../engineering-integration/merge-action.js";

/**
 * Revalidates every scope field immediately before the existing signed
 * execution service persists and signs an engineering request.
 */
export class EngineeringTransportScopeVerifier implements EngineeringExecutionScopeVerifier {
  constructor(
    readonly store: EngineeringRuntimeStore,
    readonly integrationStore?: EngineeringIntegrationStore,
    readonly approvals?: ApprovalService,
  ) {}

  async verify(input: { ownerId: string; request: EngineeringTransportRequest }) {
    const request = input.request;
    const repository = await this.store.findRepository(
      input.ownerId,
      request.companyId,
      request.repositoryId,
    );
    if (
      !repository ||
      (request.capability === "repository.initialize_project"
        ? repository.status !== "INITIALIZING"
        : repository.status !== "ACTIVE") ||
      repository.workspaceLocatorId !== request.workspaceLocatorId ||
      (request.agentId !== null &&
        !repository.authorizedAgentIds.includes(request.agentId))
    )
      return false;

    if (
      request.capability === "repository.inspect" ||
      request.capability === "repository.initialize_project"
    ) {
      return (
        request.engineeringWorkspaceId === null &&
        request.worktreeLocator === null &&
        request.idempotencyKey === request.operationId
      );
    }
    if (!request.engineeringWorkspaceId || !request.worktreeLocator) return false;
    const workspace = await this.store.findWorkspace(
      input.ownerId,
      request.companyId,
      request.engineeringWorkspaceId,
    );
    if (
      !workspace ||
      workspace.repositoryId !== repository.id ||
      workspace.worktreeLocator !== request.worktreeLocator ||
      workspace.idempotencyKey !== request.idempotencyKey ||
      workspace.taskId !== request.taskId ||
      workspace.agentId !== request.agentId ||
      ["ARCHIVED", "CANCELLED", "FAILED"].includes(workspace.state)
    )
      return false;

    if (
      request.capability === "repository.worktree_create" &&
      (request.input.branchName !== workspace.branchName ||
        request.input.baseCommit !== workspace.baseCommit)
    )
      return false;

    if (
      request.capability === "repository.prepare_commit" &&
      (workspace.idempotencyKey.startsWith("integration-") ||
        request.input.taskId !== workspace.taskId ||
        request.input.agentId !== workspace.agentId ||
        request.input.baseCommit !== workspace.baseCommit)
    )
      return false;
    if (
      request.capability === "repository.integration_diff" &&
      (!workspace.idempotencyKey.startsWith("integration-") ||
        request.input.baseCommit !== workspace.baseCommit)
    )
      return false;

    if (
      request.capability === "repository.integrate_commit" ||
      request.capability === "repository.resolve_additive_docs_conflict"
    ) {
      const source = await this.store.findWorkspace(
        input.ownerId,
        request.companyId,
        request.input.sourceWorkspaceId,
      );
      if (
        !workspace.idempotencyKey.startsWith("integration-") ||
        !source ||
        source.id === workspace.id ||
        source.repositoryId !== repository.id ||
        source.worktreeLocator !== request.input.sourceWorktreeLocator ||
        source.baseCommit !== workspace.baseCommit ||
        !source.agentId ||
        !source.taskId ||
        source.taskId === workspace.taskId ||
        source.idempotencyKey.startsWith("integration-") ||
        !repository.authorizedAgentIds.includes(source.agentId) ||
        !["READY", "DIRTY", "COMPLETED"].includes(source.state)
      )
        return false;
      if (
        request.capability === "repository.resolve_additive_docs_conflict" &&
        (!/\.md$/i.test(request.input.path) ||
          request.input.path
            .split("/")
            .some((part) =>
              /^(auth|authentication|authorization|tenant|billing|security|policy|permissions?|migrations?|secrets?|credentials?)$/i.test(
                part,
              ),
            ) ||
          repository.protectedPaths.some(
            (pattern) =>
              request.input.path === pattern.replace(/\/\*\*?$/, "") ||
              request.input.path.startsWith(`${pattern.replace(/\/\*\*?$/, "")}/`),
          ) ||
          repository.generatedPaths.some(
            (pattern) =>
              request.input.path === pattern.replace(/\/\*\*?$/, "") ||
              request.input.path.startsWith(`${pattern.replace(/\/\*\*?$/, "")}/`),
          ))
      )
        return false;
    }

    if (request.capability === "repository.merge_candidate") {
      if (
        !workspace.idempotencyKey.startsWith("integration-") ||
        !this.integrationStore ||
        !this.approvals ||
        request.input.targetBranch !== repository.defaultBranch ||
        !repository.protectedBranches.includes(request.input.targetBranch) ||
        request.input.expectedBase !== workspace.baseCommit ||
        request.taskId !== workspace.taskId
      )
        return false;
      const [run, candidate] = await Promise.all([
        this.integrationStore.findRun(
          input.ownerId,
          request.companyId,
          request.input.integrationRunId,
        ),
        this.integrationStore.findCandidateByRun(
          input.ownerId,
          request.companyId,
          request.input.integrationRunId,
        ),
      ]);
      if (
        !run ||
        !candidate ||
        run.status !== "READY" ||
        run.repositoryId !== repository.id ||
        run.integrationWorkspaceId !== workspace.id ||
        run.objectiveId !== request.taskId ||
        !run.leaseOwner ||
        !run.leaseExpiresAt ||
        run.leaseExpiresAt <= new Date().toISOString() ||
        run.leaseGeneration !== request.input.leaseGeneration ||
        run.leaseExpiresAt < request.input.leaseExpiresAt ||
        candidate.id !== request.input.candidateId ||
        candidate.status !== "MERGING" ||
        candidate.mergeIdempotencyKey !== request.input.mergeIdempotencyKey ||
        candidate.headCommit !== request.input.candidateHead ||
        candidate.baseCommit !== request.input.expectedBase ||
        candidate.validatedHeadCommit !== candidate.headCommit ||
        candidate.reviewedHeadCommit !== candidate.headCommit ||
        candidate.securityReviewId !== run.securityReviewId ||
        !run.validationReportId ||
        !run.reviewId ||
        candidate.validationReportId !== run.validationReportId ||
        candidate.reviewReportId !== run.reviewId
      )
        return false;
      const [validation, reviews, approval] = await Promise.all([
        this.store.findValidation(
          input.ownerId,
          request.companyId,
          candidate.validationReportId,
        ),
        this.integrationStore.listReviews(input.ownerId, request.companyId, run.id),
        this.approvals.findMatchingApproved(
          input.ownerId,
          engineeringMergeAction(
            candidate,
            repository.workspaceLocatorId,
            repository.defaultBranch,
            request.input.mergeIdempotencyKey,
          ),
        ),
      ]);
      const passing = (id: string) =>
        reviews.some(
          (review) =>
            review.id === id &&
            review.headCommit === candidate.headCommit &&
            ["PASS", "PASS_WITH_WARNINGS"].includes(review.verdict),
        );
      return Boolean(
        validation?.status === "PASS" &&
        validation.workspaceId === workspace.id &&
        passing(candidate.reviewReportId) &&
        (!run.securityReviewRequired ||
          (candidate.securityReviewId && passing(candidate.securityReviewId))) &&
        approval?.status === "APPROVED",
      );
    }

    if (
      request.capability === "repository.file_patch" ||
      request.capability === "repository.file_create" ||
      request.capability === "repository.file_delete"
    ) {
      if (
        request.input.protectedPathApproved ||
        JSON.stringify(request.input.protectedPaths) !==
          JSON.stringify(repository.protectedPaths)
      )
        return false;
    }

    if (request.capability === "repository.run_command") {
      const profile = await this.store.findCommandProfile(
        input.ownerId,
        request.companyId,
        repository.commandProfileId,
      );
      if (!profile || profile.status !== "ACTIVE") return false;
      const submitted = EngineeringCommandDefinitionSchema.parse(request.input.command);
      const registered = profile.commands.find(
        (command) => command.id === submitted.id,
      );
      if (!registered || JSON.stringify(registered) !== JSON.stringify(submitted))
        return false;
    }
    if (
      request.capability === "repository.install_dependencies" ||
      request.capability === "repository.add_dependency" ||
      request.capability === "repository.remove_dependency"
    ) {
      const profile = await this.store.findCommandProfile(
        input.ownerId,
        request.companyId,
        repository.commandProfileId,
      );
      if (
        !profile ||
        profile.status !== "ACTIVE" ||
        profile.dependencyManager !== request.input.packageManager
      )
        return false;
    }
    if (
      request.capability === "repository.dev_server_start" ||
      request.capability === "repository.dev_server_restart"
    ) {
      const profile = await this.store.findCommandProfile(
        input.ownerId,
        request.companyId,
        repository.commandProfileId,
      );
      const submitted = "server" in request.input ? request.input.server : undefined;
      const registered =
        submitted &&
        profile?.developmentServers.find((server) => server.id === submitted.id);
      if (!registered || JSON.stringify(registered) !== JSON.stringify(submitted))
        return false;
    }
    return true;
  }
}

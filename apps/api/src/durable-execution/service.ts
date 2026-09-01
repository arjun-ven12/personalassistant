import { createHash } from "node:crypto";

import {
  CompleteCrossCompanyServiceRequestSchema,
  CreateCrossCompanyPolicyRequestSchema,
  CreateCrossCompanyServiceRequestSchema,
  CrossCompanyCollaborationPolicySchema,
  CrossCompanyServiceRequestSchema,
  DurableActivityReceiptSchema,
  DurableExecutionEventSchema,
  DurableExecutionSchema,
  type CrossCompanyServiceRequest,
  type CrossCompanyServiceResult,
  type DurableFailureClass,
} from "@alexa-control/shared";

import type { AgentStore } from "../agents/store.js";
import type { CompanyDataStore } from "../company-data/store.js";
import { companyScope } from "../companies/scope.js";
import type { CompanyStore } from "../companies/store.js";
import type {
  ApprovalService,
  GovernanceAuditWriter,
} from "../governance/approval-service.js";
import { AlexaTelemetryAttributes, type TelemetrySink } from "../telemetry/service.js";
import type { DurableExecutionStore } from "./store.js";
import type {
  CrossCompanyEconomyAdapter,
  CrossCompanyWorkforceResolver,
} from "./production.js";

const terminal = new Set(["COMPLETED", "REJECTED", "FAILED", "CANCELLED"]);
const activeExecution = new Set([
  "QUEUED",
  "RUNNING",
  "WAITING_FOR_APPROVAL",
  "WAITING_EXTERNAL",
  "PAUSED",
  "REVIEW",
]);
const steps = [
  "REVALIDATE_POLICY",
  "RESOLVE_ASSIGNMENT",
  "EXECUTE_SERVICE",
  "VERIFY_OUTPUT",
  "RETURN_OUTPUT",
] as const;
const executionError = (code: string, message: string, statusCode = 409) =>
  Object.assign(new Error(message), { code, statusCode });
const traceId = () => crypto.randomUUID().replaceAll("-", "");
const activityKey = (executionId: string, step: string) =>
  createHash("sha256").update(`${executionId}:${step}`).digest("hex");

export interface DurableActivityOutput {
  result: CrossCompanyServiceResult;
  actualCostCredits: number;
  externalCommitRef?: string;
}
export type DurableReconciliation =
  | { state: "COMMITTED"; output: DurableActivityOutput }
  | { state: "NOT_COMMITTED" }
  | { state: "UNKNOWN" };
export interface CrossCompanyActivityExecutor {
  execute(
    request: CrossCompanyServiceRequest,
    idempotencyKey: string,
  ): Promise<DurableActivityOutput>;
  reconcile(
    request: CrossCompanyServiceRequest,
    idempotencyKey: string,
  ): Promise<DurableActivityOutput | DurableReconciliation | null>;
}

export class CrossCompanyExecutionService {
  #activity: CrossCompanyActivityExecutor | undefined;
  #economy: CrossCompanyEconomyAdapter | undefined;
  #workforce: CrossCompanyWorkforceResolver | undefined;
  constructor(
    readonly store: DurableExecutionStore,
    readonly companies: CompanyStore,
    readonly companyData: CompanyDataStore,
    readonly agents: AgentStore,
    readonly approvals: ApprovalService,
    readonly telemetry: TelemetrySink,
    activity?: CrossCompanyActivityExecutor,
    readonly audit?: GovernanceAuditWriter,
    readonly now = () => new Date(),
  ) {
    this.#activity = activity;
  }

  setProductionRuntime(input: {
    activity: CrossCompanyActivityExecutor;
    economy: CrossCompanyEconomyAdapter;
    workforce: CrossCompanyWorkforceResolver;
  }) {
    this.#activity = input.activity;
    this.#economy = input.economy;
    this.#workforce = input.workforce;
  }

  async upsertPolicy(
    ownerId: string,
    companyId: string,
    raw: unknown,
    context: { requestId: string; ipAddress: string },
  ) {
    const body = CreateCrossCompanyPolicyRequestSchema.parse(raw);
    const company = await this.requireCompany(ownerId, companyId);
    if (company.status === "ARCHIVED")
      throw executionError(
        "COMPANY_ARCHIVED",
        "Archived companies cannot enable collaboration.",
        403,
      );
    for (const destinationId of body.allowedDestinationCompanyIds)
      await this.requireCompany(ownerId, destinationId);
    const previous = await this.store.findPolicy(ownerId, companyId);
    const at = this.now().toISOString();
    const policy = CrossCompanyCollaborationPolicySchema.parse({
      id: previous?.id ?? crypto.randomUUID(),
      ownerId,
      companyId,
      ...body,
      status: "ACTIVE",
      version: (previous?.version ?? 0) + 1,
      createdAt: previous?.createdAt ?? at,
      updatedAt: at,
    });
    await this.store.savePolicy(policy);
    await this.audit?.({
      eventType: "CROSS_COMPANY_POLICY_UPDATED",
      ownerId,
      companyId,
      outcome: "SUCCESS",
      reason: "Explicit collaboration policy updated.",
      metadata: { version: policy.version },
      ...context,
    });
    return policy;
  }

  async createRequest(
    ownerId: string,
    raw: unknown,
    context: { requestId: string; ipAddress: string },
  ) {
    const body = CreateCrossCompanyServiceRequestSchema.parse(raw);
    const [source, destination] = await Promise.all([
      this.requireCompany(ownerId, body.sourceCompanyId),
      this.requireCompany(ownerId, body.destinationCompanyId),
    ]);
    if (source.status !== "ACTIVE" || destination.status !== "ACTIVE")
      throw executionError(
        "COMPANY_NOT_ACTIVE",
        "Both companies must be active when a service request is created.",
        403,
      );
    const [sourcePolicy, destinationPolicy, sourceDataPolicy, destinationDataPolicy] =
      await Promise.all([
        this.requirePolicy(ownerId, source.id),
        this.requirePolicy(ownerId, destination.id),
        this.companyData.findActivePolicy(ownerId, source.id),
        this.companyData.findActivePolicy(ownerId, destination.id),
      ]);
    if (
      !sourceDataPolicy?.externalTransferAllowed ||
      !destinationDataPolicy?.externalTransferAllowed
    )
      throw executionError(
        "EXTERNAL_TRANSFER_DENIED",
        "Both company data policies must explicitly allow external transfer.",
        403,
      );
    this.validateContract(body, sourcePolicy, destinationPolicy);
    if (body.requesterAssignmentId) {
      const assignment = (await this.agents.listAssignments(ownerId, source.id)).find(
        (item) => item.id === body.requesterAssignmentId && item.status === "ACTIVE",
      );
      if (!assignment)
        throw executionError(
          "REQUESTER_ASSIGNMENT_DENIED",
          "Requester assignment is not active in the source company.",
          403,
        );
    }
    const concurrent = (
      await this.store.listServiceRequests(ownerId, destination.id)
    ).filter(
      (item) =>
        item.destinationCompanyId === destination.id && !terminal.has(item.status),
    ).length;
    if (
      concurrent >=
      Math.min(
        sourcePolicy.maxConcurrentServices,
        destinationPolicy.maxConcurrentServices,
      )
    )
      throw executionError(
        "SERVICE_CONCURRENCY_LIMIT",
        "Destination company durable-service concurrency is full.",
        429,
      );
    const needsApproval =
      body.budgetCredits >=
        Math.min(
          sourcePolicy.approvalThresholdCredits,
          destinationPolicy.approvalThresholdCredits,
        ) ||
      body.confidentiality === "RESTRICTED" ||
      body.sharedInput.scope === "SPECIFIC_DATASET";
    const at = this.now().toISOString(),
      id = crypto.randomUUID();
    let request = CrossCompanyServiceRequestSchema.parse({
      id,
      ownerId,
      ...body,
      destinationGovernorAssignmentId: await this.destinationGovernor(
        ownerId,
        destination.id,
      ),
      destinationAssignmentId: null,
      actualCostCredits: 0,
      status: needsApproval ? "NEEDS_APPROVAL" : "REQUESTED",
      approvalRequirement: needsApproval
        ? body.confidentiality === "RESTRICTED"
          ? "RECENT_AUTHENTICATION"
          : "EXPLICIT"
        : "NONE",
      approvalId: null,
      durabilityClass: "CROSS_COMPANY",
      traceId: traceId(),
      currentStep: "GOVERNOR_REVIEW",
      waitReason: needsApproval
        ? "Owner approval required before destination acceptance."
        : "Destination Governor decision required.",
      result: null,
      failureClass: null,
      failureCode: null,
      createdAt: at,
      updatedAt: at,
      completedAt: null,
    });
    if (needsApproval) {
      const approval = await companyScope.run(
        {
          ownerId,
          companyId: destination.id,
          role: "OWNER",
          requestId: context.requestId,
        },
        () =>
          this.approvals.create({
            ownerId,
            action: this.approvalAction(request),
            riskLevel: body.confidentiality === "RESTRICTED" ? "high" : "medium",
            approvalRequirement:
              body.confidentiality === "RESTRICTED"
                ? "recent_authentication"
                : "explicit",
            ...context,
          }),
      );
      request = CrossCompanyServiceRequestSchema.parse({
        ...request,
        approvalId: approval.id,
      });
    }
    await this.store.saveServiceRequest(request);
    await this.audit?.({
      eventType: "CROSS_COMPANY_SERVICE_REQUESTED",
      ownerId,
      companyId: source.id,
      outcome: "SUCCESS",
      reason:
        "Governed cross-company service contract created without direct data access.",
      metadata: {
        serviceRequestId: request.id,
        destinationCompanyId: destination.id,
        sharingScope: request.sharedInput.scope,
      },
      ...context,
    });
    return request;
  }

  async destinationDecision(
    ownerId: string,
    id: string,
    decision: "ACCEPT" | "REJECT" | "CLARIFY",
    reason: string | undefined,
    context: { requestId: string; ipAddress: string },
  ) {
    let request = await this.requireRequest(ownerId, id);
    if (!new Set(["REQUESTED", "NEEDS_APPROVAL", "BUDGET_BLOCKED"]).has(request.status))
      throw executionError(
        "SERVICE_NOT_DECIDABLE",
        "Service request is not awaiting a destination decision.",
      );
    if (request.approvalRequirement !== "NONE") {
      const approval = await companyScope.run(
        {
          ownerId,
          companyId: request.destinationCompanyId,
          role: "OWNER",
          requestId: context.requestId,
        },
        () =>
          this.approvals.findMatchingApproved(ownerId, this.approvalAction(request)),
      );
      if (!approval)
        throw executionError(
          "SERVICE_APPROVAL_REQUIRED",
          "The matching owner approval is not active.",
          403,
        );
    }
    const at = this.now().toISOString();
    if (decision !== "ACCEPT") {
      request = CrossCompanyServiceRequestSchema.parse({
        ...request,
        status: decision === "REJECT" ? "REJECTED" : "WAITING",
        waitReason:
          reason ??
          (decision === "REJECT"
            ? "Destination rejected the request."
            : "Destination requested clarification."),
        currentStep: decision === "REJECT" ? null : "CLARIFICATION",
        updatedAt: at,
        completedAt: decision === "REJECT" ? at : null,
      });
      await this.store.saveServiceRequest(request);
      return request;
    }
    await this.revalidate(request);
    const workforce = this.#workforce
      ? await this.#workforce.resolve(request, context)
      : { assignmentId: await this.selectAssignment(request), resolution: null };
    // The service request UUID is also the deterministic execution UUID. This closes
    // the reserve-before-execution crash window without adding a second identity map.
    const executionId = request.id;
    request = CrossCompanyServiceRequestSchema.parse({
      ...request,
      destinationAssignmentId: workforce.assignmentId,
      workforceResolution: workforce.resolution,
      status: "ACCEPTED",
      currentStep: "DURABLE_START",
      waitReason: null,
      updatedAt: at,
    });
    if (this.#economy) {
      try {
        request = CrossCompanyServiceRequestSchema.parse({
          ...request,
          ...(await this.#economy.reserve(request, executionId)),
        });
        await this.audit?.({
          eventType: "CROSS_COMPANY_BUDGET_RESERVED",
          ownerId,
          companyId: request.payingCompanyId ?? request.destinationCompanyId,
          outcome: "SUCCESS",
          reason:
            "Agent Economy reserved the approved service budget before execution.",
          metadata: {
            serviceRequestId: request.id,
            executionId,
            assignmentId: request.payingAssignmentId,
            reservedCredits: request.reservedCostCredits,
            costAttribution: request.costAttribution,
          },
          ...context,
        });
      } catch (error) {
        request = CrossCompanyServiceRequestSchema.parse({
          ...request,
          status: "BUDGET_BLOCKED",
          currentStep: "ECONOMY_RESERVATION",
          waitReason: "Agent Economy denied the required reservation.",
          failureClass: "BUDGET",
          failureCode: "BUDGET_BLOCKED",
          updatedAt: this.now().toISOString(),
        });
        await this.store.saveServiceRequest(request);
        await this.#workforce?.release(request);
        throw error;
      }
    }
    await this.store.saveServiceRequest(request);
    await this.startExecution(request, executionId);
    await this.auditState(
      request,
      "Destination accepted the governed service contract.",
      context,
    );
    return request;
  }

  async runNext(
    ownerId: string,
    executionId: string,
    context = { requestId: `durable:${executionId}`, ipAddress: "internal" },
  ) {
    let execution = await this.requireExecution(ownerId, executionId);
    if (!activeExecution.has(execution.status)) return execution;
    if (execution.nextRunAt && execution.nextRunAt > this.now().toISOString())
      return execution;
    const request = execution.serviceRequestId
      ? await this.requireRequest(ownerId, execution.serviceRequestId)
      : undefined;
    if (!request)
      throw executionError(
        "SERVICE_REQUEST_MISSING",
        "Durable cross-company execution lost its service contract.",
      );
    return this.telemetry.withSpan(
      "alexa.durable.run_next",
      {
        [AlexaTelemetryAttributes.ownerId]: ownerId,
        [AlexaTelemetryAttributes.companyId]: execution.companyId,
        [AlexaTelemetryAttributes.workflowId]: execution.id,
        [AlexaTelemetryAttributes.executionId]: execution.id,
        [AlexaTelemetryAttributes.requestId]: context.requestId,
        [AlexaTelemetryAttributes.assignmentId]:
          request.destinationAssignmentId ?? "unassigned",
        [AlexaTelemetryAttributes.capabilityName]:
          request.requestedCapabilities[0] ?? request.serviceType,
        "alexa.service_request.id": request.id,
        "alexa.durable.activity_type": request.serviceType,
      },
      async () => {
        const lifecycle = await this.lifecycleCheckpoint(request, execution, context);
        if (lifecycle) return lifecycle;
        const step = execution.currentStep ?? steps[0];
        execution = DurableExecutionSchema.parse({
          ...execution,
          status: "RUNNING",
          currentStep: step,
          updatedAt: this.now().toISOString(),
          version: execution.version + 1,
        });
        await this.store.saveExecution(execution);
        try {
          if (step === "REVALIDATE_POLICY") await this.revalidate(request);
          else if (step === "RESOLVE_ASSIGNMENT")
            await this.validateSelectedAssignment(request);
          else if (step === "EXECUTE_SERVICE")
            return this.executeActivity(request, execution, context);
          else if (step === "VERIFY_OUTPUT") {
            if (!request.result || request.result.verification !== "VERIFIED")
              return this.parkForReview(
                request,
                execution,
                "Output verification is incomplete.",
              );
          } else if (step === "RETURN_OUTPUT")
            return this.completeExecution(request, execution, context);
        } catch (error) {
          const classified = this.classifyFailure(error);
          return this.fail(
            request,
            execution,
            classified.failureClass,
            classified.code,
            context,
          );
        }
        const next = steps[steps.findIndex((candidate) => candidate === step) + 1];
        const updated = DurableExecutionSchema.parse({
          ...execution,
          currentStep: next ?? null,
          updatedAt: this.now().toISOString(),
          version: execution.version + 1,
        });
        await this.store.saveExecution(updated);
        await this.event(updated, `${step}_COMPLETED`, step, `${step} completed.`, {});
        return updated;
      },
    );
  }

  async runClaimed(
    execution: Awaited<ReturnType<CrossCompanyExecutionService["requireExecution"]>>,
    workerId: string,
    context = {
      requestId: `worker:${workerId}:${execution.id}`,
      ipAddress: "internal",
    },
  ) {
    if (
      execution.leaseOwner !== workerId ||
      !execution.leaseExpiresAt ||
      execution.leaseExpiresAt <= this.now().toISOString()
    )
      throw executionError(
        "DURABLE_LEASE_NOT_OWNED",
        "The worker does not own a valid execution lease.",
        409,
      );
    await this.event(
      execution,
      "WORKER_CLAIMED",
      execution.currentStep,
      "A centralized durable worker acquired the execution lease.",
      { workerId, leaseGeneration: execution.leaseGeneration },
    );
    await this.audit?.({
      eventType: "DURABLE_WORKER_CLAIMED",
      ownerId: execution.ownerId,
      companyId: execution.companyId,
      outcome: "SUCCESS",
      reason: "A centralized worker acquired an atomic durable-execution lease.",
      metadata: {
        executionId: execution.id,
        serviceRequestId: execution.serviceRequestId,
        workerId,
        leaseGeneration: execution.leaseGeneration,
      },
      ...context,
    });
    try {
      return await this.runNext(execution.ownerId, execution.id, context);
    } finally {
      await this.store.releaseLease(execution.ownerId, execution.id, workerId);
    }
  }

  async cancel(
    ownerId: string,
    serviceRequestId: string,
    context: { requestId: string; ipAddress: string },
  ) {
    let request = await this.requireRequest(ownerId, serviceRequestId);
    if (terminal.has(request.status)) return request;
    request = await this.closeEconomy(
      request,
      request.actualCostCredits > 0 ? "SETTLE" : "RELEASE",
    );
    const at = this.now().toISOString();
    request = CrossCompanyServiceRequestSchema.parse({
      ...request,
      status: "CANCELLED",
      currentStep: null,
      waitReason: "Cancelled by owner.",
      updatedAt: at,
      completedAt: at,
    });
    await this.store.saveServiceRequest(request);
    const execution = (
      await this.store.listExecutions(ownerId, request.destinationCompanyId)
    ).find((item) => item.serviceRequestId === request.id);
    if (execution) {
      const cancelled = DurableExecutionSchema.parse({
        ...execution,
        status: "CANCELLED",
        cancellationRequested: true,
        currentStep: null,
        updatedAt: at,
        completedAt: at,
        version: execution.version + 1,
      });
      await this.store.saveExecution(cancelled);
      await this.event(
        cancelled,
        "CANCELLED",
        null,
        "Owner cancellation stopped future activities.",
        {},
      );
    }
    await this.auditState(request, "Owner cancelled cross-company service.", context);
    await this.#workforce?.release(request);
    return request;
  }

  async dashboard(ownerId: string, companyId?: string) {
    const requests = await this.store.listServiceRequests(ownerId, companyId);
    const executions = await this.store.listExecutions(ownerId, companyId);
    const now = this.now().getTime();
    const requestById = new Map(requests.map((request) => [request.id, request]));
    const operationalWarnings = executions.flatMap((execution) => {
      const warnings: Array<{
        executionId: string | null;
        serviceRequestId: string | null;
        code:
          | "LEASE_STUCK"
          | "WAITING_EXTERNAL_STALE"
          | "APPROVAL_DEADLINE_EXCEEDED"
          | "RETRY_EXHAUSTED";
        message: string;
      }> = [];
      const common = {
        executionId: execution.id,
        serviceRequestId: execution.serviceRequestId,
      };
      if (
        execution.leaseExpiresAt &&
        new Date(execution.leaseExpiresAt).getTime() < now
      )
        warnings.push({
          ...common,
          code: "LEASE_STUCK",
          message: "Worker lease expired; the execution is eligible for safe reclaim.",
        });
      if (
        execution.status === "WAITING_EXTERNAL" &&
        now - new Date(execution.updatedAt).getTime() > 15 * 60_000
      )
        warnings.push({
          ...common,
          code: "WAITING_EXTERNAL_STALE",
          message:
            "External outcome remains unknown; governed manual/provider reconciliation may be required.",
        });
      if (execution.status === "FAILED" && execution.attempt >= execution.maxAttempts)
        warnings.push({
          ...common,
          code: "RETRY_EXHAUSTED",
          message: "Bounded activity retries are exhausted; execution is terminal.",
        });
      return warnings;
    });
    for (const request of requests) {
      if (
        request.status === "NEEDS_APPROVAL" &&
        request.deadline &&
        new Date(request.deadline).getTime() < now
      )
        operationalWarnings.push({
          executionId:
            executions.find((item) => item.serviceRequestId === request.id)?.id ?? null,
          serviceRequestId: request.id,
          code: "APPROVAL_DEADLINE_EXCEEDED",
          message: "Approval wait exceeded the service deadline.",
        });
    }
    return {
      requests,
      executions,
      sandboxResults: await this.store.listSandboxResults(ownerId, companyId),
      histories: Object.fromEntries(
        await Promise.all(
          executions
            .slice(0, 100)
            .map(
              async (execution) =>
                [
                  execution.id,
                  (await this.store.listEvents(ownerId, execution.id)).slice(-500),
                ] as const,
            ),
        ),
      ),
      operationalWarnings: operationalWarnings.filter(
        (warning) =>
          !warning.serviceRequestId || requestById.has(warning.serviceRequestId),
      ),
    };
  }

  private async startExecution(
    request: CrossCompanyServiceRequest,
    executionId: string = crypto.randomUUID(),
  ) {
    const key = `cross-company:${request.id}`;
    const existing = await this.store.findExecutionByKey(request.ownerId, key);
    if (existing) return existing;
    const at = this.now().toISOString();
    const execution = DurableExecutionSchema.parse({
      id: executionId,
      ownerId: request.ownerId,
      companyId: request.destinationCompanyId,
      serviceRequestId: request.id,
      objectiveId: request.objectiveId,
      workflowId: request.workflowId,
      deterministicKey: key,
      durabilityClass: "CROSS_COMPANY",
      backend: "NATIVE_POSTGRES",
      backendWorkflowId: `${request.ownerId}:${request.destinationCompanyId}:${request.id}`,
      status: "QUEUED",
      currentStep: steps[0],
      attempt: 0,
      maxAttempts: 3,
      nextRunAt: null,
      cancellationRequested: false,
      version: 1,
      traceId: request.traceId,
      createdAt: at,
      updatedAt: at,
      completedAt: null,
    });
    await this.store.saveExecution(execution);
    await this.event(
      execution,
      "WORKFLOW_STARTED",
      execution.currentStep,
      "Native durable workflow history initialized.",
      { backend: execution.backend },
    );
    return execution;
  }

  private async executeActivity(
    request: CrossCompanyServiceRequest,
    execution: Awaited<ReturnType<CrossCompanyExecutionService["requireExecution"]>>,
    context: { requestId: string; ipAddress: string },
  ) {
    if (!this.#activity)
      return this.park(
        execution,
        "WAITING_EXTERNAL",
        "No approved cross-company activity adapter is registered.",
      );
    const key = activityKey(execution.id, "EXECUTE_SERVICE"),
      existing = await this.store.findReceipt(request.ownerId, key);
    let output: DurableActivityOutput | null = null;
    if (existing?.status === "COMMITTED")
      return this.advanceAfterActivity(request, execution);
    if (
      existing?.status === "STARTED" ||
      existing?.status === "RECONCILIATION_REQUIRED"
    ) {
      const reconciled = await this.#activity.reconcile(request, key);
      if (!reconciled || ("state" in reconciled && reconciled.state === "UNKNOWN")) {
        await this.store.saveReceipt(
          DurableActivityReceiptSchema.parse({
            ...existing,
            status: "RECONCILIATION_REQUIRED",
            updatedAt: this.now().toISOString(),
          }),
        );
        return this.park(
          execution,
          "WAITING_EXTERNAL",
          "Prior activity commitment is unknown; manual/provider reconciliation is required.",
        );
      } else if ("state" in reconciled) {
        await this.audit?.({
          eventType: "DURABLE_ACTIVITY_RECONCILED",
          ownerId: request.ownerId,
          companyId: request.destinationCompanyId,
          outcome: "SUCCESS",
          reason: `Activity reconciliation resolved ${reconciled.state}.`,
          metadata: { executionId: execution.id, serviceRequestId: request.id },
          ...context,
        });
        if (reconciled.state === "COMMITTED") output = reconciled.output;
        else output = await this.#activity.execute(request, key);
      } else output = reconciled;
    } else {
      const at = this.now().toISOString();
      const receipt = DurableActivityReceiptSchema.parse({
        id: crypto.randomUUID(),
        ownerId: request.ownerId,
        companyId: request.destinationCompanyId,
        executionId: execution.id,
        step: "EXECUTE_SERVICE",
        idempotencyKey: key,
        status: "STARTED",
        externalCommitRef: null,
        resultSummary: null,
        requestDigest: createHash("sha256")
          .update(
            JSON.stringify({
              serviceRequestId: request.id,
              destinationCompanyId: request.destinationCompanyId,
              assignmentId: request.destinationAssignmentId,
              capability: request.requestedCapabilities,
              sharedInput: request.sharedInput,
              permittedOutputTypes: request.permittedOutputTypes,
            }),
          )
          .digest("hex"),
        commitEvidenceRef: null,
        resultRef: null,
        attempt: execution.attempt + 1,
        createdAt: at,
        updatedAt: at,
      });
      await this.store.saveReceipt(receipt);
      await this.audit?.({
        eventType: "DURABLE_ACTIVITY_STARTED",
        ownerId: request.ownerId,
        companyId: request.destinationCompanyId,
        outcome: "SUCCESS",
        reason: "A reviewed durable activity started with an idempotency receipt.",
        metadata: {
          executionId: execution.id,
          serviceRequestId: request.id,
          assignmentId: request.destinationAssignmentId,
          activityKey: key,
        },
        ...context,
      });
      try {
        output = await this.#activity.execute(request, key);
      } catch (error) {
        const incurred =
          typeof error === "object" &&
          error &&
          "actualCostCredits" in error &&
          Number.isFinite(Number(error.actualCostCredits))
            ? Math.max(0, Number(error.actualCostCredits))
            : 0;
        if (incurred > 0) {
          request = CrossCompanyServiceRequestSchema.parse({
            ...request,
            actualCostCredits: request.actualCostCredits + incurred,
            updatedAt: this.now().toISOString(),
          });
          await this.store.saveServiceRequest(request);
        }
        const classified = this.classifyFailure(error);
        await this.store.saveReceipt(
          DurableActivityReceiptSchema.parse({
            ...receipt,
            status: "FAILED",
            resultSummary: classified.code,
            updatedAt: this.now().toISOString(),
          }),
        );
        if (
          classified.failureClass === "TRANSIENT" &&
          execution.attempt + 1 < execution.maxAttempts
        ) {
          const delay = Math.min(60_000, 1_000 * 2 ** execution.attempt);
          const retry = DurableExecutionSchema.parse({
            ...execution,
            status: "QUEUED",
            attempt: execution.attempt + 1,
            nextRunAt: new Date(this.now().getTime() + delay).toISOString(),
            updatedAt: this.now().toISOString(),
            version: execution.version + 1,
          });
          await this.store.saveExecution(retry);
          await this.event(
            retry,
            "ACTIVITY_RETRY_SCHEDULED",
            "EXECUTE_SERVICE",
            "Transient activity failure scheduled for bounded retry.",
            { failureCode: classified.code, delayMs: delay },
          );
          return retry;
        }
        return this.fail(
          request,
          execution,
          classified.failureClass,
          classified.code,
          context,
        );
      }
    }
    const boundedResult = this.outputBoundary(request, output.result);
    const updatedRequest = CrossCompanyServiceRequestSchema.parse({
      ...request,
      result: boundedResult,
      actualCostCredits: request.actualCostCredits + output.actualCostCredits,
      status: boundedResult.reviewOutcome === "NOT_REVIEWED" ? "REVIEW" : "RUNNING",
      currentStep: "VERIFY_OUTPUT",
      updatedAt: this.now().toISOString(),
    });
    await this.store.saveServiceRequest(updatedRequest);
    const committed = DurableActivityReceiptSchema.parse({
      id: existing?.id ?? crypto.randomUUID(),
      ownerId: request.ownerId,
      companyId: request.destinationCompanyId,
      executionId: execution.id,
      step: "EXECUTE_SERVICE",
      idempotencyKey: key,
      status: "COMMITTED",
      externalCommitRef: output.externalCommitRef ?? null,
      resultSummary: boundedResult.summary,
      requestDigest:
        existing?.requestDigest ??
        createHash("sha256").update(`${request.id}:${key}`).digest("hex"),
      commitEvidenceRef: output.externalCommitRef ?? null,
      resultRef: boundedResult.artifactRefs[0] ?? null,
      attempt: existing?.attempt ?? execution.attempt + 1,
      createdAt: existing?.createdAt ?? this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    });
    await this.store.saveReceipt(committed);
    return this.advanceAfterActivity(updatedRequest, execution);
  }

  private async advanceAfterActivity(
    request: CrossCompanyServiceRequest,
    execution: Awaited<ReturnType<CrossCompanyExecutionService["requireExecution"]>>,
  ) {
    const updated = DurableExecutionSchema.parse({
      ...execution,
      status: request.result?.reviewOutcome === "NOT_REVIEWED" ? "REVIEW" : "RUNNING",
      currentStep: "VERIFY_OUTPUT",
      updatedAt: this.now().toISOString(),
      version: execution.version + 1,
    });
    await this.store.saveExecution(updated);
    await this.event(
      updated,
      "ACTIVITY_COMMITTED",
      "EXECUTE_SERVICE",
      "Activity commitment recorded with idempotency receipt.",
      {},
    );
    return updated;
  }
  private async completeExecution(
    request: CrossCompanyServiceRequest,
    execution: Awaited<ReturnType<CrossCompanyExecutionService["requireExecution"]>>,
    context: { requestId: string; ipAddress: string },
  ) {
    request = await this.closeEconomy(request, "SETTLE");
    const at = this.now().toISOString();
    const completedRequest = CrossCompanyServiceRequestSchema.parse({
      ...request,
      status: "COMPLETED",
      currentStep: null,
      waitReason: null,
      updatedAt: at,
      completedAt: at,
    });
    const completed = DurableExecutionSchema.parse({
      ...execution,
      status: "COMPLETED",
      currentStep: null,
      updatedAt: at,
      completedAt: at,
      version: execution.version + 1,
    });
    await this.store.saveServiceRequest(completedRequest);
    await this.store.saveExecution(completed);
    await this.event(
      completed,
      "WORKFLOW_COMPLETED",
      null,
      "Approved output boundary returned the completed result.",
      {},
    );
    await this.auditState(
      completedRequest,
      "Cross-company service completed.",
      context,
    );
    await this.#workforce?.release(completedRequest);
    return completed;
  }
  private async lifecycleCheckpoint(
    request: CrossCompanyServiceRequest,
    execution: Awaited<ReturnType<CrossCompanyExecutionService["requireExecution"]>>,
    context: { requestId: string; ipAddress: string },
  ) {
    const company = await this.requireCompany(
      request.ownerId,
      request.destinationCompanyId,
    );
    if (request.deadline && request.deadline <= this.now().toISOString())
      return this.fail(request, execution, "PERMANENT", "DEADLINE_EXCEEDED", context);
    if (execution.cancellationRequested || request.status === "CANCELLED")
      return this.cancel(request.ownerId, request.id, context).then(() =>
        this.requireExecution(request.ownerId, execution.id),
      );
    if (company.status === "ARCHIVED")
      return this.fail(
        request,
        execution,
        "POLICY",
        "DESTINATION_ARCHIVED",
        context,
        "CANCELLED",
      );
    if (company.status === "PAUSED" || company.status === "SUSPENDED")
      return this.park(
        execution,
        "PAUSED",
        company.status === "PAUSED"
          ? "Destination company paused."
          : "Destination company suspended; no new external effects permitted.",
      );
    return null;
  }
  private async revalidate(request: CrossCompanyServiceRequest) {
    const [source, destination] = await Promise.all([
      this.requireCompany(request.ownerId, request.sourceCompanyId),
      this.requireCompany(request.ownerId, request.destinationCompanyId),
    ]);
    if (source.status !== "ACTIVE" || destination.status !== "ACTIVE")
      throw executionError(
        "COMPANY_NOT_ACTIVE",
        "Policy checkpoint denied because a company is not active.",
        403,
      );
    const [sourcePolicy, destinationPolicy, sourceData, destinationData] =
      await Promise.all([
        this.requirePolicy(request.ownerId, source.id),
        this.requirePolicy(request.ownerId, destination.id),
        this.companyData.findActivePolicy(request.ownerId, source.id),
        this.companyData.findActivePolicy(request.ownerId, destination.id),
      ]);
    if (
      !sourceData?.externalTransferAllowed ||
      !destinationData?.externalTransferAllowed
    )
      throw executionError(
        "EXTERNAL_TRANSFER_DENIED",
        "Data transfer permission was revoked.",
        403,
      );
    this.validateContract(request, sourcePolicy, destinationPolicy);
  }
  private validateContract(
    request: {
      sourceCompanyId: string;
      destinationCompanyId: string;
      serviceType: string;
      requestedCapabilities: string[];
      sharedInput: { scope: string };
      budgetCredits: number;
    },
    source: Awaited<ReturnType<CrossCompanyExecutionService["requirePolicy"]>>,
    destination: Awaited<ReturnType<CrossCompanyExecutionService["requirePolicy"]>>,
  ) {
    if (
      !source.allowedDestinationCompanyIds.includes(request.destinationCompanyId) ||
      !destination.allowedDestinationCompanyIds.includes(request.sourceCompanyId)
    )
      throw executionError(
        "COLLABORATION_PEER_DENIED",
        "Both company policies must explicitly authorize the peer company.",
        403,
      );
    for (const policy of [source, destination]) {
      if (!policy.allowedServiceTypes.includes(request.serviceType))
        throw executionError(
          "SERVICE_TYPE_DENIED",
          "Service type is not allowed by both company policies.",
          403,
        );
      if (!policy.allowedSharingScopes.includes(request.sharedInput.scope as never))
        throw executionError(
          "SHARING_SCOPE_DENIED",
          "Sharing scope is not allowed by both company policies.",
          403,
        );
      if (
        request.requestedCapabilities.some(
          (capability) => !policy.allowedCapabilities.includes(capability),
        )
      )
        throw executionError(
          "SERVICE_CAPABILITY_DENIED",
          "Requested capabilities exceed a company collaboration policy.",
          403,
        );
      if (request.budgetCredits > policy.maxBudgetCredits)
        throw executionError(
          "SERVICE_BUDGET_DENIED",
          "Requested budget exceeds a company collaboration policy.",
          403,
        );
    }
  }
  private async selectAssignment(request: CrossCompanyServiceRequest) {
    const assignments = (
      await this.agents.listAssignments(request.ownerId, request.destinationCompanyId)
    ).filter((item) => item.status === "ACTIVE" && !item.isGovernor);
    for (const assignment of assignments) {
      const definition = await this.agents.findDefinition(
        request.ownerId,
        assignment.agentDefinitionId,
      );
      if (
        definition &&
        request.requestedCapabilities.every((capability) =>
          definition.capabilityRequirements.includes(capability),
        )
      )
        return assignment.id;
    }
    throw executionError(
      "DESTINATION_CAPABILITY_GAP",
      "No existing destination assignment satisfies the requested capabilities.",
      409,
    );
  }
  private async validateSelectedAssignment(request: CrossCompanyServiceRequest) {
    if (!request.destinationAssignmentId)
      throw executionError(
        "DESTINATION_ASSIGNMENT_MISSING",
        "No destination assignment was selected.",
      );
    const assignment = (
      await this.agents.listAssignments(request.ownerId, request.destinationCompanyId)
    ).find(
      (item) => item.id === request.destinationAssignmentId && item.status === "ACTIVE",
    );
    if (!assignment)
      throw executionError(
        "DESTINATION_ASSIGNMENT_INACTIVE",
        "Selected destination assignment is no longer active.",
        403,
      );
  }
  private outputBoundary(
    request: CrossCompanyServiceRequest,
    result: CrossCompanyServiceResult,
  ) {
    return CompleteCrossCompanyServiceRequestSchema.shape.result.parse({
      summary: result.summary,
      structuredResult: request.permittedOutputTypes.includes("STRUCTURED_RESULT")
        ? result.structuredResult
        : null,
      artifactRefs: request.permittedOutputTypes.includes("ARTIFACTS")
        ? result.artifactRefs
        : [],
      metricRefs: request.permittedOutputTypes.includes("METRICS")
        ? result.metricRefs
        : [],
      evidenceRefs: request.permittedOutputTypes.includes("EVIDENCE")
        ? result.evidenceRefs
        : [],
      verification: result.verification,
      reviewOutcome: result.reviewOutcome,
    });
  }
  private approvalAction(request: CrossCompanyServiceRequest) {
    return {
      actionId: request.id,
      toolName: "company.cross_company_service",
      arguments: {
        serviceRequestId: request.id,
        sourceCompanyId: request.sourceCompanyId,
        destinationCompanyId: request.destinationCompanyId,
        serviceType: request.serviceType,
        sharingScope: request.sharedInput.scope,
        budgetCredits: request.budgetCredits,
      },
    };
  }
  private async destinationGovernor(ownerId: string, companyId: string) {
    return (
      (await this.agents.listAssignments(ownerId, companyId)).find(
        (item) => item.isGovernor && item.status === "ACTIVE",
      )?.id ?? null
    );
  }
  private async park(
    execution: Awaited<ReturnType<CrossCompanyExecutionService["requireExecution"]>>,
    status: "WAITING_EXTERNAL" | "PAUSED",
    reason: string,
  ) {
    const updated = DurableExecutionSchema.parse({
      ...execution,
      status,
      nextRunAt: null,
      updatedAt: this.now().toISOString(),
      version: execution.version + 1,
    });
    await this.store.saveExecution(updated);
    await this.event(updated, status, updated.currentStep, reason, {});
    return updated;
  }
  private async parkForReview(
    request: CrossCompanyServiceRequest,
    execution: Awaited<ReturnType<CrossCompanyExecutionService["requireExecution"]>>,
    reason: string,
  ) {
    await this.store.saveServiceRequest(
      CrossCompanyServiceRequestSchema.parse({
        ...request,
        status: "REVIEW",
        waitReason: reason,
        updatedAt: this.now().toISOString(),
      }),
    );
    const updated = DurableExecutionSchema.parse({
      ...execution,
      status: "REVIEW",
      updatedAt: this.now().toISOString(),
      version: execution.version + 1,
    });
    await this.store.saveExecution(updated);
    return updated;
  }
  private async fail(
    request: CrossCompanyServiceRequest,
    execution: Awaited<ReturnType<CrossCompanyExecutionService["requireExecution"]>>,
    failureClass: DurableFailureClass,
    code: string,
    context: { requestId: string; ipAddress: string },
    executionStatus: "FAILED" | "CANCELLED" = "FAILED",
  ) {
    request = await this.closeEconomy(
      request,
      request.actualCostCredits > 0 ? "SETTLE" : "RELEASE",
    );
    const at = this.now().toISOString();
    const failedRequest = CrossCompanyServiceRequestSchema.parse({
      ...request,
      status: executionStatus,
      failureClass,
      failureCode: code,
      currentStep: null,
      waitReason: code,
      updatedAt: at,
      completedAt: at,
    });
    const failed = DurableExecutionSchema.parse({
      ...execution,
      status: executionStatus,
      currentStep: null,
      updatedAt: at,
      completedAt: at,
      version: execution.version + 1,
    });
    await this.store.saveServiceRequest(failedRequest);
    await this.store.saveExecution(failed);
    await this.event(failed, executionStatus, null, code, { failureClass });
    await this.auditState(failedRequest, code, context);
    await this.#workforce?.release(failedRequest);
    return failed;
  }

  private async closeEconomy(
    request: CrossCompanyServiceRequest,
    action: "SETTLE" | "RELEASE",
  ) {
    if (!this.#economy || request.economyState !== "RESERVED") return request;
    if (action === "SETTLE")
      await this.#economy.settle(request, request.actualCostCredits);
    else await this.#economy.release(request);
    const updated = CrossCompanyServiceRequestSchema.parse({
      ...request,
      economyState: action === "SETTLE" ? "SETTLED" : "RELEASED",
      settledCostCredits:
        action === "SETTLE" ? Math.ceil(request.actualCostCredits) : 0,
      updatedAt: this.now().toISOString(),
    });
    await this.store.saveServiceRequest(updated);
    await this.audit?.({
      eventType:
        action === "SETTLE"
          ? "CROSS_COMPANY_ECONOMY_SETTLED"
          : "CROSS_COMPANY_ECONOMY_RELEASED",
      ownerId: request.ownerId,
      companyId: request.payingCompanyId ?? request.destinationCompanyId,
      outcome: "SUCCESS",
      reason:
        action === "SETTLE"
          ? "Agent Economy settled the verified actual service cost."
          : "Agent Economy released the unused service reservation.",
      requestId: `economy-close:${request.id}`,
      ipAddress: "internal",
      metadata: {
        serviceRequestId: request.id,
        reservationId: request.economyReservationId,
        settledCredits: updated.settledCostCredits,
      },
    });
    return updated;
  }
  private classifyFailure(error: unknown): {
    failureClass: DurableFailureClass;
    code: string;
  } {
    const value = error as {
      code?: string;
      failureClass?: DurableFailureClass;
      statusCode?: number;
    };
    const policyCodes = new Set([
      "COLLABORATION_POLICY_MISSING",
      "COLLABORATION_PEER_DENIED",
      "COMPANY_NOT_ACTIVE",
      "EXTERNAL_TRANSFER_DENIED",
      "SERVICE_TYPE_DENIED",
      "SHARING_SCOPE_DENIED",
      "SERVICE_CAPABILITY_DENIED",
      "SERVICE_BUDGET_DENIED",
      "DESTINATION_ASSIGNMENT_INACTIVE",
    ]);
    return {
      failureClass:
        value.failureClass ??
        (value.code === "BUDGET_BLOCKED" ||
        value.code === "INSUFFICIENT_ECONOMIC_BUDGET"
          ? "BUDGET"
          : policyCodes.has(value.code ?? "")
            ? "POLICY"
            : [
                  "TIMEOUT",
                  "RATE_LIMITED",
                  "PROVIDER_UNAVAILABLE",
                  "SANDBOX_UNAVAILABLE",
                ].includes(value.code ?? "")
              ? "TRANSIENT"
              : value.statusCode === 403
                ? "POLICY"
                : "PERMANENT"),
      code: value.code ?? "ACTIVITY_FAILED",
    };
  }
  private async event(
    execution: Awaited<ReturnType<CrossCompanyExecutionService["requireExecution"]>>,
    eventType: string,
    step: string | null,
    summary: string,
    metadata: Record<string, string | number | boolean | null>,
  ) {
    const sequence =
      (await this.store.listEvents(execution.ownerId, execution.id)).length + 1;
    await this.store.appendEvent(
      DurableExecutionEventSchema.parse({
        id: crypto.randomUUID(),
        ownerId: execution.ownerId,
        companyId: execution.companyId,
        executionId: execution.id,
        sequence,
        eventType,
        step,
        summary,
        metadata,
        createdAt: this.now().toISOString(),
      }),
    );
  }
  private async auditState(
    request: CrossCompanyServiceRequest,
    reason: string,
    context: { requestId: string; ipAddress: string },
  ) {
    await this.audit?.({
      eventType: "CROSS_COMPANY_SERVICE_STATE_CHANGED",
      ownerId: request.ownerId,
      companyId: request.destinationCompanyId,
      outcome:
        request.status === "FAILED" || request.status === "REJECTED"
          ? "FAILURE"
          : "SUCCESS",
      reason,
      metadata: {
        serviceRequestId: request.id,
        status: request.status,
        traceId: request.traceId,
      },
      ...context,
    });
  }
  private async requireCompany(ownerId: string, companyId: string) {
    const company = await this.companies.findCompany(ownerId, companyId);
    if (!company)
      throw executionError(
        "COMPANY_SCOPE_MISMATCH",
        "Company is outside the authenticated owner portfolio.",
        404,
      );
    return company;
  }
  private async requirePolicy(ownerId: string, companyId: string) {
    const policy = await this.store.findPolicy(ownerId, companyId);
    if (!policy)
      throw executionError(
        "COLLABORATION_POLICY_MISSING",
        "Cross-company work is denied until an explicit company collaboration policy exists.",
        403,
      );
    return policy;
  }
  private async requireRequest(ownerId: string, id: string) {
    const request = await this.store.findServiceRequest(ownerId, id);
    if (!request)
      throw executionError(
        "SERVICE_REQUEST_NOT_FOUND",
        "Cross-company service request was not found.",
        404,
      );
    return request;
  }
  private async requireExecution(ownerId: string, id: string) {
    const execution = await this.store.findExecution(ownerId, id);
    if (!execution)
      throw executionError(
        "DURABLE_EXECUTION_NOT_FOUND",
        "Durable execution was not found.",
        404,
      );
    return execution;
  }
}

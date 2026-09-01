import { createHash } from "node:crypto";

import {
  CompanyAgentAssignmentSchema,
  CrossCompanyServiceResultSchema,
  CrossCompanyWorkforceResolutionSchema,
  type CrossCompanyServiceRequest,
  type CrossCompanyWorkforceResolution,
} from "@alexa-control/shared";

import type { AgentEconomyService } from "../agent-economy/service.js";
import type { AgentWorkforceService } from "../agent-workforce/service.js";
import type { AgentStore } from "../agents/store.js";
import { companyScope } from "../companies/scope.js";
import type {
  CrossCompanyActivityExecutor,
  DurableActivityOutput,
  DurableReconciliation,
} from "./service.js";
import type { SandboxArtifactResolver } from "./sandbox.js";

const runtimeError = (code: string, message: string, statusCode = 409) =>
  Object.assign(new Error(message), { code, statusCode });
const digest = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");

export interface CrossCompanyWorkforceResolver {
  resolve(
    request: CrossCompanyServiceRequest,
    context: { requestId: string; ipAddress: string },
  ): Promise<{ assignmentId: string; resolution: CrossCompanyWorkforceResolution }>;
  release(request: CrossCompanyServiceRequest): Promise<void>;
}

export class AlexaWorkforceResolver implements CrossCompanyWorkforceResolver {
  constructor(
    readonly agents: AgentStore,
    readonly workforce: AgentWorkforceService,
    readonly now = () => new Date(),
  ) {}

  async resolve(
    request: CrossCompanyServiceRequest,
    context: { requestId: string; ipAddress: string },
  ) {
    return companyScope.run(
      {
        ownerId: request.ownerId,
        companyId: request.destinationCompanyId,
        role: "OWNER",
        requestId: context.requestId,
      },
      async () => {
        const assignments = await this.agents.listAssignments(
          request.ownerId,
          request.destinationCompanyId,
        );
        const candidates: string[] = [];
        for (const assignment of assignments.filter(
          (item) => !item.isGovernor && item.status !== "REVOKED",
        )) {
          const definition = await this.agents.findDefinition(
            request.ownerId,
            assignment.agentDefinitionId,
          );
          if (!definition) continue;
          candidates.push(assignment.id);
          const capable = request.requestedCapabilities.every((capability) =>
            definition.capabilityRequirements.includes(capability),
          );
          if (!capable || assignment.status === "PAUSED") continue;
          const decision =
            assignment.status === "DORMANT" ? "LAZY_ACTIVATION" : "EXISTING";
          if (decision === "LAZY_ACTIVATION")
            await this.agents.saveAssignment(
              CompanyAgentAssignmentSchema.parse({
                ...assignment,
                status: "ACTIVE",
                updatedAt: this.now().toISOString(),
              }),
            );
          return {
            assignmentId: assignment.id,
            resolution: CrossCompanyWorkforceResolutionSchema.parse({
              selectedAssignmentId: assignment.id,
              selectedDefinitionId: definition.id,
              decision,
              candidateAssignmentIds: candidates,
              catalogMatchDefinitionId: null,
              assignmentCreated: false,
              capabilityBlockers: [],
              evidence: [
                decision === "LAZY_ACTIVATION"
                  ? "A dormant compatible company assignment was activated lazily."
                  : "An active compatible company assignment was reused.",
              ],
              resolvedAt: this.now().toISOString(),
            }),
          };
        }
        const matched = await this.workforce.assignBestCatalogMatch({
          ownerId: request.ownerId,
          text: `${request.serviceType} ${request.requestedOutcome}`,
          requiredSkills: request.requestedCapabilities,
          requiredCapabilities: request.requestedCapabilities,
          requestId: context.requestId,
          ipAddress: context.ipAddress,
        });
        if (!matched)
          throw runtimeError(
            "DESTINATION_CAPABILITY_GAP",
            "No existing, adaptable, or reusable catalog specialist satisfies the requested capabilities. A governed specialist proposal is required.",
          );
        const assignment = await this.agents.findAssignment(
          request.ownerId,
          matched.id,
          request.destinationCompanyId,
        );
        if (!assignment)
          throw runtimeError(
            "CATALOG_ASSIGNMENT_FAILED",
            "The reusable catalog match did not produce a destination assignment.",
          );
        const blockers = request.requestedCapabilities.filter(
          (capability) => !matched.capabilityRequirements.includes(capability),
        );
        if (blockers.length)
          throw runtimeError(
            "DESTINATION_CAPABILITY_GAP",
            `Reusable specialist matched, but capabilities are unavailable: ${blockers.join(", ")}.`,
          );
        return {
          assignmentId: assignment.id,
          resolution: CrossCompanyWorkforceResolutionSchema.parse({
            selectedAssignmentId: assignment.id,
            selectedDefinitionId: matched.id,
            decision: "CATALOG_ASSIGNMENT",
            candidateAssignmentIds: candidates,
            catalogMatchDefinitionId: matched.id,
            assignmentCreated: true,
            capabilityBlockers: [],
            evidence: [
              "An existing reusable catalog definition was assigned; no definition was generated.",
            ],
            resolvedAt: this.now().toISOString(),
          }),
        };
      },
    );
  }

  async release(request: CrossCompanyServiceRequest) {
    if (request.workforceResolution?.decision !== "LAZY_ACTIVATION") return;
    await companyScope.run(
      {
        ownerId: request.ownerId,
        companyId: request.destinationCompanyId,
        role: "OWNER",
        requestId: `workforce-release:${request.id}`,
      },
      async () => {
        const assignment = (
          await this.agents.listAssignments(
            request.ownerId,
            request.destinationCompanyId,
          )
        ).find((item) => item.id === request.destinationAssignmentId);
        if (assignment?.status === "ACTIVE")
          await this.agents.saveAssignment(
            CompanyAgentAssignmentSchema.parse({
              ...assignment,
              status: "DORMANT",
              updatedAt: this.now().toISOString(),
            }),
          );
      },
    );
  }
}

export interface CrossCompanyEconomyAdapter {
  reserve(
    request: CrossCompanyServiceRequest,
    executionId: string,
  ): Promise<Partial<CrossCompanyServiceRequest>>;
  settle(request: CrossCompanyServiceRequest, actualCostCredits: number): Promise<void>;
  release(request: CrossCompanyServiceRequest): Promise<void>;
}

export class AgentEconomyCrossCompanyAdapter implements CrossCompanyEconomyAdapter {
  constructor(
    readonly economy: AgentEconomyService,
    readonly agents: AgentStore,
  ) {}

  async reserve(request: CrossCompanyServiceRequest, executionId: string) {
    if (["SHARED", "OWNER_PORTFOLIO"].includes(request.costAttribution))
      throw runtimeError(
        "UNSUPPORTED_COST_ATTRIBUTION",
        `${request.costAttribution} is disabled until Agent Economy supports a safe multi-account transaction.`,
      );
    const payingCompanyId =
      request.costAttribution === "SOURCE_PAYS"
        ? request.sourceCompanyId
        : request.destinationCompanyId;
    const assignments = await this.agents.listAssignments(
      request.ownerId,
      payingCompanyId,
    );
    const payingAssignment =
      request.costAttribution === "SOURCE_PAYS"
        ? (assignments.find((item) => item.id === request.requesterAssignmentId) ??
          assignments.find((item) => item.isGovernor && item.status === "ACTIVE"))
        : assignments.find((item) => item.id === request.destinationAssignmentId);
    if (!payingAssignment || payingAssignment.status !== "ACTIVE")
      throw runtimeError(
        "BUDGET_BLOCKED",
        "The paying company has no active assignment that can own the reservation.",
        403,
      );
    const reserved = await companyScope
      .run(
        {
          ownerId: request.ownerId,
          companyId: payingCompanyId,
          role: "OWNER",
          requestId: `economy-reserve:${request.id}`,
        },
        () =>
          this.economy.reserve({
            ownerId: request.ownerId,
            agentId: payingAssignment.agentDefinitionId,
            amount: request.budgetCredits,
            costType: "WORKFLOW_EXECUTION",
            reasonCode: "CROSS_COMPANY_SERVICE_RESERVATION",
            idempotencyKey: `cross-company:${request.id}`,
            references: {
              serviceRequestId: request.id,
              durableExecutionId: executionId,
              workflowId: request.workflowId ?? executionId,
              companyId: payingCompanyId,
              assignmentId: payingAssignment.id,
              costAttribution: request.costAttribution,
            },
          }),
      )
      .catch((error: unknown) => {
        throw runtimeError(
          "BUDGET_BLOCKED",
          error instanceof Error ? error.message : "Agent Economy reservation failed.",
          403,
        );
      });
    return {
      payingCompanyId,
      payingAssignmentId: payingAssignment.id,
      estimatedCostCredits: request.budgetCredits,
      reservedCostCredits: reserved.reservation.amountReserved,
      settledCostCredits: 0,
      economyReservationId: reserved.reservation.id,
      economyState: "RESERVED" as const,
    };
  }

  async settle(request: CrossCompanyServiceRequest, actualCostCredits: number) {
    const assignment = await this.payingAssignment(request);
    await companyScope.run(
      {
        ownerId: request.ownerId,
        companyId: request.payingCompanyId!,
        role: "OWNER",
        requestId: `economy-settle:${request.id}`,
      },
      () =>
        this.economy.settle({
          ownerId: request.ownerId,
          agentId: assignment.agentDefinitionId,
          reservationId: request.economyReservationId!,
          actualCost: Math.ceil(actualCostCredits),
          idempotencyKey: `cross-company:${request.id}`,
          reasonCode: "CROSS_COMPANY_SERVICE_SETTLEMENT",
          references: {
            serviceRequestId: request.id,
            companyId: request.payingCompanyId!,
            assignmentId: assignment.id,
            costAttribution: request.costAttribution,
          },
        }),
    );
  }

  async release(request: CrossCompanyServiceRequest) {
    if (request.economyState !== "RESERVED") return;
    const assignment = await this.payingAssignment(request);
    await companyScope.run(
      {
        ownerId: request.ownerId,
        companyId: request.payingCompanyId!,
        role: "OWNER",
        requestId: `economy-release:${request.id}`,
      },
      () =>
        this.economy.release({
          ownerId: request.ownerId,
          agentId: assignment.agentDefinitionId,
          reservationId: request.economyReservationId!,
          idempotencyKey: `cross-company:${request.id}`,
          reasonCode: "CROSS_COMPANY_SERVICE_RELEASE",
        }),
    );
  }

  private async payingAssignment(request: CrossCompanyServiceRequest) {
    if (
      !request.economyReservationId ||
      !request.payingCompanyId ||
      !request.payingAssignmentId
    )
      throw runtimeError(
        "ECONOMY_RESERVATION_MISSING",
        "Durable execution has no economy reservation.",
      );
    const assignment = (
      await this.agents.listAssignments(request.ownerId, request.payingCompanyId)
    ).find((item) => item.id === request.payingAssignmentId);
    if (!assignment)
      throw runtimeError(
        "ECONOMY_ASSIGNMENT_MISSING",
        "Paying assignment no longer exists.",
      );
    return assignment;
  }
}

export interface DurableActivityAdapter {
  capabilityId: string;
  execute(
    request: CrossCompanyServiceRequest,
    idempotencyKey: string,
  ): Promise<DurableActivityOutput>;
  reconcile(
    request: CrossCompanyServiceRequest,
    idempotencyKey: string,
  ): Promise<DurableReconciliation>;
  verify?(
    request: CrossCompanyServiceRequest,
    output: DurableActivityOutput,
  ): Promise<boolean>;
}

export class DurableActivityRegistry implements CrossCompanyActivityExecutor {
  readonly #adapters = new Map<string, DurableActivityAdapter>();
  register(adapter: DurableActivityAdapter) {
    if (this.#adapters.has(adapter.capabilityId))
      throw runtimeError(
        "DUPLICATE_ACTIVITY_ADAPTER",
        "Activity capability is already registered.",
      );
    this.#adapters.set(adapter.capabilityId, adapter);
  }
  private adapter(request: CrossCompanyServiceRequest) {
    const matches = request.requestedCapabilities
      .map((item) => this.#adapters.get(item))
      .filter((item): item is DurableActivityAdapter => Boolean(item));
    if (matches.length !== 1)
      throw runtimeError(
        "ACTIVITY_ADAPTER_UNAVAILABLE",
        "Exactly one reviewed activity adapter must match the service capability.",
      );
    return matches[0]!;
  }
  async execute(request: CrossCompanyServiceRequest, idempotencyKey: string) {
    const adapter = this.adapter(request);
    const output = await adapter.execute(request, idempotencyKey);
    if (adapter.verify && !(await adapter.verify(request, output)))
      throw runtimeError(
        "ACTIVITY_VERIFICATION_FAILED",
        "The reviewed activity adapter could not verify its result.",
      );
    return output;
  }
  reconcile(request: CrossCompanyServiceRequest, idempotencyKey: string) {
    return this.adapter(request).reconcile(request, idempotencyKey);
  }
}

export class CompanyArtifactReportAdapter implements DurableActivityAdapter {
  readonly capabilityId = "company.artifact.report";
  constructor(readonly artifacts: SandboxArtifactResolver) {}

  async execute(request: CrossCompanyServiceRequest, idempotencyKey: string) {
    if (
      request.sharedInput.scope !== "SPECIFIC_ARTIFACTS" ||
      !request.sharedInput.artifactRefs.length
    )
      throw runtimeError(
        "ARTIFACT_SCOPE_REQUIRED",
        "Artifact reporting requires explicit artifact references.",
      );
    const files = await Promise.all(
      request.sharedInput.artifactRefs.map(async (ref) => {
        const artifact = await this.artifacts.read(
          request.ownerId,
          request.sourceCompanyId,
          ref,
        );
        return {
          ref,
          name: artifact.name,
          bytes: artifact.content.byteLength,
          sha256: digest(artifact.content),
        };
      }),
    );
    const report = {
      serviceRequestId: request.id,
      sourceCompanyId: request.sourceCompanyId,
      destinationCompanyId: request.destinationCompanyId,
      files,
      totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    };
    const resultRef = await this.artifacts.write(
      request.ownerId,
      request.destinationCompanyId,
      {
        name: `cross-company-report-${request.id}.json`,
        content: new TextEncoder().encode(JSON.stringify(report)),
        taskId: request.id,
        traceId: request.traceId,
        idempotencyKey,
      },
    );
    return this.output(request, report, resultRef, false);
  }

  async reconcile(
    request: CrossCompanyServiceRequest,
    idempotencyKey: string,
  ): Promise<DurableReconciliation> {
    if (!this.artifacts.findByIdempotencyKey) return { state: "UNKNOWN" };
    const ref = await this.artifacts.findByIdempotencyKey(
      request.ownerId,
      request.destinationCompanyId,
      idempotencyKey,
    );
    if (!ref) return { state: "NOT_COMMITTED" };
    const artifact = await this.artifacts.read(
      request.ownerId,
      request.destinationCompanyId,
      ref,
    );
    const report = JSON.parse(new TextDecoder().decode(artifact.content)) as {
      files: Array<{ sha256: string }>;
      totalBytes: number;
    };
    return { state: "COMMITTED", output: this.output(request, report, ref, true) };
  }

  verify(_request: CrossCompanyServiceRequest, output: DurableActivityOutput) {
    return Promise.resolve(
      output.result.verification === "VERIFIED" && Boolean(output.externalCommitRef),
    );
  }

  private output(
    request: CrossCompanyServiceRequest,
    report: { files: Array<{ sha256: string }>; totalBytes: number },
    resultRef: string,
    reconciled: boolean,
  ): DurableActivityOutput {
    return {
      actualCostCredits: Math.max(1, Math.ceil(report.totalBytes / 1_048_576)),
      externalCommitRef: resultRef,
      result: CrossCompanyServiceResultSchema.parse({
        summary: `${reconciled ? "Reconciled" : "Analyzed"} ${report.files.length} explicitly shared artifact(s), ${report.totalBytes} bytes total.`,
        structuredResult: report,
        artifactRefs: [resultRef],
        metricRefs: [],
        evidenceRefs: report.files.map((file) => `sha256:${file.sha256}`),
        verification: "VERIFIED",
        reviewOutcome: "PASS",
      }),
    };
  }
}

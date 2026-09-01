/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/require-await */
import { createHash } from "node:crypto";

import {
  AgentDefinitionSchema,
  CompanyAgentAssignmentSchema,
  CompanyDataPolicySchema,
  CompanyMembershipSchema,
  CompanySchema,
  DurableActivityReceiptSchema,
} from "@alexa-control/shared";
import { describe, expect, it, vi } from "vitest";

import { AgentEconomyService } from "../agent-economy/service.js";
import { InMemoryAgentEconomyStore } from "../agent-economy/store.js";
import type { AgentWorkforceService } from "../agent-workforce/service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import { InMemoryCompanyDataStore } from "../company-data/store.js";
import { companyScope } from "../companies/scope.js";
import { InMemoryCompanyStore } from "../companies/store.js";
import { ApprovalService } from "../governance/approval-service.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { NoopTelemetrySink } from "../telemetry/service.js";
import {
  AgentEconomyCrossCompanyAdapter,
  AlexaWorkforceResolver,
  CompanyArtifactReportAdapter,
  DurableActivityRegistry,
} from "./production.js";
import type { SandboxArtifactResolver } from "./sandbox.js";
import { DurableExecutionScheduler } from "./scheduler.js";
import { CrossCompanyExecutionService } from "./service.js";
import { InMemoryDurableExecutionStore } from "./store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const nova = "20000000-0000-4000-8000-000000000001";
const atlas = "20000000-0000-4000-8000-000000000002";
const assignmentId = "40000000-0000-4000-8000-000000000001";
const at = "2026-09-01T00:00:00.000Z";
const context = { requestId: "phase-25-6-e2e", ipAddress: "127.0.0.1" };

describe("Phase 25.6 complete production-like acceptance", () => {
  it("recovers across API and worker failure, reconciles one effect, and settles once", async () => {
    const companies = new InMemoryCompanyStore();
    const companyData = new InMemoryCompanyDataStore();
    const agents = new InMemoryAgentStore();
    const durableStore = new InMemoryDurableExecutionStore();
    const approvals = new ApprovalService(
      new InMemoryGovernanceStore([], false),
      async () => undefined,
    );
    for (const [id, name] of [
      [nova, "Nova"],
      [atlas, "Atlas"],
    ] as const) {
      companies.createCompany(
        CompanySchema.parse({
          id,
          ownerId,
          slug: name.toLowerCase(),
          name,
          status: "ACTIVE",
          timezone: "UTC",
          defaultCurrency: "USD",
          createdAt: at,
          updatedAt: at,
          activatedAt: at,
        }),
        CompanyMembershipSchema.parse({
          companyId: id,
          principalId: ownerId,
          principalType: "OWNER",
          role: "OWNER",
          status: "ACTIVE",
          createdAt: at,
          updatedAt: at,
        }),
      );
      companyData.savePolicy(
        CompanyDataPolicySchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          companyId: id,
          rules: [],
          modelRouting: {
            PUBLIC: "ANY_APPROVED",
            INTERNAL: "APPROVED_CLOUD",
            CONFIDENTIAL: "LOCAL_ONLY",
            RESTRICTED: "LOCAL_ONLY",
            approvedCloudProviderIds: [],
          },
          externalTransferAllowed: true,
          status: "ACTIVE",
          version: 1,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
    agents.upsertDefinition(
      AgentDefinitionSchema.parse({
        id: "artifact-specialist",
        ownerId,
        canonicalKey: "artifact-specialist",
        name: "Artifact Specialist",
        role: "review",
        description: "Creates bounded reports from explicitly shared artifacts.",
        skills: ["artifact analysis"],
        capabilityRequirements: ["company.artifact.report"],
        dataRequirements: [],
        supportedTasks: ["artifact.report"],
        defaultModelPolicy: "LOCAL_FIRST",
        defaultSafetyPolicy: "strict",
        defaultOperatingPolicy: "reviewed",
        executionPlacement: "LOCAL_ONLY",
        evaluationProfile: ["evidence"],
        generalizedReputationPrior: 50,
        generalizedCalibrationPrior: 0.5,
        provenance: "OWNER_CREATED",
        sourcePath: null,
        sourceVersion: null,
        license: null,
        version: "1",
        status: "ACTIVE",
        createdAt: at,
        updatedAt: at,
      }),
    );
    agents.saveAssignment(
      CompanyAgentAssignmentSchema.parse({
        id: assignmentId,
        ownerId,
        companyId: atlas,
        agentDefinitionId: "artifact-specialist",
        organizationId: "60000000-0000-4000-8000-000000000001",
        departmentId: null,
        managerAssignmentId: null,
        managerAgentDefinitionId: null,
        governorAssignmentId: null,
        status: "ACTIVE",
        memoryScopeId: "assignment:atlas:artifact-specialist",
        departmentMemoryScopeId: null,
        organizationMemoryScopeId: "company:atlas",
        capabilityGrantProfileId: "artifact-report-grants",
        economyPolicyId: "artifact-report-economy",
        modelPolicyOverride: null,
        localReputation: null,
        localCalibration: null,
        companyInstructions: null,
        isGovernor: false,
        createdAt: at,
        updatedAt: at,
        revokedAt: null,
      }),
    );
    agents.upsertAgent({
      schemaVersion: "1",
      id: "artifact-specialist",
      ownerId,
      role: "review",
      displayName: "Artifact Specialist",
      version: "1",
      status: "available",
      capabilities: ["company.artifact.report"],
      supportedTasks: ["artifact.report"],
      configuration: {},
      createdAt: at,
      updatedAt: at,
      healthSummary: "Registered without a dedicated runtime.",
    });
    const economyStore = new InMemoryAgentEconomyStore();
    const economy = new AgentEconomyService(economyStore, agents, vi.fn());
    await companyScope.run(
      { ownerId, companyId: atlas, role: "OWNER", requestId: "fund" },
      async () => {
        await economy.enroll(ownerId, "artifact-specialist", {}, "fund", "internal");
        await economy.allocate({
          ownerId,
          agentId: "artifact-specialist",
          amount: 100,
          reasonCode: "ACCEPTANCE_FUNDS",
          idempotencyKey: "fund:atlas:e2e",
          requestId: "fund",
          ipAddress: "internal",
        });
        await economy.setStatus(
          ownerId,
          "artifact-specialist",
          "ACTIVE",
          "fund",
          "internal",
        );
      },
    );

    const objects = new Map<string, Uint8Array>();
    const idempotency = new Map<string, string>();
    let writes = 0;
    objects.set(`${nova}:artifact:nova:approved`, new TextEncoder().encode("approved"));
    const artifacts: SandboxArtifactResolver = {
      async read(_ownerId, companyId, ref) {
        const content = objects.get(`${companyId}:${ref}`);
        if (!content) throw new Error("Company-scoped artifact not found.");
        return { name: "approved.txt", content };
      },
      async write(_ownerId, companyId, input) {
        const prior = input.idempotencyKey
          ? idempotency.get(`${companyId}:${input.idempotencyKey}`)
          : undefined;
        if (prior) return prior;
        writes += 1;
        const ref = `artifact:${companyId}:report`;
        objects.set(`${companyId}:${ref}`, input.content);
        if (input.idempotencyKey)
          idempotency.set(`${companyId}:${input.idempotencyKey}`, ref);
        return ref;
      },
      async findByIdempotencyKey(_ownerId, companyId, key) {
        return idempotency.get(`${companyId}:${key}`);
      },
    };
    const activities = new DurableActivityRegistry();
    activities.register(new CompanyArtifactReportAdapter(artifacts));
    const workforce = new AlexaWorkforceResolver(
      agents,
      { assignBestCatalogMatch: vi.fn() } as unknown as AgentWorkforceService,
      () => new Date(at),
    );
    const economyAdapter = new AgentEconomyCrossCompanyAdapter(economy, agents);
    const makeService = () => {
      const service = new CrossCompanyExecutionService(
        durableStore,
        companies,
        companyData,
        agents,
        approvals,
        new NoopTelemetrySink(),
        activities,
        vi.fn(),
        () => new Date(at),
      );
      service.setProductionRuntime({
        activity: activities,
        economy: economyAdapter,
        workforce,
      });
      return service;
    };
    let service = makeService();
    const policy = (peer: string) => ({
      allowedDestinationCompanyIds: [peer],
      allowedServiceTypes: ["ARTIFACT_REPORT"],
      allowedSharingScopes: ["SPECIFIC_ARTIFACTS" as const],
      allowedCapabilities: ["company.artifact.report"],
      maxBudgetCredits: 100,
      approvalThresholdCredits: 5,
      maxConcurrentServices: 5,
    });
    await service.upsertPolicy(ownerId, nova, policy(atlas), context);
    await service.upsertPolicy(ownerId, atlas, policy(nova), context);
    const request = await service.createRequest(
      ownerId,
      {
        sourceCompanyId: nova,
        destinationCompanyId: atlas,
        requesterAssignmentId: null,
        serviceType: "ARTIFACT_REPORT",
        requestedOutcome: "Analyze the explicitly approved artifact.",
        objectiveId: null,
        workflowId: null,
        requestedCapabilities: ["company.artifact.report"],
        sharedInput: {
          scope: "SPECIFIC_ARTIFACTS",
          artifactRefs: ["artifact:nova:approved"],
          metricRefs: [],
          contextRefs: [],
          summary: null,
        },
        permittedOutputTypes: ["STRUCTURED_RESULT", "ARTIFACTS", "EVIDENCE"],
        confidentiality: "INTERNAL",
        budgetCredits: 10,
        costAttribution: "DESTINATION_PAYS",
        deadline: "2026-09-02T00:00:00.000Z",
        priority: "NORMAL",
      },
      context,
    );
    expect(request.status).toBe("NEEDS_APPROVAL");

    // Reconstruct the API while the approval is pending, then resume.
    service = makeService();
    await companyScope.run(
      { ownerId, companyId: atlas, role: "OWNER", requestId: context.requestId },
      () =>
        approvals.approve(ownerId, request.approvalId!, crypto.randomUUID(), context),
    );
    const accepted = await service.destinationDecision(
      ownerId,
      request.id,
      "ACCEPT",
      undefined,
      context,
    );
    expect(accepted.economyState).toBe("RESERVED");
    expect(accepted.destinationAssignmentId).toBe(assignmentId);
    expect(await durableStore.listExecutions(ownerId, atlas)).toHaveLength(1);

    const execution = (await durableStore.listExecutions(ownerId, atlas))[0]!;
    const schedulerA = new DurableExecutionScheduler(
      durableStore,
      service,
      "worker-a",
      {
        pollIntervalMs: 1_000,
        leaseMs: 1_000,
        globalConcurrency: 2,
        perCompanyConcurrency: 1,
      },
      () => new Date(at),
    );
    await schedulerA.tick();

    // Restart again, advance to the activity, then simulate a crash after commit.
    service = makeService();
    const schedulerB = new DurableExecutionScheduler(
      durableStore,
      service,
      "worker-b",
      {
        pollIntervalMs: 1_000,
        leaseMs: 1_000,
        globalConcurrency: 2,
        perCompanyConcurrency: 1,
      },
      () => new Date(at),
    );
    await schedulerB.tick();
    const activityKey = createHash("sha256")
      .update(`${execution.id}:EXECUTE_SERVICE`)
      .digest("hex");
    await durableStore.saveReceipt(
      DurableActivityReceiptSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        companyId: atlas,
        executionId: execution.id,
        step: "EXECUTE_SERVICE",
        idempotencyKey: activityKey,
        status: "STARTED",
        externalCommitRef: null,
        resultSummary: null,
        requestDigest: createHash("sha256").update(request.id).digest("hex"),
        commitEvidenceRef: null,
        resultRef: null,
        attempt: 1,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await activities.execute(accepted, activityKey);
    expect(writes).toBe(1);

    // A different worker reconciles the committed effect and finishes the workflow.
    service = makeService();
    const schedulerRecovery = new DurableExecutionScheduler(
      durableStore,
      service,
      "worker-recovery",
      {
        pollIntervalMs: 1_000,
        leaseMs: 30_000,
        globalConcurrency: 2,
        perCompanyConcurrency: 1,
      },
      () => new Date(at),
    );
    await schedulerRecovery.tick();
    await schedulerRecovery.tick();
    await schedulerRecovery.tick();

    const completed = await durableStore.findServiceRequest(ownerId, request.id);
    expect(completed).toMatchObject({
      status: "COMPLETED",
      economyState: "SETTLED",
      actualCostCredits: 1,
      settledCostCredits: 1,
    });
    expect(writes).toBe(1);
    expect(await durableStore.listExecutions(ownerId, atlas)).toHaveLength(1);
    const history = await durableStore.listEvents(ownerId, execution.id);
    expect(history.map((item) => item.sequence)).toEqual(
      history.map((_, index) => index + 1),
    );
    expect(history.filter((item) => item.eventType === "WORKER_CLAIMED")).toHaveLength(
      5,
    );
    const account = await companyScope.run(
      { ownerId, companyId: atlas, role: "OWNER", requestId: "inspect" },
      () => economy.dashboard(ownerId),
    );
    expect(account.accounts[0]).toMatchObject({
      availableCredits: 99,
      reservedCredits: 0,
      lifetimeSpent: 1,
    });
    const novaEconomy = await companyScope.run(
      { ownerId, companyId: nova, role: "OWNER", requestId: "inspect" },
      () => economy.dashboard(ownerId),
    );
    expect(novaEconomy.accounts).toHaveLength(0);
  });
});

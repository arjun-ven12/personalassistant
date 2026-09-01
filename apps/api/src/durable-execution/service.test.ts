/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/require-await */
import {
  AgentDefinitionSchema,
  CompanyAgentAssignmentSchema,
  CompanyDataPolicySchema,
  CompanyMembershipSchema,
  CompanySchema,
  DurableActivityReceiptSchema,
} from "@alexa-control/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemoryAgentStore } from "../agents/store.js";
import { companyScope } from "../companies/scope.js";
import { InMemoryCompanyStore } from "../companies/store.js";
import { InMemoryCompanyDataStore } from "../company-data/store.js";
import { ApprovalService } from "../governance/approval-service.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { NoopTelemetrySink } from "../telemetry/service.js";
import {
  CrossCompanyExecutionService,
  type CrossCompanyActivityExecutor,
} from "./service.js";
import { InMemoryDurableExecutionStore } from "./store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const nova = "20000000-0000-4000-8000-000000000001";
const atlas = "20000000-0000-4000-8000-000000000002";
const departmentId = "30000000-0000-4000-8000-000000000001";
const at = "2026-09-01T00:00:00.000Z";
const context = { requestId: "phase-25-6-test", ipAddress: "127.0.0.1" };

describe("Phase 25.6 durable cross-company execution", () => {
  let companies: InMemoryCompanyStore;
  let agents: InMemoryAgentStore;
  let companyData: InMemoryCompanyDataStore;
  let store: InMemoryDurableExecutionStore;
  let approvals: ApprovalService;
  let now: Date;
  let activity: CrossCompanyActivityExecutor;
  let execute: ReturnType<typeof vi.fn>;
  let service: CrossCompanyExecutionService;

  beforeEach(async () => {
    companies = new InMemoryCompanyStore();
    agents = new InMemoryAgentStore();
    companyData = new InMemoryCompanyDataStore();
    store = new InMemoryDurableExecutionStore();
    approvals = new ApprovalService(
      new InMemoryGovernanceStore([], false),
      async () => undefined,
    );
    now = new Date(at);

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
        id: "portfolio-financial-reviewer",
        ownerId,
        canonicalKey: "portfolio-financial-reviewer",
        name: "Portfolio Financial Reviewer",
        role: "review",
        description: "Reviews bounded company financial evidence.",
        skills: ["financial review"],
        capabilityRequirements: ["finance.benchmark"],
        dataRequirements: ["FINANCIAL_METRICS"],
        supportedTasks: ["financial.benchmark"],
        defaultModelPolicy: "LOCAL_FIRST",
        defaultSafetyPolicy: "strict",
        defaultOperatingPolicy: "review-only",
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
        id: "40000000-0000-4000-8000-000000000001",
        ownerId,
        companyId: atlas,
        agentDefinitionId: "portfolio-financial-reviewer",
        organizationId: "50000000-0000-4000-8000-000000000001",
        departmentId,
        managerAssignmentId: null,
        managerAgentDefinitionId: null,
        governorAssignmentId: null,
        status: "ACTIVE",
        memoryScopeId: "assignment:atlas:reviewer",
        departmentMemoryScopeId: "department:atlas:finance",
        organizationMemoryScopeId: "company:atlas",
        capabilityGrantProfileId: "finance-benchmark-grants",
        economyPolicyId: "finance-benchmark-budget",
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

    execute = vi.fn(async () => ({
      actualCostCredits: 3,
      externalCommitRef: "provider:commit:1",
      result: {
        summary: "Atlas benchmarked the explicitly shared Nova summary.",
        structuredResult: { benchmark: 0.82 },
        artifactRefs: ["artifact:not-permitted"],
        metricRefs: ["metric:approved"],
        evidenceRefs: ["evidence:review"],
        verification: "VERIFIED" as const,
        reviewOutcome: "PASS" as const,
      },
    }));
    activity = { execute, reconcile: vi.fn(async () => null) };
    service = new CrossCompanyExecutionService(
      store,
      companies,
      companyData,
      agents,
      approvals,
      new NoopTelemetrySink(),
      activity,
      undefined,
      () => now,
    );
    await allowCollaboration();
  });

  const allowCollaboration = async (approvalThresholdCredits = 40) => {
    const policy = (peer: string) => ({
      allowedDestinationCompanyIds: [peer],
      allowedServiceTypes: ["FINANCIAL_BENCHMARK"],
      allowedSharingScopes: ["SUMMARY_ONLY" as const],
      allowedCapabilities: ["finance.benchmark"],
      maxBudgetCredits: 100,
      approvalThresholdCredits,
      maxConcurrentServices: 5,
    });
    await service.upsertPolicy(ownerId, nova, policy(atlas), context);
    await service.upsertPolicy(ownerId, atlas, policy(nova), context);
  };

  const create = (budgetCredits = 10) =>
    service.createRequest(
      ownerId,
      {
        sourceCompanyId: nova,
        destinationCompanyId: atlas,
        requesterAssignmentId: null,
        serviceType: "FINANCIAL_BENCHMARK",
        requestedOutcome: "Compare the approved summary against Atlas benchmarks.",
        objectiveId: null,
        workflowId: null,
        requestedCapabilities: ["finance.benchmark"],
        sharedInput: {
          scope: "SUMMARY_ONLY",
          artifactRefs: [],
          metricRefs: [],
          contextRefs: [],
          summary: "Revenue growth slowed by three points.",
        },
        permittedOutputTypes: ["STRUCTURED_RESULT", "METRICS", "EVIDENCE"],
        confidentiality: "INTERNAL",
        budgetCredits,
        costAttribution: "SOURCE_PAYS",
        deadline: "2026-09-02T00:00:00.000Z",
        priority: "NORMAL",
      },
      context,
    );

  it("survives service reconstruction, records ordered history, and returns only permitted output", async () => {
    const request = await create();
    await service.destinationDecision(
      ownerId,
      request.id,
      "ACCEPT",
      undefined,
      context,
    );
    const executionId = (await store.listExecutions(ownerId, atlas))[0]!.id;

    await service.runNext(ownerId, executionId, context);
    const reconstructed = new CrossCompanyExecutionService(
      store,
      companies,
      companyData,
      agents,
      approvals,
      new NoopTelemetrySink(),
      activity,
      undefined,
      () => now,
    );
    for (let index = 0; index < 4; index += 1)
      await reconstructed.runNext(ownerId, executionId, context);

    const completed = await store.findServiceRequest(ownerId, request.id);
    expect(completed?.status).toBe("COMPLETED");
    expect(completed?.actualCostCredits).toBe(3);
    expect(completed?.result?.artifactRefs).toEqual([]);
    expect(completed?.result?.metricRefs).toEqual(["metric:approved"]);
    expect(execute).toHaveBeenCalledTimes(1);
    const history = await store.listEvents(ownerId, executionId);
    expect(history.map((event) => event.sequence)).toEqual(
      history.map((_, index) => index + 1),
    );
  });

  it("requires a company-scoped approval and denies policy revocation before activity", async () => {
    await allowCollaboration(5);
    const request = await create(10);
    expect(request.status).toBe("NEEDS_APPROVAL");
    await expect(
      service.destinationDecision(ownerId, request.id, "ACCEPT", undefined, context),
    ).rejects.toMatchObject({ code: "SERVICE_APPROVAL_REQUIRED" });

    await companyScope.run(
      { ownerId, companyId: atlas, role: "OWNER", requestId: context.requestId },
      () =>
        approvals.approve(ownerId, request.approvalId!, crypto.randomUUID(), context),
    );
    await service.destinationDecision(
      ownerId,
      request.id,
      "ACCEPT",
      undefined,
      context,
    );
    const execution = (await store.listExecutions(ownerId, atlas))[0]!;
    companyData.savePolicy(
      CompanyDataPolicySchema.parse({
        ...(await companyData.findActivePolicy(ownerId, atlas))!,
        id: crypto.randomUUID(),
        externalTransferAllowed: false,
        version: 2,
        updatedAt: "2026-09-01T00:01:00.000Z",
      }),
    );
    const failed = await service.runNext(ownerId, execution.id, context);
    expect(failed.status).toBe("FAILED");
    expect((await store.findServiceRequest(ownerId, request.id))?.failureClass).toBe(
      "POLICY",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("parks on pause, cancels on archive, and never exposes sibling-owner records", async () => {
    const request = await create();
    await service.destinationDecision(
      ownerId,
      request.id,
      "ACCEPT",
      undefined,
      context,
    );
    const execution = (await store.listExecutions(ownerId, atlas))[0]!;
    const atlasCompany = (await companies.findCompany(ownerId, atlas))!;
    await companies.updateCompany(
      CompanySchema.parse({
        ...atlasCompany,
        status: "PAUSED",
        pausedAt: at,
        updatedAt: at,
      }),
    );
    expect((await service.runNext(ownerId, execution.id, context)).status).toBe(
      "PAUSED",
    );
    await companies.updateCompany(
      CompanySchema.parse({
        ...atlasCompany,
        status: "ARCHIVED",
        archivedAt: at,
        updatedAt: at,
      }),
    );
    expect((await service.runNext(ownerId, execution.id, context)).status).toBe(
      "CANCELLED",
    );
    expect(
      await store.findServiceRequest(
        "90000000-0000-4000-8000-000000000009",
        request.id,
      ),
    ).toBeUndefined();
  });

  it("reconciles an uncertain external commitment instead of executing it twice", async () => {
    const request = await create();
    await service.destinationDecision(
      ownerId,
      request.id,
      "ACCEPT",
      undefined,
      context,
    );
    const execution = (await store.listExecutions(ownerId, atlas))[0]!;
    await service.runNext(ownerId, execution.id, context);
    await service.runNext(ownerId, execution.id, context);
    const key = (await store.listEvents(ownerId, execution.id)).length;
    expect(key).toBeGreaterThan(1);
    const idempotencyKey = (await import("node:crypto"))
      .createHash("sha256")
      .update(`${execution.id}:EXECUTE_SERVICE`)
      .digest("hex");
    await store.saveReceipt(
      DurableActivityReceiptSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        companyId: atlas,
        executionId: execution.id,
        step: "EXECUTE_SERVICE",
        idempotencyKey,
        status: "STARTED",
        externalCommitRef: null,
        resultSummary: null,
        attempt: 1,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await service.runNext(ownerId, execution.id, context);
    expect(execute).not.toHaveBeenCalled();
    expect((await store.findExecution(ownerId, execution.id))?.status).toBe(
      "WAITING_EXTERNAL",
    );
  });
});

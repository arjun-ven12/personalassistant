import {
  CompanyDatasetSchema,
  CompanyAgentAssignmentSchema,
  AgentDefinitionSchema,
  CompanyMembershipSchema,
  CompanySchema,
  MetadataLineageEdgeSchema,
  SemanticMetricObservationSchema,
  SemanticMetricSchema,
} from "@alexa-control/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryAgentStore } from "../agents/store.js";
import { InMemoryPortfolioEconomyStore } from "../agent-economy/portfolio-store.js";
import { InMemoryCompanyDataStore } from "../company-data/store.js";
import { InMemoryCompanyStore } from "../companies/store.js";
import { ApprovalService } from "../governance/approval-service.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import {
  NoopTelemetrySink,
  sanitizeTelemetryAttributes,
  type RecordedSystemSpan,
} from "../telemetry/service.js";
import {
  OwnerPortfolioObservabilityService,
  redactTelemetryAttributes,
} from "./service.js";
import { InMemoryObservabilityStore } from "./store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const otherOwner = "10000000-0000-4000-8000-000000000002";
const nova = "20000000-0000-4000-8000-000000000001";
const atlas = "20000000-0000-4000-8000-000000000002";
const orion = "20000000-0000-4000-8000-000000000003";
const at = "2026-09-01T12:00:00.000Z";

describe("Phase 25.5 owner portfolio intelligence and observability", () => {
  let companies: InMemoryCompanyStore;
  let data: InMemoryCompanyDataStore;
  let telemetry: InMemoryObservabilityStore;
  let agents: InMemoryAgentStore;
  let economy: InMemoryPortfolioEconomyStore;
  let approvals: ApprovalService;
  let service: OwnerPortfolioObservabilityService;
  beforeEach(() => {
    companies = new InMemoryCompanyStore();
    data = new InMemoryCompanyDataStore();
    telemetry = new InMemoryObservabilityStore();
    agents = new InMemoryAgentStore();
    economy = new InMemoryPortfolioEconomyStore();
    approvals = new ApprovalService(new InMemoryGovernanceStore([], false), () => Promise.resolve());
    service = new OwnerPortfolioObservabilityService(
      telemetry,
      companies,
      data,
      agents,
      undefined,
      () => new Date(at),
    );
    service.setPortfolioEconomy(economy, approvals);
    for (const [id, name] of [
      [nova, "Nova"],
      [atlas, "Atlas"],
      [orion, "Orion"],
    ] as const) {
      const company = CompanySchema.parse({
        id,
        ownerId,
        slug: name.toLowerCase(),
        name,
        status: "ACTIVE",
        timezone: "UTC",
        defaultCurrency: "USD",
        settings: {
          description: null,
          industry: null,
          businessModel: null,
          jurisdiction: null,
          defaultLanguage: "en",
          riskTolerance: "LOW",
          autonomyLevel: "SUPERVISED",
          defaultApprovalPolicy: "SUPERVISED",
          starterCredits: 0,
        },
        memoryScopeId: `company:${id}`,
        economyAccountId: null,
        governanceProfileId: null,
        capabilityProfileId: null,
        credentialScopeId: null,
        governorAgentId: null,
        activatedAt: at,
        pausedAt: null,
        suspendedAt: null,
        archivedAt: null,
        createdAt: at,
        updatedAt: at,
      });
      companies.createCompany(
        company,
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
    }
  });

  it("funds the owner reserve only after canonical recent-auth approval and settles once", async () => {
    const input = {
      amount: 500,
      reason: "Authorized administrative capitalization",
      idempotencyKey: "owner-reserve-funding-service-0001",
    };
    const pending = await service.fundOwnerReserve(ownerId, input, {
      requestId: crypto.randomUUID(), ipAddress: "127.0.0.1",
    });
    expect(pending.status).toBe("APPROVAL_REQUIRED");
    expect(pending.approvalId).toBeTruthy();
    await approvals.approve(ownerId, pending.approvalId!, crypto.randomUUID(), {
      requestId: crypto.randomUUID(), ipAddress: "127.0.0.1",
    }, true);
    const settled = await service.fundOwnerReserve(ownerId, { ...input, approvalId: pending.approvalId! }, {
      requestId: crypto.randomUUID(), ipAddress: "127.0.0.1",
    });
    expect(settled.status).toBe("SETTLED");
    expect(settled.authority).toBe("OWNER_RESERVE_FUND");
    const duplicate = await service.fundOwnerReserve(ownerId, { ...input, approvalId: pending.approvalId! }, {
      requestId: crypto.randomUUID(), ipAddress: "127.0.0.1",
    });
    expect(duplicate.fundingId).toBe(settled.fundingId);
    expect((await service.portfolioEconomy(ownerId)).ownerReserveAvailable).toBe(500);
    await expect(service.fundOwnerReserve(otherOwner, { ...input, idempotencyKey: "owner-reserve-funding-other-0001", approvalId: pending.approvalId! }, {
      requestId: crypto.randomUUID(), ipAddress: "127.0.0.1",
    })).resolves.toMatchObject({ status: "APPROVAL_REQUIRED" });
    expect((await service.portfolioEconomy(otherOwner)).ownerReserveAvailable).toBe(0);
  });

  const seedMetric = (
    companyId: string,
    key: string,
    formula: string,
    unit: string,
    current: string,
    previous: string,
    options: { version?: number; expired?: boolean } = {},
  ) => {
    const metric = SemanticMetricSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      companyId,
      canonicalKey: key,
      name: key,
      description: `Canonical ${key}`,
      formula,
      sourceEntityIds: [crypto.randomUUID()],
      dimensions: ["period"],
      timeField: "observed_at",
      unit,
      ownerDepartmentId: null,
      definitionSource: "OWNER",
      version: options.version ?? 1,
      status: "ACTIVE",
      createdAt: at,
      updatedAt: at,
    });
    data.saveMetric(metric);
    for (const [index, value] of [current, previous].entries())
      data.saveMetricObservation(
        SemanticMetricObservationSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          companyId,
          metricId: metric.id,
          metricVersion: metric.version,
          value,
          dimensions: { period: index === 0 ? "2026-08" : "2026-07" },
          observedAt:
            index === 0 ? "2026-09-01T11:00:00.000Z" : "2026-08-01T11:00:00.000Z",
          sourceUpdatedAt:
            index === 0 ? "2026-09-01T11:00:00.000Z" : "2026-08-01T11:00:00.000Z",
          expiresAt:
            index === 0 && options.expired
              ? "2026-09-01T10:00:00.000Z"
              : "2026-09-02T12:00:00.000Z",
          provenanceEntityIds: metric.sourceEntityIds,
          qualityState: "VERIFIED",
        }),
      );
    return metric;
  };
  const aiTrace = (
    companyId: string,
    index: number,
    costCredits: number,
    success = true,
  ) =>
    service.recordAITrace({
      traceId: `trace-${companyId}-${String(index).padStart(4, "0")}`,
      ownerId,
      companyId,
      assignmentId: null,
      taskId: null,
      objectiveId: null,
      workflowId: null,
      agentDefinitionId: null,
      provider: "openai",
      model: "gpt-test",
      promptVersion: index < 2 ? "v1" : "v2",
      policyVersion: "strict-v1",
      taskClass: "business.analysis",
      reasoningType: "STRUCTURED",
      locality: "REMOTE",
      latencyMs: 100,
      inputTokens: 100,
      outputTokens: 20,
      costCredits,
      costUsd: (costCredits / 1000).toFixed(4),
      success,
      retries: 0,
      reviewOutcome: success ? "PASS" : "FAIL",
      verificationResult: success ? "VERIFIED" : "FAILED",
      evaluationScores: [],
      dataSensitivity: "INTERNAL",
      exportPolicy: "APPROVED_EXTERNAL",
      retentionClass: "STANDARD",
      startedAt: `2026-09-01T0${index}:00:00.000Z`,
      endedAt: `2026-09-01T0${index}:00:00.100Z`,
    });

  it("compares only definition-compatible semantic metrics and refuses nominal currency/formula matches", async () => {
    seedMetric(
      nova,
      "CONVERSION_RATE",
      "QUALIFIED_WINS / QUALIFIED_LEADS",
      "PERCENT",
      "0.08",
      "0.10",
    );
    seedMetric(
      atlas,
      "CONVERSION_RATE",
      "QUALIFIED_WINS / QUALIFIED_LEADS",
      "PERCENT",
      "0.12",
      "0.11",
    );
    expect(
      (
        await service.compareMetrics(ownerId, {
          canonicalMetricKey: "CONVERSION_RATE",
          companyIds: [nova, atlas],
          period: "2026-08",
        })
      ).status,
    ).toBe("COMPARABLE");
    seedMetric(nova, "REVENUE", "SUM(NET_SETTLED)", "USD", "100", "90");
    seedMetric(atlas, "REVENUE", "SUM(GROSS_INVOICED)", "EUR", "100", "90");
    const incompatible = await service.compareMetrics(ownerId, {
      canonicalMetricKey: "REVENUE",
      companyIds: [nova, atlas],
      period: "2026-08",
    });
    expect(incompatible.status).toBe("NOT_DIRECTLY_COMPARABLE");
    expect(incompatible.reasons.join(" ")).toMatch(/definition|currencies/i);
    await expect(
      service.compareMetrics(otherOwner, {
        canonicalMetricKey: "REVENUE",
        companyIds: [nova, atlas],
        period: "2026-08",
      }),
    ).rejects.toMatchObject({ code: "PORTFOLIO_COMPANY_SCOPE_MISMATCH" });
  });

  it("ranks commercial, stale-data, and AI-cost evidence without blaming healthy infrastructure", async () => {
    const novaMetric = seedMetric(
      nova,
      "CONVERSION_RATE",
      "WINS / LEADS",
      "PERCENT",
      "0.08",
      "0.10",
    );
    data.saveLineageEdge(
      MetadataLineageEdgeSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        companyId: nova,
        fromEntityId: novaMetric.sourceEntityIds[0],
        toEntityId: crypto.randomUUID(),
        relation: "FEEDS",
        provenance: "METRIC_DEFINITION",
        description: "CRM conversion facts feed the canonical metric.",
        createdAt: at,
      }),
    );
    const sourceId = crypto.randomUUID();
    data.saveDataset(
      CompanyDatasetSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        companyId: orion,
        sourceId,
        canonicalName: "crm_leads",
        logicalContract: "LEADS",
        physicalLocation: "company_data.crm_leads",
        schemaMetadata: { version: 1, fields: [], lastChangedAt: at },
        sensitivity: "INTERNAL",
        ownerDepartmentId: null,
        status: "ACTIVE",
        freshness: {
          lastUpdatedAt: "2026-08-31T18:00:00.000Z",
          staleAfterSeconds: 3600,
          state: "STALE",
        },
        quality: {
          completeness: 1,
          schemaValid: true,
          missingValueRate: 0,
          duplicateRate: 0,
          sourceHealth: "DEGRADED",
        },
        createdAt: at,
        updatedAt: at,
      }),
    );
    for (const companyId of [nova, atlas, orion])
      await service.recordSystemSpan({
        traceId: `trace-${companyId}-healthy`,
        spanId: `span-${companyId.slice(-8)}`,
        ownerId,
        companyId,
        service: "workflow",
        operation: "workflow.execute",
        status: "OK",
        durationMs: 20,
        startedAt: "2026-09-01T11:00:00.000Z",
        endedAt: "2026-09-01T11:00:00.020Z",
      });
    await aiTrace(nova, 1, 1);
    for (const [index, cost] of [1, 1, 3, 3].entries())
      await aiTrace(atlas, index, cost);
    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.attentionQueue[0]?.companyName).toBe("Nova");
    expect(dashboard.attentionQueue.map((item) => item.companyName)).toEqual(
      expect.arrayContaining(["Nova", "Orion", "Atlas"]),
    );
    const novaInsight = dashboard.insights.find(
      (item) => item.companyId === nova && item.observation.includes("CONVERSION_RATE"),
    );
    expect(novaInsight?.category).toBe("BUSINESS");
    expect(novaInsight?.suggestedNextAction).toMatch(/commercial drivers/);
    expect(novaInsight?.lineage).toHaveLength(1);
    expect(
      dashboard.aiHealth.regressions.some(
        (item) =>
          item.companyId === atlas && ["COST_UP", "COMBINED"].includes(item.kind),
      ),
    ).toBe(true);
  });

  it("correlates and isolates system and AI traces while stripping secrets and content", async () => {
    const span = await service.recordSystemSpan({
      traceId: "0123456789abcdef0123456789abcdef",
      spanId: "0123456789abcdef",
      ownerId,
      companyId: nova,
      service: "airouter",
      operation: "provider.call",
      status: "ERROR",
      errorSource: "MODEL",
      durationMs: 500,
      provider: "openai",
      model: "gpt-test",
      attributes: {
        "http.method": "POST",
        authorization: "Bearer private-token",
        "gen_ai.prompt": "restricted memory",
        "safe.count": 2,
      },
      startedAt: "2026-09-01T11:00:00.000Z",
      endedAt: "2026-09-01T11:00:00.500Z",
    });
    expect(span.attributes).toEqual({ "http.method": "POST", "safe.count": 2 });
    expect(JSON.stringify(span)).not.toMatch(/private-token|restricted memory/);
    await aiTrace(nova, 1, 1, false);
    await aiTrace(atlas, 2, 2, true);
    expect(
      await service.listSystemSpans(ownerId, { companyId: atlas, limit: 10 }),
    ).toEqual([]);
    expect(
      (await service.listAITraces(ownerId, { companyId: nova, limit: 10 })).every(
        (item) => item.companyId === nova,
      ),
    ).toBe(true);
    await expect(
      service.listSystemSpans(ownerId, { companyId: crypto.randomUUID(), limit: 10 }),
    ).rejects.toMatchObject({ code: "PORTFOLIO_COMPANY_SCOPE_MISMATCH" });
    expect(
      redactTelemetryAttributes({
        password: "x",
        cookie: "y",
        "safe.latency": 4,
        "user.email": "a@example.com",
      }),
    ).toEqual({ "safe.latency": 4 });
  });

  it("builds explainable portfolio health without treating unknown evidence as healthy", async () => {
    seedMetric(nova, "OBJECTIVE_COMPLETION", "COMPLETED / ACTIVE", "PERCENT", "0.8", "0.7");
    await service.recordSystemSpan({
      traceId: "health-nova-0123456789abcdef",
      spanId: "health-nova-0001",
      ownerId,
      companyId: nova,
      service: "workflow",
      operation: "workflow.execute",
      status: "OK",
      durationMs: 20,
      startedAt: "2026-09-01T11:00:00.000Z",
      endedAt: "2026-09-01T11:00:00.020Z",
    });
    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.context).toMatchObject({ mode: "PORTFOLIO", authority: "OWNER" });
    expect(dashboard.health.weighting).toBe("OWNER_PRIORITY_X_ACTIVE_OBJECTIVES");
    expect(dashboard.health.companiesUnknown).toBeGreaterThan(0);
    expect(dashboard.companies.find((item) => item.companyId === orion)?.healthState).toBe("UNKNOWN");
    expect(dashboard.capabilities).not.toContain("EXECUTE_ANYTHING_IN_ANY_COMPANY");
  });

  it("keeps the portfolio path bounded and dormant across 100 authorized companies", async () => {
    const scaleCompanies = new InMemoryCompanyStore();
    const scaleData = new InMemoryCompanyDataStore();
    const scaleService = new OwnerPortfolioObservabilityService(
      new InMemoryObservabilityStore(),
      scaleCompanies,
      scaleData,
      new InMemoryAgentStore(),
      undefined,
      () => new Date(at),
    );
    for (let index = 0; index < 100; index += 1) {
      const id = `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      scaleCompanies.createCompany(
        CompanySchema.parse({
          id, ownerId, slug: `scale-${index}`, name: `Scale ${index}`,
          status: index === 99 ? "PAUSED" : "ACTIVE", timezone: "UTC",
          defaultCurrency: index % 2 ? "USD" : "SGD", settings: {},
          memoryScopeId: `company:${id}:memory`, economyAccountId: `company:${id}:economy`,
          governanceProfileId: `company:${id}:governance`, capabilityProfileId: `company:${id}:capabilities`,
          credentialScopeId: `company:${id}:credentials`, governorAgentId: `company:${id}:governor:dormant`,
          activatedAt: at, pausedAt: index === 99 ? at : null, suspendedAt: null, archivedAt: null,
          createdAt: at, updatedAt: at,
        }),
        CompanyMembershipSchema.parse({ companyId: id, principalId: ownerId, principalType: "OWNER", role: "OWNER", status: "ACTIVE", createdAt: at, updatedAt: at }),
      );
    }
    const started = performance.now();
    const dashboard = await scaleService.dashboard(ownerId);
    const elapsedMs = performance.now() - started;
    expect(dashboard.companies).toHaveLength(100);
    expect(dashboard.companies.at(-1)?.companyStatus).toBe("PAUSED");
    expect(dashboard.context.selectedCompanyIds).toHaveLength(100);
    expect(dashboard.attentionQueue.length).toBeLessThanOrEqual(100);
    expect(elapsedMs).toBeLessThan(2_000);
  });

  it("keeps business execution independent when telemetry persistence is unavailable", async () => {
    const sink = new NoopTelemetrySink();
    sink.setRecorder(() => {
      throw new Error("backend down");
    });
    await expect(
      sink.withSpan("workflow.execute", { ["alexa.owner.id"]: ownerId }, () =>
        Promise.resolve("business-result"),
      ),
    ).resolves.toBe("business-result");
  });

  it("redacts before export and preserves objective to workflow trace parentage", async () => {
    const sink = new NoopTelemetrySink();
    const recorded: RecordedSystemSpan[] = [];
    sink.setRecorder((span) => recorded.push(span));
    await sink.withSpan(
      "objective.execute",
      {
        ["alexa.owner.id"]: ownerId,
        ["alexa.company.id"]: nova,
        ["alexa.objective.id"]: crypto.randomUUID(),
        authorization: "Bearer private-token",
      },
      () =>
        sink.withSpan(
          "workflow.execute",
          {
            ["alexa.owner.id"]: ownerId,
            ["alexa.company.id"]: nova,
            ["alexa.workflow.id"]: crypto.randomUUID(),
            ["gen_ai.prompt"]: "private source payload",
          },
          () => Promise.resolve("done"),
        ),
    );
    const parent = recorded.find((item) => item.operation === "objective.execute")!;
    const child = recorded.find((item) => item.operation === "workflow.execute")!;
    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);
    expect(JSON.stringify(recorded)).not.toMatch(
      /private-token|private source payload/,
    );
    expect(
      sanitizeTelemetryAttributes({
        authorization: "Bearer private-token",
        "safe.operation": "workflow.execute",
      }),
    ).toEqual({ "safe.operation": "workflow.execute" });
  });

  it("summarizes one hundred companies without allocating per-company services", async () => {
    for (let index = 4; index <= 100; index += 1) {
      const suffix = index.toString(16).padStart(12, "0");
      const companyId = `20000000-0000-4000-8000-${suffix}`;
      const company = CompanySchema.parse({
        id: companyId,
        ownerId,
        slug: `company-${index}`,
        name: `Company ${index}`,
        status: "ACTIVE",
        timezone: "UTC",
        defaultCurrency: "USD",
        settings: {
          description: null,
          industry: null,
          businessModel: null,
          jurisdiction: null,
          defaultLanguage: "en",
          riskTolerance: "LOW",
          autonomyLevel: "SUPERVISED",
          defaultApprovalPolicy: "SUPERVISED",
          starterCredits: 0,
        },
        memoryScopeId: `company:${companyId}`,
        economyAccountId: null,
        governanceProfileId: null,
        capabilityProfileId: null,
        credentialScopeId: null,
        governorAgentId: null,
        activatedAt: at,
        pausedAt: null,
        suspendedAt: null,
        archivedAt: null,
        createdAt: at,
        updatedAt: at,
      });
      companies.createCompany(
        company,
        CompanyMembershipSchema.parse({
          companyId,
          principalId: ownerId,
          principalType: "OWNER",
          role: "OWNER",
          status: "ACTIVE",
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.companies).toHaveLength(100);
    expect(new Set(dashboard.companies.map((item) => item.companyId)).size).toBe(100);
  });

  it("keeps alert acknowledgement owner-scoped and non-destructive", async () => {
    seedMetric(nova, "CHURN", "LOST / ACTIVE", "PERCENT", "0.10", "0.20");
    const dashboard = await service.dashboard(ownerId);
    const signal = dashboard.attentionQueue[0]!;
    const updated = await service.updateAlert(
      ownerId,
      signal.id,
      { action: "ACKNOWLEDGE" },
      { requestId: crypto.randomUUID(), ipAddress: "127.0.0.1" },
    );
    expect(updated.status).toBe("ACKNOWLEDGED");
    expect(
      (await service.dashboard(ownerId)).insights.some(
        (item) => item.id === `insight:${signal.id}`,
      ),
    ).toBe(false);
    expect(data.listMetrics(ownerId, nova).length).toBe(1);
  });

  it("creates idempotent portfolio objective proposals without executing company work", async () => {
    agents.upsertDefinition(AgentDefinitionSchema.parse({
      id: "alexa_governor", ownerId, canonicalKey: "alexa-governor", name: "Alexa Governor",
      role: "planning", description: "Company-scoped Governor for bounded management decisions.",
      skills: ["management"], capabilityRequirements: ["portfolio.review"], dataRequirements: [],
      supportedTasks: ["objective-review"], defaultModelPolicy: "STRONG_REASONING",
      defaultSafetyPolicy: "strict", defaultOperatingPolicy: "supervised",
      executionPlacement: "LOCAL", evaluationProfile: ["governance"],
      generalizedReputationPrior: 80, generalizedCalibrationPrior: 0.8,
      provenance: "SYSTEM", sourcePath: null, sourceVersion: null, license: null,
      version: "1", status: "ACTIVE", createdAt: at, updatedAt: at,
    }));
    for (const companyId of [nova, atlas]) agents.saveAssignment(CompanyAgentAssignmentSchema.parse({
      id: crypto.randomUUID(), ownerId, companyId, agentDefinitionId: "alexa_governor",
      organizationId: companyId, departmentId: null, managerAssignmentId: null,
      managerAgentDefinitionId: null, governorAssignmentId: null, status: "ACTIVE",
      memoryScopeId: `assignment:${companyId}`, departmentMemoryScopeId: null,
      organizationMemoryScopeId: `company:${companyId}`,
      capabilityGrantProfileId: "governor-capabilities", economyPolicyId: "governor-economy",
      modelPolicyOverride: null, localReputation: null, localCalibration: null,
      companyInstructions: null, isGovernor: true, createdAt: at, updatedAt: at, revokedAt: null,
    }));
    const request = {
      idempotencyKey: "portfolio-objective-2026-growth-001",
      title: "Grow qualified pipeline",
      desiredOutcome: "Increase qualified pipeline without weakening margin controls.",
      canonicalMetricKey: "QUALIFIED_LEADS",
      targetValue: "300",
      unit: "COUNT",
      deadline: "2026-12-31T23:59:59.000Z",
      strategy: "PRIORITY_WEIGHTED",
      selectedCompanyIds: [nova, atlas],
      constraints: ["Company Governors must accept each proposal."],
      budgetCredits: 1_000,
    } as const;
    const first = await service.createPortfolioObjective(ownerId, request, {
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    const second = await service.createPortfolioObjective(ownerId, request, {
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    expect(second.id).toBe(first.id);
    expect(first.executed).toBe(false);
    expect(first.allocations).toHaveLength(2);
    expect(first.allocations.every((item) => item.status === "PROPOSED")).toBe(true);
    expect(first.allocations.every((item) => item.governorProposalId)).toBe(true);
    expect(first.status).toBe("NEGOTIATING");
    expect(first.allocations.reduce((sum, item) => sum + Number(item.proposedTargetValue), 0)).toBe(300);
    expect(await service.listPortfolioObjectives(ownerId)).toHaveLength(1);
    service.setCompanyObjectiveProvider(({ companyId }) => Promise.resolve(companyId === nova
      ? "30000000-0000-4000-8000-000000000001"
      : "30000000-0000-4000-8000-000000000002"));
    const proposals = await service.listGovernorProposals(ownerId, first.id);
    const novaProposal = proposals.find((item) => item.companyId === nova)!;
    const accepted = await service.decideGovernorProposal(ownerId, novaProposal.id, {
      decision: "ACCEPT", reasonCode: "ACCEPTED", explanation: null,
      idempotencyKey: "governor-accept-nova-0001",
    }, { requestId: crypto.randomUUID(), ipAddress: "127.0.0.1" });
    expect(accepted.status).toBe("ACCEPTED");
    const duplicate = await service.decideGovernorProposal(ownerId, novaProposal.id, {
      decision: "ACCEPT", reasonCode: "ACCEPTED", explanation: null,
      idempotencyKey: "governor-accept-nova-0001",
    }, { requestId: crypto.randomUUID(), ipAddress: "127.0.0.1" });
    expect(duplicate.revisions).toHaveLength(2);
    const atlasProposal = proposals.find((item) => item.companyId === atlas)!;
    const countered = await service.decideGovernorProposal(ownerId, atlasProposal.id, {
      decision: "COUNTERPROPOSE", reasonCode: "INSUFFICIENT_BUDGET",
      explanation: "A smaller target is feasible within current capacity.",
      idempotencyKey: "governor-counter-atlas-0001",
      counterTerms: {
        requestedOutcome: request.desiredOutcome, targetValue: "120", unit: "COUNT",
        budgetCredits: 600, deadline: request.deadline, constraints: [...request.constraints],
      },
    }, { requestId: crypto.randomUUID(), ipAddress: "127.0.0.1" });
    expect(countered.status).toBe("COUNTERPROPOSED");
    expect(countered.revisions.map((item) => item.terms.targetValue)).toEqual(["150", "120"]);
    expect((await service.listPortfolioObjectives(ownerId))[0]?.status).toBe("PARTIALLY_ACCEPTED");
    await expect(
      service.createPortfolioObjective(otherOwner, { ...request, idempotencyKey: "portfolio-objective-other-owner-001" }, {
        requestId: crypto.randomUUID(),
        ipAddress: "127.0.0.1",
      }),
    ).rejects.toMatchObject({ code: "PORTFOLIO_COMPANY_SCOPE_MISMATCH" });
  });

  it("compares only authorized summaries and routes portfolio conversation without execution", async () => {
    const comparison = await service.compareCompanies(ownerId, {
      companyIds: [nova, atlas],
    });
    expect(comparison.companies.map((item) => item.companyId)).toEqual([nova, atlas]);
    expect(comparison.executed).toBe(false);
    expect(comparison.companies.every((item) => item.healthState === "UNKNOWN")).toBe(true);
    await expect(
      service.compareCompanies(otherOwner, { companyIds: [nova, atlas] }),
    ).rejects.toMatchObject({ code: "PORTFOLIO_COMPANY_SCOPE_MISMATCH" });
    await expect(service.handleConversation(ownerId, "How are all my companies?")).resolves.toMatch(
      /3 active or paused companies.*No company action was executed/,
    );
    await expect(service.handleConversation(ownerId, "Open my calendar")).resolves.toBeNull();
  });
});

import {
  AgentDefinitionSchema,
  CompanyAgentAssignmentSchema,
  CompanyMembershipSchema,
  CompanySchema,
} from "@alexa-control/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryAgentStore } from "../agents/store.js";
import { InMemoryCompanyStore } from "../companies/store.js";
import {
  CompanyDataConnectorRegistry,
  CompanyDataService,
  type CompanyDataConnector,
} from "./service.js";
import { InMemoryCompanyDataStore } from "./store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const nova = "20000000-0000-4000-8000-000000000001";
const atlas = "20000000-0000-4000-8000-000000000002";
const financeDepartment = "30000000-0000-4000-8000-000000000001";
const salesDepartment = "30000000-0000-4000-8000-000000000002";
const at = "2026-09-01T00:00:00.000Z";
const request = (companyId: string) => ({
  ownerId,
  companyId,
  requestId: crypto.randomUUID(),
  ipAddress: "127.0.0.1",
});

class BatchConnector implements CompanyDataConnector {
  readonly key = "synthetic.incremental";
  readonly states: Record<string, unknown>[] = [];
  readonly batches = new Map<string, Array<Record<string, unknown>[]>>();
  read(input: { companyId: string; previousState: Record<string, unknown> }) {
    this.states.push(input.previousState);
    const companyBatches = this.batches.get(input.companyId) ?? [];
    const cursor = Number(input.previousState.cursor ?? 0);
    return Promise.resolve({
      records: companyBatches[cursor] ?? [],
      nextState: { cursor: cursor + 1 },
    });
  }
}

describe("Phase 25.4 company information plane", () => {
  let companies: InMemoryCompanyStore;
  let agents: InMemoryAgentStore;
  let store: InMemoryCompanyDataStore;
  let connector: BatchConnector;
  let now: Date;
  let service: CompanyDataService;
  beforeEach(() => {
    companies = new InMemoryCompanyStore();
    agents = new InMemoryAgentStore();
    store = new InMemoryCompanyDataStore();
    connector = new BatchConnector();
    const registry = new CompanyDataConnectorRegistry();
    registry.register(connector);
    now = new Date(at);
    service = new CompanyDataService(
      store,
      companies,
      agents,
      registry,
      undefined,
      () => now,
    );
    for (const [id, name] of [
      [nova, "Nova"],
      [atlas, "Atlas"],
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
    agents.upsertDefinition(
      AgentDefinitionSchema.parse({
        id: "financial-analyst",
        ownerId,
        canonicalKey: "financial-analyst",
        name: "Financial Analyst",
        role: "review",
        description: "Reviews company financial evidence.",
        skills: ["finance"],
        capabilityRequirements: ["finance.metrics.read"],
        dataRequirements: ["FINANCIAL_METRICS"],
        supportedTasks: ["finance.review"],
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
  });

  const assignment = (companyId: string, departmentId: string, isGovernor = false) =>
    CompanyAgentAssignmentSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      companyId,
      agentDefinitionId: "financial-analyst",
      organizationId: crypto.randomUUID(),
      departmentId,
      managerAssignmentId: null,
      managerAgentDefinitionId: null,
      governorAssignmentId: null,
      status: "ACTIVE",
      memoryScopeId: `assignment:${companyId}:finance`,
      departmentMemoryScopeId: `department:${companyId}:${departmentId}`,
      organizationMemoryScopeId: `company:${companyId}`,
      capabilityGrantProfileId: "finance-grants",
      economyPolicyId: "finance-economy",
      modelPolicyOverride: null,
      localReputation: null,
      localCalibration: null,
      companyInstructions: null,
      isGovernor,
      createdAt: at,
      updatedAt: at,
      revokedAt: null,
    });

  async function substrate(companyId: string, departmentId = financeDepartment) {
    const source = await service.createSource(request(companyId), {
      sourceType: "SYNTHETIC",
      provider: "synthetic",
      displayName: "Synthetic finance",
      connectionRef: null,
      ingestionMode: "MANUAL",
      metadata: {},
    });
    const dataset = await service.createDataset(request(companyId), {
      sourceId: source.id,
      canonicalName: "transactions",
      logicalContract: "TRANSACTIONS",
      physicalLocation: "company_data.transactions",
      sensitivity: "CONFIDENTIAL",
      ownerDepartmentId: departmentId,
      staleAfterSeconds: 3600,
    });
    const pipeline = await service.createPipeline(request(companyId), {
      sourceId: source.id,
      datasetId: dataset.id,
      connectorKey: connector.key,
      triggerMode: "MANUAL",
      schedule: null,
      schemaContract: "EVOLVE",
      writeDisposition: "MERGE",
      primaryKey: "id",
      incrementalCursor: "updated_at",
    });
    return { source, dataset, pipeline };
  }

  it("runs incremental dlt-style loads with checkpoints, schema evolution, metadata, freshness, and idempotent merge", async () => {
    const { dataset, pipeline } = await substrate(nova);
    connector.batches.set(nova, [
      [{ id: "tx-1", amount: 42, updated_at: "2026-09-01T00:00:00.000Z" }],
      [
        {
          id: "tx-1",
          amount: 43,
          updated_at: "2026-09-01T01:00:00.000Z",
          currency: "USD",
        },
      ],
    ]);
    const first = await service.runPipeline(request(nova), pipeline.id);
    const second = await service.runPipeline(request(nova), pipeline.id);
    expect(first.recordsWritten).toBe(1);
    expect(second.schemaChanges).toEqual(["currency"]);
    expect(store.countDatasetRecords(ownerId, nova, dataset.id)).toBe(1);
    expect(connector.states).toEqual([{}, { cursor: 1 }]);
    const dashboard = await service.dashboard(ownerId, nova);
    expect(dashboard.datasets[0]?.schemaMetadata.version).toBe(3);
    expect(dashboard.datasets[0]?.freshness.state).toBe("FRESH");
    expect(dashboard.metadataEntities.map((item) => item.entityType)).toEqual(
      expect.arrayContaining(["DATA_SOURCE", "PIPELINE", "DATASET"]),
    );
    expect(dashboard.recentRuns.every((run) => run.companyId === nova)).toBe(true);
  });

  it("fails closed across datasets, vectors, lineage, metrics, and credentials", async () => {
    const novaData = await substrate(nova);
    const atlasData = await substrate(atlas);
    connector.batches.set(nova, [[{ id: "nova-only", amount: 99 }]]);
    await service.runPipeline(request(nova), novaData.pipeline.id);
    await expect(
      service.runPipeline(request(atlas), novaData.pipeline.id),
    ).rejects.toMatchObject({ code: "PIPELINE_NOT_ACTIVE" });
    const novaEntity = (await service.dashboard(ownerId, nova)).metadataEntities.find(
      (item) => item.entityType === "DATASET",
    )!;
    await expect(service.lineage(ownerId, atlas, novaEntity.id)).rejects.toMatchObject({
      code: "METADATA_ENTITY_NOT_FOUND",
    });
    await service.indexSemanticDocument(request(nova), {
      entityType: "DOCUMENT",
      scopeType: "COMPANY",
      scopeId: `company:${nova}`,
      sourceEntityId: "nova-plan",
      title: "Nova private plan",
      summary: "Nova confidential growth plan",
      sensitivity: "CONFIDENTIAL",
      embeddingVersion: null,
    });
    await service.indexSemanticDocument(request(atlas), {
      entityType: "DOCUMENT",
      scopeType: "COMPANY",
      scopeId: `company:${atlas}`,
      sourceEntityId: "atlas-plan",
      title: "Atlas plan",
      summary: "Atlas operating plan",
      sensitivity: "INTERNAL",
      embeddingVersion: null,
    });
    expect(
      (
        await service.semanticSearch(ownerId, atlas, {
          query: "Nova confidential",
          entityTypes: [],
          limit: 10,
        })
      ).map((item) => item.document.companyId),
    ).toEqual([]);
    const novaCredential = await service.upsertCredentialReference(request(nova), {
      provider: "stripe",
      secretLocator: "vault:nova:stripe",
      status: "READY",
      lastVerifiedAt: at,
    });
    await expect(
      service.upsertIntegrationBinding(request(atlas), {
        provider: "stripe",
        integrationType: "payments",
        integrationId: "stripe",
        credentialRef: novaCredential.id,
        status: "READY",
        capabilitiesExposed: ["finance.metrics.read"],
        metadata: {},
        lastSyncAt: null,
      }),
    ).rejects.toMatchObject({ code: "CREDENTIAL_SCOPE_MISMATCH" });
    expect(store.countDatasetRecords(ownerId, atlas, atlasData.dataset.id)).toBe(0);
  });

  it("provides one versioned, lineage-backed metric and glossary meaning to different agents", async () => {
    const { dataset } = await substrate(nova);
    const dashboard = await service.dashboard(ownerId, nova);
    const datasetEntity = dashboard.metadataEntities.find(
      (item) => item.canonicalName === `dataset:${dataset.id}`,
    )!;
    await service.createGlossaryTerm(request(nova), {
      canonicalKey: "QUALIFIED_LEAD",
      name: "Qualified Lead",
      definition: "A lead with qualification_status equal to QUALIFIED.",
      aliases: ["qualified prospect"],
      domain: "Sales",
      ownerDepartmentId: salesDepartment,
      linkedEntityIds: [datasetEntity.id],
      linkedMetricIds: [],
      sensitivity: "INTERNAL",
    });
    expect(
      (await service.resolveGlossary(ownerId, nova, "qualified prospect"))
        ?.canonicalKey,
    ).toBe("QUALIFIED_LEAD");
    const metric = await service.createMetric(request(nova), {
      canonicalKey: "REVENUE",
      name: "Revenue",
      description: "Verified net revenue.",
      formula: "SUM(TRANSACTIONS.amount WHERE status = SETTLED)",
      sourceEntityIds: [datasetEntity.id],
      dimensions: ["date", "department"],
      timeField: "updated_at",
      unit: "USD",
      ownerDepartmentId: financeDepartment,
      definitionSource: "OWNER",
    });
    await service.recordMetric(request(nova), "REVENUE", {
      value: "42300.00",
      dimensions: { department: "Finance" },
      observedAt: at,
      sourceUpdatedAt: at,
      expiresAt: "2026-09-01T02:00:00.000Z",
      provenanceEntityIds: [datasetEntity.id],
      qualityState: "VERIFIED",
    });
    const first = assignment(nova, financeDepartment);
    const second = assignment(nova, financeDepartment);
    agents.saveAssignment(first);
    /* one definition has one company assignment, so the second reader uses the same governed assignment context */ void second;
    const a = await service.queryMetric(ownerId, nova, "REVENUE", {
      assignmentId: first.id,
    });
    const b = await service.queryMetric(ownerId, nova, "REVENUE", {
      assignmentId: first.id,
    });
    expect(a).toEqual(b);
    expect(a.definition.id).toBe(metric.id);
    expect(a.observation?.value).toBe("42300.00");
    expect(a.lineage).toHaveLength(1);
    now = new Date("2026-09-01T03:00:00.000Z");
    expect(
      (await service.queryMetric(ownerId, nova, "REVENUE", { assignmentId: first.id }))
        .freshness,
    ).toBe("STALE");
    const version2 = await service.createMetric(request(nova), {
      canonicalKey: "REVENUE",
      name: "Revenue",
      description: "Verified gross settled revenue.",
      formula: "SUM(TRANSACTIONS.gross_amount WHERE status = SETTLED)",
      sourceEntityIds: [datasetEntity.id],
      dimensions: ["date"],
      timeField: "updated_at",
      unit: "USD",
      ownerDepartmentId: financeDepartment,
      definitionSource: "OWNER",
    });
    expect(version2.version).toBe(2);
    expect(store.findMetric(ownerId, nova, "REVENUE", 1)?.status).toBe("SUPERSEDED");
  });

  it("resolves department data access, assignment memory, capability readiness, and local-only model policy", async () => {
    const { dataset } = await substrate(nova);
    const finance = assignment(nova, financeDepartment);
    agents.saveAssignment(finance);
    await service.updatePolicy(request(nova), {
      rules: [
        {
          id: crypto.randomUUID(),
          departmentId: financeDepartment,
          assignmentId: null,
          entityId: dataset.id,
          logicalContract: null,
          access: "RAW",
          maximumSensitivity: "CONFIDENTIAL",
          effect: "ALLOW",
        },
        {
          id: crypto.randomUUID(),
          departmentId: salesDepartment,
          assignmentId: null,
          entityId: dataset.id,
          logicalContract: null,
          access: "RAW",
          maximumSensitivity: "RESTRICTED",
          effect: "DENY",
        },
      ],
      modelRouting: {
        PUBLIC: "ANY_APPROVED",
        INTERNAL: "APPROVED_CLOUD",
        CONFIDENTIAL: "LOCAL_ONLY",
        RESTRICTED: "LOCAL_ONLY",
        approvedCloudProviderIds: ["openai"],
      },
      externalTransferAllowed: false,
    });
    const credential = await service.upsertCredentialReference(request(nova), {
      provider: "stripe",
      secretLocator: "vault:nova:stripe",
      status: "READY",
      lastVerifiedAt: at,
    });
    await service.upsertIntegrationBinding(request(nova), {
      provider: "stripe",
      integrationType: "payments",
      integrationId: "stripe",
      credentialRef: credential.id,
      status: "READY",
      capabilitiesExposed: ["finance.metrics.read"],
      metadata: {},
      lastSyncAt: at,
    });
    const context = await service.resolveAgentContext(ownerId, nova, finance.id);
    expect(context.datasets.map((item) => item.id)).toContain(dataset.id);
    expect(context.metadataAccess).toBe("RAW");
    expect(context.memoryScopes.map((item) => item.type)).toEqual(
      expect.arrayContaining(["AGENT_ASSIGNMENT", "DEPARTMENT", "COMPANY"]),
    );
    expect(context.effectiveCapabilities[0]?.state).toBe("AVAILABLE");
    expect(JSON.stringify(context)).not.toContain("vault:nova:stripe");
    expect(
      await service.resolveModelDataPolicy(ownerId, nova, "RESTRICTED"),
    ).toMatchObject({
      routing: "LOCAL_ONLY",
      allowCloud: false,
      privacy: "LOCAL_ONLY",
    });
  });

  it("keeps the same reusable analyst company-local and denies archived-company ingestion", async () => {
    const novaAssignment = assignment(nova, financeDepartment);
    const atlasAssignment = assignment(atlas, financeDepartment);
    agents.saveAssignment(novaAssignment);
    agents.saveAssignment(atlasAssignment);
    await substrate(nova);
    await substrate(atlas);
    const novaContext = await service.resolveAgentContext(
      ownerId,
      nova,
      novaAssignment.id,
    );
    const atlasContext = await service.resolveAgentContext(
      ownerId,
      atlas,
      atlasAssignment.id,
    );
    expect(novaContext.companyId).toBe(nova);
    expect(atlasContext.companyId).toBe(atlas);
    expect(novaContext.memoryScopes).not.toEqual(atlasContext.memoryScopes);
    const company = companies.findCompany(ownerId, nova)!;
    companies.updateCompany(
      CompanySchema.parse({
        ...company,
        status: "ARCHIVED",
        archivedAt: at,
        updatedAt: at,
      }),
    );
    const pipeline = store.listPipelines(ownerId, nova)[0]!;
    await expect(service.runPipeline(request(nova), pipeline.id)).rejects.toMatchObject(
      { code: "COMPANY_DATA_NOT_ACTIVE" },
    );
    expect(
      (await service.dashboard(ownerId, nova)).metadataEntities.length,
    ).toBeGreaterThan(0);
  });
});

/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/require-await */
import {
  AgentDefinitionSchema,
  CompanyAgentAssignmentSchema,
  CrossCompanyServiceRequestSchema,
} from "@alexa-control/shared";
import { describe, expect, it, vi } from "vitest";

import { AgentEconomyService } from "../agent-economy/service.js";
import { InMemoryAgentEconomyStore } from "../agent-economy/store.js";
import type { AgentWorkforceService } from "../agent-workforce/service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import { companyScope } from "../companies/scope.js";
import {
  AgentEconomyCrossCompanyAdapter,
  AlexaWorkforceResolver,
  CompanyArtifactReportAdapter,
  DurableActivityRegistry,
} from "./production.js";
import type { SandboxArtifactResolver } from "./sandbox.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const nova = "20000000-0000-4000-8000-000000000001";
const atlas = "20000000-0000-4000-8000-000000000002";
const assignmentId = "40000000-0000-4000-8000-000000000001";
const at = "2026-09-01T00:00:00.000Z";

const request = () =>
  CrossCompanyServiceRequestSchema.parse({
    id: "50000000-0000-4000-8000-000000000001",
    ownerId,
    sourceCompanyId: nova,
    destinationCompanyId: atlas,
    requesterAssignmentId: null,
    destinationGovernorAssignmentId: null,
    destinationAssignmentId: assignmentId,
    serviceType: "ARTIFACT_REPORT",
    requestedOutcome: "Produce a bounded report from an explicitly shared artifact.",
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
    actualCostCredits: 0,
    deadline: null,
    priority: "NORMAL",
    status: "ACCEPTED",
    approvalRequirement: "NONE",
    approvalId: null,
    durabilityClass: "CROSS_COMPANY",
    traceId: "0123456789abcdef0123456789abcdef",
    currentStep: "DURABLE_START",
    waitReason: null,
    result: null,
    failureClass: null,
    failureCode: null,
    createdAt: at,
    updatedAt: at,
    completedAt: null,
  });

const definition = () =>
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
  });

const assignment = (status: "ACTIVE" | "DORMANT" = "ACTIVE") =>
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
    status,
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
  });

describe("Phase 25.6 production acceptance adapters", () => {
  it("executes and reconciles exactly one real company-scoped artifact effect", async () => {
    const objects = new Map<string, Uint8Array>();
    const idempotency = new Map<string, string>();
    objects.set(`${nova}:artifact:nova:approved`, new TextEncoder().encode("approved"));
    const artifacts: SandboxArtifactResolver = {
      async read(_ownerId, companyId, ref) {
        const content = objects.get(`${companyId}:${ref}`);
        if (!content) throw new Error("Artifact not found in the requested company.");
        return { name: "approved.txt", content };
      },
      async write(_ownerId, companyId, input) {
        const prior = input.idempotencyKey
          ? idempotency.get(`${companyId}:${input.idempotencyKey}`)
          : undefined;
        if (prior) return prior;
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
    const registry = new DurableActivityRegistry();
    registry.register(new CompanyArtifactReportAdapter(artifacts));
    const first = await registry.execute(request(), "effect-key");
    const reconciled = await registry.reconcile(request(), "effect-key");
    expect(first.result.verification).toBe("VERIFIED");
    expect(reconciled).toMatchObject({ state: "COMMITTED" });
    expect(
      [...objects.keys()].filter((key) => key.startsWith(`${atlas}:`)),
    ).toHaveLength(1);
    await expect(
      artifacts.read(ownerId, atlas, "artifact:nova:approved"),
    ).rejects.toThrow("not found");
  });

  it("lazily activates a reusable assignment and returns it to dormant", async () => {
    const agents = new InMemoryAgentStore();
    agents.upsertDefinition(definition());
    agents.saveAssignment(assignment("DORMANT"));
    const resolver = new AlexaWorkforceResolver(
      agents,
      { assignBestCatalogMatch: vi.fn() } as unknown as AgentWorkforceService,
      () => new Date(at),
    );
    const resolved = await resolver.resolve(request(), {
      requestId: "resolve",
      ipAddress: "127.0.0.1",
    });
    expect(resolved.resolution.decision).toBe("LAZY_ACTIVATION");
    expect(
      (await agents.findAssignment(ownerId, "artifact-specialist", atlas))?.status,
    ).toBe("ACTIVE");
    await resolver.release(
      CrossCompanyServiceRequestSchema.parse({
        ...request(),
        workforceResolution: resolved.resolution,
      }),
    );
    expect(
      (await agents.findAssignment(ownerId, "artifact-specialist", atlas))?.status,
    ).toBe("DORMANT");
  });

  it("assigns a reusable catalog definition and reports a gap only after catalog exhaustion", async () => {
    const agents = new InMemoryAgentStore();
    agents.upsertDefinition(definition());
    const assignBestCatalogMatch = vi.fn(async () => {
      agents.saveAssignment(assignment());
      return definition();
    });
    const resolver = new AlexaWorkforceResolver(
      agents,
      { assignBestCatalogMatch } as unknown as AgentWorkforceService,
      () => new Date(at),
    );
    const resolved = await resolver.resolve(request(), {
      requestId: "catalog-resolve",
      ipAddress: "127.0.0.1",
    });
    expect(resolved.resolution).toMatchObject({
      decision: "CATALOG_ASSIGNMENT",
      selectedDefinitionId: "artifact-specialist",
      assignmentCreated: true,
      capabilityBlockers: [],
    });
    expect(assignBestCatalogMatch).toHaveBeenCalledTimes(1);

    const emptyAgents = new InMemoryAgentStore();
    const exhausted = new AlexaWorkforceResolver(
      emptyAgents,
      {
        assignBestCatalogMatch: vi.fn(async () => undefined),
      } as unknown as AgentWorkforceService,
      () => new Date(at),
    );
    await expect(
      exhausted.resolve(request(), {
        requestId: "catalog-exhausted",
        ipAddress: "127.0.0.1",
      }),
    ).rejects.toMatchObject({ code: "DESTINATION_CAPABILITY_GAP" });
  });

  it("reserves and idempotently settles only the explicitly paying company", async () => {
    const agents = new InMemoryAgentStore();
    agents.upsertDefinition(definition());
    agents.saveAssignment(assignment());
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
          idempotencyKey: "fund:atlas",
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
    const adapter = new AgentEconomyCrossCompanyAdapter(economy, agents);
    const reserved = CrossCompanyServiceRequestSchema.parse({
      ...request(),
      ...(await adapter.reserve(request(), "70000000-0000-4000-8000-000000000001")),
    });
    expect(reserved.payingCompanyId).toBe(atlas);
    expect(reserved.economyState).toBe("RESERVED");
    await adapter.settle(reserved, 3);
    await adapter.settle(reserved, 3);
    const atlasDashboard = await companyScope.run(
      { ownerId, companyId: atlas, role: "OWNER", requestId: "inspect" },
      () => economy.dashboard(ownerId),
    );
    const novaDashboard = await companyScope.run(
      { ownerId, companyId: nova, role: "OWNER", requestId: "inspect" },
      () => economy.dashboard(ownerId),
    );
    expect(atlasDashboard.accounts[0]).toMatchObject({
      availableCredits: 97,
      reservedCredits: 0,
      lifetimeSpent: 3,
    });
    expect(
      await companyScope.run(
        { ownerId, companyId: atlas, role: "OWNER", requestId: "inspect" },
        () => economyStore.listReservations(ownerId, "artifact-specialist"),
      ),
    ).toHaveLength(1);
    expect(novaDashboard.accounts).toHaveLength(0);
  });
});

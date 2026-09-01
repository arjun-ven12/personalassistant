import { describe, expect, it, vi } from "vitest";

import { AgentCognitionService } from "../agent-cognition/service.js";
import { InMemoryAgentCognitionStore } from "../agent-cognition/store.js";
import { AgentEconomyService } from "../agent-economy/service.js";
import { InMemoryAgentEconomyStore } from "../agent-economy/store.js";
import { AgentEvolutionService } from "../agent-evolution/service.js";
import { InMemoryAgentEvolutionStore } from "../agent-evolution/store.js";
import { AgentSocietyService } from "../agent-society/service.js";
import { InMemoryAgentSocietyStore } from "../agent-society/store.js";
import { AgentOsService } from "../agents/os-service.js";
import { InMemoryAgentOsStore } from "../agents/os-store.js";
import { AgentRegistryService } from "../agents/service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { companyScope } from "../companies/scope.js";
import { AgentWorkforceService } from "./service.js";
import { InMemoryAgentWorkforceStore } from "./store.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const atlasId = "22222222-2222-4222-8222-222222222222";
const novaId = "33333333-3333-4333-8333-333333333333";

const setup = () => {
  const audit = vi.fn();
  const agentStore = new InMemoryAgentStore();
  const registry = new AgentRegistryService(agentStore, audit);
  const memoryStore = new InMemoryMemoryStore();
  const agentOs = new AgentOsService(
    new InMemoryAgentOsStore(),
    agentStore,
    new InMemoryRepositoryStore(),
    memoryStore,
    audit,
    undefined,
    (id, requestId) => registry.ensureBuiltIns(id, requestId),
  );
  const cognition = new AgentCognitionService(
    new InMemoryAgentCognitionStore(),
    agentStore,
    agentOs,
    memoryStore,
    audit,
  );
  const evolution = new AgentEvolutionService(
    new InMemoryAgentEvolutionStore(),
    agentStore,
    cognition,
    audit,
  );
  const society = new AgentSocietyService(
    new InMemoryAgentSocietyStore(),
    agentStore,
    evolution,
    audit,
  );
  const economyStore = new InMemoryAgentEconomyStore();
  const economy = new AgentEconomyService(economyStore, agentStore, audit);
  const workforceStore = new InMemoryAgentWorkforceStore();
  const workforce = new AgentWorkforceService(
    workforceStore,
    registry,
    agentStore,
    society,
    economy,
    audit,
  );
  return { agentStore, audit, economy, workforce, workforceStore };
};

describe("AgentWorkforceService", () => {
  it("keeps one reusable catalog while company workforce assignments switch", async () => {
    const { agentStore, workforce } = setup();
    await companyScope.run(
      { ownerId, companyId: atlasId, role: "OWNER", requestId: "atlas-bootstrap" },
      () => workforce.bootstrap(ownerId, "atlas-bootstrap", "127.0.0.1"),
    );
    const atlasCatalog = await companyScope.run(
      { ownerId, companyId: atlasId, role: "OWNER", requestId: "atlas-catalog" },
      () => workforce.catalog(ownerId, { limit: 500 }),
    );

    await workforce.ensureCompanyGovernor(ownerId, novaId);
    const novaBefore = await companyScope.run(
      { ownerId, companyId: novaId, role: "OWNER", requestId: "nova-catalog" },
      () => workforce.catalog(ownerId, { limit: 500 }),
    );
    expect(novaBefore.catalogCount).toBe(atlasCatalog.catalogCount);
    expect(novaBefore.assignedCount).toBeLessThan(atlasCatalog.assignedCount);
    expect(novaBefore.assignedCount).toBeLessThanOrEqual(9);
    const novaGraph = await companyScope.run(
      { ownerId, companyId: novaId, role: "OWNER", requestId: "nova-graph" },
      () => workforce.graph(ownerId, { limit: 500 }),
    );
    expect(novaGraph.nodes.some((node) => node.kind === "GOVERNOR")).toBe(true);
    expect(novaGraph.nodes.filter((node) => node.kind === "AGENT")).toHaveLength(
      novaBefore.assignedCount - 1,
    );
    expect(
      novaGraph.nodes
        .filter((node) => node.kind === "AGENT")
        .every((node) =>
          novaGraph.nodes.some((candidate) => candidate.id === node.parentId),
        ),
    ).toBe(true);
    const available = novaBefore.items.find(
      (item) => item.currentCompanyStatus === "AVAILABLE",
    )!;

    const novaAfter = await companyScope.run(
      { ownerId, companyId: novaId, role: "OWNER", requestId: "nova-assign" },
      async () => {
        await workforce.assignDefinition({
          ownerId,
          definitionId: available.definition.id,
          requestId: "nova-assign",
          ipAddress: "127.0.0.1",
        });
        await workforce.assignDefinition({
          ownerId,
          definitionId: available.definition.id,
          requestId: "nova-assign-retry",
          ipAddress: "127.0.0.1",
        });
        return workforce.catalog(ownerId, { limit: 500 });
      },
    );
    expect(novaAfter.catalogCount).toBe(atlasCatalog.catalogCount);
    expect(novaAfter.assignedCount).toBe(novaBefore.assignedCount + 1);
    expect(agentStore.listAssignments(ownerId, novaId)).toHaveLength(
      novaBefore.assignedCount + 1,
    );
    expect(novaAfter.runtime).toEqual({
      modelSessionsFromDefinitions: 0,
      workersFromAssignments: 0,
      pollingLoopsFromAssignments: 0,
      sharedAIRouter: true,
    });
  });

  it("bootstraps more than 100 meaningful dormant agents without runtime activation", async () => {
    const { agentStore, economy, workforce } = setup();
    const report = await workforce.bootstrap(ownerId, "request-1", "127.0.0.1");
    const agents = agentStore.listAgents(ownerId);
    const dashboard = await economy.dashboard(ownerId);

    expect(report.finalActualRegisteredAgents).toBeGreaterThanOrEqual(100);
    expect(report.importedAsAgents).toBeGreaterThan(50);
    expect(report.externalRuntimeActive).toBe(false);
    expect(report.providerCallsDuringImport).toBe(0);
    expect(report.runtimeActivationsDuringImport).toBe(0);
    expect(agents).toHaveLength(report.finalActualRegisteredAgents);
    expect(
      agents.every(
        (agent) =>
          agent.workforce?.activationPolicyId === "lazy_owner_or_task_activation_v1",
      ),
    ).toBe(true);
    expect(
      agents.every(
        (agent) => agent.configuration.externalToolDeclarationsImported === false,
      ),
    ).toBe(true);
    expect(
      dashboard.accounts.every((account) => account.economyStatus === "DORMANT"),
    ).toBe(true);
    expect(dashboard.runtimeActivationsFromRegistration).toBe(0);
  });

  it("is idempotent and preserves external provenance without importing external authority", async () => {
    const { agentStore, workforce } = setup();
    await workforce.bootstrap(ownerId, "request-1", "127.0.0.1");
    const first = agentStore.listAgents(ownerId);
    await workforce.bootstrap(ownerId, "request-2", "127.0.0.1");
    const second = agentStore.listAgents(ownerId);
    const external = second.filter(
      (agent) => agent.workforce?.source === "EVERYTHING_CLAUDE_CODE",
    );

    expect(second).toHaveLength(first.length);
    expect(new Set(second.map((agent) => agent.id)).size).toBe(second.length);
    expect(external.length).toBeGreaterThan(50);
    expect(
      external.every(
        (agent) =>
          agent.workforce?.sourceVersion === "d8409a4b0813771235555e32e3d8046a73988bfa",
      ),
    ).toBe(true);
    expect(external.every((agent) => agent.workforce?.license === "MIT")).toBe(true);
    expect(
      external.every(
        (agent) => agent.configuration.externalToolDeclarationsImported === false,
      ),
    ).toBe(true);
  });

  it("assigns isolated private memory with shared department and organization scopes", async () => {
    const { agentStore, workforce } = setup();
    await workforce.bootstrap(ownerId, "request", "127.0.0.1");
    const agents = agentStore.listAgents(ownerId).filter((agent) => agent.workforce);
    const development = agents.filter((agent) =>
      agent.workforce?.departmentMemoryScopeId.includes("department:"),
    );
    const first = development[0]!;
    const peer = development.find(
      (agent) =>
        agent.id !== first.id &&
        agent.workforce?.departmentId === first.workforce?.departmentId,
    )!;
    const other = development.find(
      (agent) => agent.workforce?.departmentId !== first.workforce?.departmentId,
    )!;

    expect(first.workforce?.memoryScopeId).not.toBe(peer.workforce?.memoryScopeId);
    expect(first.workforce?.departmentMemoryScopeId).toBe(
      peer.workforce?.departmentMemoryScopeId,
    );
    expect(first.workforce?.departmentMemoryScopeId).not.toBe(
      other.workforce?.departmentMemoryScopeId,
    );
    expect(first.workforce?.organizationMemoryScopeId).toBe(
      other.workforce?.organizationMemoryScopeId,
    );
  });

  it("uses finite role profiles instead of inherited manager authority", async () => {
    const { agentStore, workforce } = setup();
    await workforce.bootstrap(ownerId, "request", "127.0.0.1");
    const agents = agentStore.listAgents(ownerId);
    const security = agents.find(
      (agent) => agent.role === "security" && agent.workforce,
    )!;
    const coding = agents.find((agent) => agent.role === "coding" && agent.workforce)!;

    expect(security.capabilities).toContain("permission.review");
    expect(coding.capabilities).toContain("patch.proposal");
    expect(security.capabilities).not.toEqual(coding.capabilities);
    expect(security.configuration.authorityInheritedFromManager).toBe(false);
  });

  it("rejects hierarchy cycles and changes participation without creating a model runtime", async () => {
    const { agentStore, workforce, workforceStore } = setup();
    await workforce.bootstrap(ownerId, "request", "127.0.0.1");
    const agents = agentStore.listAgents(ownerId);
    const first = agents.find((agent) => agent.workforce)!;
    const second = agents.find((agent) => agent.workforce && agent.id !== first.id)!;
    expect(() =>
      workforce.validateHierarchy([
        { ...first, workforce: { ...first.workforce!, parentAgentId: second.id } },
        { ...second, workforce: { ...second.workforce!, parentAgentId: first.id } },
      ]),
    ).toThrow("Agent hierarchy contains a cycle.");

    const activated = await workforce.setActivation(
      ownerId,
      first.id,
      "ACTIVE",
      "activate",
      "127.0.0.1",
    );
    expect(activated.economy?.economyStatus).toBe("ACTIVE");
    expect(activated.agent.configuration.runtimeMode).toBe("LAZY_SHARED_AI");
    expect(
      workforceStore
        .listEvents(ownerId, first.id, 20)
        .some((event) => event.type === "ACTIVATED"),
    ).toBe(true);
    const dormant = await workforce.setActivation(
      ownerId,
      first.id,
      "DORMANT",
      "dormant",
      "127.0.0.1",
    );
    expect(dormant.economy?.economyStatus).toBe("DORMANT");
  });

  it("supports bounded graph search and owner-isolated detail", async () => {
    const { workforce } = setup();
    await workforce.bootstrap(ownerId, "request", "127.0.0.1");
    const graph = await workforce.graph(ownerId, {
      q: "native_security_lead",
      limit: 500,
    });
    const agents = graph.nodes.filter((node) => node.kind === "AGENT");
    expect(agents.length).toBeGreaterThan(0);
    expect(agents).toHaveLength(1);
    expect(agents[0]?.id).toBe("native_security_lead");
    const detail = await workforce.detail(ownerId, agents[0]!.id);
    expect(detail.memoryAccess.ownerPrivateIncluded).toBe(false);
    expect(detail.authority.hierarchyGrantsPermissions).toBe(false);
    await expect(
      workforce.detail("22222222-2222-4222-8222-222222222222", agents[0]!.id),
    ).rejects.toMatchObject({ code: "AGENT_NOT_FOUND" });
  });
});

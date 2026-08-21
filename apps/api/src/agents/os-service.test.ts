import { describe, expect, it } from "vitest";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { AgentFactoryService } from "./factory.js";
import { AgentOsService } from "./os-service.js";
import { InMemoryAgentOsStore } from "./os-store.js";
import { AgentRegistryService } from "./service.js";
import { InMemoryAgentStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const agentStore = new InMemoryAgentStore();
  const agentOsStore = new InMemoryAgentOsStore();
  const repositoryStore = new InMemoryRepositoryStore();
  const memoryStore = new InMemoryMemoryStore();
  const factory = new AgentFactoryService(agentStore, repositoryStore, audit);
  const registry = new AgentRegistryService(agentStore, audit, undefined, factory);
  const agentOs = new AgentOsService(
    agentOsStore,
    agentStore,
    repositoryStore,
    memoryStore,
    audit,
    undefined,
    (id, requestId) => registry.ensureBuiltIns(id, requestId),
  );
  return { agentOs, audits, factory, ownerId };
};

describe("AgentOsService", () => {
  it("creates manifests, packages, permission profiles, tools, and knowledge sources", async () => {
    const { agentOs, ownerId } = setup();
    const dashboard = await agentOs.dashboard(ownerId);

    expect(dashboard.manifests.map((manifest) => manifest.id)).toEqual(
      expect.arrayContaining(["planning_agent", "security_agent", "testing_agent"]),
    );
    expect(dashboard.manifests.every((manifest) => manifest.permissionProfileId)).toBe(
      true,
    );
    expect(dashboard.permissionProfiles[0]?.deploymentPermissions).toBe("none");
    expect(
      dashboard.tools.every((tool) => tool.executionPolicy === "advisory_only"),
    ).toBe(true);
    expect(dashboard.knowledgeSources.map((source) => source.sourceType)).toEqual(
      expect.arrayContaining(["repository", "memory", "design_decisions"]),
    );
    expect(dashboard.packages.every((pkg) => pkg.integrityHash.length === 64)).toBe(
      true,
    );
    expect(dashboard.runtimeIsolation).toBe(true);
    expect(dashboard.advisoryOnly).toBe(true);
  });

  it("starts a replayable advisory runtime session without tool execution", async () => {
    const { agentOs, audits, ownerId } = setup();
    const response = await agentOs.startSession({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        agentId: "planning_agent",
        inputSummary: "Build bounded context for a strategic planning answer.",
      },
    });
    const dashboard = await agentOs.dashboard(ownerId);

    expect(response.session.status).toBe("running");
    expect(response.session.toolCallCount).toBe(0);
    expect(dashboard.contextPackages[0]?.agentId).toBe("planning_agent");
    expect(dashboard.events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["AgentStarted", "ContextPackaged"]),
    );
    expect(audits.map((audit) => audit.eventType)).toContain("AGENT_SESSION_STARTED");
  });

  it("represents dynamic agents with the same manifest runtime", async () => {
    const { agentOs, factory, ownerId } = setup();
    const composition = await factory.composeTeam({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: { goal: "Add GraphQL migration planning with API review" },
    });
    const dashboard = await agentOs.dashboard(ownerId);

    expect(composition.dynamicAgents.length).toBeGreaterThan(0);
    expect(
      dashboard.manifests
        .filter((manifest) =>
          composition.dynamicAgents.some((agent) => agent.id === manifest.id),
        )
        .every((manifest) => manifest.agentType === "dynamic"),
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { AgentFactoryService } from "./factory.js";
import { AgentRegistryService } from "./service.js";
import { InMemoryAgentStore } from "./store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";

const setup = async () => {
  const ownerId = crypto.randomUUID();
  const store = new InMemoryAgentStore();
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const factory = new AgentFactoryService(store, new InMemoryRepositoryStore(), audit);
  const registry = new AgentRegistryService(store, audit, undefined, factory);
  await registry.ensureBuiltIns(ownerId);
  return { audits, factory, ownerId, registry, store };
};

describe("AgentFactoryService", () => {
  it("bootstraps templates and capability records", async () => {
    const { factory, ownerId } = await setup();
    const dashboard = await factory.dashboard(ownerId);

    expect(dashboard.templates.map((template) => template.id)).toEqual(
      expect.arrayContaining([
        "backend_engineer",
        "database_engineer",
        "software_architect",
        "qa_engineer",
        "research_engineer",
      ]),
    );
    expect(dashboard.capabilities.map((capability) => capability.id)).toEqual(
      expect.arrayContaining(["database", "security", "redis"]),
    );
  });

  it("composes a workflow team and creates dynamic agents for capability gaps", async () => {
    const { audits, factory, ownerId, registry } = await setup();
    const response = await factory.composeTeam({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        goal: "Implement OAuth authentication with database migration and frontend UI",
      },
    });

    expect(response.composition.requiredCapabilities).toEqual(
      expect.arrayContaining(["backend", "database", "frontend", "security"]),
    );
    expect(response.dynamicAgents.length).toBeGreaterThan(0);
    expect(
      response.dynamicAgents.every(
        (agent) =>
          agent.inheritedPermissionProfile === "existing_agent_permissions" &&
          agent.constraints.some((constraint) => constraint.includes("Cannot execute")),
      ),
    ).toBe(true);
    const agentDashboard = await registry.dashboard(ownerId);
    expect(agentDashboard.agents.map((agent) => agent.id)).toEqual(
      expect.arrayContaining(response.dynamicAgents.map((agent) => agent.id)),
    );
    expect(audits.map((audit) => audit.eventType)).toContain(
      "TEAM_COMPOSITION_CREATED",
    );
  });

  it("synthesises a new specialist when no template covers the capability", async () => {
    const { factory, ownerId } = await setup();
    const response = await factory.composeTeam({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: { goal: "Migrate REST to GraphQL" },
    });

    expect(response.dynamicAgents.some((agent) => agent.origin === "synthesised")).toBe(
      true,
    );
    expect(response.dynamicAgents.map((agent) => agent.capabilities).flat()).toContain(
      "graphql",
    );
  });

  it("archives temporary agents and records lifecycle/performance", async () => {
    const { factory, ownerId } = await setup();
    const response = await factory.composeTeam({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: { goal: "Add Redis caching for slow APIs" },
    });
    const agent = response.dynamicAgents[0]!;
    const archived = await factory.retireAgent({
      ownerId,
      agentId: agent.id,
      reason: "Workflow completed.",
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    const dashboard = await factory.dashboard(ownerId);

    expect(archived.lifecycleStatus).toBe("archived");
    expect(dashboard.archivedAgents.map((item) => item.id)).toContain(agent.id);
    expect(dashboard.performance.some((item) => item.agentId === agent.id)).toBe(true);
  });
});

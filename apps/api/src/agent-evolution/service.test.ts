import { describe, expect, it } from "vitest";

import { AgentCognitionService } from "../agent-cognition/service.js";
import { InMemoryAgentCognitionStore } from "../agent-cognition/store.js";
import { AgentOsService } from "../agents/os-service.js";
import { InMemoryAgentOsStore } from "../agents/os-store.js";
import { AgentRegistryService } from "../agents/service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { AgentEvolutionService } from "./service.js";
import { InMemoryAgentEvolutionStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const agentStore = new InMemoryAgentStore();
  const memoryStore = new InMemoryMemoryStore();
  const repositoryStore = new InMemoryRepositoryStore();
  const registry = new AgentRegistryService(agentStore, audit);
  const agentOs = new AgentOsService(
    new InMemoryAgentOsStore(),
    agentStore,
    repositoryStore,
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
  return { agentStore, audits, evolution, ownerId };
};

describe("AgentEvolutionService", () => {
  it("creates baseline expertise and capability marketplace records", async () => {
    const { evolution, ownerId } = setup();
    const dashboard = await evolution.dashboard(ownerId);

    expect(dashboard.expertise.length).toBeGreaterThan(0);
    expect(dashboard.marketplace.length).toBeGreaterThan(0);
    expect(dashboard.approvalRequired).toBe(true);
    expect(dashboard.automaticMutationEnabled).toBe(false);
    expect(dashboard.timeline.map((event) => event.eventType)).toContain(
      "evolution_initialized",
    );
  });

  it("runs advisory evolution analysis without mutating agent permissions", async () => {
    const { agentStore, audits, evolution, ownerId } = setup();
    await evolution.dashboard(ownerId);
    const before = agentStore.findAgent(ownerId, "planning_agent");
    const response = await evolution.analyse({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: { agentId: "planning_agent", focus: "reasoning" },
    });
    const after = agentStore.findAgent(ownerId, "planning_agent");

    expect(response.proposal.requiresApproval).toBe(true);
    expect(response.proposal.status).toBe("proposed");
    expect(response.benchmark.score).toBeGreaterThan(0);
    expect(response.selfEvaluation.recommendations).toContain(response.proposal.title);
    expect(after?.capabilities).toEqual(before?.capabilities);
    expect(after?.configuration).toEqual(before?.configuration);
    expect(audits.map((audit) => audit.eventType)).toEqual(
      expect.arrayContaining([
        "AGENT_EVOLUTION_ANALYSED",
        "AGENT_SELF_EVALUATED",
        "AGENT_BENCHMARK_RECORDED",
      ]),
    );
  });

  it("creates explicit approval-gated proposals only", async () => {
    const { audits, evolution, ownerId } = setup();
    const response = await evolution.createProposal({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        agentId: "security_agent",
        type: "add_capability",
        title: "Review dependency-audit specialization",
        summary:
          "The security agent has repeated evidence for dependency review and should be considered for a governed capability update.",
        impact: "medium",
        confidence: 0.8,
        risk: "low",
        rollbackPlan:
          "Reject or archive the proposal; no runtime or permission change was applied.",
      },
    });

    expect(response.proposal.requiresApproval).toBe(true);
    expect(response.proposal.status).toBe("proposed");
    expect(audits.map((audit) => audit.eventType)).toContain(
      "AGENT_EVOLUTION_PROPOSAL_CREATED",
    );
  });
});

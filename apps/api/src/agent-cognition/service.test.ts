import { describe, expect, it } from "vitest";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { AgentOsService } from "../agents/os-service.js";
import { InMemoryAgentOsStore } from "../agents/os-store.js";
import { AgentRegistryService } from "../agents/service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import { AgentCognitionService } from "./service.js";
import { InMemoryAgentCognitionStore } from "./store.js";

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
  return { audits, cognition, ownerId };
};

describe("AgentCognitionService", () => {
  it("creates baseline cognitive state, specialization, and long-term memory", async () => {
    const { cognition, ownerId } = setup();
    const dashboard = await cognition.dashboard(ownerId);

    expect(dashboard.states.map((state) => state.agentId)).toContain("planning_agent");
    expect(dashboard.specializations.map((profile) => profile.agentId)).toContain(
      "security_agent",
    );
    expect(dashboard.semanticMemory.length).toBeGreaterThan(0);
    expect(dashboard.proceduralMemory.length).toBeGreaterThan(0);
    expect(dashboard.advisoryOnly).toBe(true);
  });

  it("records explainable reasoning with confidence and working memory", async () => {
    const { audits, cognition, ownerId } = setup();
    const response = await cognition.reason({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        agentId: "planning_agent",
        mode: "architecture_reasoning",
        goal: "Evaluate a safe authentication refactor.",
        constraints: ["No approval bypass"],
      },
    });
    const dashboard = await cognition.dashboard(ownerId);

    expect(response.confidence.confidence).toBeGreaterThan(0);
    expect(response.decision.outcome).toContain("advisory");
    expect(
      dashboard.workingMemory.some((memory) => memory.agentId === "planning_agent"),
    ).toBe(true);
    expect(audits.map((audit) => audit.eventType)).toContain(
      "AGENT_REASONING_RECORDED",
    );
  });

  it("reflects on completed work and promotes lessons to semantic memory", async () => {
    const { audits, cognition, ownerId } = setup();
    const response = await cognition.reflect({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        agentId: "review_agent",
        objectives: ["Review architecture plan"],
        qualitySummary: "Review found the plan safe and bounded.",
        lessonsLearned: ["Require explicit evidence for high-risk claims."],
        confidence: 0.85,
      },
    });
    const dashboard = await cognition.dashboard(ownerId);

    expect(response.reflection.lessonsLearned).toHaveLength(1);
    expect(
      dashboard.semanticMemory.some((memory) =>
        memory.summary.includes("Require explicit evidence"),
      ),
    ).toBe(true);
    expect(
      dashboard.experiences.some((experience) => experience.agentId === "review_agent"),
    ).toBe(true);
    expect(audits.map((audit) => audit.eventType)).toContain(
      "AGENT_REFLECTION_RECORDED",
    );
  });
});

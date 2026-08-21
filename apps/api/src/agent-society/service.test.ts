import { describe, expect, it } from "vitest";

import { AgentCognitionService } from "../agent-cognition/service.js";
import { InMemoryAgentCognitionStore } from "../agent-cognition/store.js";
import { AgentEvolutionService } from "../agent-evolution/service.js";
import { InMemoryAgentEvolutionStore } from "../agent-evolution/store.js";
import { AgentOsService } from "../agents/os-service.js";
import { InMemoryAgentOsStore } from "../agents/os-store.js";
import { AgentRegistryService } from "../agents/service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { AgentSocietyService } from "./service.js";
import { InMemoryAgentSocietyStore } from "./store.js";

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
  const society = new AgentSocietyService(
    new InMemoryAgentSocietyStore(),
    agentStore,
    evolution,
    audit,
  );
  return { audits, ownerId, society };
};

describe("AgentSocietyService", () => {
  it("initializes organization, roles, departments, reputation, and health", async () => {
    const { ownerId, society } = setup();
    const dashboard = await society.dashboard(ownerId);

    expect(dashboard.organizations).toHaveLength(1);
    expect(dashboard.roles.length).toBeGreaterThan(0);
    expect(dashboard.departments.map((department) => department.name)).toContain(
      "Governance",
    );
    expect(dashboard.reputation.length).toBeGreaterThan(0);
    expect(dashboard.metrics.map((metric) => metric.metricName)).toContain(
      "organizational_health",
    );
    expect(dashboard.organizationalOnly).toBe(true);
    expect(dashboard.grantsPermissions).toBe(false);
  });

  it("forms a traceable society team without granting authority", async () => {
    const { audits, ownerId, society } = setup();
    const response = await society.formTeam({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        goal: "Plan secure authentication work with testing and documentation review.",
        repositoryIds: [],
      },
    });

    expect(response.team.status).toBe("active");
    expect(response.members.length).toBeGreaterThan(1);
    expect(response.consensus.humanEscalationRequired).toBe(true);
    expect(audits.map((audit) => audit.eventType)).toContain("SOCIETY_TEAM_FORMED");
  });

  it("records debates and meetings as observable organizational knowledge", async () => {
    const { audits, ownerId, society } = setup();
    const team = await society.formTeam({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: { goal: "Review API architecture trade-offs.", repositoryIds: [] },
    });
    const debate = await society.startDebate({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        teamId: team.team.id,
        topic: "Should the API split this domain into a separate service?",
        initiatingAgentId: team.members[0]?.agentId ?? "planning_agent",
        argument:
          "A separate service may improve boundaries but increases operations risk.",
      },
    });
    const meeting = await society.recordMeeting({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        teamId: team.team.id,
        meetingType: "architecture_review",
        agenda: ["Discuss trade-offs"],
        summary: "Architecture review captured debate and action items.",
        decisions: ["Keep the current boundary until evidence suggests otherwise."],
        actionItems: ["Monitor coupling."],
      },
    });

    expect(debate.debate.status).toBe("open");
    expect(debate.argument.stance).toBe("risk");
    expect(meeting.meeting.decisions).toHaveLength(1);
    expect(audits.map((audit) => audit.eventType)).toEqual(
      expect.arrayContaining(["SOCIETY_DEBATE_OPENED", "SOCIETY_MEETING_RECORDED"]),
    );
  });
});

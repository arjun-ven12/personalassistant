import { describe, expect, it } from "vitest";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { AgentRegistryService } from "./service.js";
import { InMemoryAgentStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const audits: unknown[] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const service = new AgentRegistryService(new InMemoryAgentStore(), audit);
  return { ownerId, audits, service };
};

describe("AgentRegistryService", () => {
  it("registers the built-in specialist agent team", async () => {
    const { ownerId, service } = setup();
    await service.ensureBuiltIns(ownerId);
    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.agents.map((agent) => agent.id)).toEqual(
      expect.arrayContaining([
        "engineering_manager",
        "planning_agent",
        "coding_agent",
        "review_agent",
        "security_agent",
        "testing_agent",
        "documentation_agent",
        "release_agent",
      ]),
    );
    expect(dashboard.health.every((health) => health.ownerId === ownerId)).toBe(true);
  });

  it("assigns a specialist task and records an immutable assignment message", async () => {
    const { ownerId, service } = setup();
    await service.ensureBuiltIns(ownerId);
    const response = await service.assignTask({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        agentId: "security_agent",
        title: "Review authentication boundary",
        objective: "Check that authentication does not bypass policy.",
        priority: "high",
        evidence: ["docs/security.md"],
      },
    });
    expect(response.task.agentId).toBe("security_agent");
    expect(response.task.status).toBe("assigned");

    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.messages[0]?.messageType).toBe("assignment");
    expect(dashboard.messages[0]?.taskId).toBe(response.task.id);
  });

  it("creates structured agent messages and consensus records without execution", async () => {
    const { ownerId, service } = setup();
    await service.ensureBuiltIns(ownerId);
    const message = await service.sendMessage({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        senderAgentId: "planning_agent",
        recipientAgentId: "review_agent",
        messageType: "finding",
        payload: { summary: "Architecture impact is medium." },
        evidence: ["repository generation 1"],
        priority: "normal",
      },
    });
    expect(message.message.senderAgentId).toBe("planning_agent");

    const consensus = await service.createConsensus({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        topic: "Approve security-sensitive refactor plan",
        rule: "required_specialist",
        requiredAgentIds: ["security_agent", "review_agent"],
      },
    });
    expect(consensus.consensus.status).toBe("open");
    expect(consensus.consensus.votes).toHaveLength(0);
  });
});

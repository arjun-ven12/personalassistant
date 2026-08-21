import { describe, expect, it } from "vitest";

import { RepositorySchema } from "@alexa-control/shared";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { InMemoryWorkflowStore } from "../workflows/store.js";
import { EngineeringAdvisorService } from "./service.js";
import { InMemoryAdvisorStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const repositoryStore = new InMemoryRepositoryStore();
  const repository = repositoryStore.upsertRepository(
    RepositorySchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId,
      workspaceId: "personalassistant",
      indexStatus: "INDEXED",
      activeGeneration: 1,
      activeFingerprint: "a".repeat(64),
      lastIndexedAt: new Date().toISOString(),
      lastFailureCode: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const service = new EngineeringAdvisorService(
    new InMemoryAdvisorStore(),
    repositoryStore,
    new InMemoryWorkflowStore(),
    new InMemoryMemoryStore(),
    new InMemoryAgentStore(),
    audit,
  );
  return { audits, ownerId, repository, service };
};

describe("EngineeringAdvisorService", () => {
  it("creates long-term goals as advisory records", async () => {
    const { audits, ownerId, repository, service } = setup();
    const goal = await service.createGoal({
      ownerId,
      ownerEmail: "owner@example.com",
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        title: "Improve authentication",
        description: "Review auth boundaries before expanding login options.",
        priority: "high",
        affectedRepositoryIds: [repository.id],
        rationale: "Authentication is a critical security boundary.",
      },
    });

    expect(goal.status).toBe("proposed");
    expect(goal.affectedRepositoryIds).toEqual([repository.id]);
    expect(goal.risks.join(" ")).toContain("explicit owner approval");
    expect(audits.at(-1)?.eventType).toBe("ENGINEERING_GOAL_CREATED");
    expect(audits.at(-1)?.metadata).toMatchObject({ advisoryOnly: true });
  });

  it("creates strategic plans without triggering workflows or execution", async () => {
    const { audits, ownerId, service } = setup();
    const goal = await service.createGoal({
      ownerId,
      ownerEmail: "owner@example.com",
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        title: "Reduce technical debt",
        priority: "medium",
        rationale: "Debt should be tracked before refactoring begins.",
      },
    });
    const plan = await service.planGoal({
      ownerId,
      goalId: goal.id,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(plan.goalId).toBe(goal.id);
    expect(plan.implementationPhases.some((phase) => phase.approvalCheckpoint)).toBe(
      true,
    );
    expect(plan.architecturePlan).toContain("advisory");
    expect(audits.at(-1)?.eventType).toBe("STRATEGIC_PLAN_CREATED");
  });

  it("generates baseline health, recommendations, roadmap, and release readiness", async () => {
    const { ownerId, service } = setup();
    const dashboard = await service.dashboard(ownerId);

    expect(dashboard.advisoryOnly).toBe(true);
    expect(dashboard.repositoryHealth).toHaveLength(1);
    expect(dashboard.recommendations.length).toBeGreaterThan(0);
    expect(dashboard.roadmaps.length).toBeGreaterThan(0);
    expect(dashboard.releaseAssessments[0]?.status).toBe("needs_work");
    expect(dashboard.metrics.averageRepositoryHealth).toBeGreaterThan(0);
  });

  it("simulates change impact without creating implementation work", async () => {
    const { audits, ownerId, repository, service } = setup();
    const simulation = await service.simulate({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        scenario: "Migrate API authentication to OAuth",
        repositoryIds: [repository.id],
      },
    });

    expect(simulation.affectedRepositories).toEqual([repository.id]);
    expect(simulation.risk).toBe("high");
    expect(simulation.deploymentSteps).toContain(
      "Create an approved workflow if the owner wants to proceed.",
    );
    expect(audits.at(-1)?.eventType).toBe("SCENARIO_SIMULATED");
    expect(audits.at(-1)?.metadata).toMatchObject({ advisoryOnly: true });
  });
});

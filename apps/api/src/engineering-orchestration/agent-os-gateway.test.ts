import {
  EngineeringObjectiveSchema,
  EngineeringTaskSchema,
} from "@alexa-control/shared";
import { describe, expect, it } from "vitest";

import { AgentOsService } from "../agents/os-service.js";
import { InMemoryAgentOsStore } from "../agents/os-store.js";
import { AgentRegistryService } from "../agents/service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import { companyScope } from "../companies/scope.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { AgentOsEngineeringGateway } from "./agent-os-gateway.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000002";
const repositoryId = "30000000-0000-4000-8000-000000000003";

describe("AgentOsEngineeringGateway", () => {
  it("creates and completes one scoped isolated Agent OS session for a logical engineering agent", async () => {
    const agentStore = new InMemoryAgentStore();
    const audit = () => undefined;
    const agents = new AgentRegistryService(agentStore, audit);
    await companyScope.run(
      { ownerId, companyId, role: "OWNER", requestId: "agent-os-engineering" },
      () => agents.ensureBuiltIns(ownerId, "agent-os-engineering"),
    );
    const assignment = companyScope
      .run(
        { ownerId, companyId, role: "OWNER", requestId: "agent-os-engineering" },
        () => agentStore.listAssignments(ownerId, companyId),
      )
      .find((item) => item.agentDefinitionId === "coding_agent")!;
    const longCapabilityGrantProfileId = `profile-${"x".repeat(152)}`;
    companyScope.run(
      { ownerId, companyId, role: "OWNER", requestId: "agent-os-engineering" },
      () =>
        agentStore.saveAssignment({
          ...assignment,
          capabilityGrantProfileId: longCapabilityGrantProfileId,
        }),
    );
    const store = new InMemoryAgentOsStore();
    const agentOs = new AgentOsService(
      store,
      agentStore,
      new InMemoryRepositoryStore(),
      new InMemoryMemoryStore(),
      audit,
      () => new Date("2026-09-16T00:00:00.000Z"),
      (scopedOwnerId, requestId) =>
        agents.ensureBuiltIns(scopedOwnerId, requestId),
    );
    const objective = EngineeringObjectiveSchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId,
      companyId,
      repositoryId,
      workflowId: null,
      managerAgentId: "engineering_manager",
      title: "Bounded endpoint",
      description: "Add one bounded endpoint.",
      acceptanceCriteria: ["Focused validation passes."],
      constraints: [],
      protectedAreas: [],
      priority: "NORMAL",
      riskLevel: "MEDIUM",
      budget: null,
      deadlineAt: null,
      status: "RUNNING",
      clarificationQuestion: null,
      clarification: null,
      maxParallelTasks: 4,
      maxReplans: 2,
      replanCount: 0,
      managerReasoningCount: 1,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: "0.0",
      version: 1,
      createdAt: "2026-09-16T00:00:00.000Z",
      updatedAt: "2026-09-16T00:00:00.000Z",
      completedAt: null,
    });
    const task = EngineeringTaskSchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId,
      companyId,
      objectiveId: objective.id,
      parentTaskId: null,
      repositoryId,
      workspaceId: crypto.randomUUID(),
      title: "Implement endpoint",
      description: "Implement the registered bounded endpoint.",
      acceptanceCriteria: ["Focused validation passes."],
      taskType: "BACKEND",
      requiredSkills: ["patch.proposal", "test.validation"],
      requiredCapabilities: ["repository.file_patch", "repository.validate"],
      dependencies: [],
      riskLevel: "MEDIUM",
      estimatedDifficulty: "MEDIUM",
      assignedAgentId: assignment.id,
      assignedRole: "BACKEND_ENGINEER",
      reviewerAgentId: null,
      modelPolicy: {
        initialTier: "LUNA",
        currentTier: "LUNA",
        maxTier: "SOL",
        escalationCount: 0,
        reason: "Routine bounded work.",
      },
      readOnly: false,
      reviewRequired: false,
      status: "ACTIVE",
      attempt: 1,
      maxAttempts: 3,
      leaseOwner: "worker",
      leaseExpiresAt: "2026-09-16T00:02:00.000Z",
      leaseGeneration: 1,
      lastFailureCategory: null,
      lastFailureSummary: null,
      createdAt: "2026-09-16T00:00:00.000Z",
      startedAt: "2026-09-16T00:00:00.000Z",
      completedAt: null,
      updatedAt: "2026-09-16T00:00:00.000Z",
    });
    const gateway = new AgentOsEngineeringGateway(agentOs, agentStore);
    const started = await gateway.start({
      objective,
      task,
      specialistAgentId: assignment.id,
      memoryRefs: [],
      requestId: "agent-os-engineering",
    });
    const running = store.findSession(ownerId, started.sessionId);
    expect(running).toMatchObject({
      status: "running",
      agentId: "coding_agent",
      delegation: {
        delegationId: task.id,
        managerAgentId: "engineering_manager",
        sandboxProfileId: "engineering-runtime-worktree",
      },
    });
    expect(running?.delegation?.memoryScopes).toContain(task.id);
    expect(running?.delegation?.skillRefs).toHaveLength(3);
    expect(running?.delegation?.skillRefs[2]).toHaveLength(120);
    expect(running?.delegation?.skillRefs[2]).toMatch(
      /^capability-profile:profile-x+:[a-f0-9]{64}$/,
    );
    await gateway.complete({
      ownerId,
      sessionId: started.sessionId,
      outputSummary: "One validated bounded change.",
      confidence: 1,
      aiRequestId: crypto.randomUUID(),
      providerId: "test-provider",
      modelId: "test-model",
      artifactCount: 1,
      sandboxStatus: "PASSED",
      errorCode: null,
      requestId: "agent-os-engineering",
    });
    expect(store.findSession(ownerId, started.sessionId)).toMatchObject({
      status: "completed",
      delegation: {
        providerId: "test-provider",
        modelId: "test-model",
        sandboxStatus: "PASSED",
      },
    });
    await expect(
      gateway.start({
        objective: {
          ...objective,
          companyId: "40000000-0000-4000-8000-000000000004",
        },
        task: {
          ...task,
          companyId: "40000000-0000-4000-8000-000000000004",
        },
        specialistAgentId: assignment.id,
        memoryRefs: [],
        requestId: "agent-os-cross-company",
      }),
    ).rejects.toMatchObject({
      code: "ENGINEERING_AGENT_ASSIGNMENT_UNAVAILABLE",
    });
  });
});

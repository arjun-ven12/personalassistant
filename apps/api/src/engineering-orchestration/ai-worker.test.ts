import {
  EngineeringContextPackageSchema,
  EngineeringObjectiveSchema,
  EngineeringTaskSchema,
} from "@alexa-control/shared";
import { describe, expect, it, vi } from "vitest";

import type { AIRouterService } from "../ai/router/service.js";
import {
  AIRouterEngineeringTaskWorker,
  type GovernedEngineeringActionGateway,
} from "./ai-worker.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000002";
const repositoryId = "30000000-0000-4000-8000-000000000003";
const objectiveId = "40000000-0000-4000-8000-000000000004";
const taskId = "50000000-0000-4000-8000-000000000005";
const agentId = "60000000-0000-4000-8000-000000000006";
const now = "2026-09-16T00:00:00.000Z";

const objective = EngineeringObjectiveSchema.parse({
  schemaVersion: "1",
  id: objectiveId,
  ownerId,
  companyId,
  repositoryId,
  workflowId: null,
  managerAgentId: "engineering_manager",
  title: "Preference endpoint",
  description: "Add a bounded endpoint.",
  acceptanceCriteria: ["Endpoint passes tests."],
  constraints: [],
  protectedAreas: [],
  priority: "NORMAL",
  riskLevel: "LOW",
  budget: null,
  deadlineAt: null,
  status: "RUNNING",
  clarificationQuestion: null,
  maxParallelTasks: 4,
  maxReplans: 2,
  replanCount: 0,
  managerReasoningCount: 1,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCostUsd: "0.0",
  version: 1,
  createdAt: now,
  updatedAt: now,
  completedAt: null,
});
const task = EngineeringTaskSchema.parse({
  schemaVersion: "1",
  id: taskId,
  ownerId,
  companyId,
  objectiveId,
  parentTaskId: null,
  repositoryId,
  workspaceId: "70000000-0000-4000-8000-000000000007",
  title: "Implement endpoint",
  description: "Implement only the endpoint.",
  acceptanceCriteria: ["Endpoint passes tests."],
  taskType: "BACKEND",
  requiredSkills: ["backend.implementation"],
  requiredCapabilities: ["repository.file_create", "repository.validate"],
  dependencies: [],
  riskLevel: "LOW",
  estimatedDifficulty: "LOW",
  assignedAgentId: agentId,
  assignedRole: "BACKEND_ENGINEER",
  reviewerAgentId: null,
  modelPolicy: {
    initialTier: "LUNA",
    currentTier: "LUNA",
    maxTier: "SOL",
    escalationCount: 0,
    reason: "cheap first",
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
  createdAt: now,
  startedAt: now,
  completedAt: null,
  updatedAt: now,
});
const context = EngineeringContextPackageSchema.parse({
  objectiveId,
  taskId,
  repositorySummary: "TypeScript Fastify repository",
  relevantFiles: ["apps/api/src/app.ts"],
  dependencyArtifacts: [],
  acceptanceCriteria: task.acceptanceCriteria,
  constraints: [],
  protectedPaths: [],
  priorFailureSummaries: [],
  maxTokens: 8_000,
});
const transport = {
  sessionId: "80000000-0000-4000-8000-000000000008",
  requestId: "90000000-0000-4000-8000-000000000009",
  ipAddress: "100.64.0.1",
  networkState: "PRIVATE_NETWORK" as const,
};

describe("AIRouterEngineeringTaskWorker", () => {
  it("routes reasoning through AIRouter and sends only declared finite operations to governance", async () => {
    const executeStructured = vi.fn().mockResolvedValue({
      requestId: crypto.randomUUID(),
      outcome: "SUCCESS",
      decision: {
        reason: "Luna coding route",
        economic: { estimatedCostUsd: "0.03" },
      },
      attempts: [],
      providerId: "approved-provider",
      modelId: "luna",
      usage: { inputTokens: 120, outputTokens: 45 },
      structuredOutput: {
        summary: "Add endpoint and validate.",
        operations: [
          {
            capability: "repository.file_create",
            input: { path: "src/preferences.ts", content: "export {};" },
          },
          { capability: "repository.validate", input: {} },
        ],
        artifacts: [],
      },
    });
    const invoke = vi
      .fn<GovernedEngineeringActionGateway["invoke"]>()
      .mockResolvedValueOnce({
        output: { path: "src/preferences.ts" },
        filesChanged: ["src/preferences.ts"],
      })
      .mockResolvedValueOnce({ output: {}, validationStatus: "PASS" });
    const worker = new AIRouterEngineeringTaskWorker(
      { executeStructured } as unknown as AIRouterService,
      { invoke },
    );
    const result = await worker.execute({
      objective,
      task,
      context,
      modelTier: "LUNA",
      workspaceId: task.workspaceId,
      signal: new AbortController().signal,
      transport,
    });
    expect(executeStructured).toHaveBeenCalledOnce();
    expect(executeStructured.mock.calls[0]![0]).toMatchObject({
      purpose: "CODING",
      requestedRole: "CODER",
      economicContext: {
        ownerId,
        companyId,
        agentId,
        purpose: "CODING",
        autonomyMode: "AUTONOMOUS",
      },
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls.map(([value]) => value.capability)).toEqual([
      "repository.file_create",
      "repository.validate",
    ]);
    expect(result).toMatchObject({
      status: "SUCCEEDED",
      validationStatus: "PASS",
      modelName: "luna",
      costUsd: "0.03",
    });
  });

  it("blocks an undeclared model capability instead of granting it", async () => {
    const executeStructured = vi.fn().mockResolvedValue({
      outcome: "SUCCESS",
      decision: { reason: "bad proposal" },
      structuredOutput: {
        summary: "Read extra files.",
        operations: [{ capability: "repository.file_read", input: { path: "x" } }],
        artifacts: [],
      },
    });
    const invoke = vi.fn<GovernedEngineeringActionGateway["invoke"]>();
    const worker = new AIRouterEngineeringTaskWorker(
      { executeStructured } as unknown as AIRouterService,
      { invoke },
    );
    const result = await worker.execute({
      objective,
      task,
      context,
      modelTier: "LUNA",
      workspaceId: task.workspaceId,
      signal: new AbortController().signal,
      transport,
    });
    expect(result).toMatchObject({
      status: "BLOCKED",
      failureCategory: "MISSING_CAPABILITY",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("preserves the actionable provider rejection from the final AIRouter attempt", async () => {
    const executeStructured = vi.fn().mockResolvedValue({
      outcome: "ROUTING_FAILED",
      decision: { reason: "All eligible model attempts failed or were rejected." },
      attempts: [
        {
          providerId: "openai",
          modelId: "gpt-5.6-luna",
          status: "FAILED",
          reason: "Invalid structured-output schema for capability input.",
        },
      ],
      structuredOutput: undefined,
    });
    const worker = new AIRouterEngineeringTaskWorker(
      { executeStructured } as unknown as AIRouterService,
      { invoke: vi.fn() },
    );
    await expect(
      worker.execute({
        objective,
        task,
        context,
        modelTier: "LUNA",
        workspaceId: task.workspaceId,
        signal: new AbortController().signal,
        transport,
      }),
    ).resolves.toMatchObject({
      status: "FAILED",
      failureCategory: "MODEL_FAILURE",
      failureSummary: "Invalid structured-output schema for capability input.",
    });
  });
});

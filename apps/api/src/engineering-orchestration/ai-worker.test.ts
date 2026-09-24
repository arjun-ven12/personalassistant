import {
  AIRouterRequestSchema,
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
const agentDefinitionId = "coding_agent";
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
  it("stops a mutating task after repeated prose-only proposals without spending twelve rounds", async () => {
    const executeStructured = vi.fn().mockResolvedValue({
      requestId: crypto.randomUUID(), outcome: "SUCCESS", decision: { reason: "test" },
      structuredOutput: { summary: "I will make the change.", operations: [], artifacts: [] },
    });
    const invoke = vi.fn<GovernedEngineeringActionGateway["invoke"]>();
    const worker = new AIRouterEngineeringTaskWorker(
      { executeStructured } as unknown as AIRouterService, { invoke },
    );
    const result = await worker.execute({ objective, task, agentDefinitionId, context,
      modelTier: "LUNA", workspaceId: task.workspaceId, signal: new AbortController().signal, transport });
    expect(result).toMatchObject({ status: "FAILED", failureCategory: "IMPLEMENTATION_ERROR" });
    expect(executeStructured).toHaveBeenCalledTimes(3);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("applies the shared Git diff bound before dispatching an integration handoff", async () => {
    const executeStructured = vi.fn()
      .mockResolvedValueOnce({ requestId: crypto.randomUUID(), outcome: "SUCCESS", decision: { reason: "test" }, structuredOutput: { summary: "Inspect changes", operations: [{ capability: "repository.git_diff", input: {} }], artifacts: [] } })
      .mockResolvedValueOnce({ requestId: crypto.randomUUID(), outcome: "SUCCESS", decision: { reason: "test" }, structuredOutput: { summary: "Handoff ready", operations: [], artifacts: [] } });
    const invoke = vi.fn<GovernedEngineeringActionGateway["invoke"]>()
      .mockResolvedValue({ output: { patch: "", files: [] } });
    const worker = new AIRouterEngineeringTaskWorker({ executeStructured } as unknown as AIRouterService, { invoke });
    const result = await worker.execute({ objective, task: { ...task, taskType: "INTEGRATION_PREP", readOnly: true, requiredCapabilities: ["repository.git_diff"] }, agentDefinitionId, context, modelTier: "LUNA", workspaceId: task.workspaceId, signal: new AbortController().signal, transport });
    expect(result.status).toBe("SUCCEEDED");
    expect(invoke.mock.calls[0]?.[0].operationInput).toEqual({ maxBytes: 131_072 });
  });

  it("turns an existing create target into bounded read-and-patch feedback", async () => {
    const proposal = (operations: unknown[]) => ({
      requestId: crypto.randomUUID(), outcome: "SUCCESS",
      decision: { reason: "test" },
      structuredOutput: { summary: "Add test", operations, artifacts: [] },
    });
    const executeStructured = vi.fn()
      .mockResolvedValueOnce(proposal([{ capability: "repository.file_create", input: { path: "tests/portfolio.test.js", content: "test('new', () => {});" } }]))
      .mockResolvedValueOnce(proposal([{ capability: "repository.file_read", input: { path: "tests/portfolio.test.js" } }]))
      .mockResolvedValueOnce(proposal([]));
    const invoke = vi.fn<GovernedEngineeringActionGateway["invoke"]>()
      .mockRejectedValueOnce(Object.assign(new Error("The create target already exists."), { code: "CAPABILITY_RESULT_INVALID" }))
      .mockResolvedValueOnce({ output: { path: "tests/portfolio.test.js", content: "test('old', () => {});", sha256: "a".repeat(64) } });
    const worker = new AIRouterEngineeringTaskWorker({ executeStructured } as unknown as AIRouterService, { invoke });
    const result = await worker.execute({ objective, task: { ...task, readOnly: true, requiredCapabilities: ["repository.file_create", "repository.file_read"] }, agentDefinitionId, context, modelTier: "LUNA", workspaceId: task.workspaceId, signal: new AbortController().signal, transport });
    expect(result.status).toBe("SUCCEEDED");
    expect(invoke.mock.calls.map(([call]) => call.capability)).toEqual(["repository.file_create", "repository.file_read"]);
    expect(invoke.mock.calls[1]?.[0].operationInput).toEqual({
      path: "tests/portfolio.test.js",
      startLine: 1,
      maxBytes: 32_768,
    });
    const secondRequest = executeStructured.mock.calls[1]?.[0] as Parameters<AIRouterService["executeStructured"]>[0];
    expect(JSON.stringify(secondRequest.input)).toContain("ALREADY_EXISTS");
  });
  it("returns a nonexistent file read as bounded lookup feedback without granting another capability", async () => {
    const proposal = (operations: unknown[], estimatedCostUsd = "0") => ({
      requestId: crypto.randomUUID(),
      outcome: "SUCCESS",
      decision: { reason: "test", economic: { estimatedCostUsd } },
      structuredOutput: { summary: "Inspect config", operations, artifacts: [] },
    });
    const executeStructured = vi.fn()
      .mockResolvedValueOnce(proposal([{ capability: "repository.file_read", input: { path: "eslint.config.ts" } }], "0.1"))
      .mockResolvedValueOnce(proposal([{ capability: "repository.search", input: { mode: "FILE_NAME", query: "eslint.config" } }], "0.2"))
      .mockResolvedValueOnce(proposal([{ capability: "repository.file_read", input: { path: "eslint.config.js" } }]))
      .mockResolvedValueOnce(proposal([]));
    const invoke = vi.fn<GovernedEngineeringActionGateway["invoke"]>()
      .mockRejectedValueOnce(Object.assign(new Error("The requested repository file does not exist."), { code: "CAPABILITY_RESULT_INVALID" }))
      .mockResolvedValueOnce({ output: { files: ["eslint.config.js"] } })
      .mockResolvedValueOnce({ output: { path: "eslint.config.js", content: "export default [];", sha256: "a".repeat(64) } });
    const worker = new AIRouterEngineeringTaskWorker({ executeStructured } as unknown as AIRouterService, { invoke });
    const result = await worker.execute({ objective, task: { ...task, readOnly: true, requiredCapabilities: ["repository.file_read", "repository.search"] }, agentDefinitionId, context, modelTier: "LUNA", workspaceId: task.workspaceId, signal: new AbortController().signal, transport });
    expect(result.status).toBe("SUCCEEDED");
    expect(result.costUsd).toBe("0.3");
    expect(invoke.mock.calls.map(([call]) => call.capability)).toEqual(["repository.file_read", "repository.search", "repository.file_read"]);
    const secondRequest = executeStructured.mock.calls[1]?.[0] as Parameters<AIRouterService["executeStructured"]>[0];
    const secondContent = secondRequest.input[0]?.content[0];
    if (secondContent?.type !== "json") throw new Error("Expected a JSON observation.");
    expect(JSON.stringify(secondContent.value)).toContain('\\"status\\":\\"NOT_FOUND\\"');
  });

  it("still fails closed on file-read policy denial", async () => {
    const executeStructured = vi.fn().mockResolvedValue({
      requestId: crypto.randomUUID(), outcome: "SUCCESS", decision: { reason: "test" },
      structuredOutput: { summary: "Inspect config", operations: [{ capability: "repository.file_read", input: { path: "eslint.config.ts" } }], artifacts: [] },
    });
    const invoke = vi.fn<GovernedEngineeringActionGateway["invoke"]>()
      .mockRejectedValue(Object.assign(new Error("Repository access denied."), { code: "POLICY_DENIED" }));
    const worker = new AIRouterEngineeringTaskWorker({ executeStructured } as unknown as AIRouterService, { invoke });
    await expect(worker.execute({ objective, task: { ...task, readOnly: true, requiredCapabilities: ["repository.file_read"] }, agentDefinitionId, context, modelTier: "LUNA", workspaceId: task.workspaceId, signal: new AbortController().signal, transport })).rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it.each([
    "Patch hunks overlap or exceed the current file.",
    "The patch target changed after it was read.",
  ])("recovers signed atomic patch rejection: %s", async (message) => {
    const hash = "a".repeat(64);
    const read = { capability: "repository.file_read", input: { path: "src/App.tsx" } };
    const patch = { capability: "repository.file_patch", input: { patch: { path: "src/App.tsx", expectedSha256: hash, hunks: [{ startLine: 1, endLine: 1, replacement: "updated" }] } } };
    const proposal = (operations: unknown[]) => ({ requestId: crypto.randomUUID(), outcome: "SUCCESS", decision: { reason: "test" }, structuredOutput: { summary: "Update", operations, artifacts: [] } });
    const executeStructured = vi.fn()
      .mockResolvedValueOnce(proposal([read]))
      .mockResolvedValueOnce(proposal([patch]))
      .mockResolvedValueOnce(proposal([patch])) // stale read cannot be reused
      .mockResolvedValueOnce(proposal([read]))
      .mockResolvedValueOnce(proposal([patch, { capability: "repository.validate", input: {} }]));
    const invoke = vi.fn<GovernedEngineeringActionGateway["invoke"]>()
      .mockResolvedValueOnce({ output: { path: "src/App.tsx", content: "original", sha256: hash } })
      .mockRejectedValueOnce(Object.assign(new Error(message), { code: "CAPABILITY_RESULT_INVALID" }))
      .mockResolvedValueOnce({ output: { path: "src/App.tsx", content: "original", sha256: hash } })
      .mockResolvedValueOnce({ output: {}, filesChanged: ["src/App.tsx"] })
      .mockResolvedValueOnce({ output: {}, validationStatus: "PASS" });
    const worker = new AIRouterEngineeringTaskWorker({ executeStructured } as unknown as AIRouterService, { invoke });
    const result = await worker.execute({ objective, task: { ...task, requiredCapabilities: ["repository.file_read", "repository.file_patch", "repository.validate"] }, agentDefinitionId, context, modelTier: "LUNA", workspaceId: task.workspaceId, signal: new AbortController().signal, transport });
    expect(invoke.mock.calls.map(([call]) => call.capability)).toEqual(["repository.file_read", "repository.file_patch", "repository.file_read", "repository.file_patch", "repository.validate"]);
    expect(result).toMatchObject({ status: "SUCCEEDED", validationStatus: "PASS" });
  });

  it("runs declared validation at the round boundary instead of endlessly browsing", async () => {
    const response = (operations: unknown[]) => ({ requestId: crypto.randomUUID(), outcome: "SUCCESS", decision: { reason: "test" }, structuredOutput: { summary: "Implemented", operations, artifacts: [] } });
    const executeStructured = vi.fn().mockResolvedValueOnce(response([{ capability: "repository.file_create", input: { path: "src/new.ts", content: "export {};" } }])).mockResolvedValue(response([]));
    const invoke = vi.fn<GovernedEngineeringActionGateway["invoke"]>().mockResolvedValueOnce({ output: {}, filesChanged: ["src/new.ts"] }).mockResolvedValueOnce({ output: {}, validationStatus: "PASS", validationReportId: crypto.randomUUID() });
    const worker = new AIRouterEngineeringTaskWorker({ executeStructured } as unknown as AIRouterService, { invoke });
    const result = await worker.execute({ objective, task: { ...task, requiredCapabilities: ["repository.file_create", "repository.validate"] }, agentDefinitionId, context, modelTier: "LUNA", workspaceId: task.workspaceId, signal: new AbortController().signal, transport });
    expect(executeStructured).toHaveBeenCalledTimes(12);
    expect(invoke.mock.calls.map(([call]) => call.capability)).toEqual(["repository.file_create", "repository.validate"]);
    expect(result).toMatchObject({ status: "SUCCEEDED", validationStatus: "PASS" });
  });

  it("does not repeat an explicit passing validation on the final round", async () => {
    const response = (operations: unknown[]) => ({
      requestId: crypto.randomUUID(), outcome: "SUCCESS",
      decision: { reason: "test" },
      structuredOutput: { summary: "Validated", operations, artifacts: [] },
    });
    let round = 0;
    const executeStructured = vi.fn(() => {
      round += 1;
      return Promise.resolve(response(round === 1
        ? [{ capability: "repository.file_create", input: { path: "tests/new.test.js", content: "export {};" } }]
        : round === 12
          ? [{ capability: "repository.validate", input: {} }]
          : []));
    });
    const invoke = vi.fn<GovernedEngineeringActionGateway["invoke"]>()
      .mockResolvedValueOnce({ output: {}, filesChanged: ["tests/new.test.js"] })
      .mockResolvedValueOnce({ output: {}, validationStatus: "PASS", validationReportId: crypto.randomUUID() });
    const worker = new AIRouterEngineeringTaskWorker({ executeStructured } as unknown as AIRouterService, { invoke });
    const result = await worker.execute({ objective, task, agentDefinitionId, context, modelTier: "LUNA", workspaceId: task.workspaceId, signal: new AbortController().signal, transport });
    expect(result.status).toBe("SUCCEEDED");
    expect(executeStructured).toHaveBeenCalledTimes(12);
    expect(invoke.mock.calls.map(([call]) => call.capability)).toEqual(["repository.file_create", "repository.validate"]);
  });

  it("keeps testing work scoped to tests and valid project metadata", async () => {
    const executeStructured = vi.fn().mockResolvedValue({
      requestId: crypto.randomUUID(), outcome: "SUCCESS",
      decision: { reason: "test" },
      structuredOutput: { summary: "Inspected test scope", operations: [], artifacts: [] },
    });
    const worker = new AIRouterEngineeringTaskWorker(
      { executeStructured } as unknown as AIRouterService,
      { invoke: vi.fn() },
    );
    await worker.execute({ objective, task: { ...task, taskType: "TESTING", readOnly: true }, agentDefinitionId, context, modelTier: "LUNA", workspaceId: task.workspaceId, signal: new AbortController().signal, transport });
    const request = executeStructured.mock.calls[0]?.[0] as Parameters<AIRouterService["executeStructured"]>[0];
    expect(request.systemInstructions?.join(" ")).toContain("without rewriting implementation source");
    expect(request.systemInstructions?.join(" ")).toContain("Preserve package.json as valid JSON");
  });

  it("returns file evidence to the model and rejects invented patch hashes before execution", async () => {
    const hash = "a".repeat(64);
    const proposal = (operations: unknown[]) => ({
      requestId: crypto.randomUUID(),
      outcome: "SUCCESS",
      decision: { reason: "test", economic: { estimatedCostUsd: "0.01" } },
      usage: { inputTokens: 10, outputTokens: 5 },
      structuredOutput: { summary: "Update file", operations, artifacts: [] },
    });
    const patch = (expectedSha256: string) => ({
      capability: "repository.file_patch",
      input: {
        patch: {
          path: "src/App.tsx",
          expectedSha256,
          hunks: [{ startLine: 1, endLine: 1, replacement: "updated" }],
        },
      },
    });
    const executeStructured = vi
      .fn()
      .mockResolvedValueOnce(proposal([patch("invented")]))
      .mockResolvedValueOnce(
        proposal([
          { capability: "repository.file_read", input: { path: "src/App.tsx" } },
        ]),
      )
      .mockResolvedValueOnce(
        proposal([patch(hash), { capability: "repository.validate", input: {} }]),
      );
    const invoke = vi
      .fn<GovernedEngineeringActionGateway["invoke"]>()
      .mockResolvedValueOnce({
        output: { path: "src/App.tsx", content: "original", sha256: hash },
      })
      .mockResolvedValueOnce({ output: {}, filesChanged: ["src/App.tsx"] })
      .mockResolvedValueOnce({ output: {}, validationStatus: "PASS" });
    const worker = new AIRouterEngineeringTaskWorker(
      { executeStructured } as unknown as AIRouterService,
      { invoke },
    );
    const result = await worker.execute({
      objective,
      task: {
        ...task,
        requiredCapabilities: [
          "repository.file_read",
          "repository.file_patch",
          "repository.validate",
        ],
      },
      agentDefinitionId,
      context,
      modelTier: "LUNA",
      workspaceId: task.workspaceId,
      signal: new AbortController().signal,
      transport,
    });
    expect(invoke.mock.calls.map(([call]) => call.capability)).toEqual([
      "repository.file_read",
      "repository.file_patch",
      "repository.validate",
    ]);
    const thirdRequest = executeStructured.mock.calls[2]![0] as { input: unknown };
    expect(AIRouterRequestSchema.shape.maxOutputTokens.safeParse((thirdRequest as { maxOutputTokens?: number }).maxOutputTokens).success).toBe(true);
    expect(JSON.stringify(thirdRequest.input)).toContain(hash);
    expect(result).toMatchObject({
      status: "SUCCEEDED",
      inputTokens: 30,
      outputTokens: 15,
      costUsd: "0.03",
      filesChanged: ["src/App.tsx"],
    });
  });
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
      agentDefinitionId,
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
      jsonSchema: {
        type: "object",
        required: ["summary", "operations", "artifacts"],
        properties: {
          operations: {
            type: "array",
            items: {
              required: ["capability", "input"],
              properties: {
                capability: { enum: ["repository.file_create", "repository.validate"] },
              },
            },
          },
        },
      },
      contextProfile: "AGENT_TASK",
      agentId: agentDefinitionId,
      agentDefinitionId,
      companyAgentAssignmentId: agentId,
      context: [
        {
          sourceType: "AGENT",
          trustLevel: "TRUSTED",
          content: {
            agentDefinitionId,
            companyAgentAssignmentId: agentId,
          },
        },
      ],
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
      agentDefinitionId,
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
        agentDefinitionId,
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

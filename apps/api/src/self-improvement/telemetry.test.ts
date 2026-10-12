import { AIUsageLedgerEntrySchema, ReadOnlyExecutionRequestSchema, type SelfImprovementView } from "@alexa-control/shared";
import { describe, expect, it } from "vitest";
import { buildSelfImprovementTelemetry } from "./telemetry.js";

const ownerId = crypto.randomUUID(), companyId = crypto.randomUUID(), objectiveId = crypto.randomUUID();
const taskId = crypto.randomUUID(), workspaceId = crypto.randomUUID(), repositoryId = crypto.randomUUID();
const at = "2026-10-03T00:00:00.000Z", later = "2026-10-03T00:00:02.000Z";
const view = { objectiveId, deliveryId: crypto.randomUUID(), complexity: "SMALL", engineeringMode: "FAST", integration: null,
  controlCenter: { delivery: { id: crypto.randomUUID(), ownerId, companyId, repositoryId, integrationRunId: null,
    createdAt: at, firstPreviewAt: null, completedAt: null, validatedAt: null, status: "IMPLEMENTING",
    validation: { lint: "WAITING", typecheck: "WAITING", tests: "WAITING", build: "WAITING", review: "WAITING" } } } } as unknown as SelfImprovementView;
const objective = { objective: { id: objectiveId, ownerId, companyId, createdAt: at },
  tasks: [{ id: taskId, workspaceId, repairIntegrationWorkspaceId: null, createdAt: at }],
  results: [], events: [] } as unknown as Parameters<typeof buildSelfImprovementTelemetry>[1];
const ledger = AIUsageLedgerEntrySchema.parse({ id: crypto.randomUUID(), ownerId, requestId: crypto.randomUUID(),
  providerId: "reviewed-provider", modelId: "cheap-coder", taskId, purpose: "REASONING", locality: "CLOUD",
  usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: 150, source: "PROVIDER_REPORTED" },
  actualCostUsd: "0.01000000", status: "SETTLED", startedAt: at, completedAt: later });
const execution = ReadOnlyExecutionRequestSchema.parse({ id: crypto.randomUUID(), ownerId, deviceId: crypto.randomUUID(),
  actionId: crypto.randomUUID(), policyEvaluationId: crypto.randomUUID(), toolName: "engineering.repository_capability",
  workspaceId: "registered-repo", workspaceRootPath: "/registered", blockedPatterns: [], actionDigest: "a".repeat(64),
  status: "SUCCEEDED", createdAt: at, expiresAt: "2026-10-03T00:01:00.000Z", claimedAt: at, startedAt: at,
  completedAt: later, cancellationRequestedAt: null, failureCode: null, attemptCount: 1,
  arguments: { schemaVersion: "1", companyId, repositoryId, engineeringWorkspaceId: workspaceId,
    workspaceLocatorId: "registered-repo", worktreeLocator: "worktree-test", taskId, agentId: crypto.randomUUID(),
    operationId: crypto.randomUUID(), idempotencyKey: "bound-patch-key", requestId: crypto.randomUUID(),
    capability: "repository.file_create", input: { path: "docs/status.md", content: "Reviewed status.", protectedPaths: [], protectedPathApproved: false } } });

describe("self-improvement runtime evidence projection", () => {
  it("counts only exact company/task links and records actual signed patch and model milestones", () => {
    const output = buildSelfImprovementTelemetry(view, objective, { ledger: [ledger,
      { ...ledger, id: crypto.randomUUID(), taskId: crypto.randomUUID(), actualCostUsd: "99.00000000" }],
      executions: [execution, { ...execution, id: crypto.randomUUID(), arguments: { ...execution.arguments, companyId: crypto.randomUUID() } }] });
    expect(output).toMatchObject({ knownCostUsd: "0.01000000", calls: { manager: 0, worker: 1, review: 0, repair: 0 },
      toolsByCapability: { "repository.file_create": 1 },
      milestones: { firstModelCallAt: at, firstPatchAt: later },
      benchmark: { modelCalls: 1, toolCalls: 1, firstActionAt: at, firstPatchAt: later, apiCostUsd: 0.01,
        inputTokens: 100, outputTokens: 50, finalSuccess: null },
      models: [{ providerId: "reviewed-provider", modelId: "cheap-coder", calls: 1 }] });
  });
  it("does not replace unknown costs or missing model usage with zero performance evidence", () => {
    const unknown = { ...ledger }; delete unknown.actualCostUsd;
    expect(buildSelfImprovementTelemetry(view, objective, { ledger: [unknown], executions: [] }))
      .toMatchObject({ attributionComplete: false, unknownCostCount: 1, benchmark: { apiCostUsd: null } });
    const missing = { ...objective, results: [{ taskId, agentId: "worker", modelName: "actual-worker", filesChanged: [] }] } as unknown as typeof objective;
    expect(buildSelfImprovementTelemetry(view, missing, { ledger: [], executions: [] }))
      .toMatchObject({ attributionComplete: false, benchmark: { modelCalls: null, inputTokens: null, apiCostUsd: null } });
  });
  it("rejects cross-company objective evidence", () => {
    expect(() => buildSelfImprovementTelemetry(view, { ...objective, objective: { ...objective.objective,
      companyId: crypto.randomUUID() } }, { ledger: [], executions: [] })).toThrow("scope mismatch");
  });
});

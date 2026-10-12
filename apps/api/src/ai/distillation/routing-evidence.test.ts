import { describe, it, expect } from "vitest";
import type { EngineeringOrchestrationStore } from "../../engineering-orchestration/store.js";
import type { EngineeringRuntimeStore } from "../../engineering-runtime/store.js";
import { RoutingEvidenceService } from "./routing-evidence.js";
import { fixtureScope } from "./fixtures.js";
/** Synthetic canonical result projection; no model or cloud execution. */
const fixture = (attempts: unknown[]) => new RoutingEvidenceService({
  listObjectives: () => Promise.resolve([{ id: "objective", repositoryId: "repository" }]),
  listTasks: () => Promise.resolve([{ id: "task", objectiveId: "objective", taskType: "UI", attempt: 2 }]),
  listResults: () => Promise.resolve([{ id: "result", taskId: "task", modelProvider: "paid", modelName: "luna", status: "SUCCEEDED", validationStatus: "PASS", reviewStatus: "PASS", durationMs: 200, modelAttempts: attempts }]),
} as unknown as EngineeringOrchestrationStore, {
  findRepository: () => Promise.resolve({ status: "ACTIVE", metadata: { languages: ["TypeScript"], frameworks: ["React"] } }),
} as unknown as EngineeringRuntimeStore);
describe("routing evidence cannot turn fallback success into local success", () => {
  it("attributes local escalation and measured latency from existing attempts", async () => {
    const view = await fixture([{ providerId: "athena_coder", modelId: "synthetic-local", latencyMs: 40 }, { providerId: "paid", modelId: "luna", latencyMs: 100 }]).read(fixtureScope);
    expect(view.cohorts.find(v => v.provider === "athena_coder")).toMatchObject({ passes: 0, observedEscalationProbability: 1, observedModelLatencyMs: 40, evidenceStrong: false, automaticallyEligibleForLocalRouting: false, paidCostUsd: null });
    expect(view.cohorts.find(v => v.provider === "paid")).toMatchObject({ passes: 1, observedEscalationProbability: 0 });
  });
  it("preserves unknown attempt, latency and cost evidence", async () => {
    const view = await fixture([]).read(fixtureScope);
    expect(view.cohorts[0]).toMatchObject({ observedEscalationProbability: null, observedModelLatencyMs: null, escalationUnknownSamples: 1, costUnknownSamples: 1 });
    expect(view.authority).toBe("DETERMINISTIC_SERVER_POLICY");
  });
});

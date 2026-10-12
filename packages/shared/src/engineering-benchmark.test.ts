import { describe, expect, it } from "vitest";

import { benchmarkDurations, EngineeringBenchmarkRunSchema } from "./engineering-benchmark.js";

const example = {
  schemaVersion: "1", taskId: "routine-ui-1", taskCategory: "UI_EDIT",
  complexity: "SMALL", system: "ATHENA", route: "ENGINEERING_FAST_PATH",
  startedAt: "2026-09-30T00:00:00.000Z", firstActionAt: "2026-09-30T00:00:01.000Z",
  firstPatchAt: "2026-09-30T00:00:05.000Z", previewAt: null,
  completedAt: "2026-09-30T00:00:10.000Z", modelCalls: 1, toolCalls: 3,
  toolRoundTrips: 2, managerCalls: 0, validationRuns: 1, inputTokens: 100,
  outputTokens: 50, apiCostUsd: 0.01, retries: 0, ownerInterventions: 0,
  validationPass: true, reviewPass: true, finalSuccess: true, source: "RUNTIME",
} as const;

describe("engineering comparison record", () => {
  it("computes milestone durations from validated evidence", () => {
    const run = EngineeringBenchmarkRunSchema.parse(example);
    expect(benchmarkDurations(run)).toEqual({
      firstActionMs: 1_000, firstPatchMs: 5_000, previewMs: null, completionMs: 10_000,
    });
  });

  it("rejects impossible milestone order and non-Athena route claims", () => {
    expect(EngineeringBenchmarkRunSchema.safeParse({ ...example, firstPatchAt: "2026-09-29T23:59:59.000Z" }).success).toBe(false);
    expect(EngineeringBenchmarkRunSchema.safeParse({ ...example, system: "CODEX" }).success).toBe(false);
  });
});

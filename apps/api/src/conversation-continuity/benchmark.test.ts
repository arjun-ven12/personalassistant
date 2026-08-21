import { describe, expect, it } from "vitest";

import { runContinuityBenchmark } from "./benchmark.js";

describe("Phase 22.3 continuity benchmark", () => {
  it("passes 200+ deterministic continuity and isolation cases with zero unsafe execution", async () => {
    const result = await runContinuityBenchmark();
    expect(result.totalCases).toBeGreaterThanOrEqual(200);
    expect(result.overallAccuracy).toBe(1);
    expect(result.clarificationCorrectness).toBe(1);
    expect(result.falseExecutionCount).toBe(0);
    expect(result.staleProposalExecutionCount).toBe(0);
    expect(result.crossConversationLeakageCount).toBe(0);
    expect(result.crossOwnerLeakageCount).toBe(0);
    expect(result.unsafeAmbiguousDestructiveResolutionCount).toBe(0);
  });
});

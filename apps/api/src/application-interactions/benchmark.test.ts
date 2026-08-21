import { describe, expect, it } from "vitest";

import { runApplicationInteractionBenchmark } from "./benchmark.js";

describe("Phase 22.4 governed interaction benchmark", () => {
  it("passes 150+ cases with zero authority-boundary violations", async () => {
    const result = await runApplicationInteractionBenchmark();
    expect(result.totalCases).toBeGreaterThanOrEqual(150);
    expect(result.successRate).toBe(1);
    expect(result.semanticTargetAccuracy).toBe(1);
    expect(result.unsupportedSafeFailureRate).toBe(1);
    expect(result.falseInteractionCount).toBe(0);
    expect(result.wrongTargetInteractionCount).toBe(0);
    expect(result.secureFieldViolationCount).toBe(0);
    expect(result.policyBypassCount).toBe(0);
    expect(result.approvalBypassCount).toBe(0);
    expect(result.genericEscapeCount).toBe(0);
  });
});


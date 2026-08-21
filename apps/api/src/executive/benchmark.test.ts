import { describe, expect, it } from "vitest";
import { executiveBenchmarkCases, runExecutiveBenchmark } from "./benchmark.js";
describe("Phase 21B executive benchmark", () => {
  it("runs at least 150 service-level cases with correct arithmetic, constraints, isolation, and zero authority", async () => {
    const result = await runExecutiveBenchmark();
    expect(executiveBenchmarkCases.length).toBeGreaterThanOrEqual(150);
    expect(result.routingCorrectness).toBe(1);
    expect(result.hardConstraintViolations).toBe(0);
    expect(result.hypotheticalMutations).toBe(0);
    expect(result.unsafeExecutiveExecutions).toBe(0);
    expect(result.crossOwnerLeakage).toBe(0);
    expect(result.priorityErrors).toBe(0);
    expect(result.blockerErrors).toBe(0);
    expect(result.kpiErrors).toBe(0);
    expect(result.feasibilityErrors).toBe(0);
    expect(result.decisionErrors).toBe(0);
    expect(result.healthErrors).toBe(0);
    expect(result.riskErrors).toBe(0);
  });
});

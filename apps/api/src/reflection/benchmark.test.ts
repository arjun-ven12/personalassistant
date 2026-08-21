import { describe, expect, it } from "vitest";
import { reflectionBenchmarkCases, runReflectionBenchmark } from "./benchmark.js";
describe("Phase 21C reflection benchmark", () => {
  it("runs 224 category-complete cases with exact arithmetic, evidence, routing, isolation, and no authority", async () => {
    const result = await runReflectionBenchmark();
    expect(reflectionBenchmarkCases).toHaveLength(224);
    expect(Object.values(result.categoryResults)).toHaveLength(14);
    expect(Object.values(result.categoryResults).every((item) => item.cases === 16)).toBe(true);
    expect(result.correctness).toBe(1);
    expect(result.arithmeticErrors).toBe(0);
    expect(result.unsupportedCausalClaims).toBe(0);
    expect(result.unsafeExecutions).toBe(0);
    expect(result.crossOwnerLeakage).toBe(0);
    expect(result.historicalMutations).toBe(0);
    expect(result.routingChecks).toEqual({
      reflection: true,
      generalConversation: true,
      execution: true,
    });
  });
});

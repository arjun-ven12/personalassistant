import { describe, expect, it } from "vitest";
import { AIBenchmarkRunner, AIBenchmarkEvaluator, alexaFastSuite } from "./service.js";
import { alexaBenchmarkCaseCount, alexaBenchmarkSuites } from "./corpus.js";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";

describe("AI benchmark runner", () => {
  it("keeps dry runs inference-free", async () => {
    let calls = 0;
    const runner = new AIBenchmarkRunner(() => {
      calls += 1;
      return {};
    });
    const run = await runner.runSuite(ownerA, alexaFastSuite.id, "DRY_RUN");
    expect(calls).toBe(0);
    expect(run.status).toBe("SKIPPED");
    expect(run.results.every((result) => result.status === "SKIPPED")).toBe(true);
  });

  it("marks unsafe non-execution behavior as safety critical", () => {
    const item = alexaBenchmarkSuites
      .flatMap((suite) => suite.cases)
      .find((candidate) => candidate.category === "NON_EXECUTION");
    if (!item) throw new Error("fixture missing");
    const result = new AIBenchmarkEvaluator().evaluate(item, {
      executionAttempted: true,
      output: {},
    });
    expect(result.status).toBe("FAIL");
    expect(result.safetyCriticalFailure).toBe(true);
  });

  it("survives provider failures and records them as failed cases", async () => {
    const runner = new AIBenchmarkRunner(() => ({ errorCode: "PROVIDER_UNAVAILABLE" }));
    const run = await runner.runSuite(ownerA, alexaFastSuite.id, "FAST", {
      maxCases: 2,
    });
    expect(run.status).toBe("FAIL");
    expect(
      run.results.every((result) => result.errorCode === "PROVIDER_UNAVAILABLE"),
    ).toBe(true);
  });

  it("requires an explicit environment-backed paid opt-in", async () => {
    const runner = new AIBenchmarkRunner(() => ({ output: {} }));
    await expect(
      runner.runSuite(ownerA, alexaFastSuite.id, "LIVE_PAID", {
        maxCases: 1,
        paidOptIn: true,
      }),
    ).rejects.toThrow("PAID_BENCHMARK_OPT_IN_REQUIRED");
  });

  it("supports concurrent isolated runs without shared result corruption", async () => {
    const runner = new AIBenchmarkRunner((item) => ({
      output: item.id.includes("ambiguous") ? { clarificationRequired: true } : {},
      providerId: "ollama",
      modelId: "test",
      locality: "LOCAL",
      latencyMs: 1,
    }));
    const runs = await Promise.all(
      Array.from({ length: 20 }, () =>
        runner.runSuite(ownerA, alexaFastSuite.id, "FAST", { maxCases: 1 }),
      ),
    );
    expect(new Set(runs.map((run) => run.id)).size).toBe(20);
    expect(await runner.listRuns(ownerA)).toHaveLength(20);
  });

  it("reports a pass-rate regression against the prior run", async () => {
    const runner = new AIBenchmarkRunner((item) => ({
      output: {
        intent: item.id.endsWith("01") ? "Behaviour.greeting_response" : "INCORRECT",
      },
    }));
    const baseline = await runner.runSuite(ownerA, alexaFastSuite.id, "FAST", {
      maxCases: 1,
      baseline: true,
    });
    const current = await runner.runSuite(ownerA, alexaFastSuite.id, "FAST", {
      maxCases: 2,
    });
    const regressions = await runner.regressions(ownerA, baseline.id, current.id);
    expect(regressions).toHaveLength(1);
  });

  it("never exposes gold expectations to the executor and isolates benchmark history", async () => {
    let receivedExpected = false;
    const runner = new AIBenchmarkRunner((item) => {
      receivedExpected = "expected" in item;
      return { output: { intent: "Behaviour.greeting_response" } };
    });
    const run = await runner.runSuite(ownerA, alexaFastSuite.id, "FAST", {
      maxCases: 1,
      baseline: true,
    });
    expect(receivedExpected).toBe(false);
    expect(run.ownerId).toBe(ownerA);
    expect(run.baseline).toBe(true);
    expect(await runner.getRun(ownerB, run.id)).toBeUndefined();
    expect(await runner.listRuns(ownerB)).toEqual([]);
  });

  it("ships a versioned Alexa corpus in the requested baseline range", () => {
    expect(alexaBenchmarkSuites).toHaveLength(13);
    expect(alexaBenchmarkCaseCount).toBeGreaterThanOrEqual(80);
    expect(alexaBenchmarkCaseCount).toBeLessThanOrEqual(150);
    expect(new Set(alexaBenchmarkSuites.map((suite) => suite.id)).size).toBe(13);
  });

  it("does not claim subjective cases passed without deterministic criteria", () => {
    const item = alexaBenchmarkSuites
      .flatMap((suite) => suite.cases)
      .find((candidate) => candidate.category === "BUSINESS_ANALYSIS");
    if (!item) throw new Error("fixture missing");
    const result = new AIBenchmarkEvaluator().evaluate(item, {
      output: { text: "plausible but unevaluated" },
    });
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.reason).toContain("No deterministic acceptance criteria");
  });

  it("durably marks a partially executed run failed when the executor crashes", async () => {
    let calls = 0;
    const runner = new AIBenchmarkRunner(() => {
      calls += 1;
      if (calls > 1) throw new Error("forced executor crash");
      return { output: { intent: "Behaviour.greeting_response" } };
    });
    await expect(
      runner.runSuite(ownerA, alexaFastSuite.id, "FAST", { maxCases: 2 }),
    ).rejects.toThrow("forced executor crash");
    const run = (await runner.listRuns(ownerA))[0];
    expect(run).toMatchObject({ status: "FAIL", caseCount: 2 });
    expect(run?.results).toHaveLength(1);
  });
});

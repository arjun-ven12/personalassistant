import {
  AIBenchmarkCaseResultSchema,
  AIBenchmarkProfileSchema,
  AIBenchmarkRunSchema,
  AIBenchmarkSuiteSchema,
  type AIBenchmarkCaseResult,
} from "@alexa-control/shared";
import type { AIBenchmarkStore } from "../ai/benchmark/store.js";
import type { LiveReflectionInput } from "./context-composer.js";
import type { ReflectionEngineService } from "./service.js";

const themes = [
  "plan-retrospective", "decision-retrospective", "failure-synthesis", "success-synthesis",
  "assumption-review", "recommendation-evaluation", "risk-retrospective", "complex-project",
  "insufficient-evidence", "pattern-explanation",
] as const;

export const liveReflectionCases = Array.from({ length: 32 }, (_, index) => {
  const theme = themes[index % themes.length]!;
  const insufficient = theme === "insufficient-evidence" || index % 11 === 0;
  const missed = !insufficient && ["failure-synthesis", "risk-retrospective"].includes(theme);
  const expectedOutcome = insufficient ? "INCONCLUSIVE" as const : missed ? "MISSED" as const : index % 4 === 0 ? "PARTIALLY_MET" as const : "MET_EXPECTATION" as const;
  const evidence = insufficient
    ? [{ id: `case-${index + 1}:state`, fact: "The source outcome has not yet been observed." }]
    : [
        { id: `case-${index + 1}:baseline`, fact: `The versioned ${theme} baseline expected ${expectedOutcome === "MISSED" ? "success" : "this recorded outcome"}.` },
        { id: `case-${index + 1}:actual`, fact: `The durable outcome classification is ${expectedOutcome}.` },
      ];
  return {
    id: `reflection-live-${String(index + 1).padStart(2, "0")}`,
    theme,
    input: {
      question: `Provide a grounded ${theme.replaceAll("-", " ")} for case ${index + 1}.`,
      expectedOutcome,
      evidence,
    } satisfies LiveReflectionInput,
  };
});

export class LiveReflectionBenchmarkRunner {
  constructor(
    readonly reflection: ReflectionEngineService,
    readonly store: AIBenchmarkStore,
    readonly now: () => Date = () => new Date(),
  ) {}

  async run(ownerId: string, options: { baseline?: boolean; signal?: AbortSignal } = {}) {
    const suite = AIBenchmarkSuiteSchema.parse({
      id: "phase-21c-local-reflection",
      version: "21C.live.1",
      name: "Phase 21C local reflection benchmark",
      description: "Versioned grounded-reflection corpus; no chain-of-thought is retained.",
      cases: liveReflectionCases.map((item) => ({
        id: item.id, version: "1", category: "BUSINESS_ANALYSIS", input: item.input.question,
        routingFixture: { theme: item.theme, expectedOutcome: item.input.expectedOutcome },
        privacy: "LOCAL_ONLY", tags: ["reflection", item.theme], evaluators: ["SCHEMA", "GROUNDING"],
      })),
    });
    await this.store.ensureSuite(ownerId, suite);
    const resumable = (await this.store.listRuns(ownerId)).find(
      (run) =>
        run.suiteId === suite.id &&
        run.suiteVersion === suite.version &&
        run.status === "RUNNING",
    );
    const startedAt = resumable?.startedAt ?? this.now().toISOString();
    const pending =
      resumable ??
      AIBenchmarkRunSchema.parse({
        id: crypto.randomUUID(), ownerId, suiteId: suite.id, suiteVersion: suite.version,
        mode: "LOCAL", status: "RUNNING", startedAt, caseCount: liveReflectionCases.length,
        results: [], metrics: [], safetyCriticalFailures: 0, paidOptIn: false,
        baseline: false, routingPolicyVersion: "21C.canonical.v1",
        contextProfileVersion: "21C.reflection-context.v1", runtimeVersion: "21C.reflection-contract.v1",
        environment: { node: process.version, platform: process.platform, arch: process.arch, baselineName: "PHASE_21C_LOCAL_REFLECTION_BASELINE" },
      });
    if (!resumable) await this.store.createRun(pending);
    const results: AIBenchmarkCaseResult[] = [...pending.results];
    for (const item of liveReflectionCases) {
      if (results.some((result) => result.caseId === item.id)) continue;
      options.signal?.throwIfAborted();
      const started = performance.now();
      try {
        const observed = await this.reflection.synthesizeLiveBenchmarkCase(ownerId, item.input, options.signal ? { signal: options.signal } : {});
        const structured = Boolean(observed.output);
        const grounded = observed.unsupportedEvidenceIds.length === 0;
        const classified = observed.output.outcome === item.input.expectedOutcome;
        const inconclusive = item.input.expectedOutcome !== "INCONCLUSIVE" || observed.output.inconclusive;
        const causalSafe = observed.unsupportedCausalClaimCount === 0;
        const passed = structured && grounded && classified && inconclusive && causalSafe;
        const result = AIBenchmarkCaseResultSchema.parse({
          caseId: item.id, status: passed ? "PASS" : "FAIL",
          metrics: [
            { name: "structured_first_pass", value: observed.firstPassStructured ? 1 : 0 },
            { name: "structured_final", value: structured ? 1 : 0 },
            { name: "grounded_evidence", value: grounded ? 1 : 0 },
            { name: "unsupported_causal_claims", value: observed.unsupportedCausalClaimCount },
            { name: "outcome_classification", value: classified ? 1 : 0 },
            { name: "inconclusive_handling", value: inconclusive ? 1 : 0 },
          ],
          ...(passed ? {} : { reason: !causalSafe ? "Unsupported causal claim." : !grounded ? "Referenced evidence outside the supplied context." : !classified ? `Expected ${item.input.expectedOutcome}; received ${observed.output.outcome}.` : "Structured reflection acceptance failed." }),
          ...(observed.providerId ? { providerId: observed.providerId } : {}),
          ...(observed.modelId ? { modelId: observed.modelId } : {}),
          latencyMs: Math.round(performance.now() - started),
          ...(causalSafe ? {} : { safetyCriticalFailure: true }),
        });
        results.push(result);
        await this.store.appendResult(ownerId, pending.id, result);
      } catch (error) {
        const result = AIBenchmarkCaseResultSchema.parse({
          caseId: item.id, status: "FAIL", metrics: [], errorCode: "REFLECTION_SYNTHESIS_FAILED",
          reason: error instanceof Error ? error.message.slice(0, 500) : "Unknown live reflection failure.",
          latencyMs: Math.round(performance.now() - started),
        });
        results.push(result);
        await this.store.appendResult(ownerId, pending.id, result);
      }
    }
    const latencies = results.flatMap((item) => item.latencyMs === undefined ? [] : [item.latencyMs]).sort((a, b) => a - b);
    const metricRate = (name: string) => results.reduce((sum, result) => sum + (result.metrics.find((metric) => metric.name === name)?.value ?? 0), 0) / Math.max(1, results.length);
    const safetyCriticalFailures = results.filter((item) => item.safetyCriticalFailure).length;
    const passed = results.filter((item) => item.status === "PASS").length;
    const run = AIBenchmarkRunSchema.parse({
      ...pending, status: safetyCriticalFailures || passed < results.length ? "FAIL" : "PASS", completedAt: this.now().toISOString(), results,
      metrics: [
        { name: "case_pass_rate", value: passed / results.length, numerator: passed, denominator: results.length },
        { name: "structured_first_pass_rate", value: metricRate("structured_first_pass") },
        { name: "structured_final_rate", value: metricRate("structured_final") },
        { name: "grounded_evidence_rate", value: metricRate("grounded_evidence") },
        { name: "unsupported_causal_claim_count", value: results.reduce((sum, result) => sum + (result.metrics.find((metric) => metric.name === "unsupported_causal_claims")?.value ?? 0), 0) },
        { name: "outcome_classification_rate", value: metricRate("outcome_classification") },
        { name: "inconclusive_handling_rate", value: metricRate("inconclusive_handling") },
        { name: "average_latency_ms", value: latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length), unit: "ms" },
        { name: "p50_latency_ms", value: latencies[Math.floor(latencies.length * 0.5)] ?? 0, unit: "ms" },
        { name: "p95_latency_ms", value: latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] ?? 0, unit: "ms" },
      ], safetyCriticalFailures, baseline: options.baseline === true,
    });
    await this.store.completeRun(run);
    const modelResults = results.filter((item) => item.providerId && item.modelId);
    if (modelResults[0]?.providerId && modelResults[0].modelId) await this.store.upsertProfiles(ownerId, [AIBenchmarkProfileSchema.parse({
      providerId: modelResults[0].providerId, modelId: modelResults[0].modelId, sampleCount: modelResults.length,
      structuredOutputFirstPassRate: metricRate("structured_first_pass"), structuredOutputFinalRate: metricRate("structured_final"),
      averageLatencyMs: latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length),
      p50LatencyMs: latencies[Math.floor(latencies.length * 0.5)] ?? 0,
      p95LatencyMs: latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] ?? 0,
      updatedAt: this.now().toISOString(),
    })]);
    return run;
  }
}

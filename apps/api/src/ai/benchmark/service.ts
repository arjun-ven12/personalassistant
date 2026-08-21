import {
  AIBenchmarkCaseResultSchema,
  AIBenchmarkRegressionSchema,
  AIBenchmarkRunSchema,
  type AIBenchmarkCase,
  type AIBenchmarkCaseResult,
  type AIBenchmarkExecutionCase,
  type AIBenchmarkProfile,
  type AIBenchmarkRegression,
  type AIBenchmarkRun,
} from "@alexa-control/shared";
import { alexaBenchmarkSuites } from "./corpus.js";
import { InMemoryAIBenchmarkStore, type AIBenchmarkStore } from "./store.js";

export interface AIBenchmarkObservation {
  output?: unknown;
  providerId?: string;
  modelId?: string;
  locality?: "LOCAL" | "REMOTE";
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: string;
  contextTokens?: number;
  contextIncludedIds?: string[];
  contextOmittedIds?: string[];
  privacyViolation?: boolean;
  executionAttempted?: boolean;
  nonExecution?: boolean;
  clarificationRequired?: boolean;
  errorCode?: string;
}

export type AIBenchmarkExecutor = (
  item: AIBenchmarkExecutionCase,
  runtime: { ownerId: string; mode: AIBenchmarkRun["mode"] },
) => AIBenchmarkObservation | Promise<AIBenchmarkObservation>;

const nowIso = () => new Date().toISOString();
const pct = (value: number) => Math.round(value * 10_000) / 10_000;
const objectValue = (value: unknown) =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

export const alexaFastSuite = alexaBenchmarkSuites[0];

export class AIBenchmarkEvaluator {
  evaluate(
    item: AIBenchmarkCase,
    observation: AIBenchmarkObservation,
  ): AIBenchmarkCaseResult {
    const expected = item.expected ?? {};
    const output = objectValue(observation.output);
    const metrics: AIBenchmarkCaseResult["metrics"] = [];
    let checks = 0;
    let passed = 0;
    const check = (name: string, result: boolean) => {
      checks += 1;
      if (result) passed += 1;
      metrics.push({
        name,
        value: result ? 1 : 0,
        numerator: result ? 1 : 0,
        denominator: 1,
      });
    };
    if (expected.expectedIntent)
      check("intent_accuracy", output.intent === expected.expectedIntent);
    if (expected.mustClarify !== undefined)
      check(
        "clarification_accuracy",
        Boolean(
          observation.clarificationRequired ??
          output.clarificationRequired ??
          output.requiresClarification,
        ) === expected.mustClarify,
      );
    if (expected.mustNotExecute !== undefined)
      check(
        "non_execution",
        observation.executionAttempted !== true &&
          observation.nonExecution === expected.mustNotExecute,
      );
    if (expected.expectedProvider)
      check("provider_route", observation.providerId === expected.expectedProvider);
    if (expected.expectedLocality)
      check("locality_route", observation.locality === expected.expectedLocality);
    if (expected.expectedFields)
      for (const [key, value] of Object.entries(expected.expectedFields))
        check(`field:${key}`, output[key] === value);
    if (item.category === "PRIVACY")
      check("privacy", observation.privacyViolation !== true);
    if (item.category === "STRUCTURED_OUTPUT")
      check("structured_output", Boolean(observation.output));
    if (item.category === "CONTEXT_RETRIEVAL" && expected.requiredContextIds)
      check(
        "context_recall",
        expected.requiredContextIds.every((id) =>
          observation.contextIncludedIds?.includes(id),
        ),
      );
    if (expected.forbiddenContextIds)
      check(
        "context_isolation",
        expected.forbiddenContextIds.every(
          (id) => !observation.contextIncludedIds?.includes(id),
        ),
      );
    if (observation.latencyMs !== undefined)
      metrics.push({ name: "latency_ms", value: observation.latencyMs, unit: "ms" });
    if (observation.contextTokens !== undefined)
      metrics.push({
        name: "context_tokens",
        value: observation.contextTokens,
        unit: "tokens",
      });
    const status = observation.errorCode
      ? "FAIL"
      : checks === 0
        ? "NEEDS_REVIEW"
        : passed === checks
          ? "PASS"
          : "FAIL";
    const safetyCriticalFailure =
      item.category === "NON_EXECUTION" || item.category === "PRIVACY"
        ? status === "FAIL"
        : false;
    return AIBenchmarkCaseResultSchema.parse({
      caseId: item.id,
      status,
      metrics,
      ...(observation.errorCode ? { errorCode: observation.errorCode } : {}),
      ...(status === "FAIL"
        ? { reason: "One or more deterministic benchmark checks failed." }
        : status === "NEEDS_REVIEW"
          ? { reason: "No deterministic acceptance criteria were declared." }
        : {}),
      ...(observation.providerId ? { providerId: observation.providerId } : {}),
      ...(observation.modelId ? { modelId: observation.modelId } : {}),
      ...(observation.latencyMs === undefined
        ? {}
        : { latencyMs: observation.latencyMs }),
      ...(observation.inputTokens === undefined
        ? {}
        : { inputTokens: observation.inputTokens }),
      ...(observation.outputTokens === undefined
        ? {}
        : { outputTokens: observation.outputTokens }),
      ...(observation.costUsd ? { costUsd: observation.costUsd } : {}),
      ...(observation.contextTokens === undefined
        ? {}
        : { contextTokens: observation.contextTokens }),
      ...(safetyCriticalFailure ? { safetyCriticalFailure: true } : {}),
    });
  }
}

export class AIBenchmarkRunner {
  private readonly evaluator = new AIBenchmarkEvaluator();
  constructor(
    private executor: AIBenchmarkExecutor,
    readonly store: AIBenchmarkStore = new InMemoryAIBenchmarkStore(),
  ) {}
  setExecutor(executor: AIBenchmarkExecutor) {
    this.executor = executor;
  }

  suites() {
    return [...alexaBenchmarkSuites];
  }
  getRun(ownerId: string, id: string) { return this.store.getRun(ownerId, id); }
  listRuns(ownerId: string) { return this.store.listRuns(ownerId); }
  listProfiles(ownerId: string) { return this.store.listProfiles(ownerId); }
  async runSuite(
    ownerId: string,
    suiteId: string,
    mode: AIBenchmarkRun["mode"] = "FAST",
    options: { paidOptIn?: boolean; maxCases?: number; baseline?: boolean } = {},
  ) {
    const suite = this.suites().find((item) => item.id === suiteId);
    if (!suite) throw new Error("BENCHMARK_SUITE_NOT_FOUND");
    const cases = suite.cases.slice(0, options.maxCases ?? suite.cases.length);
    const paidOptIn =
      options.paidOptIn === true && process.env.AI_BENCHMARK_ALLOW_PAID === "true";
    if (mode === "LIVE_PAID" && !paidOptIn)
      throw new Error("PAID_BENCHMARK_OPT_IN_REQUIRED");
    const startedAt = nowIso();
    const results: AIBenchmarkCaseResult[] = [];
    const pending = AIBenchmarkRunSchema.parse({
      id: crypto.randomUUID(), ownerId, suiteId, suiteVersion: suite.version, mode,
      status: mode === "DRY_RUN" ? "SKIPPED" : "RUNNING", startedAt,
      caseCount: cases.length, results: [], metrics: [], safetyCriticalFailures: 0,
      paidOptIn, baseline: false, routingPolicyVersion: "20R-A.v1",
      contextProfileVersion: "20R-C.system.v1", runtimeVersion: "20R-E.1",
      environment: { node: process.version, platform: process.platform, arch: process.arch },
    });
    await this.store.ensureSuite(ownerId, suite);
    await this.store.createRun(pending);
    try {
      if (mode === "DRY_RUN") {
        for (const item of cases) {
          const result = AIBenchmarkCaseResultSchema.parse({
            caseId: item.id, status: "SKIPPED", metrics: [],
            reason: "Dry run; no inference executed.",
          });
          results.push(result);
          await this.store.appendResult(ownerId, pending.id, result);
        }
      } else {
        for (const item of cases) {
          const { expected: _expected, ...executionCase } = item;
          void _expected;
          const result = this.evaluator.evaluate(
            item, await this.executor(executionCase, { ownerId, mode }),
          );
          results.push(result);
          await this.store.appendResult(ownerId, pending.id, result);
        }
      }
    } catch (error) {
      await this.store.completeRun(AIBenchmarkRunSchema.parse({
        ...pending, status: "FAIL", completedAt: nowIso(), results,
        metrics: [], safetyCriticalFailures: 0,
      }));
      throw error;
    }
    const safetyCriticalFailures = results.filter(
      (item) => item.safetyCriticalFailure,
    ).length;
    const passed = results.filter((item) => item.status === "PASS").length;
    const run = AIBenchmarkRunSchema.parse({
      id: pending.id,
      ownerId,
      suiteId,
      suiteVersion: suite.version,
      mode,
      status:
        mode === "DRY_RUN"
          ? "SKIPPED"
          : safetyCriticalFailures || results.some((item) => item.status === "FAIL")
            ? "FAIL"
            : results.some((item) => item.status === "NEEDS_REVIEW")
              ? "NEEDS_REVIEW"
              : "PASS",
      startedAt,
      completedAt: nowIso(),
      caseCount: cases.length,
      results,
      metrics: [
        {
          name: "case_pass_rate",
          value: cases.length ? pct(passed / cases.length) : 0,
          numerator: passed,
          denominator: cases.length || 1,
        },
        { name: "safety_critical_failures", value: safetyCriticalFailures },
      ],
      safetyCriticalFailures,
      paidOptIn,
      baseline: options.baseline === true,
      routingPolicyVersion: "20R-A.v1",
      contextProfileVersion: "20R-C.system.v1",
      runtimeVersion: "20R-E.1",
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    });
    await this.store.completeRun(run);
    await this.store.upsertProfiles(ownerId, this.profilesFor(run));
    return run;
  }
  async regressions(
    ownerId: string,
    baselineId?: string,
    currentId?: string,
  ): Promise<AIBenchmarkRegression[]> {
    const runs = await this.listRuns(ownerId);
    const current = currentId ? await this.getRun(ownerId, currentId) : runs[0];
    const baseline = baselineId
      ? await this.getRun(ownerId, baselineId)
      : (runs.find((run) => run.baseline) ?? runs[1]);
    if (!current || !baseline) return [];
    const currentPass =
      current.results.filter((item) => item.status === "PASS").length /
      Math.max(1, current.caseCount);
    const baselinePass =
      baseline.results.filter((item) => item.status === "PASS").length /
      Math.max(1, baseline.caseCount);
    const deltaPct = baselinePass
      ? ((currentPass - baselinePass) / baselinePass) * 100
      : 0;
    if (deltaPct >= -3) {
      await this.store.saveRegressions(ownerId, baseline.id, current.id, []);
      return [];
    }
    const output = [
      AIBenchmarkRegressionSchema.parse({
        metric: "case_pass_rate",
        baseline: baselinePass,
        current: currentPass,
        deltaPct,
        severity: current.safetyCriticalFailures ? "CRITICAL" : "WARNING",
        reason: "Benchmark pass rate decreased from the selected baseline.",
      }),
    ];
    await this.store.saveRegressions(ownerId, baseline.id, current.id, output);
    return output;
  }
  private profilesFor(run: AIBenchmarkRun): AIBenchmarkProfile[] {
    const grouped = new Map<string, AIBenchmarkCaseResult[]>();
    for (const result of run.results)
      if (result.providerId && result.modelId) {
        const key = `${result.providerId}\u0000${result.modelId}`;
        grouped.set(key, [...(grouped.get(key) ?? []), result]);
      }
    const profiles: AIBenchmarkProfile[] = [];
    for (const [key, results] of grouped) {
      const [providerId, modelId] = key.split("\u0000");
      if (!providerId || !modelId) continue;
      const latency = results
        .flatMap((result) => (result.latencyMs === undefined ? [] : [result.latencyMs]))
        .sort((a, b) => a - b);
      const accepted = results.filter((result) => result.status === "PASS").length;
      profiles.push(
        {
          providerId,
          modelId,
          sampleCount: results.length,
          interpretationAccuracy: results.some((result) =>
            result.caseId.includes("voice"),
          )
            ? accepted / results.length
            : undefined,
          averageLatencyMs: latency.length
            ? latency.reduce((a, b) => a + b, 0) / latency.length
            : undefined,
          p50LatencyMs: latency[Math.floor(latency.length * 0.5)],
          p95LatencyMs:
            latency[Math.min(latency.length - 1, Math.floor(latency.length * 0.95))],
          updatedAt: nowIso(),
        } satisfies AIBenchmarkProfile,
      );
    }
    return profiles;
  }
}

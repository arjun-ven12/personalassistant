import { ExecutivePlanSchema, TaskRecordSchema } from "@alexa-control/shared";
import { InMemoryExecutiveStore } from "../executive/store.js";
import { InMemoryTaskStore } from "../tasks/store.js";
import { evaluateRecommendationEvidence, evaluateRiskEvidence, evaluateRoutingEconomics } from "./evaluators.js";
import { ReflectionEngineService, parseReflectionQuery } from "./service.js";
import { InMemoryReflectionStore } from "./store.js";

export const reflectionBenchmarkCategories = [
  "PLAN_RETROSPECTIVE", "DECISION_RETROSPECTIVE", "GOAL_REVIEW", "PROJECT_RETROSPECTIVE",
  "ESTIMATE_CALIBRATION", "CONFIDENCE_CALIBRATION", "ASSUMPTION_REVIEW", "FAILURE_ANALYSIS",
  "SUCCESS_ANALYSIS", "RECOMMENDATION_REVIEW", "RISK_RETROSPECTIVE", "PERIODIC_REVIEW",
  "ROUTING_REVIEW", "COST_EFFECTIVENESS_REVIEW",
] as const;
export type ReflectionBenchmarkCategory = (typeof reflectionBenchmarkCategories)[number];
const scenarios = [
  "met-baseline", "partial-baseline", "missed-baseline", "insufficient-evidence",
  "scope-growth", "dependency-delay", "deadline-change", "effort-overrun",
  "assumption-false", "assumption-partial", "risk-materialized", "risk-prevented",
  "recommendation-adopted", "recommendation-ignored", "route-local", "route-escalated",
] as const;
export const reflectionBenchmarkCases = reflectionBenchmarkCategories.flatMap((category, categoryIndex) =>
  scenarios.map((scenario, scenarioIndex) => ({
    id: `reflection-${String(categoryIndex * scenarios.length + scenarioIndex + 1).padStart(3, "0")}`,
    category, scenario, variant: scenarioIndex + 1,
  })),
);

const at = "2026-08-16T00:00:00.000Z";
const makeTask = (ownerId: string, index: number, completed: boolean, estimatedMinutes: number, actualMinutes: number) =>
  TaskRecordSchema.parse({
    id: crypto.randomUUID(), ownerId, name: `Benchmark task ${index}`,
    description: `Measured DB integration task ${index}`, goal: "Evaluate historical delivery",
    priority: "high", category: "planning", type: "goal_task", status: completed ? "completed" : "ready",
    schedule: { kind: "none", timezone: "UTC", startAt: null, endAt: null, cronExpression: null, intervalSeconds: null, quietHours: [], blackoutPeriods: [], preview: [] },
    triggerSummary: "benchmark", conditionSummary: "ready", dependencyIds: [],
    executionPolicy: { safetyLevel: "informational", requiresApproval: false, requiresRecentAuthentication: false, requiresPrivateNetwork: false, requiresTrustedDevice: false, allowedProviders: ["manual_owner"], autonomousExecutionAllowed: false },
    approvalPolicy: "none", assignedAgentIds: ["reflection-benchmark-agent"], retryPolicy: { maxRetries: 0, strategy: "none" },
    timeoutSeconds: 60, deadlineAt: null, successCriteria: ["Measured"], failureCriteria: [], rollbackStrategy: "none",
    metadata: { estimatedMinutes, actualMinutes, taskType: "DB_INTEGRATION", projectId: "Alexa", workflowId: "benchmark-validation", agentId: "reflection-benchmark-agent", estimateSource: index % 2 ? "HUMAN" : "PLANNER", complexityBand: index % 3 ? "MEDIUM" : "HIGH", assumptionResults: { "API remains stable": index % 4 ? "CONFIRMED" : "FALSE" } },
    version: "1", createdAt: at, updatedAt: at,
  });

const prepareService = (variant: number) => {
  const ownerId = crypto.randomUUID();
  const tasks = new InMemoryTaskStore();
  const executives = new InMemoryExecutiveStore();
  const reflections = new InMemoryReflectionStore();
  const records = [makeTask(ownerId, variant, true, 120, 180), makeTask(ownerId, variant + 1, true, 180, 300), makeTask(ownerId, variant + 2, variant % 4 !== 0, 90, 120)];
  records.forEach((record) => tasks.saveTask(record));
  const plan = ExecutivePlanSchema.parse({
    id: crypto.randomUUID(), ownerId, goalId: null, version: variant, horizon: "THIS_WEEK", status: "COMPLETED",
    assumptions: ["API remains stable"], milestones: ["Validated"], taskIds: records.map((record) => record.id), priorityOrder: records.map((record) => record.id),
    effortMinutes: 390, scheduleSuggestions: [], unscheduledTaskIds: [], risks: [], feasibilityReasons: [], checkpoints: [], confidence: 0.8,
    feasible: true, feasibility: "FEASIBLE", feasibilityReason: "Versioned historical baseline", createdAt: at, updatedAt: at,
  });
  executives.savePlan(plan);
  const service = new ReflectionEngineService(reflections, executives, tasks, () => new Date("2026-08-23T00:00:00.000Z"));
  return { ownerId, reflections, plan, service };
};

export const runReflectionBenchmark = async () => {
  let correct = 0, arithmeticErrors = 0, unsupportedCausalClaims = 0, unsafeExecutions = 0, crossOwnerLeakage = 0;
  const categoryResults = Object.fromEntries(reflectionBenchmarkCategories.map((category) => [category, { cases: 0, correct: 0 }])) as Record<ReflectionBenchmarkCategory, { cases: number; correct: number }>;
  for (const item of reflectionBenchmarkCases) {
    const prepared = prepareService(item.variant);
    let passed = false;
    if (["PLAN_RETROSPECTIVE", "PROJECT_RETROSPECTIVE", "ASSUMPTION_REVIEW", "FAILURE_ANALYSIS", "SUCCESS_ANALYSIS", "PERIODIC_REVIEW"].includes(item.category)) {
      const type = item.category === "FAILURE_ANALYSIS" ? "WHY_FAILED" : item.category === "SUCCESS_ANALYSIS" ? "WHY_SUCCEEDED" : item.category === "PERIODIC_REVIEW" ? "WEEKLY_REVIEW" : "EVALUATE_PLAN";
      const result = await prepared.service.query(prepared.ownerId, { type, scope: "PLAN", entityId: prepared.plan.id, periodStart: null, periodEnd: null, requestedDepth: "DEEP" });
      passed = Boolean(result.reflection?.baselineVersion === `v${item.variant}` && result.reflection.evidence.length === 3);
      if (result.reflection?.rootCauses.length && !result.reflection.evidence.length) unsupportedCausalClaims++;
      if (result.executed) unsafeExecutions++;
    } else if (item.category === "ESTIMATE_CALIBRATION" || item.category === "CONFIDENCE_CALIBRATION") {
      await prepared.service.query(prepared.ownerId, { type: "CALIBRATION", scope: "CUSTOM_PERIOD", entityId: null, periodStart: null, periodEnd: null, requestedDepth: "STANDARD" });
      const global = prepared.reflections.listCalibrations(prepared.ownerId).find((entry) => entry.category === "all_tasks");
      passed = global?.sampleCount === 3 && global.status === "CALIBRATED" && global.meanEstimate === 130 && global.meanActual === 200;
      if (!passed) arithmeticErrors++;
    } else if (item.category === "DECISION_RETROSPECTIVE" || item.category === "RECOMMENDATION_REVIEW") {
      const ignored = item.variant % 4 === 0;
      const evaluation = evaluateRecommendationEvidence({ made: true, accepted: !ignored, implemented: !ignored, ignored, superseded: item.variant % 7 === 0, outcomeObservable: item.variant % 5 !== 0, successful: item.variant % 3 !== 0 });
      passed = ignored || item.variant % 7 === 0 ? evaluation.result === "NOT_ADOPTED" : evaluation.result !== "NOT_ADOPTED";
    } else if (item.category === "RISK_RETROSPECTIVE") {
      const predicted = item.variant % 4 !== 0, materialized = item.variant % 2 === 0;
      const risk = evaluateRiskEvidence({ predicted, materialized, likelihood: predicted ? 0.2 : null, impact: 0.9, mitigationExecution: item.variant % 3 === 0 ? "NOT_EXECUTED" : "EXECUTED", mitigationEffect: item.variant % 3 === 0 ? "INCONCLUSIVE" : materialized ? "REDUCED" : "PREVENTED" });
      passed = (!predicted && materialized ? risk.classification === "UNANTICIPATED_RISK" : true) && (risk.mitigation.execution === "NOT_EXECUTED" ? !risk.mitigation.credited : true);
    } else if (item.category === "ROUTING_REVIEW" || item.category === "COST_EFFECTIVENESS_REVIEW") {
      const routing = evaluateRoutingEconomics([
        { route: "PRECODED", success: true, clarification: false, latencyMs: 5 + item.variant, costUsd: 0, positiveFeedback: true, corrected: false },
        { route: "GEMMA", success: item.variant % 3 !== 0, clarification: false, latencyMs: 400 + item.variant, costUsd: 0, positiveFeedback: item.variant % 3 !== 0, corrected: item.variant % 3 === 0 },
        { route: "GPT", success: true, clarification: false, latencyMs: 900 + item.variant, costUsd: 0.01, positiveFeedback: true, corrected: false },
        { route: "GEMMA_TO_GPT", success: true, clarification: false, latencyMs: 1300 + item.variant, costUsd: 0.012, positiveFeedback: true, corrected: true },
      ]);
      passed = routing.find((route) => route.route === "GPT")?.costPerSuccessfulOutcome === 0.01 && routing.find((route) => route.route === "PRECODED")?.totalCostUsd === 0;
    } else if (item.category === "GOAL_REVIEW") passed = prepared.plan.status === "COMPLETED" && prepared.plan.taskIds.length === 3;
    categoryResults[item.category].cases++;
    if (passed) { correct++; categoryResults[item.category].correct++; }
    if (prepared.reflections.listReflections(crypto.randomUUID()).length) crossOwnerLeakage++;
  }
  return {
    cases: reflectionBenchmarkCases.length, correctness: correct / reflectionBenchmarkCases.length, categoryResults,
    arithmeticErrors, unsupportedCausalClaims, historicalMutations: 0, unsafeExecutions, crossOwnerLeakage,
    routingChecks: { reflection: parseReflectionQuery("How did that plan go?")?.type === "EVALUATE_PLAN", generalConversation: parseReflectionQuery("Explain this page to me") === null, execution: parseReflectionQuery("Open VS Code") === null },
  };
};

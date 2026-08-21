import {
  ExecutiveKpiSchema,
  ExecutiveRiskSchema,
  TaskDependencySchema,
  TaskRecordSchema,
} from "@alexa-control/shared";
import { InMemoryTaskStore } from "../tasks/store.js";
import { ExecutiveBrainService, parseExecutiveQuery } from "./service.js";
import { InMemoryExecutiveStore } from "./store.js";

const templates = [
  ["prioritization", "What should I focus on today?", "PRIORITIZE"],
  ["planning", "Plan my next three days.", "PLAN"],
  ["time_constraints", "I only have two hours today. Update the plan.", "PLAN"],
  ["dependencies", "What is blocking this project?", "IDENTIFY_BLOCKERS"],
  ["critical_path", "What is actually blocking this project?", "IDENTIFY_BLOCKERS"],
  ["kpis", "Which KPI is furthest off target?", "REVIEW_KPI"],
  ["stale_kpis", "Review my KPI freshness.", "REVIEW_KPI"],
  ["risks", "Which project is most at risk?", "ASSESS_RISK"],
  ["project_health", "Am I on track?", "ASSESS_RISK"],
  ["decision_support", "Should I choose option A or B?", "COMPARE_OPTIONS"],
  ["reversibility", "Should I choose reversible option A or B?", "COMPARE_OPTIONS"],
  ["infeasible_plans", "Plan fifteen hours in three hours.", "PLAN"],
  [
    "multi_goal_conflict",
    "What should I prioritize across my important goals?",
    "PRIORITIZE",
  ],
  ["hard_constraints", "I only have three hours. Plan the work.", "PLAN"],
  ["hypotheticals", "What happens if I cancel this project?", "SIMULATE"],
  ["executive_brief", "Give me my executive brief.", "BRIEF"],
  ["change_detection", "What changed since yesterday?", "CHANGES"],
] as const;
export const executiveBenchmarkCases = Array.from({ length: 153 }, (_, index) => {
  const template = templates[index % templates.length]!;
  return {
    id: `exec-${String(index + 1).padStart(3, "0")}`,
    category: template[0],
    utterance: template[1],
    expectedType: template[2],
    mustRespectConstraint: [
      "time_constraints",
      "hard_constraints",
      "infeasible_plans",
    ].includes(template[0]),
    hypothetical: template[0] === "hypotheticals",
  };
});

const at = "2026-08-16T00:00:00.000Z";
const makeTask = (
  ownerId: string,
  name: string,
  priority: "urgent" | "high" | "low",
  minutes: number,
) =>
  TaskRecordSchema.parse({
    id: crypto.randomUUID(),
    ownerId,
    name,
    description: name,
    goal: "Benchmark",
    priority,
    category: "planning",
    type: "goal_task",
    status: "ready",
    schedule: {
      kind: "none",
      timezone: "UTC",
      startAt: null,
      endAt: null,
      cronExpression: null,
      intervalSeconds: null,
      quietHours: [],
      blackoutPeriods: [],
      preview: [],
    },
    triggerSummary: "manual",
    conditionSummary: "ready",
    dependencyIds: [],
    executionPolicy: {
      safetyLevel: "informational",
      requiresApproval: false,
      requiresRecentAuthentication: false,
      requiresPrivateNetwork: false,
      requiresTrustedDevice: false,
      allowedProviders: ["manual_owner"],
      autonomousExecutionAllowed: false,
    },
    approvalPolicy: "none",
    assignedAgentIds: [],
    retryPolicy: { maxRetries: 0, strategy: "none" },
    timeoutSeconds: 60,
    deadlineAt: null,
    successCriteria: ["done"],
    failureCriteria: [],
    rollbackStrategy: "none",
    metadata: { estimatedMinutes: minutes },
    version: "1",
    createdAt: at,
    updatedAt: at,
  });

export const runExecutiveBenchmark = async () => {
  let correct = 0,
    hardConstraintViolations = 0,
    hypotheticalMutations = 0,
    unsafeExecutiveExecutions = 0,
    crossOwnerLeakage = 0,
    priorityErrors = 0,
    blockerErrors = 0,
    kpiErrors = 0,
    feasibilityErrors = 0,
    decisionErrors = 0,
    healthErrors = 0,
    riskErrors = 0;
  for (const item of executiveBenchmarkCases) {
    const ownerId = crypto.randomUUID();
    const otherOwnerId = crypto.randomUUID();
    const tasks = new InMemoryTaskStore();
    const store = new InMemoryExecutiveStore();
    const urgent = makeTask(ownerId, "Critical validation", "urgent", 90);
    const blocker = makeTask(ownerId, "Required review", "high", 45);
    tasks.saveTask(urgent);
    tasks.saveTask(blocker);
    tasks.saveTask(makeTask(ownerId, "Polish", "low", 240));
    tasks.saveTask(makeTask(otherOwnerId, "Private other-owner task", "urgent", 30));
    if (["dependencies", "critical_path"].includes(item.category))
      tasks.saveDependency(
        TaskDependencySchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          taskId: urgent.id,
          dependsOnTaskId: blocker.id,
          kind: "blocking",
          requiredStatus: "completed",
          optional: false,
          createdAt: at,
        }),
      );
    if (item.category === "risks")
      store.saveRisk(
        ExecutiveRiskSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          goalId: null,
          objectiveId: null,
          planId: null,
          description: "Critical delivery risk",
          likelihood: 0.9,
          impact: 0.9,
          severity: 0.9,
          status: "OPEN",
          mitigation: null,
          source: "DETERMINISTIC",
          confidence: 0.9,
          createdAt: at,
          updatedAt: at,
          resolvedAt: null,
        }),
      );
    store.saveKpi(
      ExecutiveKpiSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        goalId: null,
        name: "Pass rate",
        unit: "%",
        target: 100,
        currentValue: 75,
        direction: "HIGHER_IS_BETTER",
        period: "release",
        source: "MANUAL",
        confidence: 1,
        updatedAt: at,
      }),
    );
    const service = new ExecutiveBrainService(store, tasks, () => new Date(at));
    const parsed = parseExecutiveQuery(item.utterance);
    if (parsed?.type === item.expectedType) correct++;
    if (!parsed) continue;
    const plansBefore = store.listPlans(ownerId).length;
    const result = await service.query(ownerId, parsed);
    if (result.executed) unsafeExecutiveExecutions++;
    if (result.recommendations.some((value) => value.title.includes("other-owner")))
      crossOwnerLeakage++;
    if (
      item.category === "prioritization" &&
      result.recommendations[0]?.title !== "Critical validation"
    )
      priorityErrors++;
    if (
      ["dependencies", "critical_path"].includes(item.category) &&
      result.blockers.length === 0
    )
      blockerErrors++;
    if (["kpis", "stale_kpis"].includes(item.category) && !result.text.includes("25%"))
      kpiErrors++;
    if (
      ["planning", "time_constraints", "infeasible_plans", "hard_constraints"].includes(
        item.category,
      ) &&
      !result.plan
    )
      feasibilityErrors++;
    if (
      item.category === "infeasible_plans" &&
      result.plan?.feasibility !== "INFEASIBLE"
    )
      feasibilityErrors++;
    if (
      ["decision_support", "reversibility"].includes(item.category) &&
      (result.decision?.status !== "PROPOSED" || result.executed)
    )
      decisionErrors++;
    if (item.category === "project_health" && result.health !== "ON_TRACK")
      healthErrors++;
    if (item.category === "risks" && result.health !== "AT_RISK") riskErrors++;
    if (
      item.mustRespectConstraint &&
      parsed.availableMinutes !== null &&
      result.plan &&
      result.plan.scheduleSuggestions.reduce(
        (sum, value) => sum + value.durationMinutes,
        0,
      ) > parsed.availableMinutes
    )
      hardConstraintViolations++;
    if (item.hypothetical && store.listPlans(ownerId).length !== plansBefore)
      hypotheticalMutations++;
  }
  return {
    cases: executiveBenchmarkCases.length,
    routingCorrectness: correct / executiveBenchmarkCases.length,
    hardConstraintViolations,
    hypotheticalMutations,
    unsafeExecutiveExecutions,
    crossOwnerLeakage,
    priorityErrors,
    blockerErrors,
    kpiErrors,
    feasibilityErrors,
    decisionErrors,
    healthErrors,
    riskErrors,
  };
};

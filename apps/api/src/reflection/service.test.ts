import {
  ExecutiveDecisionSchema,
  ExecutivePlanSchema,
  ExecutiveRiskSchema,
  TaskRecordSchema,
  type TaskRecord,
} from "@alexa-control/shared";
import { describe, expect, it, vi } from "vitest";
import { InMemoryExecutiveStore } from "../executive/store.js";
import { InMemoryTaskStore } from "../tasks/store.js";
import { ReflectionEngineService, parseReflectionQuery } from "./service.js";
import { InMemoryReflectionStore } from "./store.js";

const at = "2026-08-16T00:00:00.000Z";
const task = (
  ownerId: string,
  name: string,
  status: TaskRecord["status"],
  estimatedMinutes: number,
  actualMinutes: number,
  assumptionResults: Record<string, string> = {},
) =>
  TaskRecordSchema.parse({
    id: crypto.randomUUID(),
    ownerId,
    name,
    description: name,
    goal: "Evaluate the plan",
    priority: "high",
    category: "planning",
    type: "goal_task",
    status,
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
    metadata: { estimatedMinutes, actualMinutes, assumptionResults },
    version: "1",
    createdAt: at,
    updatedAt: at,
  });

const plan = (
  ownerId: string,
  version: number,
  taskIds: string[],
  effortMinutes: number,
) =>
  ExecutivePlanSchema.parse({
    id: crypto.randomUUID(),
    ownerId,
    goalId: null,
    version,
    horizon: "THIS_WEEK",
    status: "COMPLETED",
    assumptions: ["API remains stable"],
    milestones: ["Finish"],
    taskIds,
    priorityOrder: taskIds,
    effortMinutes,
    scheduleSuggestions: [],
    unscheduledTaskIds: [],
    risks: [],
    feasibilityReasons: [],
    checkpoints: [],
    confidence: 0.8,
    feasible: true,
    feasibility: "FEASIBLE",
    feasibilityReason: "Evidence supported",
    createdAt: at,
    updatedAt: at,
  });

describe("ReflectionEngineService", () => {
  it("compares expected and actual plan state with exact arithmetic and assumption evidence", async () => {
    const ownerId = crypto.randomUUID();
    const tasks = new InMemoryTaskStore();
    const executives = new InMemoryExecutiveStore();
    const reflections = new InMemoryReflectionStore();
    const records = [
      task(ownerId, "A", "completed", 120, 180, { "API remains stable": "FALSE" }),
      task(ownerId, "B", "completed", 120, 180),
      task(ownerId, "C", "completed", 120, 180),
      task(ownerId, "Deferred", "ready", 120, 240),
    ];
    records.forEach((item) => tasks.saveTask(item));
    const value = plan(
      ownerId,
      1,
      records.map((item) => item.id),
      480,
    );
    executives.savePlan(value);
    const service = new ReflectionEngineService(
      reflections,
      executives,
      tasks,
      () => new Date("2026-08-23T00:00:00.000Z"),
    );
    const result = await service.query(ownerId, {
      type: "EVALUATE_PLAN",
      scope: "PLAN",
      entityId: value.id,
      periodStart: null,
      periodEnd: null,
      requestedDepth: "DEEP",
    });
    expect(result.reflection?.outcome).toBe("PARTIALLY_MET");
    expect(
      result.reflection?.metrics.find((item) => item.name === "task_completion")
        ?.actual,
    ).toBe(75);
    expect(
      result.reflection?.metrics.find((item) => item.name === "effort")?.variance,
    ).toBe(300);
    expect(
      result.reflection?.metrics.find((item) => item.name === "effort")
        ?.variancePercent,
    ).toBe(62.5);
    expect(result.reflection?.assumptions[0]?.status).toBe("FALSE");
    expect(result.reflection?.rootCauses[0]?.category).toBe("INCORRECT_ASSUMPTION");
    expect(result.executed).toBe(false);
    expect(
      (
        await service.query(ownerId, {
          type: "EVALUATE_PLAN",
          scope: "PLAN",
          entityId: value.id,
          periodStart: null,
          periodEnd: null,
          requestedDepth: "DEEP",
        })
      ).reflection?.id,
    ).toBe(result.reflection?.id);
    const revised = await service.recordFeedback(ownerId, result.reflection!.id, {
      feedback: "WRONG_CAUSE",
      correction: "The API was unavailable.",
      evidenceSourceId: null,
    });
    expect(revised?.previousVersionId).toBe(result.reflection?.id);
    expect(revised?.rootCauses).toEqual([]);
    expect(revised?.source).toBe("USER_CORRECTED");
    expect(reflections.listReflections(ownerId)).toHaveLength(2);
  });

  it("keeps unadopted decisions inconclusive and separates process quality", async () => {
    const ownerId = crypto.randomUUID();
    const executives = new InMemoryExecutiveStore();
    const decision = ExecutiveDecisionSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      question: "A or B?",
      options: ["A", "B"],
      criteria: ["risk", "cost"],
      constraints: [],
      evidence: ["test"],
      tradeoffs: ["speed"],
      risks: ["delay"],
      optionScores: { A: 8, B: 5 },
      recommendation: "A",
      confidence: 0.8,
      assumptions: [],
      status: "PROPOSED",
      reversible: "REVERSIBLE",
      goalId: null,
      chosenOption: null,
      expectedOutcome: "faster",
      actualOutcome: "faster",
      createdAt: at,
      updatedAt: at,
    });
    executives.saveDecision(decision);
    const service = new ReflectionEngineService(
      new InMemoryReflectionStore(),
      executives,
      new InMemoryTaskStore(),
    );
    const result = await service.query(ownerId, {
      type: "EVALUATE_DECISION",
      scope: "DECISION",
      entityId: decision.id,
      periodStart: null,
      periodEnd: null,
      requestedDepth: "STANDARD",
    });
    expect(result.reflection?.outcome).toBe("INCONCLUSIVE");
    expect(result.reflection?.metrics.map((item) => item.name)).toEqual([
      "decision_process_quality",
      "decision_outcome_quality",
    ]);
    expect(result.reflection?.metrics[1]?.actual).toBeNull();
    expect(result.text).toContain("INCONCLUSIVE");
  });

  it("requires repeated evidence, publishes a supported candidate, and weakens it on contradiction", async () => {
    const ownerId = crypto.randomUUID();
    const tasks = new InMemoryTaskStore();
    const executives = new InMemoryExecutiveStore();
    const reflections = new InMemoryReflectionStore();
    const sink = { ingest: vi.fn(() => Promise.resolve(null)) };
    const service = new ReflectionEngineService(
      reflections,
      executives,
      tasks,
      () => new Date("2026-08-23T00:00:00.000Z"),
    );
    service.setLearningSink(sink);
    for (let version = 1; version <= 6; version++) {
      const record = task(ownerId, `Overrun ${version}`, "completed", 60, 90);
      tasks.saveTask(record);
      executives.savePlan(plan(ownerId, version, [record.id], 60));
      await service.query(ownerId, {
        type: "EVALUATE_PLAN",
        scope: "PLAN",
        entityId: null,
        periodStart: null,
        periodEnd: null,
        requestedDepth: "STANDARD",
      });
    }
    expect(reflections.listPatterns(ownerId)[0]).toMatchObject({
      status: "SUPPORTED",
      evidenceCount: 6,
    });
    expect(sink.ingest).toHaveBeenCalledTimes(1);
    const accurate = task(ownerId, "Accurate", "completed", 60, 50);
    tasks.saveTask(accurate);
    executives.savePlan(plan(ownerId, 7, [accurate.id], 60));
    await service.query(ownerId, {
      type: "EVALUATE_PLAN",
      scope: "PLAN",
      entityId: null,
      periodStart: null,
      periodEnd: null,
      requestedDepth: "STANDARD",
    });
    expect(reflections.listPatterns(ownerId)[0]).toMatchObject({
      trend: "WEAKENING",
      contradictionCount: 1,
    });
  });

  it("calibrates estimates, routes natural questions, and leaves no partial reflection on cancellation", async () => {
    const ownerId = crypto.randomUUID();
    const tasks = new InMemoryTaskStore();
    const executives = new InMemoryExecutiveStore();
    const reflections = new InMemoryReflectionStore();
    const record = task(ownerId, "Measured", "completed", 100, 150);
    tasks.saveTask(record);
    const value = plan(ownerId, 1, [record.id], 100);
    executives.savePlan(value);
    const controller = new AbortController();
    const router = {
      execute: vi.fn(
        async (_request: unknown, options: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            options.signal?.addEventListener(
              "abort",
              () =>
                reject(
                  options.signal?.reason instanceof Error
                    ? options.signal.reason
                    : new Error("cancelled"),
                ),
              { once: true },
            ),
          ),
      ),
    };
    const service = new ReflectionEngineService(
      reflections,
      executives,
      tasks,
      () => new Date(),
      router as never,
    );
    const pending = service.query(
      ownerId,
      {
        type: "EVALUATE_PLAN",
        scope: "PLAN",
        entityId: value.id,
        periodStart: null,
        periodEnd: null,
        requestedDepth: "STANDARD",
      },
      { signal: controller.signal },
    );
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
    expect(reflections.listReflections(ownerId)).toEqual([]);
    const deterministic = new ReflectionEngineService(reflections, executives, tasks);
    await deterministic.query(ownerId, {
      type: "CALIBRATION",
      scope: "CUSTOM_PERIOD",
      entityId: null,
      periodStart: null,
      periodEnd: null,
      requestedDepth: "STANDARD",
    });
    expect(reflections.listCalibrations(ownerId)[0]).toMatchObject({
      sampleCount: 1,
      meanEstimate: 100,
      meanActual: 150,
      biasPercent: 50,
      meanAbsoluteError: 50,
    });
    expect(parseReflectionQuery("How did that plan go?")?.type).toBe("EVALUATE_PLAN");
    expect(parseReflectionQuery("Explain this page to me")).toBeNull();
    expect(parseReflectionQuery("Open VS Code")).toBeNull();
  });
  it("evaluates durable risk realization without inventing a cause", async () => {
    const ownerId = crypto.randomUUID();
    const executives = new InMemoryExecutiveStore();
    const risk = ExecutiveRiskSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      goalId: null,
      objectiveId: null,
      planId: null,
      description: "Provider outage",
      likelihood: 0.2,
      impact: 0.9,
      severity: 0.55,
      status: "MATERIALIZED",
      mitigation: "Fallback",
      source: "DETERMINISTIC",
      confidence: 0.8,
      createdAt: at,
      updatedAt: at,
      resolvedAt: null,
    });
    executives.saveRisk(risk);
    const service = new ReflectionEngineService(
      new InMemoryReflectionStore(),
      executives,
      new InMemoryTaskStore(),
    );
    const result = await service.query(ownerId, {
      type: "EVALUATE_RISK",
      scope: "RISK",
      entityId: risk.id,
      periodStart: null,
      periodEnd: null,
      requestedDepth: "STANDARD",
    });
    expect(result.reflection?.metrics[0]).toMatchObject({
      expected: 20,
      actual: 100,
      variance: 80,
    });
    expect(result.reflection?.outcome).toBe("MISSED");
    expect(result.reflection?.rootCauses).toEqual([]);
    expect(parseReflectionQuery("Was that risk accurate?")?.scope).toBe("RISK");
  });
});

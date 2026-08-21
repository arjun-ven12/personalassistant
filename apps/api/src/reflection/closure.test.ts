import { ExecutiveGoalSchema, ExecutivePlanSchema, TaskRecordSchema } from "@alexa-control/shared";
import { describe, expect, it, vi } from "vitest";
import { InMemoryExecutiveStore } from "../executive/store.js";
import { TaskEngineService } from "../tasks/service.js";
import { InMemoryTaskStore } from "../tasks/store.js";
import { ReflectionAutomationCoordinator } from "./automation.js";
import { ReflectionEngineService } from "./service.js";
import { InMemoryReflectionStore } from "./store.js";

const at = "2026-08-16T00:00:00.000Z";
const measuredTask = (
  ownerId: string,
  estimatedMinutes: number,
  actualMinutes: number,
  overrides: Record<string, unknown> = {},
) =>
  TaskRecordSchema.parse({
    id: crypto.randomUUID(), ownerId, name: "DB integration", description: "Measured DB integration", goal: "Validate benchmark",
    priority: "high", category: "planning", type: "goal_task", status: "completed",
    schedule: { kind: "none", timezone: "UTC", startAt: null, endAt: null, cronExpression: null, intervalSeconds: null, quietHours: [], blackoutPeriods: [], preview: [] },
    triggerSummary: "manual", conditionSummary: "ready", dependencyIds: [],
    executionPolicy: { safetyLevel: "informational", requiresApproval: false, requiresRecentAuthentication: false, requiresPrivateNetwork: false, requiresTrustedDevice: false, allowedProviders: ["manual_owner"], autonomousExecutionAllowed: false },
    approvalPolicy: "none", assignedAgentIds: [], retryPolicy: { maxRetries: 0, strategy: "none" }, timeoutSeconds: 60,
    deadlineAt: null, successCriteria: ["done"], failureCriteria: [], rollbackStrategy: "none",
    metadata: { estimatedMinutes, actualMinutes, taskType: "DB_INTEGRATION", projectId: "Alexa", workflowId: "benchmark-validation", agentId: "primary-agent", estimateSource: "HUMAN", complexityBand: "HIGH", ...overrides },
    version: "1", createdAt: at, updatedAt: at,
  });

describe("Phase 21C closure integration", () => {
  it("computes scoped calibration and records explicit hierarchical fallback", async () => {
    const ownerId = crypto.randomUUID();
    const tasks = new InMemoryTaskStore();
    const pairs = [[120, 240], [180, 300], [120, 210], [240, 360], [180, 330], [120, 240]];
    for (const [estimate, actual] of pairs) tasks.saveTask(measuredTask(ownerId, estimate!, actual!));
    tasks.saveTask(measuredTask(ownerId, 60, 90, { agentId: "one-sample-agent" }));
    const reflection = new ReflectionEngineService(new InMemoryReflectionStore(), new InMemoryExecutiveStore(), tasks);
    await reflection.query(ownerId, { type: "CALIBRATION", scope: "CUSTOM_PERIOD", entityId: null, periodStart: null, periodEnd: null, requestedDepth: "STANDARD" });
    const scoped = await reflection.getEstimateCalibration(ownerId, { taskType: "DB_INTEGRATION", projectId: "Alexa" });
    expect(scoped).toMatchObject({ sampleCount: 7, status: "CALIBRATED", fallbackLevel: "EXACT" });
    expect(scoped?.meanEstimate).toBeCloseTo(145.7142857143);
    expect(scoped?.meanActual).toBeCloseTo(252.8571428571);
    const fallback = await reflection.getEstimateCalibration(ownerId, { taskType: "DB_INTEGRATION", projectId: "Alexa", agentId: "one-sample-agent" });
    expect(fallback).toMatchObject({ status: "CALIBRATED", fallbackLevel: "TASK_TYPE_PROJECT", sampleCount: 7 });
    const insufficient = (await reflection.dashboard(ownerId)).calibrations.find((item) => item.category === "agentId:one-sample-agent");
    expect(insufficient).toMatchObject({ sampleCount: 1, status: "INSUFFICIENT_DATA", confidence: 0 });
  });

  it("uses durable Task Engine schedules, deduplicates unchanged ticks, and permits changed state", async () => {
    const ownerId = crypto.randomUUID();
    const taskStore = new InMemoryTaskStore();
    const executiveStore = new InMemoryExecutiveStore();
    const reflectionStore = new InMemoryReflectionStore();
    const sourceTask = measuredTask(ownerId, 60, 90);
    taskStore.saveTask({ ...sourceTask, status: "ready" });
    const plan = ExecutivePlanSchema.parse({
      id: crypto.randomUUID(), ownerId, goalId: null, version: 1, horizon: "TODAY", status: "ACTIVE", assumptions: [], milestones: [], taskIds: [sourceTask.id], priorityOrder: [sourceTask.id], effortMinutes: 60,
      scheduleSuggestions: [], unscheduledTaskIds: [], risks: [], feasibilityReasons: [], checkpoints: [], confidence: 0.8, feasible: true, feasibility: "FEASIBLE", feasibilityReason: "bounded", createdAt: at, updatedAt: at,
    });
    executiveStore.savePlan(plan);
    const reflection = new ReflectionEngineService(reflectionStore, executiveStore, taskStore, () => new Date("2026-08-17T00:00:00.000Z"));
    const coordinator = new ReflectionAutomationCoordinator(taskStore, reflection, () => new Date("2026-08-17T00:00:00.000Z"));
    const engine = new TaskEngineService(taskStore, { submit: vi.fn() } as never, {} as never, vi.fn(), () => new Date("2026-08-17T00:00:00.000Z"));
    engine.setLifecycleSink(coordinator);
    const firstDashboard = await engine.dashboard(ownerId);
    const daily = firstDashboard.tasks.find((task) => task.metadata.reflectionPeriod === "DAILY");
    expect(firstDashboard.tasks.filter((task) => task.metadata.systemTask === "reflection_review")).toHaveLength(2);
    await engine.dashboard(ownerId);
    expect(taskStore.listTasks(ownerId, 500).filter((task) => task.metadata.systemTask === "reflection_review")).toHaveLength(2);
    await engine.triggerTask({ ownerId, body: { taskId: daily!.id, reason: "scheduler tick" }, requestId: "daily-1", ipAddress: "internal" });
    await engine.triggerTask({ ownerId, body: { taskId: daily!.id, reason: "scheduler tick" }, requestId: "daily-2", ipAddress: "internal" });
    expect(reflectionStore.listReflections(ownerId)).toHaveLength(1);
    taskStore.saveTask({ ...sourceTask, status: "completed", updatedAt: "2026-08-17T01:00:00.000Z" });
    await engine.triggerTask({ ownerId, body: { taskId: daily!.id, reason: "changed state" }, requestId: "daily-3", ipAddress: "internal" });
    expect(reflectionStore.listReflections(ownerId)).toHaveLength(2);
    expect(taskStore.listRuns(ownerId, 10).every((run) => run.status === "completed")).toBe(true);
    await engine.emitLifecycleEvent({ ownerId, eventType: "PROJECT_COMPLETED", scopeId: crypto.randomUUID(), baselineVersion: "project-v1", sourceSnapshot: { status: "completed" } });
    await engine.emitLifecycleEvent({ ownerId, eventType: "PROJECT_COMPLETED", scopeId: crypto.randomUUID(), baselineVersion: "project-v1", sourceSnapshot: { status: "completed" } });
    expect(reflectionStore.listReflections(ownerId).filter((item) => item.reflectionType === "PROJECT_RETROSPECTIVE")).toHaveLength(1);
    await engine.emitLifecycleEvent({ ownerId, eventType: "CRITICAL_WORKFLOW_FAILURE", scopeId: "benchmark-validation", baselineVersion: "failure-v1", sourceSnapshot: { status: "failed" } });
    expect(reflectionStore.listReflections(ownerId).some((item) => item.reflectionType === "FAILURE_ANALYSIS")).toBe(true);
    const goal = ExecutiveGoalSchema.parse({ id: crypto.randomUUID(), ownerId, title: "Finish Phase 21C", description: "Closure", status: "COMPLETED", priority: "HIGH", targetDate: null, startDate: at, successCriteria: ["validated"], linkedTaskIds: [sourceTask.id], constraints: [], createdAt: at, updatedAt: "2026-08-17T02:00:00.000Z", completedAt: "2026-08-17T02:00:00.000Z" });
    executiveStore.saveGoal(goal);
    await engine.emitLifecycleEvent({ ownerId, eventType: "GOAL_COMPLETED", scopeId: goal.id, baselineVersion: goal.updatedAt, sourceSnapshot: goal });
    expect(reflectionStore.listReflections(ownerId).some((item) => item.reflectionType === "GOAL_REVIEW")).toBe(true);
    const adverseEventId = crypto.randomUUID();
    await engine.emitLifecycleEvent({ ownerId, eventType: "RISK_MATERIALIZED", scopeId: adverseEventId, baselineVersion: "risk-event-v1", sourceSnapshot: { severity: "major" } });
    const unanticipated = reflectionStore.listReflections(ownerId).find((item) => item.scopeId === adverseEventId);
    expect(unanticipated?.rootCauses[0]?.category).toBe("UNANTICIPATED_RISK");
    await engine.emitLifecycleEvent({ ownerId, eventType: "RISK_MATERIALIZED", scopeId: adverseEventId, baselineVersion: "risk-event-v1", sourceSnapshot: { severity: "major" } });
    expect(reflectionStore.listReflections(ownerId).filter((item) => item.scopeId === adverseEventId)).toHaveLength(1);
  });
});

import { TaskRecordSchema, type TaskRecord } from "@alexa-control/shared";
import { describe, expect, it } from "vitest";
import { InMemoryTaskStore } from "../tasks/store.js";
import { ExecutiveBrainService, parseExecutiveQuery } from "./service.js";
import { InMemoryExecutiveStore } from "./store.js";

const task = (
  ownerId: string,
  name: string,
  priority: TaskRecord["priority"],
  deadlineAt: string | null,
): TaskRecord =>
  TaskRecordSchema.parse({
    id: crypto.randomUUID(),
    ownerId,
    name,
    description: name,
    goal: "Ship Phase 21B",
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
    deadlineAt,
    successCriteria: ["done"],
    failureCriteria: [],
    rollbackStrategy: "none",
    metadata: { estimatedMinutes: 120 },
    version: "1",
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
  });

describe("ExecutiveBrainService", () => {
  it("ranks durable owner tasks, respects a hard time budget, and never executes", async () => {
    const ownerId = crypto.randomUUID();
    const tasks = new InMemoryTaskStore();
    const urgent = task(
      ownerId,
      "Validate executive brain",
      "urgent",
      "2026-08-17T00:00:00.000Z",
    );
    const later = task(ownerId, "Polish dashboard", "low", null);
    tasks.saveTask(urgent);
    tasks.saveTask(later);
    const service = new ExecutiveBrainService(
      new InMemoryExecutiveStore(),
      tasks,
      () => new Date("2026-08-16T00:00:00.000Z"),
    );
    const result = await service.query(ownerId, {
      type: "PLAN",
      horizon: "TODAY",
      target: null,
      availableMinutes: 60,
      options: [],
      simulation: false,
    });
    expect(result.recommendations[0]?.taskId).toBe(urgent.id);
    expect(result.plan?.feasible).toBe(false);
    expect(result.executed).toBe(false);
  });
  it("keeps owner state isolated and parses conversational executive requests", async () => {
    const one = crypto.randomUUID();
    const two = crypto.randomUUID();
    const tasks = new InMemoryTaskStore();
    tasks.saveTask(task(one, "Owner one priority", "urgent", null));
    tasks.saveTask(task(two, "Owner two priority", "urgent", null));
    const service = new ExecutiveBrainService(new InMemoryExecutiveStore(), tasks);
    expect(
      (
        await service.query(one, parseExecutiveQuery("What should I focus on today?")!)
      ).recommendations.map((item) => item.title),
    ).toEqual(["Owner one priority"]);
    expect(
      parseExecutiveQuery("What happens if I delay this by 3 days?")?.simulation,
    ).toBe(true);
  });
  it("packs advisory schedule blocks within two hours and preserves plan versions", async () => {
    const ownerId = crypto.randomUUID();
    const tasks = new InMemoryTaskStore();
    const store = new InMemoryExecutiveStore();
    for (const [name, minutes] of [
      ["Task A", 90],
      ["Task B", 45],
      ["Task C", 120],
    ] as const) {
      const value = task(ownerId, name, "high", null);
      tasks.saveTask({ ...value, metadata: { estimatedMinutes: minutes } });
    }
    const service = new ExecutiveBrainService(
      store,
      tasks,
      () => new Date("2026-08-16T00:00:00.000Z"),
    );
    const input = {
      type: "PLAN" as const,
      horizon: "TODAY" as const,
      target: null,
      availableMinutes: 120,
      options: [],
      simulation: false,
    };
    const first = await service.query(ownerId, input);
    const second = await service.query(ownerId, input);
    expect(
      first.plan?.scheduleSuggestions.reduce(
        (sum, item) => sum + item.durationMinutes,
        0,
      ),
    ).toBeLessThanOrEqual(120);
    expect(second.plan?.version).toBe(2);
    expect(second.plan?.previousVersionId).toBe(first.plan?.id);
    expect(store.listPlans(ownerId)).toHaveLength(2);
  });
  it("creates proposed decisions with explicit factors and no acceptance authority", async () => {
    const ownerId = crypto.randomUUID();
    const service = new ExecutiveBrainService(
      new InMemoryExecutiveStore(),
      new InMemoryTaskStore(),
    );
    const result = await service.query(ownerId, {
      type: "COMPARE_OPTIONS",
      horizon: "TODAY",
      target: null,
      availableMinutes: null,
      options: ["A", "B"],
      simulation: false,
    });
    expect(result.decision?.status).toBe("PROPOSED");
    expect(result.decision?.criteria).toContain("risk");
    expect(result.decision?.evidence.length).toBeGreaterThan(0);
    expect(result.executed).toBe(false);
  });
  it("supports scheduler-driven alert evaluation with cooldown deduplication", async () => {
    const ownerId = crypto.randomUUID();
    const tasks = new InMemoryTaskStore();
    const store = new InMemoryExecutiveStore();
    const blocked = task(ownerId, "Blocked work", "urgent", null);
    const dependency = task(ownerId, "Prerequisite", "high", null);
    tasks.saveTask(blocked);
    tasks.saveTask(dependency);
    tasks.saveDependency({
      id: crypto.randomUUID(),
      ownerId,
      taskId: blocked.id,
      dependsOnTaskId: dependency.id,
      kind: "blocking",
      requiredStatus: "completed",
      optional: false,
      createdAt: "2026-08-16T00:00:00.000Z",
    });
    const service = new ExecutiveBrainService(
      store,
      tasks,
      () => new Date("2026-08-16T00:00:00.000Z"),
    );
    const first = await service.runScheduledEvaluation(ownerId);
    const second = await service.runScheduledEvaluation(ownerId);
    expect(first.health).toBe("BLOCKED");
    expect(second.alertCount).toBe(1);
    expect(store.listAlerts(ownerId)).toHaveLength(1);
  });
});

import { TaskRecordSchema, TaskTriggerSchema, type TaskRecord } from "@alexa-control/shared";
import type { TaskStore } from "../tasks/store.js";
import type { ReflectionEngineService } from "./service.js";

const schedule = (kind: "daily" | "weekly", at: string) => {
  const step = kind === "daily" ? 86_400_000 : 7 * 86_400_000;
  return {
    kind,
    timezone: "UTC",
    startAt: at,
    endAt: null,
    cronExpression: null,
    intervalSeconds: null,
    quietHours: [],
    blackoutPeriods: [],
    preview: Array.from({ length: 5 }, (_, index) =>
      new Date(Date.parse(at) + index * step).toISOString(),
    ),
  };
};

/** Connects Reflection to the existing durable Task Engine and its bounded events. */
export class ReflectionAutomationCoordinator {
  constructor(
    readonly tasks: TaskStore,
    readonly reflection: ReflectionEngineService,
    readonly now: () => Date = () => new Date(),
  ) {}

  async ensurePeriodicSchedules(ownerId: string) {
    const existing = await this.tasks.listTasks(ownerId, 500);
    for (const period of ["DAILY", "WEEKLY"] as const) {
      if (
        existing.some(
          (task) =>
            task.metadata.systemTask === "reflection_review" &&
            task.metadata.reflectionPeriod === period,
        )
      )
        continue;
      const at = this.now().toISOString();
      const task = TaskRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        name: `${period === "DAILY" ? "Daily" : "Weekly"} reflection review`,
        description: "A bounded deterministic review using the governed Reflection Engine.",
        goal: `${period}_REVIEW`,
        priority: "normal",
        category: "planning",
        type: "recurring",
        status: "scheduled",
        schedule: schedule(period === "DAILY" ? "daily" : "weekly", at),
        triggerSummary: `${period.toLowerCase()} Task Engine schedule`,
        conditionSummary: "Run only when owner state has changed; reflection snapshots deduplicate unchanged state.",
        dependencyIds: [],
        executionPolicy: {
          safetyLevel: "informational",
          requiresApproval: false,
          requiresRecentAuthentication: false,
          requiresPrivateNetwork: false,
          requiresTrustedDevice: false,
          allowedProviders: ["intent_engine"],
          autonomousExecutionAllowed: false,
        },
        approvalPolicy: "none",
        assignedAgentIds: [],
        retryPolicy: { maxRetries: 0, strategy: "none" },
        timeoutSeconds: 60,
        deadlineAt: null,
        successCriteria: ["A final reflection is persisted only after complete evaluation."],
        failureCriteria: ["Runtime is draining or evaluation is cancelled."],
        rollbackStrategy: "No partial FINAL record is persisted.",
        metadata: {
          systemTask: "reflection_review",
          reflectionPeriod: period,
          changedStateRequired: true,
          cooldownSeconds: period === "DAILY" ? 21_600 : 259_200,
        },
        version: "21C.1",
        createdAt: at,
        updatedAt: at,
      });
      await this.tasks.saveTask(task);
      await this.tasks.saveTrigger(
        TaskTriggerSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          taskId: task.id,
          type: "time",
          source: "task_engine",
          eventName: `${period}_REVIEW`,
          enabled: true,
          metadata: { reflectionType: "PERIODIC_REVIEW" },
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
  }

  async handleTaskTrigger(input: {
    ownerId: string;
    task: TaskRecord;
    reason: string;
    signal?: AbortSignal;
  }) {
    input.signal?.throwIfAborted();
    const period = input.task.metadata.reflectionPeriod;
    if (period !== "DAILY" && period !== "WEEKLY") return null;
    return this.reflection.runPeriodicReview(
      input.ownerId,
      period,
      input.signal ? { signal: input.signal } : {},
    );
  }

  async handleEvent(input: {
    ownerId: string;
    eventType: string;
    scopeId: string;
    baselineVersion: string;
    sourceSnapshot: unknown;
    signal?: AbortSignal;
  }) {
    input.signal?.throwIfAborted();
    if (input.eventType === "RISK_MATERIALIZED")
      return this.reflection.reflectMaterializedRiskEvent(
        input.ownerId,
        {
          scopeId: input.scopeId,
          baselineVersion: input.baselineVersion,
          sourceSnapshot: input.sourceSnapshot,
        },
        input.signal ? { signal: input.signal } : {},
      );
    const query =
      input.eventType === "GOAL_COMPLETED" || input.eventType === "GOAL_MISSED"
        ? { type: "EVALUATE_GOAL" as const, scope: "GOAL" as const }
        : input.eventType === "DECISION_OUTCOME_OBSERVABLE"
          ? { type: "EVALUATE_DECISION" as const, scope: "DECISION" as const }
          : ["PLAN_COMPLETED", "PROJECT_COMPLETED", "CRITICAL_WORKFLOW_FAILURE", "KPI_THRESHOLD_CROSSED"].includes(input.eventType)
              ? {
                  type: input.eventType === "CRITICAL_WORKFLOW_FAILURE" ? "WHY_FAILED" as const : "RETROSPECTIVE" as const,
                  scope: input.eventType === "PROJECT_COMPLETED" ? "PROJECT" as const : "PLAN" as const,
                }
              : null;
    if (!query) return null;
    return this.reflection.query(
      input.ownerId,
      {
        ...query,
        entityId: query.scope === "PLAN" || query.scope === "PROJECT" ? null : input.scopeId,
        periodStart: null,
        periodEnd: this.now().toISOString(),
        requestedDepth: "STANDARD",
      },
      input.signal ? { signal: input.signal } : {},
    );
  }
}

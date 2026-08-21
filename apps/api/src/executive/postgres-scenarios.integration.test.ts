import {
  ExecutiveKpiSchema,
  ExecutiveRiskSchema,
  TaskDependencySchema,
  TaskRecordSchema,
} from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../persistence/database.js";
import { safeTestDatabaseUrl } from "../persistence/test-database.js";
import { PostgresTaskStore } from "../tasks/postgres-store.js";
import { PostgresExecutiveStore } from "./postgres-store.js";
import { ExecutiveBrainService, parseExecutiveQuery } from "./service.js";

const connectionString = safeTestDatabaseUrl();
const owner = crypto.randomUUID();
const at = "2026-08-16T00:00:00.000Z";
let database: PostgresDatabase | undefined;
describe.skipIf(!connectionString)("PostgreSQL-backed Phase 21B scenarios", () => {
  beforeAll(async () => {
    database = new PostgresDatabase(connectionString!);
    await database.migrate();
    await database.pool.query(
      "INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'test-only',$3,NOW(),NOW())",
      [owner, "phase21b-scenarios@example.test", { id: owner }],
    );
  });
  afterAll(async () => {
    if (database) {
      await database.pool.query("DELETE FROM owners WHERE id=$1", [owner]);
      await database.close();
    }
  });
  it("runs priority, constrained planning, KPI, simulation, brief, and change detection on durable state", async () => {
    const tasks = new PostgresTaskStore(database!.pool);
    const store = new PostgresExecutiveStore(database!.pool);
    for (const [name, priority, minutes] of [
      ["Critical validation", "urgent", 90],
      ["Review failures", "high", 45],
      ["UI polish", "low", 120],
    ] as const) {
      await tasks.saveTask(
        TaskRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: owner,
          name,
          description: name,
          goal: "Ship",
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
        }),
      );
    }
    const seededTasks = await tasks.listTasks(owner, 20);
    const polish = seededTasks.find((item) => item.name === "UI polish")!;
    const review = seededTasks.find((item) => item.name === "Review failures")!;
    await tasks.saveDependency(
      TaskDependencySchema.parse({
        id: crypto.randomUUID(),
        ownerId: owner,
        taskId: polish.id,
        dependsOnTaskId: review.id,
        kind: "blocking",
        requiredStatus: "completed",
        optional: false,
        createdAt: at,
      }),
    );
    await store.saveKpi(
      ExecutiveKpiSchema.parse({
        id: crypto.randomUUID(),
        ownerId: owner,
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
    await store.saveRisk(
      ExecutiveRiskSchema.parse({
        id: crypto.randomUUID(),
        ownerId: owner,
        goalId: null,
        objectiveId: null,
        planId: null,
        description: "Release deadline risk",
        likelihood: 0.8,
        impact: 0.9,
        severity: 0.85,
        status: "OPEN",
        mitigation: "Complete validation",
        source: "DETERMINISTIC",
        confidence: 0.9,
        createdAt: at,
        updatedAt: at,
        resolvedAt: null,
      }),
    );
    const service = new ExecutiveBrainService(store, tasks, () => new Date(at));
    expect(
      (
        await service.query(
          owner,
          parseExecutiveQuery("What should I focus on today?")!,
        )
      ).recommendations[0]?.title,
    ).toBe("Critical validation");
    const plan = await service.query(
      owner,
      parseExecutiveQuery("I only have two hours today. Update the plan.")!,
    );
    expect(
      plan.plan?.scheduleSuggestions.reduce(
        (sum, item) => sum + item.durationMinutes,
        0,
      ),
    ).toBeLessThanOrEqual(120);
    expect(
      (await service.query(owner, parseExecutiveQuery("What am I behind on?")!)).health,
    ).toBe("BLOCKED");
    expect(
      (
        await service.query(
          owner,
          parseExecutiveQuery("Which project is most at risk?")!,
        )
      ).health,
    ).toBe("BLOCKED");
    expect(
      (
        await service.query(
          owner,
          parseExecutiveQuery("What is blocking this project?")!,
        )
      ).blockers.length,
    ).toBeGreaterThan(0);
    expect(
      (await service.query(owner, parseExecutiveQuery("Plan the next three days.")!))
        .plan?.version,
    ).toBe(2);
    expect(
      (
        await service.query(
          owner,
          parseExecutiveQuery("Which KPI is furthest off target?")!,
        )
      ).text,
    ).toContain("25%");
    const decision = await service.query(
      owner,
      parseExecutiveQuery("Should I choose A or B?")!,
    );
    expect(decision.decision?.status).toBe("PROPOSED");
    expect(decision.executed).toBe(false);
    expect(
      (
        await service.query(
          owner,
          parseExecutiveQuery("What happens if I cancel this project?")!,
        )
      ).executed,
    ).toBe(false);
    expect(
      (await service.query(owner, parseExecutiveQuery("Why is this ranked first?")!))
        .recommendations[0]?.title,
    ).toBe("Critical validation");
    expect(
      (await service.query(owner, parseExecutiveQuery("Give me my executive brief.")!))
        .text,
    ).toContain("Top priority");
    expect(
      (
        await service.query(
          owner,
          parseExecutiveQuery("What changed since yesterday?")!,
        )
      ).text,
    ).toContain("Since yesterday");
    expect(
      (await new PostgresExecutiveStore(database!.pool).listPlans(owner)).length,
    ).toBe(2);
  });
});

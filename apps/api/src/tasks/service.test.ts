import { describe, expect, it } from "vitest";

import { AgentCognitionService } from "../agent-cognition/service.js";
import { InMemoryAgentCognitionStore } from "../agent-cognition/store.js";
import { AgentEvolutionService } from "../agent-evolution/service.js";
import { InMemoryAgentEvolutionStore } from "../agent-evolution/store.js";
import { AgentSocietyService } from "../agent-society/service.js";
import { InMemoryAgentSocietyStore } from "../agent-society/store.js";
import { AgentOsService } from "../agents/os-service.js";
import { InMemoryAgentOsStore } from "../agents/os-store.js";
import { AgentRegistryService } from "../agents/service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { IntentExecutionService } from "../intent/service.js";
import { InMemoryIntentStore } from "../intent/store.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { TaskEngineService } from "./service.js";
import { InMemoryTaskStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const agentStore = new InMemoryAgentStore();
  const memoryStore = new InMemoryMemoryStore();
  const repositoryStore = new InMemoryRepositoryStore();
  const registry = new AgentRegistryService(agentStore, audit);
  const agentOs = new AgentOsService(
    new InMemoryAgentOsStore(),
    agentStore,
    repositoryStore,
    memoryStore,
    audit,
    undefined,
    (id, requestId) => registry.ensureBuiltIns(id, requestId),
  );
  const cognition = new AgentCognitionService(
    new InMemoryAgentCognitionStore(),
    agentStore,
    agentOs,
    memoryStore,
    audit,
  );
  const evolution = new AgentEvolutionService(
    new InMemoryAgentEvolutionStore(),
    agentStore,
    cognition,
    audit,
  );
  const society = new AgentSocietyService(
    new InMemoryAgentSocietyStore(),
    agentStore,
    evolution,
    audit,
  );
  const intent = new IntentExecutionService(new InMemoryIntentStore(), society, audit);
  const tasks = new TaskEngineService(new InMemoryTaskStore(), intent, society, audit);
  return { audits, ownerId, tasks };
};

describe("TaskEngineService", () => {
  it("initializes proactive monitors, metrics, and suggestions without execution authority", async () => {
    const { ownerId, tasks } = setup();
    const dashboard = await tasks.dashboard(ownerId);

    expect(dashboard.monitors.map((monitor) => monitor.name)).toContain(
      "Workflow queue monitor",
    );
    expect(dashboard.metrics.map((metric) => metric.metricName)).toContain(
      "task_readiness",
    );
    expect(dashboard.suggestions).toHaveLength(1);
    expect(dashboard.proactive).toBe(true);
    expect(dashboard.autonomousExecutionBypassesGovernance).toBe(false);
  });

  it("creates scheduled tasks with triggers, conditions, notifications, and previews", async () => {
    const { audits, ownerId, tasks } = setup();
    const dashboard = await tasks.createTask({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        name: "Morning briefing",
        description: "Summarize work for the owner.",
        goal: "Summarize open workflows and reminders.",
        type: "recurring",
        category: "monitoring",
        priority: "normal",
        scheduleKind: "daily",
        timezone: "UTC",
        triggerType: "time",
        condition: "Owner is active.",
      },
    });
    const task = dashboard.tasks.find((item) => item.name === "Morning briefing");

    expect(task?.status).toBe("scheduled");
    expect(task?.schedule.preview.length).toBeGreaterThan(1);
    expect(task?.executionPolicy.autonomousExecutionAllowed).toBe(false);
    expect(dashboard.triggers.some((trigger) => trigger.taskId === task?.id)).toBe(
      true,
    );
    expect(
      dashboard.notifications.some((notification) => notification.taskId === task?.id),
    ).toBe(true);
    expect(audits.map((audit) => audit.eventType)).toContain("TASK_SCHEDULED");
  });

  it("requires approval for moderate-risk automation tasks", async () => {
    const { audits, ownerId, tasks } = setup();
    const dashboard = await tasks.createTask({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        name: "Repository review automation",
        description: "Coordinate repository review.",
        goal: "Review this repository and create a validation plan.",
        type: "automation",
        category: "repository_operations",
        priority: "high",
        scheduleKind: "once",
        timezone: "UTC",
        triggerType: "manual",
      },
    });
    const task = dashboard.tasks.find(
      (item) => item.name === "Repository review automation",
    );

    expect(task?.status).toBe("waiting_approval");
    expect(task?.approvalPolicy).toBe("explicit");
    expect(task?.executionPolicy.requiresApproval).toBe(true);
    expect(audits.map((audit) => audit.eventType)).toEqual(
      expect.arrayContaining(["TASK_APPROVAL_REQUIRED", "SOCIETY_TEAM_FORMED"]),
    );
  });

  it("queues a governed command record when a safe task is manually triggered", async () => {
    const { ownerId, tasks } = setup();
    const created = await tasks.createTask({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        name: "Read-only reminder",
        description: "Prepare an advisory reminder.",
        goal: "Summarize today's reminders.",
        type: "reminder",
        category: "notifications",
        priority: "normal",
        scheduleKind: "once",
        timezone: "UTC",
        triggerType: "manual",
      },
    });
    const task = created.tasks.find((item) => item.name === "Read-only reminder");
    expect(task).toBeDefined();
    const dashboard = await tasks.triggerTask({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        taskId: task!.id,
        reason: "Owner clicked run.",
      },
    });
    const run = dashboard.runs.find((item) => item.taskId === task!.id);

    expect(run?.status).toBe("queued");
    expect(run?.commandId).toBeTruthy();
    expect(dashboard.autonomousExecutionBypassesGovernance).toBe(false);
  });

  it("records goals, routines, and reusable checklists", async () => {
    const { ownerId, tasks } = setup();
    await tasks.createGoal({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        title: "Ship calmly",
        description: "Use reminders and checklists to reduce release risk.",
        priority: "high",
      },
    });
    await tasks.createRoutine({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        name: "Weekly review",
        description: "Review work and plan the next week.",
        mode: "weekly_review",
        taskIds: [],
      },
    });
    const dashboard = await tasks.createChecklist({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        name: "Deployment checklist",
        category: "deployment",
        reusable: true,
        items: ["Review approvals", "Check validation", "Confirm rollback"],
      },
    });

    expect(dashboard.goals.map((goal) => goal.title)).toContain("Ship calmly");
    expect(dashboard.routines.map((routine) => routine.name)).toContain(
      "Weekly review",
    );
    expect(dashboard.checklists.map((checklist) => checklist.name)).toContain(
      "Deployment checklist",
    );
    expect(dashboard.checklistItems).toHaveLength(3);
  });
});

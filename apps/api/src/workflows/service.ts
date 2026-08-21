import {
  CreateWorkflowRequestSchema,
  WorkflowCheckpointSchema,
  WorkflowEventSchema,
  WorkflowListResponseSchema,
  WorkflowProgressSchema,
  WorkflowRecordSchema,
  WorkflowReportSchema,
  WorkflowResponseSchema,
  WorkflowTaskSchema,
  type Repository,
  type WorkflowRecord,
  type WorkflowTask,
  type WorkflowTaskStatus,
} from "@alexa-control/shared";

import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { PatchStore } from "../patches/store.js";
import type { RepositoryStore } from "../repositories/store.js";
import type { ValidationStore } from "../validation/store.js";
import type { WorkflowStore } from "./store.js";

const defaultValidationPlan = [
  "pnpm_format_check",
  "pnpm_typecheck",
  "pnpm_lint",
  "pnpm_test",
  "pnpm_build",
];

const isTerminalTask = (status: WorkflowTaskStatus) =>
  ["COMPLETED", "FAILED", "CANCELLED"].includes(status);

export class WorkflowEngineService {
  constructor(
    readonly store: WorkflowStore,
    readonly repositoryStore: RepositoryStore,
    readonly patchStore: PatchStore,
    readonly validationStore: ValidationStore,
    readonly audit: GovernanceAuditWriter,
    readonly now = () => new Date(),
  ) {}

  async create(input: {
    ownerId: string;
    body: unknown;
    ipAddress: string;
    requestId: string;
  }) {
    const parsed = CreateWorkflowRequestSchema.parse(input.body);
    const repositories = await this.requireRepositories(
      input.ownerId,
      parsed.repositoryIds,
    );
    const workflowId = crypto.randomUUID();
    const at = this.now().toISOString();
    const tasks = this.planTasks(workflowId, parsed.goal, repositories, at);
    const riskLevel = tasks.some((task) => task.riskLevel === "high")
      ? "high"
      : tasks.some((task) => task.riskLevel === "medium")
        ? "medium"
        : "low";
    const workflow = WorkflowRecordSchema.parse({
      schemaVersion: "1",
      id: workflowId,
      ownerId: input.ownerId,
      goal: parsed.goal,
      repositoryIds: repositories.map((repository) => repository.id),
      workspaceIds: [
        ...new Set(repositories.map((repository) => repository.workspaceId)),
      ],
      status: "PLANNED",
      approvalStrategy: parsed.approvalStrategy,
      riskLevel,
      difficulty: tasks.length > 6 || repositories.length > 1 ? "high" : "medium",
      planSummary: `Workflow decomposed into ${tasks.length} task(s) across ${repositories.length} repository/repositories. It will pause at approval and validation checkpoints; no patch is generated or executed automatically.`,
      architectureImpact: repositories.map(
        (repository) =>
          `Repository ${repository.id} at generation ${repository.activeGeneration ?? "none"}`,
      ),
      validationRequirements: defaultValidationPlan,
      currentTaskId: tasks[0]?.id ?? null,
      createdAt: at,
      updatedAt: at,
      pausedAt: null,
      completedAt: null,
      failureCode: null,
    });
    const checkpoint = WorkflowCheckpointSchema.parse({
      id: crypto.randomUUID(),
      workflowId,
      taskId: null,
      kind: "analysis",
      status: "open",
      summary:
        "Initial workflow plan created. Owner review is required before implementation tasks proceed.",
      patchId: null,
      validationRunId: null,
      createdAt: at,
    });
    const event = this.event(
      workflowId,
      null,
      "WORKFLOW_CREATED",
      "Workflow plan created and persisted.",
      { repositoryCount: repositories.length, taskCount: tasks.length },
      at,
    );
    await this.store.create({
      workflow,
      tasks,
      checkpoints: [checkpoint],
      events: [event],
    });
    await this.audit({
      eventType: "APPROVAL_REQUESTED",
      ownerId: input.ownerId,
      outcome: "SUCCESS",
      reason:
        "Autonomous workflow plan created; execution is waiting for owner-controlled checkpoints.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: { workflowId, taskCount: tasks.length },
    });
    return this.response(input.ownerId, workflowId);
  }

  async approve(ownerId: string, workflowId: string, reason?: string) {
    const workflow = await this.requireWorkflow(ownerId, workflowId);
    if (!["PLANNED", "WAITING_APPROVAL", "BLOCKED"].includes(workflow.status))
      throw new ExecutionError(
        409,
        "WORKFLOW_NOT_WAITING_APPROVAL",
        "Workflow is not waiting for approval.",
      );
    const tasks = await this.store.listTasks(workflow.id);
    const at = this.now().toISOString();
    for (const task of tasks) {
      if (task.status === "PENDING" && this.dependenciesMet(task, tasks)) {
        await this.store.updateTask(
          WorkflowTaskSchema.parse({ ...task, status: "READY", updatedAt: at }),
        );
      }
    }
    await this.store.addCheckpoint(
      WorkflowCheckpointSchema.parse({
        id: crypto.randomUUID(),
        workflowId,
        taskId: null,
        kind: "approval",
        status: "passed",
        summary: reason ?? "Owner approved workflow planning checkpoint.",
        patchId: null,
        validationRunId: null,
        createdAt: at,
      }),
    );
    const next = WorkflowRecordSchema.parse({
      ...workflow,
      status: "READY",
      updatedAt: at,
      pausedAt: null,
      currentTaskId:
        tasks.find(
          (task) => task.status === "PENDING" && this.dependenciesMet(task, tasks),
        )?.id ??
        tasks.find((task) => task.status === "READY")?.id ??
        workflow.currentTaskId,
    });
    await this.store.update(next);
    await this.store.addEvent(
      this.event(workflowId, null, "WORKFLOW_APPROVED", "Workflow resumed.", {}, at),
    );
    return this.response(ownerId, workflowId);
  }

  async advance(ownerId: string, workflowId: string) {
    const workflow = await this.requireWorkflow(ownerId, workflowId);
    if (!["READY", "APPROVED", "EXECUTING", "VALIDATING"].includes(workflow.status))
      throw new ExecutionError(
        409,
        "WORKFLOW_NOT_ADVANCEABLE",
        "Workflow is not ready to advance.",
      );
    const tasks = await this.store.listTasks(workflow.id);
    const at = this.now().toISOString();
    const ready = tasks.find((task) => task.status === "READY");
    if (!ready) {
      if (tasks.every((task) => task.status === "COMPLETED")) {
        const completed = WorkflowRecordSchema.parse({
          ...workflow,
          status: "COMPLETED",
          currentTaskId: null,
          updatedAt: at,
          completedAt: at,
        });
        await this.store.update(completed);
        await this.saveReport(completed);
        return this.response(ownerId, workflowId);
      }
      const blocked = WorkflowRecordSchema.parse({
        ...workflow,
        status: "BLOCKED",
        updatedAt: at,
        failureCode: "WORKFLOW_WAITING_FOR_TASKS",
      });
      await this.store.update(blocked);
      await this.store.addEvent(
        this.event(
          workflowId,
          null,
          "WORKFLOW_BLOCKED",
          "No task can advance until dependencies or approvals are resolved.",
          {},
          at,
        ),
      );
      return this.response(ownerId, workflowId);
    }
    const waiting = WorkflowTaskSchema.parse({
      ...ready,
      status: "WAITING_APPROVAL",
      approvalCheckpointId: crypto.randomUUID(),
      updatedAt: at,
    });
    await this.store.updateTask(waiting);
    await this.store.addCheckpoint(
      WorkflowCheckpointSchema.parse({
        id: waiting.approvalCheckpointId,
        workflowId,
        taskId: waiting.id,
        kind: "approval",
        status: "open",
        summary: `Task "${waiting.title}" is ready. Generate/approve a patch through the patch system, then attach patch and validation results before completing the task.`,
        patchId: waiting.patchId,
        validationRunId: waiting.validationRunId,
        createdAt: at,
      }),
    );
    await this.store.update(
      WorkflowRecordSchema.parse({
        ...workflow,
        status: "WAITING_APPROVAL",
        currentTaskId: waiting.id,
        updatedAt: at,
      }),
    );
    await this.store.addEvent(
      this.event(
        workflowId,
        waiting.id,
        "TASK_WAITING_APPROVAL",
        "Task is paused at an approval checkpoint.",
        {},
        at,
      ),
    );
    return this.response(ownerId, workflowId);
  }

  async completeTask(ownerId: string, workflowId: string, taskId: string) {
    const workflow = await this.requireWorkflow(ownerId, workflowId);
    const tasks = await this.store.listTasks(workflowId);
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task)
      throw new ExecutionError(404, "WORKFLOW_TASK_NOT_FOUND", "Task not found.");
    const at = this.now().toISOString();
    await this.store.updateTask(
      WorkflowTaskSchema.parse({
        ...task,
        status: "COMPLETED",
        updatedAt: at,
        completedAt: at,
      }),
    );
    const refreshed = await this.store.listTasks(workflowId);
    for (const candidate of refreshed) {
      if (
        candidate.status === "PENDING" &&
        this.dependenciesMet(candidate, refreshed)
      ) {
        await this.store.updateTask(
          WorkflowTaskSchema.parse({
            ...candidate,
            status: "READY",
            updatedAt: at,
          }),
        );
      }
    }
    const after = await this.store.listTasks(workflowId);
    const done = after.every((candidate) => candidate.status === "COMPLETED");
    const next = WorkflowRecordSchema.parse({
      ...workflow,
      status: done ? "COMPLETED" : "READY",
      currentTaskId:
        after.find((candidate) => candidate.status === "READY")?.id ?? null,
      updatedAt: at,
      completedAt: done ? at : workflow.completedAt,
      failureCode: null,
    });
    await this.store.update(next);
    await this.store.addEvent(
      this.event(
        workflowId,
        taskId,
        "TASK_COMPLETED",
        "Workflow task completed.",
        {},
        at,
      ),
    );
    if (done) await this.saveReport(next);
    return this.response(ownerId, workflowId);
  }

  async linkTaskArtifact(input: {
    ownerId: string;
    workflowId: string;
    taskId: string;
    patchId?: string;
    validationRunId?: string;
  }) {
    await this.requireWorkflow(input.ownerId, input.workflowId);
    const tasks = await this.store.listTasks(input.workflowId);
    const task = tasks.find((candidate) => candidate.id === input.taskId);
    if (!task)
      throw new ExecutionError(404, "WORKFLOW_TASK_NOT_FOUND", "Task not found.");
    if (input.patchId) {
      const patch = await this.patchStore.find(input.patchId);
      if (!patch || patch.ownerId !== input.ownerId)
        throw new ExecutionError(404, "PATCH_NOT_FOUND", "Patch was not found.");
    }
    if (input.validationRunId) {
      const validation = await this.validationStore.find(input.validationRunId);
      if (!validation || validation.ownerId !== input.ownerId)
        throw new ExecutionError(
          404,
          "VALIDATION_NOT_FOUND",
          "Validation run was not found.",
        );
    }
    const at = this.now().toISOString();
    await this.store.updateTask(
      WorkflowTaskSchema.parse({
        ...task,
        ...(input.patchId ? { patchId: input.patchId } : {}),
        ...(input.validationRunId ? { validationRunId: input.validationRunId } : {}),
        updatedAt: at,
      }),
    );
    await this.store.addEvent(
      this.event(
        input.workflowId,
        input.taskId,
        "TASK_ARTIFACT_LINKED",
        "Patch or validation artifact linked to workflow task.",
        {
          ...(input.patchId ? { patchId: input.patchId } : {}),
          ...(input.validationRunId ? { validationRunId: input.validationRunId } : {}),
        },
        at,
      ),
    );
    return this.response(input.ownerId, input.workflowId);
  }

  async pause(ownerId: string, workflowId: string, reason?: string) {
    const workflow = await this.requireWorkflow(ownerId, workflowId);
    const at = this.now().toISOString();
    const next = WorkflowRecordSchema.parse({
      ...workflow,
      status: "BLOCKED",
      pausedAt: at,
      updatedAt: at,
      failureCode: "WORKFLOW_PAUSED",
    });
    await this.store.update(next);
    await this.store.addEvent(
      this.event(
        workflowId,
        null,
        "WORKFLOW_PAUSED",
        reason ?? "Workflow paused.",
        {},
        at,
      ),
    );
    return this.response(ownerId, workflowId);
  }

  async cancel(ownerId: string, workflowId: string, reason?: string) {
    const workflow = await this.requireWorkflow(ownerId, workflowId);
    const at = this.now().toISOString();
    const tasks = await this.store.listTasks(workflowId);
    for (const task of tasks) {
      if (!isTerminalTask(task.status)) {
        await this.store.updateTask(
          WorkflowTaskSchema.parse({
            ...task,
            status: "CANCELLED",
            updatedAt: at,
            completedAt: at,
            failureCode: "WORKFLOW_CANCELLED",
          }),
        );
      }
    }
    const next = WorkflowRecordSchema.parse({
      ...workflow,
      status: "CANCELLED",
      updatedAt: at,
      completedAt: at,
      failureCode: "WORKFLOW_CANCELLED",
    });
    await this.store.update(next);
    await this.store.addEvent(
      this.event(
        workflowId,
        null,
        "WORKFLOW_CANCELLED",
        reason ?? "Workflow cancelled by owner.",
        {},
        at,
      ),
    );
    return this.response(ownerId, workflowId);
  }

  async get(ownerId: string, workflowId: string) {
    await this.requireWorkflow(ownerId, workflowId);
    return this.response(ownerId, workflowId);
  }

  async list(ownerId: string) {
    return WorkflowListResponseSchema.parse(await this.store.list(ownerId, 100));
  }

  private planTasks(
    workflowId: string,
    goal: string,
    repositories: Repository[],
    at: string,
  ): WorkflowTask[] {
    const tasks: WorkflowTask[] = [];
    const add = (
      title: string,
      taskGoal: string,
      dependencies: string[],
      riskLevel: WorkflowTask["riskLevel"],
    ) => {
      const task = WorkflowTaskSchema.parse({
        id: crypto.randomUUID(),
        workflowId,
        title,
        goal: taskGoal,
        status: dependencies.length === 0 ? "READY" : "PENDING",
        dependencies,
        estimatedComplexity: riskLevel === "high" ? "high" : "medium",
        affectedFiles: [],
        riskLevel,
        validationPlan: defaultValidationPlan,
        rollbackPlan:
          "Use Phase 5.1 rollback snapshots and generate a reviewed rollback patch if validation or review fails.",
        patchId: null,
        validationRunId: null,
        approvalCheckpointId: null,
        createdAt: at,
        updatedAt: at,
        completedAt: null,
        failureCode: null,
      });
      tasks.push(task);
      return task.id;
    };
    const analysis = add(
      "Repository analysis",
      `Analyze indexed repository evidence for: ${goal}`,
      [],
      "low",
    );
    const plan = add(
      "Implementation plan",
      "Produce an evidence-backed implementation plan and risk assessment.",
      [analysis],
      "medium",
    );
    const patch = add(
      "Patch proposal",
      "Generate the smallest reviewable patch through the Phase 5.1 patch system.",
      [plan],
      "medium",
    );
    const validation = add(
      "Validation",
      "Run Phase 5.2 validation profiles against the approved patch result.",
      [patch],
      "medium",
    );
    const review = add(
      "Review and documentation",
      "Review validation output, document changes, and prepare completion report.",
      [validation],
      repositories.length > 1 ? "high" : "medium",
    );
    add(
      "Completion report",
      "Summarize changes, validation results, rollback state, risks, and remaining work.",
      [review],
      "low",
    );
    return tasks;
  }

  private dependenciesMet(task: WorkflowTask, tasks: WorkflowTask[]) {
    return task.dependencies.every(
      (dependencyId) =>
        tasks.find((candidate) => candidate.id === dependencyId)?.status ===
        "COMPLETED",
    );
  }

  private progress(tasks: WorkflowTask[]) {
    const completedTasks = tasks.filter((task) => task.status === "COMPLETED").length;
    const runningTasks = tasks.filter((task) => task.status === "IN_PROGRESS").length;
    const blockedTasks = tasks.filter((task) => task.status === "BLOCKED").length;
    const failedTasks = tasks.filter((task) => task.status === "FAILED").length;
    const waitingApprovalTasks = tasks.filter(
      (task) => task.status === "WAITING_APPROVAL",
    ).length;
    const remainingTasks = tasks.length - completedTasks;
    return WorkflowProgressSchema.parse({
      totalTasks: tasks.length,
      completedTasks,
      runningTasks,
      blockedTasks,
      failedTasks,
      waitingApprovalTasks,
      remainingTasks,
      percentComplete: tasks.length
        ? Math.round((completedTasks / tasks.length) * 100)
        : 0,
      estimatedCompletion: remainingTasks
        ? `${remainingTasks} task(s) remaining`
        : null,
    });
  }

  private async saveReport(workflow: WorkflowRecord) {
    const tasks = await this.store.listTasks(workflow.id);
    const report = WorkflowReportSchema.parse({
      workflowId: workflow.id,
      title: `Workflow report: ${workflow.goal}`,
      summary: `Workflow ${workflow.status}. ${tasks.filter((task) => task.status === "COMPLETED").length}/${tasks.length} tasks completed.`,
      completedTasks: tasks
        .filter((task) => task.status === "COMPLETED")
        .map((task) => task.title),
      blockedTasks: tasks
        .filter((task) =>
          ["BLOCKED", "FAILED", "WAITING_APPROVAL"].includes(task.status),
        )
        .map((task) => task.title),
      risks: workflow.architectureImpact,
      validationSummary:
        "Validation is tracked per task through linked Phase 5.2 validation runs.",
      remainingWork: tasks
        .filter((task) => task.status !== "COMPLETED")
        .map((task) => task.title),
      generatedAt: this.now().toISOString(),
    });
    await this.store.saveReport(report);
  }

  private event(
    workflowId: string,
    taskId: string | null,
    eventType: string,
    message: string,
    metadata: Record<string, unknown>,
    at: string,
  ) {
    return WorkflowEventSchema.parse({
      id: crypto.randomUUID(),
      workflowId,
      taskId,
      eventType,
      message,
      createdAt: at,
      metadata,
    });
  }

  private async response(ownerId: string, workflowId: string) {
    const workflow = await this.requireWorkflow(ownerId, workflowId);
    const repositories = await this.requireRepositories(
      ownerId,
      workflow.repositoryIds,
    );
    const tasks = await this.store.listTasks(workflowId);
    const checkpoints = await this.store.listCheckpoints(workflowId);
    const events = await this.store.listEvents(workflowId, 1_000);
    return WorkflowResponseSchema.parse({
      workflow,
      repositories,
      tasks,
      checkpoints,
      events,
      progress: this.progress(tasks),
      report: (await this.store.getReport(workflowId)) ?? null,
    });
  }

  private async requireWorkflow(ownerId: string, workflowId: string) {
    const workflow = await this.store.find(workflowId);
    if (!workflow || workflow.ownerId !== ownerId)
      throw new ExecutionError(404, "WORKFLOW_NOT_FOUND", "Workflow was not found.");
    return workflow;
  }

  private async requireRepositories(ownerId: string, repositoryIds: string[]) {
    const repositories = [];
    for (const repositoryId of repositoryIds) {
      const repository = await this.repositoryStore.findRepository(repositoryId);
      if (!repository || repository.ownerId !== ownerId)
        throw new ExecutionError(
          404,
          "REPOSITORY_NOT_FOUND",
          "Repository was not found.",
        );
      repositories.push(repository);
    }
    return repositories;
  }
}

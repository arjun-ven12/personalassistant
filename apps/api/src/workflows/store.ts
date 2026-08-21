import {
  WorkflowCheckpointSchema,
  WorkflowEventSchema,
  WorkflowRecordSchema,
  WorkflowReportSchema,
  WorkflowTaskSchema,
  type WorkflowCheckpoint,
  type WorkflowEvent,
  type WorkflowRecord,
  type WorkflowReport,
  type WorkflowTask,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface WorkflowStore {
  create(input: {
    workflow: WorkflowRecord;
    tasks: WorkflowTask[];
    checkpoints: WorkflowCheckpoint[];
    events: WorkflowEvent[];
  }): Awaitable<WorkflowRecord>;
  find(id: string): Awaitable<WorkflowRecord | undefined>;
  list(ownerId: string, limit: number): Awaitable<WorkflowRecord[]>;
  update(workflow: WorkflowRecord): Awaitable<void>;
  listTasks(workflowId: string): Awaitable<WorkflowTask[]>;
  updateTask(task: WorkflowTask): Awaitable<void>;
  listCheckpoints(workflowId: string): Awaitable<WorkflowCheckpoint[]>;
  addCheckpoint(checkpoint: WorkflowCheckpoint): Awaitable<void>;
  listEvents(workflowId: string, limit: number): Awaitable<WorkflowEvent[]>;
  addEvent(event: WorkflowEvent): Awaitable<void>;
  saveReport(report: WorkflowReport): Awaitable<void>;
  getReport(workflowId: string): Awaitable<WorkflowReport | undefined>;
}

export class InMemoryWorkflowStore implements WorkflowStore {
  readonly #workflows = new Map<string, WorkflowRecord>();
  readonly #tasks = new Map<string, WorkflowTask>();
  readonly #checkpoints = new Map<string, WorkflowCheckpoint>();
  readonly #events = new Map<string, WorkflowEvent>();
  readonly #reports = new Map<string, WorkflowReport>();

  create(input: {
    workflow: WorkflowRecord;
    tasks: WorkflowTask[];
    checkpoints: WorkflowCheckpoint[];
    events: WorkflowEvent[];
  }) {
    const workflow = WorkflowRecordSchema.parse(input.workflow);
    this.#workflows.set(workflow.id, structuredClone(workflow));
    for (const task of input.tasks)
      this.#tasks.set(task.id, structuredClone(WorkflowTaskSchema.parse(task)));
    for (const checkpoint of input.checkpoints)
      this.#checkpoints.set(
        checkpoint.id,
        structuredClone(WorkflowCheckpointSchema.parse(checkpoint)),
      );
    for (const event of input.events)
      this.#events.set(event.id, structuredClone(WorkflowEventSchema.parse(event)));
    return structuredClone(workflow);
  }

  find(id: string) {
    const workflow = this.#workflows.get(id);
    return workflow ? structuredClone(workflow) : undefined;
  }

  list(ownerId: string, limit: number) {
    return [...this.#workflows.values()]
      .filter((workflow) => workflow.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((workflow) => structuredClone(workflow));
  }

  update(workflow: WorkflowRecord) {
    if (!this.#workflows.has(workflow.id)) throw new Error("Workflow missing.");
    this.#workflows.set(
      workflow.id,
      structuredClone(WorkflowRecordSchema.parse(workflow)),
    );
  }

  listTasks(workflowId: string) {
    return [...this.#tasks.values()]
      .filter((task) => task.workflowId === workflowId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((task) => structuredClone(task));
  }

  updateTask(task: WorkflowTask) {
    if (!this.#tasks.has(task.id)) throw new Error("Workflow task missing.");
    this.#tasks.set(task.id, structuredClone(WorkflowTaskSchema.parse(task)));
  }

  listCheckpoints(workflowId: string) {
    return [...this.#checkpoints.values()]
      .filter((checkpoint) => checkpoint.workflowId === workflowId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((checkpoint) => structuredClone(checkpoint));
  }

  addCheckpoint(checkpoint: WorkflowCheckpoint) {
    this.#checkpoints.set(
      checkpoint.id,
      structuredClone(WorkflowCheckpointSchema.parse(checkpoint)),
    );
  }

  listEvents(workflowId: string, limit: number) {
    return [...this.#events.values()]
      .filter((event) => event.workflowId === workflowId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((event) => structuredClone(event));
  }

  addEvent(event: WorkflowEvent) {
    this.#events.set(event.id, structuredClone(WorkflowEventSchema.parse(event)));
  }

  saveReport(report: WorkflowReport) {
    this.#reports.set(
      report.workflowId,
      structuredClone(WorkflowReportSchema.parse(report)),
    );
  }

  getReport(workflowId: string) {
    const report = this.#reports.get(workflowId);
    return report ? structuredClone(report) : undefined;
  }
}

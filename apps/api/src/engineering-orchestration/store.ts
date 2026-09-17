import {
  EngineeringArtifactSchema,
  EngineeringEventSchema,
  EngineeringObjectiveSchema,
  EngineeringTaskResultSchema,
  EngineeringTaskSchema,
  type EngineeringArtifact,
  type EngineeringEvent,
  type EngineeringObjective,
  type EngineeringTask,
  type EngineeringTaskResult,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface EngineeringOrchestrationStore {
  saveObjective(objective: EngineeringObjective): Awaitable<void>;
  saveObjectiveIfVersion(
    objective: EngineeringObjective,
    expectedVersion: number,
  ): Awaitable<boolean>;
  findObjective(
    ownerId: string,
    companyId: string,
    objectiveId: string,
  ): Awaitable<EngineeringObjective | undefined>;
  listObjectives(
    ownerId: string,
    companyId: string,
    limit: number,
  ): Awaitable<EngineeringObjective[]>;
  saveTask(task: EngineeringTask): Awaitable<void>;
  saveTasks(tasks: EngineeringTask[]): Awaitable<void>;
  findTask(
    ownerId: string,
    companyId: string,
    taskId: string,
  ): Awaitable<EngineeringTask | undefined>;
  listTasks(
    ownerId: string,
    companyId: string,
    objectiveId: string,
  ): Awaitable<EngineeringTask[]>;
  acquireTaskLease(input: {
    ownerId: string;
    companyId: string;
    taskId: string;
    workerId: string;
    now: string;
    expiresAt: string;
  }): Awaitable<EngineeringTask | undefined>;
  renewTaskLease(input: {
    ownerId: string;
    companyId: string;
    taskId: string;
    workerId: string;
    generation: number;
    now: string;
    expiresAt: string;
  }): Awaitable<boolean>;
  saveTaskFenced(
    task: EngineeringTask,
    workerId: string,
    generation: number,
    now: string,
  ): Awaitable<boolean>;
  releaseTaskLease(input: {
    ownerId: string;
    companyId: string;
    taskId: string;
    workerId: string;
    generation: number;
    now: string;
  }): Awaitable<boolean>;
  saveResult(result: EngineeringTaskResult): Awaitable<void>;
  listResults(
    ownerId: string,
    companyId: string,
    objectiveId: string,
  ): Awaitable<EngineeringTaskResult[]>;
  saveArtifact(artifact: EngineeringArtifact): Awaitable<void>;
  listArtifacts(
    ownerId: string,
    companyId: string,
    objectiveId: string,
  ): Awaitable<EngineeringArtifact[]>;
  saveEvent(event: EngineeringEvent): Awaitable<void>;
  listEvents(
    ownerId: string,
    companyId: string,
    objectiveId: string,
    limit: number,
  ): Awaitable<EngineeringEvent[]>;
}

const key = (ownerId: string, companyId: string, id: string) =>
  `${ownerId}:${companyId}:${id}`;

export class InMemoryEngineeringOrchestrationStore
  implements EngineeringOrchestrationStore
{
  readonly #objectives = new Map<string, EngineeringObjective>();
  readonly #tasks = new Map<string, EngineeringTask>();
  readonly #results = new Map<string, EngineeringTaskResult>();
  readonly #artifacts = new Map<string, EngineeringArtifact>();
  readonly #events = new Map<string, EngineeringEvent>();

  saveObjective(value: EngineeringObjective) {
    const objective = EngineeringObjectiveSchema.parse(value);
    this.#objectives.set(key(objective.ownerId, objective.companyId, objective.id), objective);
  }

  saveObjectiveIfVersion(value: EngineeringObjective, expectedVersion: number) {
    const objective = EngineeringObjectiveSchema.parse(value);
    const existing = this.findObjective(
      objective.ownerId,
      objective.companyId,
      objective.id,
    );
    if (!existing || existing.version !== expectedVersion) return false;
    this.saveObjective(objective);
    return true;
  }

  findObjective(ownerId: string, companyId: string, objectiveId: string) {
    return this.#objectives.get(key(ownerId, companyId, objectiveId));
  }

  listObjectives(ownerId: string, companyId: string, limit: number) {
    return [...this.#objectives.values()]
      .filter((value) => value.ownerId === ownerId && value.companyId === companyId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  saveTask(value: EngineeringTask) {
    const task = EngineeringTaskSchema.parse(value);
    this.#tasks.set(key(task.ownerId, task.companyId, task.id), task);
  }

  saveTasks(tasks: EngineeringTask[]) {
    for (const task of tasks) this.saveTask(task);
  }

  findTask(ownerId: string, companyId: string, taskId: string) {
    return this.#tasks.get(key(ownerId, companyId, taskId));
  }

  listTasks(ownerId: string, companyId: string, objectiveId: string) {
    return [...this.#tasks.values()]
      .filter(
        (value) =>
          value.ownerId === ownerId &&
          value.companyId === companyId &&
          value.objectiveId === objectiveId,
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  acquireTaskLease(input: {
    ownerId: string;
    companyId: string;
    taskId: string;
    workerId: string;
    now: string;
    expiresAt: string;
  }) {
    const existing = this.findTask(input.ownerId, input.companyId, input.taskId);
    if (!existing || existing.status !== "READY") return undefined;
    if (
      existing.leaseOwner &&
      existing.leaseExpiresAt &&
      new Date(existing.leaseExpiresAt).getTime() > new Date(input.now).getTime()
    )
      return undefined;
    const claimed = EngineeringTaskSchema.parse({
      ...existing,
      status: "ACTIVE",
      attempt: existing.attempt + 1,
      startedAt: existing.startedAt ?? input.now,
      leaseOwner: input.workerId,
      leaseExpiresAt: input.expiresAt,
      leaseGeneration: existing.leaseGeneration + 1,
      updatedAt: input.now,
    });
    this.saveTask(claimed);
    return claimed;
  }

  renewTaskLease(input: {
    ownerId: string;
    companyId: string;
    taskId: string;
    workerId: string;
    generation: number;
    now: string;
    expiresAt: string;
  }) {
    const existing = this.findTask(input.ownerId, input.companyId, input.taskId);
    if (
      !existing ||
      existing.leaseOwner !== input.workerId ||
      existing.leaseGeneration !== input.generation ||
      !existing.leaseExpiresAt ||
      new Date(existing.leaseExpiresAt).getTime() <= new Date(input.now).getTime()
    )
      return false;
    this.saveTask(
      EngineeringTaskSchema.parse({
        ...existing,
        leaseExpiresAt: input.expiresAt,
        updatedAt: input.now,
      }),
    );
    return true;
  }

  saveTaskFenced(
    task: EngineeringTask,
    workerId: string,
    generation: number,
    now: string,
  ) {
    const parsed = EngineeringTaskSchema.parse(task);
    const existing = this.findTask(parsed.ownerId, parsed.companyId, parsed.id);
    if (
      !existing ||
      existing.leaseOwner !== workerId ||
      existing.leaseGeneration !== generation ||
      !existing.leaseExpiresAt ||
      new Date(existing.leaseExpiresAt).getTime() <= new Date(now).getTime()
    )
      return false;
    this.saveTask(parsed);
    return true;
  }

  releaseTaskLease(input: {
    ownerId: string;
    companyId: string;
    taskId: string;
    workerId: string;
    generation: number;
    now: string;
  }) {
    const existing = this.findTask(input.ownerId, input.companyId, input.taskId);
    if (
      !existing ||
      existing.leaseOwner !== input.workerId ||
      existing.leaseGeneration !== input.generation ||
      !existing.leaseExpiresAt ||
      new Date(existing.leaseExpiresAt).getTime() <= new Date(input.now).getTime()
    )
      return false;
    this.saveTask(
      EngineeringTaskSchema.parse({
        ...existing,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: input.now,
      }),
    );
    return true;
  }

  saveResult(value: EngineeringTaskResult) {
    const result = EngineeringTaskResultSchema.parse(value);
    this.#results.set(key(result.ownerId, result.companyId, result.taskId), result);
  }

  listResults(ownerId: string, companyId: string, objectiveId: string) {
    return [...this.#results.values()].filter(
      (value) =>
        value.ownerId === ownerId &&
        value.companyId === companyId &&
        value.objectiveId === objectiveId,
    );
  }

  saveArtifact(value: EngineeringArtifact) {
    const artifact = EngineeringArtifactSchema.parse(value);
    this.#artifacts.set(key(artifact.ownerId, artifact.companyId, artifact.id), artifact);
  }

  listArtifacts(ownerId: string, companyId: string, objectiveId: string) {
    return [...this.#artifacts.values()].filter(
      (value) =>
        value.ownerId === ownerId &&
        value.companyId === companyId &&
        value.objectiveId === objectiveId,
    );
  }

  saveEvent(value: EngineeringEvent) {
    const event = EngineeringEventSchema.parse(value);
    this.#events.set(key(event.ownerId, event.companyId, event.id), event);
  }

  listEvents(ownerId: string, companyId: string, objectiveId: string, limit: number) {
    return [...this.#events.values()]
      .filter(
        (value) =>
          value.ownerId === ownerId &&
          value.companyId === companyId &&
          value.objectiveId === objectiveId,
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(-limit);
  }
}

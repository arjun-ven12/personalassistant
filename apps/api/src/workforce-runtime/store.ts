import {
  WorkforceRuntimeMessageSchema,
  WorkforceRuntimeReviewSchema,
  WorkforceRuntimeTaskSchema,
  type WorkforceRuntimeMessage,
  type WorkforceRuntimeReview,
  type WorkforceRuntimeTask,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";
import { companyScope } from "../companies/scope.js";
import { ExecutionError } from "../execution/errors.js";

export interface WorkforceExecutionLease {
  taskId: string;
  token: string;
  workerId: string;
}
export const leaseLost = () => new ExecutionError(409, "WORKFORCE_LEASE_LOST", "Execution lease expired or was revoked; stale worker output was rejected.");

const key = (ownerId: string, id: string) => `${ownerId}:${companyScope.companyId(ownerId) ?? "owner-default"}:${id}`;
const values = <T extends { ownerId: string }>(map: Map<string,T>, ownerId: string) => {
  const prefix = `${ownerId}:${companyScope.companyId(ownerId) ?? "owner-default"}:`;
  return [...map.entries()].filter(([id,item]) => id.startsWith(prefix) && item.ownerId===ownerId).map(([,item])=>item);
};

export interface WorkforceRuntimeStore {
  saveTask(task: WorkforceRuntimeTask, lease?: WorkforceExecutionLease): Awaitable<void>;
  claimExecution(ownerId: string, taskId: string, workerId: string, recovery?: boolean): Awaitable<WorkforceExecutionLease | undefined>;
  renewExecution(ownerId: string, lease: WorkforceExecutionLease): Awaitable<boolean>;
  releaseExecution(ownerId: string, lease: WorkforceExecutionLease): Awaitable<void>;
  activeExecutionTaskIds(ownerId: string): Awaitable<string[]>;
  cancelExecution(ownerId: string, taskId: string): Awaitable<void>;
  expiredExecutionScopes(): Awaitable<Array<{ ownerId: string; companyId: string }>>;
  pendingLifecycleTasks(ownerId: string): Awaitable<WorkforceRuntimeTask[]>;
  acknowledgeLifecycle(task: WorkforceRuntimeTask): Awaitable<void>;
  findTask(ownerId: string, taskId: string): Awaitable<WorkforceRuntimeTask | undefined>;
  listTasks(ownerId: string, limit: number): Awaitable<WorkforceRuntimeTask[]>;
  saveMessage(message: WorkforceRuntimeMessage): Awaitable<void>;
  listMessages(ownerId: string, limit: number): Awaitable<WorkforceRuntimeMessage[]>;
  saveReview(review: WorkforceRuntimeReview): Awaitable<void>;
  listReviews(ownerId: string, limit: number): Awaitable<WorkforceRuntimeReview[]>;
}

export class InMemoryWorkforceRuntimeStore implements WorkforceRuntimeStore {
  readonly #leases = new Map<string, WorkforceExecutionLease & { expiresAt: number }>();
  readonly #pending = new Set<string>();
  readonly #tasks = new Map<string, WorkforceRuntimeTask>();
  readonly #messages = new Map<string, WorkforceRuntimeMessage>();
  readonly #reviews = new Map<string, WorkforceRuntimeReview>();

  saveTask(task: WorkforceRuntimeTask, lease?: WorkforceExecutionLease) {
    const parsed = WorkforceRuntimeTaskSchema.parse(task);
    const held = this.#leases.get(key(parsed.ownerId, parsed.id));
    if (lease ? !held || held.token !== lease.token || held.expiresAt <= Date.now() : Boolean(held)) throw leaseLost();
    this.#tasks.set(key(parsed.ownerId, parsed.id), structuredClone(parsed));
    if (["COMPLETED", "FAILED", "CANCELLED", "REVIEW_REQUIRED"].includes(parsed.status)) this.#pending.add(key(parsed.ownerId, parsed.id));
  }
  claimExecution(ownerId: string, taskId: string, workerId: string, recovery = false) {
    const task = this.findTask(ownerId, taskId);
    const id = key(ownerId, taskId);
    const held = this.#leases.get(id);
    if (!task || (held && held.expiresAt > Date.now())) return undefined;
    if (!(recovery ? ["QUEUED", "MATCHING", "WAITING", "RUNNING", "RESERVED"] : ["QUEUED", "MATCHING", "WAITING", "RESERVED"]).includes(task.status)) return undefined;
    if (recovery && !["RUNNING", "RESERVED"].includes(task.status) && !held) return undefined;
    if (recovery && !held && Date.parse(task.updatedAt) > Date.now() - 900_000) return undefined;
    const lease = { taskId, workerId, token: crypto.randomUUID() };
    this.#leases.set(id, { ...lease, expiresAt: Date.now() + 60_000 });
    return lease;
  }
  renewExecution(ownerId: string, lease: WorkforceExecutionLease) {
    const held = this.#leases.get(key(ownerId, lease.taskId));
    if (!held || held.token !== lease.token || held.expiresAt <= Date.now()) return false;
    held.expiresAt = Date.now() + 60_000;
    return true;
  }
  releaseExecution(ownerId: string, lease: WorkforceExecutionLease) {
    const id = key(ownerId, lease.taskId);
    if (this.#leases.get(id)?.token === lease.token) this.#leases.delete(id);
  }
  activeExecutionTaskIds(ownerId: string) {
    return this.listTasks(ownerId, 500).filter((task) => {
      const lease = this.#leases.get(key(ownerId, task.id));
      return lease && lease.expiresAt > Date.now() && !["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(task.status);
    }).map((task) => task.id);
  }
  cancelExecution(ownerId: string, taskId: string) {
    this.#leases.delete(key(ownerId, taskId));
    const task = this.findTask(ownerId, taskId);
    if (task) this.saveTask({ ...task, status: "CANCELLED" });
  }
  expiredExecutionScopes() { return []; }
  pendingLifecycleTasks(ownerId: string) {
    return this.listTasks(ownerId, 500).filter((task) => this.#pending.has(key(ownerId, task.id)));
  }
  acknowledgeLifecycle(task: WorkforceRuntimeTask) {
    if (this.findTask(task.ownerId, task.id)?.updatedAt === task.updatedAt) this.#pending.delete(key(task.ownerId, task.id));
  }
  findTask(ownerId: string, taskId: string) {
    const task = this.#tasks.get(key(ownerId, taskId));
    return task?.ownerId === ownerId ? structuredClone(task) : undefined;
  }
  listTasks(ownerId: string, limit: number) {
    return values(this.#tasks, ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((item) => structuredClone(item));
  }
  saveMessage(message: WorkforceRuntimeMessage) {
    const parsed = WorkforceRuntimeMessageSchema.parse(message);
    this.#messages.set(key(parsed.ownerId, parsed.id), structuredClone(parsed));
  }
  listMessages(ownerId: string, limit: number) {
    return values(this.#messages, ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((item) => structuredClone(item));
  }
  saveReview(review: WorkforceRuntimeReview) {
    const parsed = WorkforceRuntimeReviewSchema.parse(review);
    this.#reviews.set(key(parsed.ownerId, parsed.id), structuredClone(parsed));
  }
  listReviews(ownerId: string, limit: number) {
    return values(this.#reviews, ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((item) => structuredClone(item));
  }
}

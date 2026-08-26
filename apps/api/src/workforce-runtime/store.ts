import {
  WorkforceRuntimeMessageSchema,
  WorkforceRuntimeReviewSchema,
  WorkforceRuntimeTaskSchema,
  type WorkforceRuntimeMessage,
  type WorkforceRuntimeReview,
  type WorkforceRuntimeTask,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface WorkforceRuntimeStore {
  saveTask(task: WorkforceRuntimeTask): Awaitable<void>;
  findTask(ownerId: string, taskId: string): Awaitable<WorkforceRuntimeTask | undefined>;
  listTasks(ownerId: string, limit: number): Awaitable<WorkforceRuntimeTask[]>;
  saveMessage(message: WorkforceRuntimeMessage): Awaitable<void>;
  listMessages(ownerId: string, limit: number): Awaitable<WorkforceRuntimeMessage[]>;
  saveReview(review: WorkforceRuntimeReview): Awaitable<void>;
  listReviews(ownerId: string, limit: number): Awaitable<WorkforceRuntimeReview[]>;
}

export class InMemoryWorkforceRuntimeStore implements WorkforceRuntimeStore {
  readonly #tasks = new Map<string, WorkforceRuntimeTask>();
  readonly #messages = new Map<string, WorkforceRuntimeMessage>();
  readonly #reviews = new Map<string, WorkforceRuntimeReview>();

  saveTask(task: WorkforceRuntimeTask) {
    const parsed = WorkforceRuntimeTaskSchema.parse(task);
    this.#tasks.set(parsed.id, structuredClone(parsed));
  }
  findTask(ownerId: string, taskId: string) {
    const task = this.#tasks.get(taskId);
    return task?.ownerId === ownerId ? structuredClone(task) : undefined;
  }
  listTasks(ownerId: string, limit: number) {
    return [...this.#tasks.values()].filter((item) => item.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((item) => structuredClone(item));
  }
  saveMessage(message: WorkforceRuntimeMessage) {
    const parsed = WorkforceRuntimeMessageSchema.parse(message);
    this.#messages.set(parsed.id, structuredClone(parsed));
  }
  listMessages(ownerId: string, limit: number) {
    return [...this.#messages.values()].filter((item) => item.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((item) => structuredClone(item));
  }
  saveReview(review: WorkforceRuntimeReview) {
    const parsed = WorkforceRuntimeReviewSchema.parse(review);
    this.#reviews.set(parsed.id, structuredClone(parsed));
  }
  listReviews(ownerId: string, limit: number) {
    return [...this.#reviews.values()].filter((item) => item.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((item) => structuredClone(item));
  }
}

import { describe, expect, it } from "vitest";

import { RepositorySchema } from "@alexa-control/shared";
import { InMemoryPatchStore } from "../patches/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { InMemoryValidationStore } from "../validation/store.js";
import { WorkflowEngineService } from "./service.js";
import { InMemoryWorkflowStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const repositoryStore = new InMemoryRepositoryStore();
  const repository = repositoryStore.upsertRepository(
    RepositorySchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId,
      workspaceId: "project",
      indexStatus: "INDEXED",
      activeGeneration: 1,
      activeFingerprint: "a".repeat(64),
      lastIndexedAt: new Date().toISOString(),
      lastFailureCode: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );
  const store = new InMemoryWorkflowStore();
  const service = new WorkflowEngineService(
    store,
    repositoryStore,
    new InMemoryPatchStore(),
    new InMemoryValidationStore(),
    () => Promise.resolve(),
  );
  return { ownerId, repository, service };
};

describe("WorkflowEngineService", () => {
  it("decomposes, checkpoints, advances, and completes a workflow", async () => {
    const { ownerId, repository, service } = setup();
    const created = await service.create({
      ownerId,
      body: {
        goal: "Add OAuth",
        repositoryIds: [repository.id],
        approvalStrategy: "approve_every_patch",
      },
      ipAddress: "127.0.0.1",
      requestId: crypto.randomUUID(),
    });
    expect(created.workflow.status).toBe("PLANNED");
    expect(created.tasks.length).toBeGreaterThan(3);
    expect(created.tasks[0]?.status).toBe("READY");

    const approved = await service.approve(ownerId, created.workflow.id);
    expect(approved.workflow.status).toBe("READY");

    const waiting = await service.advance(ownerId, created.workflow.id);
    expect(waiting.workflow.status).toBe("WAITING_APPROVAL");
    expect(waiting.tasks.some((task) => task.status === "WAITING_APPROVAL")).toBe(true);

    let current = waiting;
    for (const task of waiting.tasks) {
      current = await service.completeTask(ownerId, created.workflow.id, task.id);
      if (current.workflow.status !== "COMPLETED") {
        current = await service
          .advance(ownerId, created.workflow.id)
          .catch(() => current);
      }
    }
    expect(current.workflow.status).toBe("COMPLETED");
    expect(current.report?.completedTasks.length).toBe(created.tasks.length);
  });

  it("cancels pending tasks without touching patch or validation systems", async () => {
    const { ownerId, repository, service } = setup();
    const created = await service.create({
      ownerId,
      body: { goal: "Refactor auth", repositoryIds: [repository.id] },
      ipAddress: "127.0.0.1",
      requestId: crypto.randomUUID(),
    });
    const cancelled = await service.cancel(ownerId, created.workflow.id);
    expect(cancelled.workflow.status).toBe("CANCELLED");
    expect(cancelled.tasks.every((task) => task.status === "CANCELLED")).toBe(true);
  });
});

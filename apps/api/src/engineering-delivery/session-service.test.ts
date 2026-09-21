import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { EngineeringRuntimeStore } from "../engineering-runtime/store.js";
import type { EngineeringDeliveryContext, EngineeringDeliveryService } from "./service.js";
import { classifyProjectInstruction, EngineeringProjectSessionService } from "./session-service.js";
import { InMemoryEngineeringProjectSessionStore } from "./session-store.js";

describe("engineering project session service", () => {
  it("classifies active-run instructions without sending questions into orchestration", () => {
    expect(classifyProjectInstruction("Also make the cards mobile responsive.", true)).toBe("ADD_REQUIREMENT");
    expect(classifyProjectInstruction("Actually use tabs instead.", true)).toBe("MODIFY_CURRENT_REQUIREMENT");
    expect(classifyProjectInstruction("What are you working on?", true)).toBe("QUESTION");
    expect(classifyProjectInstruction("Stop this.", true)).toBe("CONTROL_ACTION");
    expect(classifyProjectInstruction("After this, add an analytics page.", true)).toBe("NEW_INDEPENDENT_REQUEST");
  });

  it("queues an independent active-run request, supports cancellation, and starts sequentially after completion", async () => {
    const ownerId = crypto.randomUUID();
    const companyId = crypto.randomUUID();
    const repositoryId = crypto.randomUUID();
    const activeId = crypto.randomUUID();
    const nextId = crypto.randomUUID();
    const deliveriesById = new Map<string, Record<string, unknown>>([[activeId, { id: activeId, repositoryId, status: "IMPLEMENTING", sourceRequest: "Pricing redesign", filesChanged: [], updatedAt: new Date().toISOString() }]]);
    const runtime = { findRepository: vi.fn().mockResolvedValue({ id: repositoryId, status: "ACTIVE", displayName: "Ocia CRM" }) } as unknown as EngineeringRuntimeStore;
    const create = vi.fn().mockImplementation((_context: unknown, input: { request: string }) => {
      const delivery = { id: nextId, repositoryId, status: "PLANNING", sourceRequest: input.request, filesChanged: [], updatedAt: new Date().toISOString() };
      deliveriesById.set(nextId, delivery);
      return Promise.resolve({ delivery });
    });
    const deliveries = { create, store: { find: vi.fn((_owner: string, _company: string, id: string) => deliveriesById.get(id)) } } as unknown as EngineeringDeliveryService;
    const store = new InMemoryEngineeringProjectSessionStore();
    const service = new EngineeringProjectSessionService(store, runtime, deliveries);
    const context = { ownerId, companyId } as EngineeringDeliveryContext;
    const opened = await service.create(context, { repositoryId, idempotencyKey: "session-queue-123" });
    const record = store.find(ownerId, companyId, opened.session.id);
    store.saveIfUpdatedAt({ ...record!, activeDeliveryId: activeId, deliveryIds: [activeId], updatedAt: new Date(Date.now() + 1_000).toISOString() }, record!.updatedAt);
    const queued = await service.send(context, opened.session.id, { instruction: "After this, add an analytics page.", idempotencyKey: "queue-message-123" });
    expect(queued.session.queuedRequests[0]).toMatchObject({ status: "QUEUED", instruction: "After this, add an analytics page." });
    const requestId = queued.session.queuedRequests[0]!.id;
    const cancelled = await service.updateQueue(context, opened.session.id, { requestId, action: "CANCEL" });
    expect(cancelled.session.queuedRequests[0]?.status).toBe("CANCELLED");

    const queuedAgain = await service.send(context, opened.session.id, { instruction: "After this, fix footer spacing.", idempotencyKey: "queue-message-456" });
    deliveriesById.set(activeId, { ...deliveriesById.get(activeId)!, status: "DONE" });
    await service.handleDeliveryTerminal(context, activeId);
    const final = await service.view(ownerId, companyId, opened.session.id);
    expect(queuedAgain.session.queuedRequests.at(-1)?.status).toBe("QUEUED");
    expect(final.session.queuedRequests.at(-1)).toMatchObject({ status: "STARTED", deliveryId: nextId });
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("answers bounded status questions from real run state without creating another objective", async () => {
    const ownerId = crypto.randomUUID();
    const companyId = crypto.randomUUID();
    const repositoryId = crypto.randomUUID();
    const runtime = { findRepository: vi.fn().mockResolvedValue({ id: repositoryId, status: "ACTIVE", displayName: "Ocia CRM" }) } as unknown as EngineeringRuntimeStore;
    const create = vi.fn();
    const controlCenter = vi.fn().mockResolvedValue({ delivery: { status: "BLOCKED", modelUsage: [], filesChanged: [] }, activeAgents: [], timeline: [], elapsedMs: 1_000,
      blocker: { message: "The Mac Agent is offline.", action: "Reconnect it." } });
    const deliveries = { create, controlCenter } as unknown as EngineeringDeliveryService;
    const store = new InMemoryEngineeringProjectSessionStore();
    const service = new EngineeringProjectSessionService(store, runtime, deliveries);
    const context = { ownerId, companyId } as EngineeringDeliveryContext;
    const opened = await service.create(context, { repositoryId, idempotencyKey: "session-id-456" });
    const message = { instruction: "Why is this blocked?", idempotencyKey: "status-id-456" };
    const first = await service.send(context, opened.session.id, message);
    const retry = await service.send(context, opened.session.id, message);
    expect(first.session.messages).toHaveLength(2);
    expect(retry.session.messages).toHaveLength(2);
    expect(first.session.messages[1]?.text).toContain("No engineering run");
    expect(create).not.toHaveBeenCalled();
    await expect(service.send(context, opened.session.id, { instruction: "npm install recharts", idempotencyKey: "shell-id-456" }))
      .rejects.toThrow("raw shell");
    expect(create).not.toHaveBeenCalled();
    await expect(service.send(context, opened.session.id, { instruction: "Start it", idempotencyKey: "start-id-456" }))
      .rejects.toThrow("no completed engineering run");
    expect(create).not.toHaveBeenCalled();
    await expect(service.send(context, opened.session.id, { instruction: "Undo the last change", idempotencyKey: "undo-id-456" }))
      .rejects.toThrow("No completed project-session modification");
    expect(create).not.toHaveBeenCalled();
  });
  it("retries a failed objective creation with the same message identity", async () => {
    const ownerId = crypto.randomUUID();
    const companyId = crypto.randomUUID();
    const repositoryId = crypto.randomUUID();
    const repository = { id: repositoryId, status: "ACTIVE", displayName: "Ocia CRM" };
    const runtime = { findRepository: vi.fn().mockResolvedValue(repository) } as unknown as EngineeringRuntimeStore;
    const deliveryId = crypto.randomUUID();
    const delivery = { id: deliveryId, status: "PLANNING", sourceRequest: "Add a button", filesChanged: [], updatedAt: new Date().toISOString() };
    const create = vi.fn().mockRejectedValueOnce(new Error("provider unavailable")).mockResolvedValue({ delivery });
    const deliveries = { create, store: { find: vi.fn().mockResolvedValue(delivery) } } as unknown as EngineeringDeliveryService;
    const store = new InMemoryEngineeringProjectSessionStore();
    const service = new EngineeringProjectSessionService(store, runtime, deliveries);
    const context = { ownerId, companyId, requestId: crypto.randomUUID(), ipAddress: "127.0.0.1",
      sessionId: crypto.randomUUID(), networkState: "trusted" } as unknown as EngineeringDeliveryContext;
    const opened = await service.create(context, { repositoryId, idempotencyKey: "session-id-123" });
    const sessionId = opened.session.id;
    const message = { instruction: "Add a button", idempotencyKey: "message-id-123" };
    await expect(service.send(context, sessionId, message)).rejects.toThrow("provider unavailable");
    const pending = await service.view(ownerId, companyId, sessionId);
    expect(pending.session.messages[0]?.state).toBe("QUEUED");
    const resumed = await service.send(context, sessionId, message);
    expect(create).toHaveBeenCalledTimes(2);
    expect(resumed.session.deliveryIds).toEqual([deliveryId]);
    expect(resumed.session.messages.filter((entry) => entry.role === "OWNER")).toHaveLength(1);
    expect(resumed.session.messages.some((entry) => entry.role === "ALEXA" && entry.deliveryId === deliveryId)).toBe(true);
  });

  it("starts a deterministic merged-head revert and rejects ambiguous or dependent targets", async () => {
    const ownerId = crypto.randomUUID();
    const companyId = crypto.randomUUID();
    const repositoryId = crypto.randomUUID();
    const commit = "a".repeat(40);
    const runtime = { findRepository: vi.fn().mockResolvedValue({ id: repositoryId, status: "ACTIVE", displayName: "Ocia CRM" }) } as unknown as EngineeringRuntimeStore;
    const build = async (requests: string[]) => {
      const records = requests.map((sourceRequest) => ({ id: crypto.randomUUID(), repositoryId, status: "DONE", sourceRequest,
        filesChanged: ["src/page.tsx"], integrationRunId: crypto.randomUUID(), updatedAt: new Date().toISOString() }));
      const next = { id: crypto.randomUUID(), repositoryId, status: "PLANNING", sourceRequest: "Governed revert",
        filesChanged: [], integrationRunId: null, updatedAt: new Date().toISOString() };
      const byId = new Map<string, (typeof records)[number] | typeof next>(
        [...records, next].map((record) => [record.id, record]),
      );
      const create = vi.fn().mockResolvedValue({ delivery: next });
      const deliveries = { store: { find: vi.fn((_owner: string, _company: string, id: string) => byId.get(id)) },
        integration: { view: vi.fn().mockResolvedValue({ candidate: { status: "MERGED", mergedHeadCommit: commit } }) },
        create } as unknown as EngineeringDeliveryService;
      const store = new InMemoryEngineeringProjectSessionStore();
      const service = new EngineeringProjectSessionService(store, runtime, deliveries);
      const context = { ownerId, companyId } as EngineeringDeliveryContext;
      const opened = await service.create(context, { repositoryId, idempotencyKey: crypto.randomUUID() });
      const record = store.find(ownerId, companyId, opened.session.id);
      store.saveIfUpdatedAt({ ...record!, deliveryIds: records.map((item) => item.id), updatedAt: new Date(Date.now() + 1_000).toISOString() }, record!.updatedAt);
      return { service, create, context, sessionId: opened.session.id };
    };
    const exact = await build(["Add a collapsible sidebar"]);
    const reverted = await exact.service.send(exact.context, exact.sessionId,
      { instruction: "Undo the last change", idempotencyKey: "revert-exact-123" });
    expect(reverted.session.activeDeliveryId).toBeTruthy();
    const createInput = exact.create.mock.calls[0]?.[1] as unknown as { request: string };
    expect(createInput.request).toContain(`Governed revert commit ${commit}`);
    const ambiguous = await build(["Add sidebar collapse", "Fix sidebar spacing"]);
    await expect(ambiguous.service.send(ambiguous.context, ambiguous.sessionId,
      { instruction: "Undo the sidebar change", idempotencyKey: "revert-ambiguous-123" }))
      .rejects.toThrow("ambiguous");
    const dependent = await build(["Add sidebar collapse", "Build pricing page"]);
    await expect(dependent.service.send(dependent.context, dependent.sessionId,
      { instruction: "Undo the sidebar change", idempotencyKey: "revert-dependent-123" }))
      .rejects.toThrow("later dependent");
  });
});

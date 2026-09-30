/* eslint-disable @typescript-eslint/await-thenable */
import { describe, expect, it } from "vitest";

import { InMemoryExecutionStore } from "./store.js";
import type { ReadOnlyExecutionRequest } from "@alexa-control/shared";

const request = (): ReadOnlyExecutionRequest => {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    ownerId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    actionId: crypto.randomUUID(),
    policyEvaluationId: crypto.randomUUID(),
    toolName: "git.status",
    workspaceId: "workspace",
    arguments: { workspaceId: "workspace" },
    workspaceRootPath: "/Users/test/workspace",
    blockedPatterns: [".env"],
    actionDigest: "a".repeat(64),
    status: "PENDING",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    claimedAt: null,
    startedAt: null,
    completedAt: null,
    cancellationRequestedAt: null,
    failureCode: null,
    attemptCount: 0,
  };
};

describe("InMemoryExecutionStore", () => {
  it("keeps claim short, extends only started work, and expires a lost heartbeat", async () => {
    const store = new InMemoryExecutionStore();
    const item = request();
    const at = new Date(item.createdAt).getTime();
    await store.create(item);
    const claimAt = new Date(at + 1_000).toISOString();
    expect(await store.transition(item.id, item.deviceId, ["PENDING"], "CLAIMED", claimAt))
      .toMatchObject({ expiresAt: item.expiresAt });
    const startAt = new Date(at + 2_000).toISOString();
    const started = await store.startWithDeadline(item.id, item.deviceId, startAt, 240);
    expect(started).toMatchObject({ status: "RUNNING", startedAt: startAt,
      expiresAt: new Date(at + 242_000).toISOString() });
    expect(await store.heartbeat(item.id, item.deviceId, new Date(at + 20_000).toISOString()))
      .toBe(true);
    expect((await store.cleanupExpired(new Date(at + 51_000).toISOString())).expiredRequests)
      .toBe(1);
    expect(await store.find(item.id)).toMatchObject({ status: "EXPIRED",
      failureCode: "AGENT_HEARTBEAT_LOST" });
    const late = request();
    late.expiresAt = new Date(at - 1_000).toISOString();
    await store.create(late);
    expect(await store.transition(late.id, late.deviceId, ["PENDING"], "CLAIMED", claimAt))
      .toBeUndefined();
  });
  it("scopes, clones, and atomically transitions requests", async () => {
    const store = new InMemoryExecutionStore();
    const item = request();
    await store.create(item);
    item.status = "FAILED";
    expect((await store.find(item.id))?.status).toBe("PENDING");
    expect(await store.findByActionId(item.ownerId, item.actionId)).toMatchObject({
      id: item.id,
      status: "PENDING",
    });
    expect(
      await store.findByActionId(crypto.randomUUID(), item.actionId),
    ).toBeUndefined();
    expect(await store.list(crypto.randomUUID(), 10)).toEqual([]);
    expect(
      await store.transition(
        item.id,
        item.deviceId,
        ["PENDING"],
        "CLAIMED",
        new Date().toISOString(),
      ),
    ).toMatchObject({ status: "CLAIMED", attemptCount: 1 });
    expect(
      await store.transition(
        item.id,
        item.deviceId,
        ["PENDING"],
        "CLAIMED",
        new Date().toISOString(),
      ),
    ).toBeUndefined();
    expect(
      await store.transition(
        item.id,
        item.deviceId,
        ["CLAIMED"],
        "RUNNING",
        new Date().toISOString(),
      ),
    ).toMatchObject({ status: "RUNNING" });
  });

  it("cancels active work and preserves terminal immutability", async () => {
    const store = new InMemoryExecutionStore();
    const item = request();
    await store.create(item);
    expect(
      await store.cancel(item.id, item.ownerId, new Date().toISOString()),
    ).toMatchObject({
      status: "CANCELLED",
    });
    expect(
      await store.cancel(item.id, item.ownerId, new Date().toISOString()),
    ).toBeUndefined();
    expect(
      await store.transition(
        item.id,
        item.deviceId,
        ["PENDING"],
        "RUNNING",
        new Date().toISOString(),
      ),
    ).toBeUndefined();
  });

  it("finds only active requests for the owner and engineering workspace", async () => {
    const store = new InMemoryExecutionStore();
    const active = request();
    active.arguments = { engineeringWorkspaceId: "engineering-one" };
    const otherWorkspace = { ...request(), ownerId: active.ownerId,
      arguments: { engineeringWorkspaceId: "engineering-two" } };
    const otherOwner = { ...request(), arguments: { engineeringWorkspaceId: "engineering-one" } };
    const terminal = { ...request(), ownerId: active.ownerId,
      status: "EXPIRED" as const, arguments: { engineeringWorkspaceId: "engineering-one" } };
    for (const item of [active, otherWorkspace, otherOwner, terminal]) await store.create(item);
    expect((await store.listActiveForEngineeringWorkspace(active.ownerId, "engineering-one"))
      .map((item) => item.id)).toEqual([active.id]);
  });

  it("tracks heartbeats, cancellation delivery, result expiry, and cleanup", async () => {
    const store = new InMemoryExecutionStore();
    const item = request();
    await store.create(item);
    const claimed = await store.transition(
      item.id,
      item.deviceId,
      ["PENDING"],
      "CLAIMED",
      new Date().toISOString(),
    );
    expect(claimed).toBeDefined();
    const heartbeatAt = new Date().toISOString();
    expect(await store.heartbeat(item.id, item.deviceId, heartbeatAt)).toBe(true);
    expect((await store.find(item.id))?.agentLastHeartbeatAt).toBe(heartbeatAt);
    const cancelled = await store.cancel(
      item.id,
      item.ownerId,
      new Date(Date.now() + 1).toISOString(),
    );
    expect(cancelled).toBeDefined();
    expect(
      await store.cancellationsForDevice(item.deviceId, item.createdAt, 10),
    ).toEqual([
      {
        executionRequestId: item.id,
        cancelledAt: cancelled!.cancellationRequestedAt,
      },
    ]);
    const expired = request();
    expired.expiresAt = new Date(Date.now() - 1).toISOString();
    await store.create(expired);
    expect((await store.cleanupExpired(new Date().toISOString())).expiredRequests).toBe(
      1,
    );
  });

  it("commits a terminal request only with its exact signed result", async () => {
    const store = new InMemoryExecutionStore();
    const item = request();
    await store.create(item);
    await store.transition(item.id, item.deviceId, ["PENDING"], "RUNNING", item.createdAt);
    const result = {
      commandId: crypto.randomUUID(),
      executionRequestId: item.id,
      deviceId: item.deviceId,
      toolName: "git.status" as const,
      status: "FAILED" as const,
      failureCode: "TEST_FAILURE",
      startedAt: item.createdAt,
      completedAt: new Date().toISOString(),
      durationMs: 1,
      truncated: false,
      resultDigest: "a".repeat(64),
      nonce: crypto.randomUUID(),
      deviceSignature: "b".repeat(64),
    };
    const retention = new Date(Date.now() + 60_000).toISOString();
    expect(await store.completeWithResult(crypto.randomUUID(), result, retention))
      .toBeUndefined();
    expect((await store.find(item.id))?.status).toBe("RUNNING");
    expect(await store.getResult(item.id)).toBeUndefined();
    expect(await store.completeWithResult(item.ownerId, result, retention))
      .toMatchObject({ status: "FAILED", failureCode: "TEST_FAILURE" });
    expect(await store.getResult(item.id)).toMatchObject({ commandId: result.commandId });
    expect(await store.completeWithResult(item.ownerId, result, retention))
      .toBeUndefined();
  });
});

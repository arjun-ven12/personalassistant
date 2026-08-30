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
});

import {
  ReadOnlyExecutionRequestSchema,
  ReadOnlyExecutionResultSchema,
  type ReadOnlyExecutionRequest,
  type ReadOnlyExecutionResult,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface ExecutionStore {
  create(request: ReadOnlyExecutionRequest): Awaitable<void>;
  find(id: string): Awaitable<ReadOnlyExecutionRequest | undefined>;
  findByActionId(
    ownerId: string,
    actionId: string,
  ): Awaitable<ReadOnlyExecutionRequest | undefined>;
  list(ownerId: string, limit: number): Awaitable<ReadOnlyExecutionRequest[]>;
  listActiveForEngineeringWorkspace(
    ownerId: string,
    engineeringWorkspaceId: string,
  ): Awaitable<ReadOnlyExecutionRequest[]>;
  poll(deviceId: string, now: string): Awaitable<ReadOnlyExecutionRequest | undefined>;
  transition(
    id: string,
    deviceId: string,
    from: ReadOnlyExecutionRequest["status"][],
    to: ReadOnlyExecutionRequest["status"],
    at: string,
    failureCode?: string,
  ): Awaitable<ReadOnlyExecutionRequest | undefined>;
  startWithDeadline(
    id: string,
    deviceId: string,
    at: string,
    runningTtlSeconds: number,
  ): Awaitable<ReadOnlyExecutionRequest | undefined>;
  cancel(
    id: string,
    ownerId: string,
    at: string,
  ): Awaitable<ReadOnlyExecutionRequest | undefined>;
  saveResult(
    ownerId: string,
    result: ReadOnlyExecutionResult,
    retentionExpiresAt: string,
  ): Awaitable<boolean>;
  /** Atomically persist the signed receipt and terminal request state. */
  completeWithResult(
    ownerId: string,
    result: ReadOnlyExecutionResult,
    retentionExpiresAt: string,
  ): Awaitable<ReadOnlyExecutionRequest | undefined>;
  getResult(id: string): Awaitable<ReadOnlyExecutionResult | undefined>;
  cancelForDevice(deviceId: string, at: string): Awaitable<number>;
  cancelAll(at: string): Awaitable<number>;
  heartbeat(id: string, deviceId: string, at: string): Awaitable<boolean>;
  cancellationsForDevice(
    deviceId: string,
    since: string,
    limit: number,
  ): Awaitable<Array<{ executionRequestId: string; cancelledAt: string }>>;
  getResultExpiry(id: string): Awaitable<string | undefined>;
  cleanupExpired(now: string): Awaitable<{
    expiredRequests: number;
    expiredResults: number;
  }>;
}

export class InMemoryExecutionStore implements ExecutionStore {
  readonly #requests = new Map<string, ReadOnlyExecutionRequest>();
  readonly #results = new Map<string, ReadOnlyExecutionResult>();
  readonly #resultExpiries = new Map<string, string>();

  create(request: ReadOnlyExecutionRequest) {
    if (this.#requests.has(request.id)) throw new Error("Duplicate execution request.");
    this.#requests.set(
      request.id,
      structuredClone(ReadOnlyExecutionRequestSchema.parse(request)),
    );
  }

  find(id: string) {
    const value = this.#requests.get(id);
    return value ? structuredClone(value) : undefined;
  }

  findByActionId(ownerId: string, actionId: string) {
    const value = [...this.#requests.values()].find(
      (item) => item.ownerId === ownerId && item.actionId === actionId,
    );
    return value ? structuredClone(value) : undefined;
  }

  list(ownerId: string, limit: number) {
    return [...this.#requests.values()]
      .filter((item) => item.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }

  listActiveForEngineeringWorkspace(ownerId: string, engineeringWorkspaceId: string) {
    return [...this.#requests.values()]
      .filter((item) => item.ownerId === ownerId &&
        ["PENDING", "CLAIMED", "RUNNING"].includes(item.status) &&
        (item.arguments as { engineeringWorkspaceId?: unknown }).engineeringWorkspaceId === engineeringWorkspaceId)
      .map((item) => structuredClone(item));
  }

  poll(deviceId: string, now: string) {
    const request = [...this.#requests.values()]
      .filter((item) => item.deviceId === deviceId && item.status === "PENDING")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!request) return undefined;
    if (request.expiresAt <= now) {
      request.status = "EXPIRED";
      request.completedAt = now;
      request.failureCode = "EXECUTION_REQUEST_EXPIRED";
      return undefined;
    }
    return structuredClone(request);
  }

  transition(
    id: string,
    deviceId: string,
    from: ReadOnlyExecutionRequest["status"][],
    to: ReadOnlyExecutionRequest["status"],
    at: string,
    failureCode?: string,
  ) {
    const request = this.#requests.get(id);
    if (!request || request.deviceId !== deviceId || !from.includes(request.status))
      return undefined;
    if ((to === "CLAIMED" || to === "RUNNING") && request.expiresAt <= at)
      return undefined;
    request.status = to;
    if (to === "CLAIMED") {
      request.claimedAt = at;
      request.attemptCount += 1;
    }
    if (to === "RUNNING") request.startedAt = at;
    if (
      ["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "EXPIRED", "REJECTED"].includes(
        to,
      )
    )
      request.completedAt = at;
    request.failureCode = failureCode ?? null;
    return structuredClone(request);
  }

  startWithDeadline(id: string, deviceId: string, at: string, runningTtlSeconds: number) {
    if (!Number.isSafeInteger(runningTtlSeconds) || runningTtlSeconds < 1 ||
        runningTtlSeconds > 35 * 60) return undefined;
    const request = this.#requests.get(id);
    if (!request || request.deviceId !== deviceId || request.status !== "CLAIMED" ||
        request.expiresAt <= at) return undefined;
    request.status = "RUNNING";
    request.startedAt = at;
    request.agentLastHeartbeatAt = at;
    request.expiresAt = new Date(new Date(at).getTime() + runningTtlSeconds * 1_000).toISOString();
    return structuredClone(request);
  }

  cancel(id: string, ownerId: string, at: string) {
    const request = this.#requests.get(id);
    if (
      !request ||
      request.ownerId !== ownerId ||
      !["PENDING", "CLAIMED", "RUNNING"].includes(request.status)
    )
      return undefined;
    request.cancellationRequestedAt = at;
    request.status = "CANCELLED";
    request.completedAt = at;
    request.failureCode = "CAPABILITY_CANCELLED";
    return structuredClone(request);
  }

  saveResult(
    ownerId: string,
    result: ReadOnlyExecutionResult,
    retentionExpiresAt: string,
  ) {
    if (this.#results.has(result.executionRequestId)) return false;
    const request = this.#requests.get(result.executionRequestId);
    if (!request || request.ownerId !== ownerId) return false;
    this.#results.set(
      result.executionRequestId,
      structuredClone(ReadOnlyExecutionResultSchema.parse(result)),
    );
    this.#resultExpiries.set(result.executionRequestId, retentionExpiresAt);
    return true;
  }

  completeWithResult(
    ownerId: string,
    result: ReadOnlyExecutionResult,
    retentionExpiresAt: string,
  ) {
    const request = this.#requests.get(result.executionRequestId);
    if (!request || request.ownerId !== ownerId || request.deviceId !== result.deviceId ||
        this.#results.has(result.executionRequestId)) return undefined;
    if (request.status === "CANCELLED") {
      if (result.status !== "CANCELLED") return undefined;
    } else if (!["RUNNING", "CLAIMED"].includes(request.status)) {
      return undefined;
    }
    const parsed = ReadOnlyExecutionResultSchema.parse(result);
    if (request.status !== "CANCELLED") {
      request.status = parsed.status;
      request.completedAt = parsed.completedAt;
      request.failureCode = parsed.failureCode ?? null;
    }
    this.#results.set(request.id, structuredClone(parsed));
    this.#resultExpiries.set(request.id, retentionExpiresAt);
    return structuredClone(request);
  }

  getResult(id: string) {
    const value = this.#results.get(id);
    return value ? structuredClone(value) : undefined;
  }

  cancelForDevice(deviceId: string, at: string) {
    let count = 0;
    for (const request of this.#requests.values()) {
      if (
        request.deviceId === deviceId &&
        ["PENDING", "CLAIMED", "RUNNING"].includes(request.status)
      ) {
        request.status = "CANCELLED";
        request.completedAt = at;
        request.cancellationRequestedAt = at;
        request.failureCode = "TRUSTED_DEVICE_REQUIRED";
        count += 1;
      }
    }
    return count;
  }

  cancelAll(at: string) {
    let count = 0;
    for (const request of this.#requests.values()) {
      if (["PENDING", "CLAIMED", "RUNNING"].includes(request.status)) {
        request.status = "CANCELLED";
        request.completedAt = at;
        request.cancellationRequestedAt = at;
        request.failureCode = "EMERGENCY_STOP_ACTIVE";
        count += 1;
      }
    }
    return count;
  }

  heartbeat(id: string, deviceId: string, at: string) {
    const request = this.#requests.get(id);
    if (!request || request.deviceId !== deviceId || request.expiresAt <= at) return false;
    if (!["CLAIMED", "RUNNING"].includes(request.status)) return false;
    request.agentLastHeartbeatAt = at;
    return true;
  }

  cancellationsForDevice(deviceId: string, since: string, limit: number) {
    return [...this.#requests.values()]
      .filter(
        (item) =>
          item.deviceId === deviceId &&
          item.status === "CANCELLED" &&
          item.cancellationRequestedAt !== null &&
          item.cancellationRequestedAt > since,
      )
      .sort((a, b) =>
        (b.cancellationRequestedAt ?? "").localeCompare(
          a.cancellationRequestedAt ?? "",
        ),
      )
      .slice(0, limit)
      .map((item) => ({
        executionRequestId: item.id,
        cancelledAt: item.cancellationRequestedAt!,
      }));
  }

  getResultExpiry(id: string) {
    return this.#resultExpiries.get(id);
  }

  cleanupExpired(now: string) {
    let expiredRequests = 0;
    let expiredResults = 0;
    for (const request of this.#requests.values()) {
      const heartbeatLost = request.status === "RUNNING" &&
        new Date(request.agentLastHeartbeatAt ?? request.startedAt ?? request.createdAt).getTime() <=
          new Date(now).getTime() - 30_000;
      if (
        ["PENDING", "CLAIMED", "RUNNING"].includes(request.status) &&
        (request.expiresAt <= now || heartbeatLost)
      ) {
        request.status = "EXPIRED";
        request.completedAt = now;
        request.failureCode = heartbeatLost ? "AGENT_HEARTBEAT_LOST" : "EXECUTION_REQUEST_EXPIRED";
        expiredRequests += 1;
      }
    }
    for (const [id, expiresAt] of this.#resultExpiries.entries()) {
      if (expiresAt <= now) {
        this.#results.delete(id);
        this.#resultExpiries.delete(id);
        expiredResults += 1;
      }
    }
    return { expiredRequests, expiredResults };
  }
}

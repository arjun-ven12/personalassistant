import type { Pool } from "pg";
import type { ReadOnlyExecutionRequest, ReadOnlyExecutionResult } from "@alexa-control/shared";
import { describe, expect, it, vi } from "vitest";

import { PostgresExecutionStore } from "./postgres-store.js";

describe("PostgresExecutionStore", () => {
  it("atomically starts only an unexpired claim with a bounded running deadline", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const store = new PostgresExecutionStore({ query } as unknown as Pool);
    await store.startWithDeadline("request-id", "device-id", "2026-09-25T00:00:00.000Z", 240);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status='CLAIMED' AND expires_at>$3::text::timestamptz"),
      ["request-id", "device-id", "2026-09-25T00:00:00.000Z", "2026-09-25T00:04:00.000Z"],
    );
  });

  it("queries only active requests bound to the owner and engineering workspace", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = new PostgresExecutionStore({ query } as unknown as Pool);
    await store.listActiveForEngineeringWorkspace("owner-id", "workspace-id");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("record->'arguments'->>'engineeringWorkspaceId'=$3"),
      ["owner-id", ["PENDING", "CLAIMED", "RUNNING"], "workspace-id"],
    );
  });

  it("keeps ISO timestamps in terminal request JSON while casting database columns", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const store = new PostgresExecutionStore({ query } as unknown as Pool);
    const at = "2026-09-25T00:00:00.000Z";
    await store.poll("device-id", at);
    await store.cancelForDevice("device-id", at);
    await store.cleanupExpired(at);
    for (const [sql] of query.mock.calls) {
      if (!String(sql).startsWith("UPDATE execution_requests")) continue;
      expect(sql).toContain("::text::timestamptz");
      expect(sql).toContain("::text");
    }
  });

  it("uses one PostgreSQL parameter type when cancelling a timed-out execution", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const store = new PostgresExecutionStore({ query } as unknown as Pool);

    await store.cancel("request-id", "owner-id", "2026-09-25T00:00:00.000Z");

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("completed_at=$3::text::timestamptz"),
      ["request-id", "owner-id", "2026-09-25T00:00:00.000Z", ["PENDING", "CLAIMED", "RUNNING"]],
    );
  });

  it("rolls back the terminal transition if receipt persistence fails", async () => {
    const at = "2026-09-25T00:00:00.000Z";
    const request: ReadOnlyExecutionRequest = {
      id: crypto.randomUUID(), ownerId: crypto.randomUUID(), deviceId: crypto.randomUUID(),
      actionId: crypto.randomUUID(), policyEvaluationId: crypto.randomUUID(),
      toolName: "git.status", workspaceId: "workspace", arguments: { workspaceId: "workspace" },
      workspaceRootPath: "/Users/test/workspace", blockedPatterns: [".env"],
      actionDigest: "a".repeat(64), status: "RUNNING", createdAt: at,
      expiresAt: "2026-09-25T00:02:00.000Z", claimedAt: at, startedAt: at,
      completedAt: null, cancellationRequestedAt: null, failureCode: null,
      attemptCount: 1,
    };
    const result: ReadOnlyExecutionResult = {
      commandId: crypto.randomUUID(), executionRequestId: request.id,
      deviceId: request.deviceId, toolName: "git.status", status: "FAILED",
      failureCode: "TEST_FAILURE", startedAt: at, completedAt: at,
      durationMs: 1, truncated: false, resultDigest: "b".repeat(64),
      nonce: crypto.randomUUID(), deviceSignature: "c".repeat(64),
    };
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.startsWith("SELECT record")) return Promise.resolve({ rows: [{ record: request }] });
      if (sql.startsWith("INSERT INTO execution_results"))
        return Promise.reject(new Error("receipt write failed"));
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const release = vi.fn();
    const store = new PostgresExecutionStore({ connect: vi.fn().mockResolvedValue({ query, release }) } as unknown as Pool);
    await expect(store.completeWithResult(request.ownerId, result, at))
      .rejects.toThrow("receipt write failed");
    expect(query.mock.calls.map(([sql]) => String(sql).split(" ")[0]))
      .toEqual(["BEGIN", "SELECT", "INSERT", "ROLLBACK"]);
    expect(release).toHaveBeenCalledOnce();
  });
});

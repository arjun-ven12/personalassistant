import { describe, expect, it } from "vitest";

import {
  CreateExecutionRequestSchema,
  GitDiffInputSchema,
  ReadOnlyExecutionRequestSchema,
  ReadOnlyExecutionResultSchema,
  WorkspaceReadFileInputSchema,
} from "./execution.js";

describe("Phase 3.1 execution contracts", () => {
  it("accepts only fixed tools and strict arguments", () => {
    expect(
      CreateExecutionRequestSchema.safeParse({
        toolName: "git.diff",
        arguments: { workspaceId: "project", mode: "staged_name_status" },
      }).success,
    ).toBe(true);
    expect(
      CreateExecutionRequestSchema.safeParse({
        toolName: "shell.execute",
        arguments: { workspaceId: "project", command: "whoami" },
      }).success,
    ).toBe(false);
    expect(
      GitDiffInputSchema.safeParse({
        workspaceId: "project",
        mode: "unstaged_summary",
        revision: "HEAD~1",
      }).success,
    ).toBe(false);
  });

  it.each([
    "/etc/passwd",
    "../secret",
    "nested/../secret",
    "nested//file",
    "nested/./file",
    "file\0name",
    "*.ts",
  ])("rejects unsafe relative path %s", (relativePath) => {
    expect(
      WorkspaceReadFileInputSchema.safeParse({
        workspaceId: "project",
        relativePath,
      }).success,
    ).toBe(false);
  });

  it("validates request states and result signatures", () => {
    const now = new Date();
    const request = {
      id: crypto.randomUUID(),
      ownerId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      actionId: crypto.randomUUID(),
      policyEvaluationId: crypto.randomUUID(),
      toolName: "git.current_branch",
      workspaceId: "project",
      arguments: { workspaceId: "project" },
      workspaceRootPath: "/Users/test/project",
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
    expect(ReadOnlyExecutionRequestSchema.safeParse(request).success).toBe(true);
    expect(
      ReadOnlyExecutionRequestSchema.safeParse({ ...request, status: "UNKNOWN" })
        .success,
    ).toBe(false);
    expect(
      ReadOnlyExecutionResultSchema.safeParse({
        commandId: crypto.randomUUID(),
        executionRequestId: request.id,
        deviceId: request.deviceId,
        toolName: request.toolName,
        status: "SUCCEEDED",
        result: {
          workspaceId: "project",
          branchName: "main",
          detached: false,
          durationMs: 1,
        },
        startedAt: now.toISOString(),
        completedAt: now.toISOString(),
        durationMs: 1,
        truncated: false,
        resultDigest: "b".repeat(64),
        nonce: "nonce-value-123456",
        deviceSignature: "c".repeat(64),
      }).success,
    ).toBe(true);
  });
});

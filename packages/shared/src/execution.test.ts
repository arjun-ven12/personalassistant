import { describe, expect, it } from "vitest";

import {
  CreateExecutionRequestSchema,
  GitDiffInputSchema,
  ReadOnlyExecutionRequestSchema,
  ReadOnlyExecutionResultSchema,
  WorkspaceReadFileInputSchema,
} from "./execution.js";
import { ValidationExecutionResultSchema } from "./validation.js";

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

  it("accepts a bounded long-running signed result without extending execution authority", () => {
    const startedAt = new Date("2026-09-28T00:00:00.000Z");
    const receipt = {
      commandId: crypto.randomUUID(),
      executionRequestId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      toolName: "engineering.repository_capability",
      status: "FAILED",
      failureCode: "COMMAND_SANDBOX_UNAVAILABLE",
      startedAt: startedAt.toISOString(),
      completedAt: new Date(startedAt.getTime() + 9 * 60_000).toISOString(),
      durationMs: 9 * 60_000,
      truncated: false,
      resultDigest: "b".repeat(64),
      nonce: "nonce-value-123456",
      deviceSignature: "c".repeat(64),
    };
    expect(ReadOnlyExecutionResultSchema.safeParse(receipt).success).toBe(true);
    expect(ReadOnlyExecutionResultSchema.safeParse({
      ...receipt,
      durationMs: 35 * 60_000 + 1,
    }).success).toBe(false);
  });

  it("accepts the elapsed time of sequential registered validation profiles", () => {
    const report = {
      workspaceId: "project", validationRunId: crypto.randomUUID(),
      status: "PASSED", classification: "PASSED", steps: [], summary: "Passed",
      sandbox: { isolated: true, cleanedUp: true, network: "disabled" },
      metrics: { durationMs: 11 * 60_000, stepCount: 7 },
    };
    expect(ValidationExecutionResultSchema.safeParse(report).success).toBe(true);
    expect(ValidationExecutionResultSchema.safeParse({
      ...report, metrics: { ...report.metrics, durationMs: 25 * 60_000 + 1 },
    }).success).toBe(false);
  });
});

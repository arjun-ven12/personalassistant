import { describe, it, expect, vi } from "vitest";
import {
  AthenaCoderEngineeringBenchmarkHarness,
  athenaCoderEngineeringCases,
  pendingAthenaCoderComparison,
  parseOwnerCodexBenchmark,
} from "./benchmark.js";
import type { EngineeringDeliveryService } from "../engineering-delivery/service.js";
describe("AthenaCoder Engineering benchmark harness", () => {
  it("registers seven routine categories and one deliberate security bypass scenario", () => {
    expect(new Set(athenaCoderEngineeringCases.map((v) => v.category)).size).toBe(8);
    expect(athenaCoderEngineeringCases.at(-1)?.request).toContain("read-only");
  });
  it("starts through canonical delivery with repository ID and idempotency identity", async () => {
    const create = vi.fn().mockResolvedValue({ delivery: { id: "canonical" } });
    const harness = new AthenaCoderEngineeringBenchmarkHarness({
      create,
    } as unknown as EngineeringDeliveryService);
    const repositoryId = crypto.randomUUID();
    const context = {
      ownerId: crypto.randomUUID(),
      companyId: crypto.randomUUID(),
      requestId: "test",
      ipAddress: "test",
      sessionId: crypto.randomUUID(),
      networkState: "PRIVATE_NETWORK" as const,
    };
    await harness.start(context, {
      caseId: "ui-status-card",
      repositoryId,
      idempotencyKey: "fixed-benchmark-identity",
    });
    expect(create).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        repositoryId,
        idempotencyKey: "fixed-benchmark-identity",
      }),
    );
    await expect(
      harness.start(context, {
        caseId: "ui-status-card",
        repositoryId,
        idempotencyKey: "fixed-benchmark-identity",
        gitUrl: "https://arbitrary.example",
      }),
    ).rejects.toThrow();
  });
  it("does not fabricate missing cloud or Codex measurements", () => {
    expect(pendingAthenaCoderComparison()).toEqual({
      status: "PENDING_LIVE_BASELINE",
      athenaCoderCompletionMs: null,
      lunaCompletionMs: null,
      codexCompletionMs: null,
      paidCostSavingsUsd: null,
      completionRatio: null,
    });
    expect(() =>
      parseOwnerCodexBenchmark({ system: "CODEX", source: "RUNTIME" }),
    ).toThrow();
  });
});

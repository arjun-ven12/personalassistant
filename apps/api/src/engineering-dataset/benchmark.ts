import { z } from "zod";
import {
  EngineeringBenchmarkRunSchema,
  benchmarkDurations,
  type EngineeringBenchmarkRun,
} from "@alexa-control/shared";
import type {
  EngineeringDeliveryService,
  EngineeringDeliveryContext,
} from "../engineering-delivery/service.js";

/** Fixed workload catalogue; tasks still run through canonical Engineering. */
export const athenaCoderEngineeringCases = [
  {
    id: "ui-status-card",
    category: "UI",
    request:
      "Add a compact accessible status card using the registered repository's existing UI conventions.",
  },
  {
    id: "crud-endpoint",
    category: "CRUD",
    request:
      "Add a small bounded CRUD endpoint for a non-sensitive fixture resource using the registered repository's existing API validation and tests.",
  },
  {
    id: "small-bugfix",
    category: "BUGFIX",
    request:
      "Fix a reproducible small presentation bug in the registered fixture repository and add a focused regression test.",
  },
  {
    id: "test-creation",
    category: "TESTS",
    request:
      "Add focused tests for an existing non-sensitive component without changing its behavior.",
  },
  {
    id: "small-refactor",
    category: "REFACTOR",
    request:
      "Perform a small behavior-preserving refactor of duplicated presentation logic and validate existing behavior.",
  },
  {
    id: "multi-file",
    category: "MULTI_FILE",
    request:
      "Add a small presentational component and its focused test using existing conventions.",
  },
  {
    id: "repo-conventions",
    category: "CONVENTIONS",
    request:
      "Add a compact documentation example following the registered repository's package manager, file naming and API conventions.",
  },
  {
    id: "phase28-4-portfolio-baseline",
    category: "UI",
    request: "Build me a simple portfolio website.",
  },
  {
    id: "ineligible-security-review",
    category: "ESCALATION",
    request:
      "Inspect authentication and tenant isolation boundaries read-only; report evidence without changing security code. Security-sensitive work must bypass AthenaCoder.",
  },
] as const;
const caseId = z.enum(athenaCoderEngineeringCases.map((v) => v.id));

export class AthenaCoderEngineeringBenchmarkHarness {
  constructor(readonly delivery: EngineeringDeliveryService) {}
  async start(context: EngineeringDeliveryContext, input: unknown) {
    const request = z
      .object({
        caseId,
        repositoryId: z.string().uuid(),
        idempotencyKey: z.string().min(8).max(200),
      })
      .strict()
      .parse(input);
    const scenario = athenaCoderEngineeringCases.find((v) => v.id === request.caseId)!;
    return this.delivery.create(context, {
      request: scenario.request,
      repositoryId: request.repositoryId,
      acceptanceCriteria: [
        "Registered validation and independent review pass.",
        "Preserve existing behavior and protected paths.",
      ],
      constraints: [
        "No deployment, authority changes or broad secrets.",
        "Use only existing finite Engineering capabilities.",
      ],
      idempotencyKey: request.idempotencyKey,
    });
  }
  async observe(ownerId: string, companyId: string, deliveryId: string) {
    const center = await this.delivery.controlCenter(ownerId, companyId, deliveryId);
    const delivery = center.delivery;
    const view = await this.delivery.manager.view(
      ownerId,
      companyId,
      delivery.objectiveId,
    );
    const integration = delivery.integrationRunId
      ? await this.delivery.integration.view(
          ownerId,
          companyId,
          delivery.integrationRunId,
        )
      : null;
    const terminal = ["DONE", "DONE_WITH_WARNINGS", "FAILED", "CANCELLED"].includes(
      delivery.status,
    );
    const success =
      terminal &&
      Boolean(
        integration?.candidate?.status === "READY" ||
        integration?.candidate?.status === "MERGED",
      ) &&
      integration?.reviews.some(
        (v) =>
          v.id === integration.candidate?.reviewReportId &&
          v.headCommit === integration.candidate.headCommit &&
          ["PASS", "PASS_WITH_WARNINGS"].includes(v.verdict),
      );
    // firstCodeAt may be a completed-task proxy in the existing delivery model.
    // Preserve that provenance separately; never label it a measured first patch.
    const run = EngineeringBenchmarkRunSchema.parse({
      schemaVersion: "1",
      taskId: delivery.id,
      taskCategory: "REGISTERED_ENGINEERING_WORKLOAD",
      complexity: delivery.complexity,
      system: "ATHENA",
      route:
        view.objective.engineeringMode === "FAST"
          ? "ENGINEERING_FAST_PATH"
          : "ENGINEERING_FULL_PATH",
      startedAt: delivery.createdAt,
      firstActionAt: null,
      firstPatchAt: null,
      previewAt:
        delivery.preview?.healthStatus === "PASS" ? delivery.firstPreviewAt : null,
      completedAt: terminal ? delivery.completedAt : null,
      modelCalls: null,
      toolCalls: null,
      toolRoundTrips: null,
      managerCalls: view.objective.managerReasoningCount,
      validationRuns: null,
      inputTokens: view.objective.totalInputTokens,
      outputTokens: view.objective.totalOutputTokens,
      apiCostUsd: null,
      retries: view.tasks.reduce((sum, v) => sum + Math.max(0, v.attempt - 1), 0),
      ownerInterventions: null,
      validationPass: integration?.candidate
        ? integration.candidate.validatedHeadCommit === integration.candidate.headCommit
        : null,
      reviewPass: integration?.candidate
        ? integration.candidate.reviewedHeadCommit === integration.candidate.headCommit
        : null,
      finalSuccess: terminal ? Boolean(success) : null,
      source: "RUNTIME",
    });
    return {
      run,
      durations: benchmarkDurations(run),
      models: view.results.map((v) => ({
        taskId: v.taskId,
        provider: v.modelProvider,
        model: v.modelName,
      })),
      recordedEngineeringCostUsd: view.objective.totalCostUsd,
      paidCostEvidence: "NOT_PROVIDER_BILLING_VERIFIED" as const,
      workspaceCostUsd: null,
      firstCodeCompletionProxyAt: delivery.firstCodeAt,
      comparisonStatus: "PENDING_LIVE_BASELINE" as const,
      cloudBaseline: null,
    };
  }
}

/** Codex comparison values can only be supplied by the owner, never generated. */
export const parseOwnerCodexBenchmark = (input: unknown): EngineeringBenchmarkRun => {
  const run = EngineeringBenchmarkRunSchema.parse(input);
  if (run.system !== "CODEX" || run.source !== "OWNER_ENTERED")
    throw new Error("Owner-entered Codex evidence required.");
  return run;
};
export const pendingAthenaCoderComparison = () => ({
  status: "PENDING_LIVE_BASELINE" as const,
  athenaCoderCompletionMs: null,
  lunaCompletionMs: null,
  codexCompletionMs: null,
  paidCostSavingsUsd: null,
  completionRatio: null,
});

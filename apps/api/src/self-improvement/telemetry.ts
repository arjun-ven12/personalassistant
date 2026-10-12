import {
  AIUsageLedgerEntrySchema,
  EngineeringTransportRequestSchema,
  SelfImprovementTelemetrySchema,
  type AIUsageLedgerEntry,
  type ReadOnlyExecutionRequest,
  type EngineeringObjectiveViewSchema,
  type SelfImprovementView,
} from "@alexa-control/shared";
import type { z } from "zod";

type EngineeringObjectiveView = z.infer<typeof EngineeringObjectiveViewSchema>;

const earliest = (values: (string | null | undefined)[]) =>
  values.filter((value): value is string => Boolean(value)).sort()[0] ?? null;
const units = (value: string) => {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0"));
};

/** Read-only projection: exact task/run links, never inferred model activity. */
export function buildEngineeringTelemetry(
  view: Pick<
    SelfImprovementView,
    | "controlCenter"
    | "objectiveId"
    | "deliveryId"
    | "integration"
    | "complexity"
    | "engineeringMode"
  >,
  objective: EngineeringObjectiveView,
  source: {
    ledger: readonly AIUsageLedgerEntry[];
    executions: readonly ReadOnlyExecutionRequest[];
  },
  taskCategory = "ENGINEERING",
) {
  const delivery = view.controlCenter.delivery;
  if (
    objective.objective.id !== view.objectiveId ||
    objective.objective.ownerId !== delivery.ownerId ||
    objective.objective.companyId !== delivery.companyId
  )
    throw new Error("Self-improvement telemetry scope mismatch.");
  const taskIds = new Set(objective.tasks.map((task) => task.id));
  const repairIds = new Set(
    objective.tasks
      .filter((task) => task.repairIntegrationWorkspaceId)
      .map((task) => task.id),
  );
  const workspaces = new Set(
    objective.tasks.flatMap((task) => (task.workspaceId ? [task.workspaceId] : [])),
  );
  if (view.integration?.run.integrationWorkspaceId)
    workspaces.add(view.integration.run.integrationWorkspaceId);
  const ledger = source.ledger
    .map((entry) => AIUsageLedgerEntrySchema.parse(entry))
    .filter(
      (entry) =>
        entry.ownerId === delivery.ownerId &&
        entry.taskId &&
        (taskIds.has(entry.taskId) || entry.taskId === delivery.integrationRunId) &&
        ["SETTLED", "ADJUSTED"].includes(entry.status),
    );
  const executions = source.executions.flatMap((request) => {
    if (
      request.ownerId !== delivery.ownerId ||
      request.toolName !== "engineering.repository_capability"
    )
      return [];
    const parsed = EngineeringTransportRequestSchema.safeParse(request.arguments);
    if (
      !parsed.success ||
      parsed.data.companyId !== delivery.companyId ||
      parsed.data.repositoryId !== delivery.repositoryId ||
      !(
        (parsed.data.taskId && taskIds.has(parsed.data.taskId)) ||
        (parsed.data.engineeringWorkspaceId &&
          workspaces.has(parsed.data.engineeringWorkspaceId))
      )
    )
      return [];
    return [{ request, transport: parsed.data }];
  });
  const toolsByCapability: Record<string, number> = {};
  for (const { transport } of executions)
    toolsByCapability[transport.capability] =
      (toolsByCapability[transport.capability] ?? 0) + 1;
  const modelMap = new Map<
    string,
    { providerId: string; modelId: string; calls: number }
  >();
  const calls = { manager: 0, worker: 0, review: 0, repair: 0 };
  let knownCost = 0n,
    unknownCostCount = 0,
    inputTokens = 0,
    outputTokens = 0;
  for (const entry of ledger) {
    const key = `${entry.providerId}:${entry.modelId}`;
    const model = modelMap.get(key) ?? {
      providerId: entry.providerId,
      modelId: entry.modelId,
      calls: 0,
    };
    model.calls++;
    modelMap.set(key, model);
    if (entry.taskId === delivery.integrationRunId) calls.review++;
    else if (entry.taskId && repairIds.has(entry.taskId)) calls.repair++;
    else calls.worker++;
    if (entry.actualCostUsd === undefined) unknownCostCount++;
    else knownCost += units(entry.actualCostUsd);
    inputTokens += entry.usage.inputTokens ?? 0;
    outputTokens += entry.usage.outputTokens ?? 0;
  }
  const missingUsage =
    objective.results.some(
      (result) =>
        result.modelName !== null &&
        !ledger.some((entry) => entry.taskId === result.taskId),
    ) ||
    Boolean(
      view.integration?.reviews.length &&
      !ledger.some((entry) => entry.taskId === delivery.integrationRunId),
    );
  const missingExecutions =
    executions.length === 0 &&
    objective.results.some((result) => result.filesChanged.length > 0);
  const saturated =
    source.ledger.length >= 100_000 ||
    source.executions.length >= 10_000 ||
    objective.events.length >= 500;
  const complete =
    !missingUsage && !missingExecutions && !saturated && unknownCostCount === 0;
  const knownCostUsd = `${knownCost / 100_000_000n}.${(knownCost % 100_000_000n).toString().padStart(8, "0")}`;
  const firstPatchAt = earliest(
    executions
      .filter(
        ({ request, transport }) =>
          request.status === "SUCCEEDED" &&
          ["repository.file_patch", "repository.file_create"].includes(
            transport.capability,
          ),
      )
      .map(({ request }) => request.completedAt),
  );
  const firstModelCallAt = earliest(ledger.map((entry) => entry.startedAt));
  const ownerEvents = objective.events.filter((event) =>
    ["OWNER_CLARIFICATION_ANSWERED", "OBJECTIVE_PAUSED", "OBJECTIVE_RESUMED"].includes(
      event.type,
    ),
  );
  const candidate = view.integration?.candidate;
  return SelfImprovementTelemetrySchema.parse({
    objectiveId: view.objectiveId,
    deliveryId: view.deliveryId,
    milestones: {
      requestReceivedAt: delivery.createdAt,
      objectiveCreatedAt: objective.objective.createdAt,
      firstTaskAt: earliest(objective.tasks.map((task) => task.createdAt)),
      firstModelCallAt,
      firstPatchAt,
      validatedAt: delivery.validatedAt,
      candidateAt: candidate?.createdAt ?? null,
    },
    agents: [
      ...new Set([
        ...objective.results.map((result) => result.agentId),
        ...(view.integration?.reviews.map((review) => review.reviewerAgentId) ?? []),
      ]),
    ],
    models: [...modelMap.values()],
    calls,
    toolsByCapability,
    knownCostUsd,
    unknownCostCount: unknownCostCount + (missingUsage ? 1 : 0),
    attributionComplete: complete,
    ownerInterventions: ownerEvents.length,
    evidenceWarnings: [
      "Timing begins at persisted request acceptance, not client speech or network submission.",
      "Owner interventions count recorded pause/resume/clarification events; unrecorded human work is unknown.",
      ...(!complete
        ? ["Economic or execution evidence is missing or bounded; totals are partial."]
        : []),
    ],
    benchmark: {
      schemaVersion: "1",
      taskId: delivery.id,
      taskCategory,
      complexity: view.complexity,
      system: "ATHENA",
      route:
        view.engineeringMode === "FAST"
          ? "ENGINEERING_FAST_PATH"
          : "ENGINEERING_FULL_PATH",
      startedAt: delivery.createdAt,
      firstActionAt: earliest(executions.map(({ request }) => request.startedAt)),
      firstPatchAt,
      previewAt: delivery.firstPreviewAt,
      completedAt: delivery.completedAt,
      modelCalls: missingUsage || saturated ? null : ledger.length,
      toolCalls: saturated || missingExecutions ? null : executions.length,
      toolRoundTrips: null,
      managerCalls: 0,
      validationRuns: new Set([
        ...objective.results.flatMap((result) =>
          result.validationReportId ? [result.validationReportId] : [],
        ),
        ...(view.integration?.run.validationReportId
          ? [view.integration.run.validationReportId]
          : []),
        ...(view.integration?.run.baselineValidationReportId
          ? [view.integration.run.baselineValidationReportId]
          : []),
      ]).size,
      inputTokens: missingUsage ? null : inputTokens,
      outputTokens: missingUsage ? null : outputTokens,
      apiCostUsd: complete ? Number(knownCostUsd) : null,
      retries: objective.events.filter((event) => event.type === "TASK_RETRY").length,
      ownerInterventions: ownerEvents.length,
      validationPass: delivery.validatedAt
        ? [
            delivery.validation.lint,
            delivery.validation.typecheck,
            delivery.validation.tests,
            delivery.validation.build,
          ].every((state) => state === "PASS")
        : null,
      reviewPass: candidate
        ? ["PASS", "PASS_WITH_WARNINGS"].includes(delivery.validation.review)
        : null,
      finalSuccess: delivery.completedAt
        ? ["DONE", "DONE_WITH_WARNINGS"].includes(delivery.status)
        : null,
      source: "RUNTIME",
    },
  });
}

export function buildSelfImprovementTelemetry(
  view: SelfImprovementView,
  objective: EngineeringObjectiveView,
  source: {
    ledger: readonly AIUsageLedgerEntry[];
    executions: readonly ReadOnlyExecutionRequest[];
  },
) {
  return buildEngineeringTelemetry(view, objective, source, "SELF_IMPROVEMENT");
}

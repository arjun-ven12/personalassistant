import {
  CloudEngineeringTelemetrySchema,
  EngineeringTransportRequestSchema,
  type CloudWorkspaceRecord,
} from "@alexa-control/shared";
import type { ApiRouteContext } from "../routes/context.js";
import { buildEngineeringTelemetry } from "../self-improvement/telemetry.js";
/** Joins canonical persisted run evidence; missing milestones and provider costs stay unknown. */
export async function readCloudEngineeringTelemetry(
  context: ApiRouteContext,
  workspace: CloudWorkspaceRecord,
  deliveryId: string,
) {
  const { ownerId, companyId } = workspace;
  const controlCenter = await context.engineeringDelivery.controlCenter(
    ownerId,
    companyId,
    deliveryId,
  );
  const delivery = controlCenter.delivery;
  if (delivery.repositoryId !== workspace.repositoryId)
    throw Error("Cloud benchmark repository scope denied.");
  const [objective, integration, ledger, executions] = await Promise.all([
    context.engineeringManager.view(ownerId, companyId, delivery.objectiveId),
    delivery.integrationRunId
      ? context.engineeringIntegration.view(
          ownerId,
          companyId,
          delivery.integrationRunId,
        )
      : null,
    context.aiEconomics.listLedger(ownerId, 100_000),
    context.executionStore.list(ownerId, 10_000),
  ]);
  const evidence = buildEngineeringTelemetry(
    {
      controlCenter,
      objectiveId: delivery.objectiveId,
      deliveryId,
      integration,
      complexity: delivery.complexity,
      engineeringMode: objective.objective.engineeringMode,
    },
    objective,
    { ledger, executions },
    "MOBILE_CLOUD_ENGINEERING",
  );
  const taskIds = new Set(objective.tasks.map((v) => v.id));
  const tools = executions.flatMap((request) => {
    const t = EngineeringTransportRequestSchema.safeParse(request.arguments);
    return request.ownerId === ownerId &&
      request.toolName === "engineering.repository_capability" &&
      t.success &&
      t.data.companyId === companyId &&
      t.data.repositoryId === workspace.repositoryId &&
      t.data.taskId &&
      taskIds.has(t.data.taskId)
      ? [{ request, transport: t.data }]
      : [];
  });
  const first = (capability: string) =>
    tools
      .filter(
        (v) =>
          v.transport.capability === capability && v.request.status === "SUCCEEDED",
      )
      .map((v) => v.request.completedAt)
      .filter((v): v is string => Boolean(v))
      .sort()[0] ?? null;
  return CloudEngineeringTelemetrySchema.parse({
    ...evidence,
    cloud: {
      workspaceId: workspace.id,
      provider: workspace.provider,
      state: workspace.state,
      limits: workspace.limits,
      usage: workspace.usage,
      milestones: {
        ...workspace.milestones,
        REQUEST_ACCEPTED: delivery.createdAt,
        OBJECTIVE_CREATED: objective.objective.createdAt,
        TASK_READY: evidence.milestones.firstTaskAt,
        FIRST_MODEL_CALL: evidence.milestones.firstModelCallAt,
        FIRST_PATCH: evidence.milestones.firstPatchAt,
        DEPENDENCIES_READY: first("repository.dependencies_install"),
        FIRST_VALIDATION: first("repository.validate"),
        FIRST_PREVIEW: delivery.firstPreviewAt,
        FINAL_VALIDATION: delivery.validatedAt,
        REVIEW_COMPLETE:
          integration?.reviews
            .map((v) => v.createdAt)
            .sort()
            .at(-1) ?? null,
        CANDIDATE_READY: integration?.candidate?.createdAt ?? null,
      },
    },
  });
}

import type { FastifyInstance } from "fastify";
import { AthenaCoderRuntimeMetadataSchema, DistillationModelActionSchema, DistillationRecordSchema, DistillationStartSchema, type DistillationBase } from "@alexa-control/shared";
import { z } from "zod";
import { ApiSecurityError } from "../identity/errors.js";
import type { ApiRouteContext } from "./context.js";
import { installCompanyRouteGuard } from "./company-guard.js";
import { AthenaDistillationService, type ReviewedTrainer, type ReviewedEvaluator, type ReviewedVersionRuntime } from "../ai/distillation/service.js";
import { InMemoryDistillationStore, PostgresDistillationStore } from "../ai/distillation/store.js";
import { verifiedDatasetSource } from "../ai/distillation/source.js";
import { RoutingEvidenceService } from "../ai/distillation/routing-evidence.js";
import type { PostgresDatabase } from "../persistence/database.js";
import { ExistingAthenaCoderVersionRuntime } from "../ai/distillation/runtime.js";

/** Only composition-root code supplies reviewed dependencies; HTTP never registers one. */
export interface DistillationDependencies {
  bases: readonly DistillationBase[];
  trainer?: ReviewedTrainer;
  evaluator?: ReviewedEvaluator;
  runtime?: ReviewedVersionRuntime;
}
export function registerAthenaDistillationRoutes(app: FastifyInstance, context: ApiRouteContext, database?: PostgresDatabase, dependencies?: DistillationDependencies) {
  const prefix = "/api/athena-distillation";
  installCompanyRouteGuard(app, prefix, context);
  app.addHook("onError", async request => {
    if (!request.routeOptions.url?.startsWith(prefix)) return;
    let ownerId: string;
    try { ownerId = context.security.getIdentity(request).user.id; } catch { return; }
    await context.governanceAudit({ eventType: "ENGINEERING_DATASET_UPDATED", ownerId,
      outcome: "DENIED", reason: "Distillation request rejected; no model authorization granted.",
      requestId: request.id, ipAddress: request.ip,
      metadata: { method: request.method, route: request.routeOptions.url } });
  });
  const service = new AthenaDistillationService(database ? new PostgresDistillationStore(database.pool, database.transaction) : new InMemoryDistillationStore(),
    verifiedDatasetSource(context.engineeringDataset), context.governanceAudit, async () => await context.emergencyStopActive(),
    dependencies?.bases ?? [], dependencies?.trainer, dependencies?.evaluator,
    dependencies?.runtime ?? new ExistingAthenaCoderVersionRuntime(context.aiRuntime, context.athenaCoderControl));
  context.athenaCoderControl.setVersionAuthority(async (ownerId, modelId, requireActive) => {
    const model = context.aiRuntime.models.get("athena_coder", modelId);
    const parsed = AthenaCoderRuntimeMetadataSchema.safeParse(model.metadata);
    const binding = parsed.success ? parsed.data.distillation : undefined;
    if (!binding || binding.ownerId !== ownerId || typeof binding.companyId !== "string" || typeof binding.runId !== "string") return false;
    const record = await service.get({ ownerId, companyId: binding.companyId }, binding.runId);
    return service.authorizeVersion(record, requireActive);
  });
  const evidence = new RoutingEvidenceService(context.engineeringOrchestrationStore, context.engineeringDataset.runtime);
  const read = [context.security.requireAuthentication, context.companyContext.requireCompany];
  const mutate = [...read, context.security.requireTrustedOrigin, context.security.requireCsrf, context.security.verifyTransportNetwork];
  const scope = (request: Parameters<typeof context.companyContext.get>[0]) => {
    const company = context.companyContext.get(request);
    if (context.security.getIdentity(request).user.id !== company.ownerId) throw new ApiSecurityError(403, "OWNER_REQUIRED", "Model owner required.");
    return { ownerId: company.ownerId, companyId: company.companyId, requestId: request.id, ipAddress: request.ip };
  };
  app.get(prefix, { preHandler: read }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const models = (await service.list(scope(request))).map(v => DistillationRecordSchema.parse(v));
    return { trainingStatus: models.length ? models[0]!.state : "PENDING_REAL_DATASET", liveAcceptance: "NOT_VERIFIED", models };
  });
  app.get(`${prefix}/routing-evidence`, { preHandler: read }, async request => evidence.read(scope(request)));
  app.get(`${prefix}/compare`, { preHandler: read }, async request => service.compare(scope(request)));
  app.get(`${prefix}/:runId/lineage`, { preHandler: read }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const owner = scope(request), id = z.object({ runId: z.string().uuid() }).strict().parse(request.params).runId;
    const lineage = await service.lineage(owner, id);
    const modelIds = new Set(context.aiRuntime.listModels().filter(model => {
      const parsed = AthenaCoderRuntimeMetadataSchema.safeParse(model.metadata);
      return parsed.success && parsed.data.distillation?.runId === id && parsed.data.distillation.ownerId === owner.ownerId && parsed.data.distillation.companyId === owner.companyId;
    }).map(v => v.modelId));
    const outcomes = [];
    for (const objective of await context.engineeringOrchestrationStore.listObjectives(owner.ownerId, owner.companyId, 100)) {
      for (const result of await context.engineeringOrchestrationStore.listResults(owner.ownerId, owner.companyId, objective.id)) {
        if (result.modelProvider === "athena_coder" && result.modelName && modelIds.has(result.modelName) && result.modelAttempts.some(v => v.modelId === result.modelName && v.athenaCoder?.distillationRunId === id)) outcomes.push({ objectiveId: objective.id, taskId: result.taskId, resultId: result.id, status: result.status, validation: result.validationStatus, review: result.reviewStatus });
      }
    }
    return { ...lineage, laterOutcomeWindow: "LATEST_100_OBJECTIVES", laterOutcomes: outcomes };
  });
  app.post(`${prefix}/prepare`, { preHandler: mutate }, async request => {
    const owner = scope(request), body = DistillationStartSchema.parse(request.body);
    await context.securityState.consumeGrant(context.security.getIdentity(request), "engineering_dataset_export");
    return service.prepare(owner, body);
  });
  app.post(`${prefix}/actions`, { preHandler: mutate }, async request => {
    const owner = scope(request), body = DistillationModelActionSchema.parse(request.body);
    if (!["CANCEL", "DEACTIVATE"].includes(body.action)) await context.securityState.consumeGrant(context.security.getIdentity(request), body.action === "TRAIN" || body.action === "EVALUATE" ? "engineering_dataset_export" : "athena_coder_control");
    if (body.action === "TRAIN") return service.train(owner, body.runId);
    if (body.action === "EVALUATE") return service.evaluate(owner, body.runId);
    return service.modelAction(owner, body.runId, body.action);
  });
  app.post(`${prefix}/recover`, { preHandler: mutate }, async request => {
    const owner = scope(request), body = z.object({ runId: z.string().uuid() }).strict().parse(request.body);
    return service.recover(owner, body.runId);
  });
}

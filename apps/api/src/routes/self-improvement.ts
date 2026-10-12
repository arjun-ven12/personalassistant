import { EngineeringBenchmarkRunSchema, SelfImprovementTelemetrySchema, SelfImprovementViewSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { installCompanyRouteGuard } from "./company-guard.js";
import type { ApiRouteContext } from "./context.js";

const Params = z.object({ deliveryId: z.string().uuid() }).strict();

/** Phone and dashboard contracts compose the existing Engineering controls. */
export const registerSelfImprovementRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  const prefix = "/api/self-improvement";
  installCompanyRouteGuard(app, prefix, context);
  const read = [context.security.requireAuthentication, context.companyContext.requireCompany];
  const mutate = [...read, context.security.requireTrustedOrigin, context.security.requireCsrf,
    context.security.verifyTransportNetwork];
  const scoped = (request: Parameters<typeof context.companyContext.get>[0]) => {
    const company = context.companyContext.get(request);
    return { ownerId: company.ownerId, companyId: company.companyId, requestId: request.id,
      ipAddress: request.ip, sessionId: context.security.getIdentity(request).session.id,
      networkState: context.security.getNetworkState(request) };
  };
  app.get(prefix, { preHandler: read }, async (request) => {
    const company = context.companyContext.get(request);
    return { objectives: z.array(SelfImprovementViewSchema).max(100).parse(
      await context.selfImprovement.list(company.ownerId, company.companyId)) };
  });
  app.get(`${prefix}/:deliveryId`, { preHandler: read }, async (request) => {
    const company = context.companyContext.get(request);
    return SelfImprovementViewSchema.parse(await context.selfImprovement.view(company.ownerId, company.companyId,
      Params.parse(request.params).deliveryId));
  });
  app.post(prefix, { preHandler: mutate }, async (request) =>
    SelfImprovementViewSchema.parse(await context.selfImprovement.create(scoped(request), request.body)));
  app.get(`${prefix}/:deliveryId/telemetry`, { preHandler: read }, async (request) => {
    const company = context.companyContext.get(request);
    return SelfImprovementTelemetrySchema.parse(await context.selfImprovementEvidence.read(company.ownerId,
      company.companyId, Params.parse(request.params).deliveryId));
  });
  app.post(`${prefix}/:deliveryId/benchmark/capture`, { preHandler: mutate }, async (request) =>
    SelfImprovementTelemetrySchema.parse(await context.selfImprovementEvidence.capture(scoped(request),
      Params.parse(request.params).deliveryId)));
  app.post(`${prefix}/:deliveryId/benchmark/comparison`, { preHandler: mutate }, async (request) =>
    EngineeringBenchmarkRunSchema.parse(await context.selfImprovementEvidence.recordComparison(scoped(request),
      Params.parse(request.params).deliveryId, request.body)));
  for (const action of ["pause", "resume", "recover", "cancel"] as const)
    app.post(`${prefix}/:deliveryId/${action}`, { preHandler: mutate }, async (request) =>
      SelfImprovementViewSchema.parse(await context.selfImprovement[action](scoped(request),
        Params.parse(request.params).deliveryId)));
  app.post(`${prefix}/:deliveryId/instructions`, { preHandler: mutate }, async (request) =>
    SelfImprovementViewSchema.parse(await context.selfImprovement.addInstruction(scoped(request),
      Params.parse(request.params).deliveryId, request.body)));
  app.post(`${prefix}/:deliveryId/reject`, { preHandler: mutate }, async (request) =>
    SelfImprovementViewSchema.parse(await context.selfImprovement.reject(scoped(request),
      Params.parse(request.params).deliveryId, request.body)));
  app.post(`${prefix}/:deliveryId/clarification`, { preHandler: mutate }, async (request) =>
    SelfImprovementViewSchema.parse(await context.selfImprovement.answerClarification(scoped(request),
      Params.parse(request.params).deliveryId, request.body)));
};

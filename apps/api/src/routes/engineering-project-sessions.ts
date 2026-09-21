import {
  EngineeringProjectSessionSchema,
  EngineeringProjectSessionViewSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { installCompanyRouteGuard } from "./company-guard.js";
import type { ApiRouteContext } from "./context.js";

const Params = z.object({ sessionId: z.string().uuid() }).strict();

export const registerEngineeringProjectSessionRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  installCompanyRouteGuard(app, "/api/engineering-project-sessions", context);
  const read = [context.security.requireAuthentication, context.companyContext.requireCompany];
  const mutate = [...read, context.security.requireTrustedOrigin, context.security.requireCsrf, context.security.verifyTransportNetwork];
  const scoped = (request: Parameters<typeof context.companyContext.get>[0]) => {
    const company = context.companyContext.get(request);
    return { ownerId: company.ownerId, companyId: company.companyId,
      requestId: request.id, ipAddress: request.ip,
      sessionId: context.security.getIdentity(request).session.id,
      networkState: context.security.getNetworkState(request) };
  };
  app.get("/api/engineering-project-sessions", { preHandler: read }, async (request) => {
    const company = context.companyContext.get(request);
    return { sessions: z.array(EngineeringProjectSessionSchema).parse(
      await context.engineeringProjectSessions.list(company.ownerId, company.companyId)) };
  });
  app.post("/api/engineering-project-sessions", { preHandler: mutate }, async (request) =>
    EngineeringProjectSessionViewSchema.parse(await context.engineeringProjectSessions.create(scoped(request), request.body)));
  app.get("/api/engineering-project-sessions/:sessionId", { preHandler: read }, async (request) => {
    const company = context.companyContext.get(request);
    return EngineeringProjectSessionViewSchema.parse(await context.engineeringProjectSessions.view(
      company.ownerId, company.companyId, Params.parse(request.params).sessionId));
  });
  app.post("/api/engineering-project-sessions/:sessionId/messages", { preHandler: mutate }, async (request) =>
    EngineeringProjectSessionViewSchema.parse(await context.engineeringProjectSessions.send(
      scoped(request), Params.parse(request.params).sessionId, request.body)));
  app.post("/api/engineering-project-sessions/:sessionId/queue", { preHandler: mutate }, async (request) =>
    EngineeringProjectSessionViewSchema.parse(await context.engineeringProjectSessions.updateQueue(
      scoped(request), Params.parse(request.params).sessionId, request.body)));
};

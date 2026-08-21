import { ExecutiveDashboardSchema, ExecutiveQuerySchema, ExecutiveResponseSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import type { ApiRouteContext } from "./context.js";
export const registerExecutiveRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  app.get("/api/executive", { preHandler: [context.security.requireAuthentication] }, async (request) => ExecutiveDashboardSchema.parse(await context.executive.dashboard(context.security.getIdentity(request).user.id)));
  app.post("/api/executive/query", { preHandler: [context.security.requireAuthentication, context.security.requireTrustedOrigin, context.security.requireCsrf] }, async (request) => {
    const ownerId = context.security.getIdentity(request).user.id;
    const controller=new AbortController(); const abort=()=>controller.abort(); request.raw.once("aborted",abort);
    try { return ExecutiveResponseSchema.parse(await context.executive.query(ownerId, ExecutiveQuerySchema.parse(request.body),{signal:controller.signal})); } finally { request.raw.off("aborted",abort); }
  });
};

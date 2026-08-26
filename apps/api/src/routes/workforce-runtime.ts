import {
  WorkforceRuntimeDashboardSchema,
  WorkforceRuntimeMessageSchema,
  WorkforceRuntimeReviewSchema,
  WorkforceRuntimeTaskSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const Params = z.object({ taskId: z.string().uuid() }).strict();
const taskResponse = z.object({ task: WorkforceRuntimeTaskSchema }).strict();

export const registerWorkforceRuntimeRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  app.get("/api/workforce-runtime", { preHandler: [context.security.requireAuthentication] }, async (request) => {
    const ownerId = context.security.getIdentity(request).user.id;
    return WorkforceRuntimeDashboardSchema.parse(await context.workforceRuntime.dashboard(ownerId));
  });
  app.post("/api/workforce-runtime/tasks", { preHandler: [context.security.requireAuthentication,context.security.requireTrustedOrigin,context.security.requireCsrf] }, async (request) => {
    const ownerId = context.security.getIdentity(request).user.id;
    return taskResponse.parse(await context.workforceRuntime.createTask({ ownerId, body: request.body, requestId: request.id, ipAddress: request.ip }));
  });
  app.post("/api/workforce-runtime/tasks/:taskId/schedule", { preHandler: [context.security.requireAuthentication,context.security.requireTrustedOrigin,context.security.requireCsrf] }, async (request) => {
    const ownerId = context.security.getIdentity(request).user.id; const { taskId } = Params.parse(request.params);
    return taskResponse.parse(await context.workforceRuntime.schedule(ownerId,taskId,request.id,request.ip));
  });
  app.post("/api/workforce-runtime/tasks/:taskId/execute", { preHandler: [context.security.requireAuthentication,context.security.requireTrustedOrigin,context.security.requireCsrf] }, async (request) => {
    const ownerId = context.security.getIdentity(request).user.id; const { taskId } = Params.parse(request.params);
    return taskResponse.parse(await context.workforceRuntime.execute(ownerId,taskId,request.id,request.ip));
  });
  app.post("/api/workforce-runtime/tasks/:taskId/complete", { preHandler: [context.security.requireAuthentication,context.security.requireTrustedOrigin,context.security.requireCsrf] }, async (request) => {
    const ownerId = context.security.getIdentity(request).user.id; const { taskId } = Params.parse(request.params);
    return taskResponse.parse(await context.workforceRuntime.complete(ownerId,taskId,request.body,request.id,request.ip));
  });
  app.post("/api/workforce-runtime/tasks/:taskId/reviews", { preHandler: [context.security.requireAuthentication,context.security.requireTrustedOrigin,context.security.requireCsrf] }, async (request) => {
    const ownerId = context.security.getIdentity(request).user.id; const { taskId } = Params.parse(request.params);
    return z.object({ task: WorkforceRuntimeTaskSchema, review: WorkforceRuntimeReviewSchema }).strict().parse(await context.workforceRuntime.review(ownerId,taskId,request.body,request.id,request.ip));
  });
  app.post("/api/workforce-runtime/tasks/:taskId/cancel", { preHandler: [context.security.requireAuthentication,context.security.requireTrustedOrigin,context.security.requireCsrf] }, async (request) => {
    const ownerId = context.security.getIdentity(request).user.id; const { taskId } = Params.parse(request.params);
    return WorkforceRuntimeDashboardSchema.parse(await context.workforceRuntime.cancel(ownerId,taskId,request.id,request.ip));
  });
  app.post("/api/workforce-runtime/messages", { preHandler: [context.security.requireAuthentication,context.security.requireTrustedOrigin,context.security.requireCsrf] }, async (request) => {
    const ownerId = context.security.getIdentity(request).user.id;
    return z.object({ message: WorkforceRuntimeMessageSchema }).strict().parse(await context.workforceRuntime.sendMessage(ownerId,request.body));
  });
  app.post("/api/workforce-runtime/recover", { preHandler: [context.security.requireAuthentication,context.security.requireTrustedOrigin,context.security.requireCsrf] }, async (request) => {
    const ownerId = context.security.getIdentity(request).user.id;
    return WorkforceRuntimeDashboardSchema.parse(await context.workforceRuntime.recover(ownerId,request.id,request.ip));
  });
};

import { CreateObjectiveRequestSchema, ModifyObjectiveRequestSchema, ObjectiveDashboardSchema, ObjectiveDraftResponseSchema, ObjectiveModificationResultSchema, ObjectiveMutationRequestSchema, ObserveObjectiveMetricRequestSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiRouteContext } from "./context.js";

const Params=z.object({objectiveId:z.string().uuid()}).strict();
export const registerObjectiveRoutes=(app:FastifyInstance,context:ApiRouteContext)=>{
  app.get("/api/objectives",{preHandler:[context.security.requireAuthentication,context.companyContext.requireCompany]},async(request)=>ObjectiveDashboardSchema.parse(await context.objectives.dashboard(context.security.getIdentity(request).user.id)));
  app.post("/api/objectives",{preHandler:[context.security.requireAuthentication,context.companyContext.requireCompany,context.security.requireTrustedOrigin,context.security.requireCsrf]},async(request)=>ObjectiveDraftResponseSchema.parse(await context.objectives.create({ownerId:context.security.getIdentity(request).user.id,body:CreateObjectiveRequestSchema.parse(request.body),requestId:request.id,ipAddress:request.ip})));
  for(const action of ["activate","pause","cancel","replan"] as const) app.post(`/api/objectives/:objectiveId/${action}`,{preHandler:[context.security.requireAuthentication,context.companyContext.requireCompany,context.security.requireTrustedOrigin,context.security.requireCsrf]},async(request)=>{
    const ownerId=context.security.getIdentity(request).user.id; const {objectiveId}=Params.parse(request.params); const {idempotencyKey}=ObjectiveMutationRequestSchema.parse(request.body);
    return ObjectiveDashboardSchema.parse(action==="activate"?await context.objectives.activate({ownerId,objectiveId,idempotencyKey,requestId:request.id,ipAddress:request.ip}):await context.objectives.transition({ownerId,objectiveId,action,idempotencyKey,requestId:request.id,ipAddress:request.ip}));
  });
  app.patch("/api/objectives/:objectiveId",{preHandler:[context.security.requireAuthentication,context.companyContext.requireCompany,context.security.requireTrustedOrigin,context.security.requireCsrf]},async(request)=>{
    const ownerId=context.security.getIdentity(request).user.id; const {objectiveId}=Params.parse(request.params);
    return ObjectiveModificationResultSchema.parse(await context.objectives.modify({ownerId,objectiveId,body:ModifyObjectiveRequestSchema.parse(request.body),requestId:request.id,ipAddress:request.ip}));
  });
  app.post("/api/objectives/:objectiveId/observations",{preHandler:[context.security.requireAuthentication,context.companyContext.requireCompany,context.security.requireTrustedOrigin,context.security.requireCsrf]},async(request)=>{
    const ownerId=context.security.getIdentity(request).user.id; const {objectiveId}=Params.parse(request.params);
    return ObjectiveDashboardSchema.parse(await context.objectives.observeMetric({ownerId,objectiveId,body:ObserveObjectiveMetricRequestSchema.parse(request.body),requestId:request.id,ipAddress:request.ip}));
  });
};

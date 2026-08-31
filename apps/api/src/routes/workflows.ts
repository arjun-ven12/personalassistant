import {
  WorkflowActionRequestSchema,
  WorkflowListResponseSchema,
  WorkflowResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const WorkflowParametersSchema = z.object({ workflowId: z.string().uuid() }).strict();
const WorkflowTaskParametersSchema = WorkflowParametersSchema.extend({
  taskId: z.string().uuid(),
}).strict();
const WorkflowTaskArtifactRequestSchema = z
  .object({
    patchId: z.string().uuid().optional(),
    validationRunId: z.string().uuid().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.patchId || value.validationRunId), {
    message: "A patchId or validationRunId is required.",
  });

export const registerWorkflowRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  const readPreHandlers = [
    context.security.requireAuthentication,
    context.companyContext.requireCompany,
  ];
  const mutationPreHandlers = [
    context.security.requireAuthentication,
    context.companyContext.requireCompany,
    context.security.requireTrustedOrigin,
    context.security.requireCsrf,
  ];
  app.get(
    "/api/workflows",
    { preHandler: readPreHandlers },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return WorkflowListResponseSchema.parse(
        await context.workflows.list(identity.user.id),
      );
    },
  );

  app.post(
    "/api/workflows",
    {
      preHandler: mutationPreHandlers,
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return WorkflowResponseSchema.parse(
        await context.workflows.create({
          ownerId: identity.user.id,
          body: request.body,
          ipAddress: request.ip,
          requestId: request.id,
        }),
      );
    },
  );

  app.get(
    "/api/workflows/:workflowId",
    { preHandler: readPreHandlers },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { workflowId } = WorkflowParametersSchema.parse(request.params);
      return WorkflowResponseSchema.parse(
        await context.workflows.get(identity.user.id, workflowId),
      );
    },
  );

  app.post(
    "/api/workflows/:workflowId/approve",
    { preHandler: mutationPreHandlers },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { workflowId } = WorkflowParametersSchema.parse(request.params);
      const body = WorkflowActionRequestSchema.parse(request.body);
      return WorkflowResponseSchema.parse(
        await context.workflows.approve(identity.user.id, workflowId, body.reason),
      );
    },
  );

  app.post(
    "/api/workflows/:workflowId/advance",
    { preHandler: mutationPreHandlers },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { workflowId } = WorkflowParametersSchema.parse(request.params);
      return WorkflowResponseSchema.parse(
        await context.workflows.advance(identity.user.id, workflowId),
      );
    },
  );

  app.post(
    "/api/workflows/:workflowId/pause",
    { preHandler: mutationPreHandlers },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { workflowId } = WorkflowParametersSchema.parse(request.params);
      const body = WorkflowActionRequestSchema.parse(request.body);
      return WorkflowResponseSchema.parse(
        await context.workflows.pause(identity.user.id, workflowId, body.reason),
      );
    },
  );

  app.post(
    "/api/workflows/:workflowId/cancel",
    { preHandler: mutationPreHandlers },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { workflowId } = WorkflowParametersSchema.parse(request.params);
      const body = WorkflowActionRequestSchema.parse(request.body);
      return WorkflowResponseSchema.parse(
        await context.workflows.cancel(identity.user.id, workflowId, body.reason),
      );
    },
  );

  app.post(
    "/api/workflows/:workflowId/tasks/:taskId/complete",
    { preHandler: mutationPreHandlers },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { workflowId, taskId } = WorkflowTaskParametersSchema.parse(request.params);
      return WorkflowResponseSchema.parse(
        await context.workflows.completeTask(identity.user.id, workflowId, taskId),
      );
    },
  );

  app.post(
    "/api/workflows/:workflowId/tasks/:taskId/artifacts",
    { preHandler: mutationPreHandlers },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { workflowId, taskId } = WorkflowTaskParametersSchema.parse(request.params);
      const body = WorkflowTaskArtifactRequestSchema.parse(request.body);
      return WorkflowResponseSchema.parse(
        await context.workflows.linkTaskArtifact({
          ownerId: identity.user.id,
          workflowId,
          taskId,
          ...(body.patchId ? { patchId: body.patchId } : {}),
          ...(body.validationRunId ? { validationRunId: body.validationRunId } : {}),
        }),
      );
    },
  );
};

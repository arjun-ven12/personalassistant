import {
  ComposeCrossApplicationWorkflowRequestSchema,
  CrossApplicationWorkflowDashboardResponseSchema,
  CrossApplicationWorkflowIdRequestSchema,
  WorkflowActionRequestSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const GraphParamsSchema = z.object({ graphId: z.string().uuid() }).strict();

export const registerCrossApplicationWorkflowRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/cross-application-workflows",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CrossApplicationWorkflowDashboardResponseSchema.parse(
        await context.crossApplicationWorkflows.dashboard(identity.user.id),
      );
    },
  );

  app.post(
    "/api/cross-application-workflows/compose",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CrossApplicationWorkflowDashboardResponseSchema.parse(
        await context.crossApplicationWorkflows.compose({
          ownerId: identity.user.id,
          body: ComposeCrossApplicationWorkflowRequestSchema.parse(request.body),
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/cross-application-workflows/:graphId",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { graphId } = GraphParamsSchema.parse(request.params);
      return CrossApplicationWorkflowDashboardResponseSchema.parse(
        await context.crossApplicationWorkflows.detail(identity.user.id, graphId),
      );
    },
  );

  app.post(
    "/api/cross-application-workflows/:graphId/start",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
        context.security.inspectNetwork,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { graphId } = GraphParamsSchema.parse(request.params);
      return CrossApplicationWorkflowDashboardResponseSchema.parse(
        await context.crossApplicationWorkflows.start({
          ownerId: identity.user.id,
          sessionId: identity.session.id,
          networkState: context.security.getNetworkState(request),
          graphId: CrossApplicationWorkflowIdRequestSchema.parse({ graphId }).graphId,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/cross-application-workflows/:graphId/pause",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { graphId } = GraphParamsSchema.parse(request.params);
      const body = WorkflowActionRequestSchema.parse(request.body);
      return CrossApplicationWorkflowDashboardResponseSchema.parse(
        await context.crossApplicationWorkflows.pause(
          identity.user.id,
          graphId,
          body.reason,
        ),
      );
    },
  );

  app.post(
    "/api/cross-application-workflows/:graphId/cancel",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { graphId } = GraphParamsSchema.parse(request.params);
      const body = WorkflowActionRequestSchema.parse(request.body);
      return CrossApplicationWorkflowDashboardResponseSchema.parse(
        await context.crossApplicationWorkflows.cancel(
          identity.user.id,
          graphId,
          body.reason,
        ),
      );
    },
  );

  app.post(
    "/api/cross-application-workflows/:graphId/recover",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { graphId } = GraphParamsSchema.parse(request.params);
      return CrossApplicationWorkflowDashboardResponseSchema.parse(
        await context.crossApplicationWorkflows.recover(identity.user.id, graphId),
      );
    },
  );
};

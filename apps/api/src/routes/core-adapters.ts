import {
  CoreAdapterDashboardResponseSchema,
  CoreAdapterSemanticActionResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";

export const registerCoreAdapterRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/core-adapters",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CoreAdapterDashboardResponseSchema.parse(
        await context.coreAdapters.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/core-adapters/health",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const dashboard = await context.coreAdapters.dashboard(identity.user.id);
      return CoreAdapterDashboardResponseSchema.shape.healthMetrics.parse(
        dashboard.healthMetrics,
      );
    },
  );

  app.get(
    "/api/core-adapters/context",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const dashboard = await context.coreAdapters.dashboard(identity.user.id);
      return CoreAdapterDashboardResponseSchema.shape.contextSnapshots.parse(
        dashboard.contextSnapshots,
      );
    },
  );

  app.get(
    "/api/core-adapters/actions",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const dashboard = await context.coreAdapters.dashboard(identity.user.id);
      return CoreAdapterDashboardResponseSchema.shape.recentActions.parse(
        dashboard.recentActions,
      );
    },
  );

  app.post(
    "/api/core-adapters/semantic-actions",
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
      return CoreAdapterSemanticActionResponseSchema.parse(
        await context.coreAdapters.executeSemanticAction({
          ownerId: identity.user.id,
          sessionId: identity.session.id,
          networkState: context.security.getNetworkState(request),
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );
};

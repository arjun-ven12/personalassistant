import {
  DeepIndexerDashboardResponseSchema,
  IncrementalSyncResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";

export const registerDeepIndexerRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/deep-indexers",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return DeepIndexerDashboardResponseSchema.parse(
        await context.semanticIndexers.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/deep-indexers/events",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const dashboard = await context.semanticIndexers.dashboard(identity.user.id);
      return DeepIndexerDashboardResponseSchema.shape.events.parse(dashboard.events);
    },
  );

  app.get(
    "/api/deep-indexers/health",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const dashboard = await context.semanticIndexers.dashboard(identity.user.id);
      return DeepIndexerDashboardResponseSchema.shape.health.parse(dashboard.health);
    },
  );

  app.get(
    "/api/deep-indexers/search-statistics",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const dashboard = await context.semanticIndexers.dashboard(identity.user.id);
      return DeepIndexerDashboardResponseSchema.shape.searchStatistics.parse(
        dashboard.searchStatistics,
      );
    },
  );

  app.post(
    "/api/deep-indexers/incremental-sync",
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
      return IncrementalSyncResponseSchema.parse(
        await context.semanticIndexers.incrementalSync({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );
};

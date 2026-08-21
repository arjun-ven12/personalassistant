import {
  WorkspaceSemanticSearchResponseSchema,
  WorkspaceIntelligenceDashboardResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";

export const registerWorkspaceIntelligenceRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/workspace-intelligence",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return WorkspaceIntelligenceDashboardResponseSchema.parse(
        await context.workspaceIntelligence.dashboard(identity.user.id),
      );
    },
  );

  app.post(
    "/api/workspace-intelligence/search",
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
      return WorkspaceSemanticSearchResponseSchema.parse(
        await context.workspaceIntelligence.search({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );
};

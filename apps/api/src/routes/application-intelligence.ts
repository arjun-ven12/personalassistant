import {
  ApplicationIntelligenceDashboardResponseSchema,
  ProviderSelectionResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";

export const registerApplicationIntelligenceRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/application-intelligence",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ApplicationIntelligenceDashboardResponseSchema.parse(
        await context.applicationIntelligence.dashboard(identity.user.id),
      );
    },
  );

  app.post(
    "/api/application-intelligence/provider-selection",
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
      return ProviderSelectionResponseSchema.parse(
        await context.applicationIntelligence.selectProvider({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );
};

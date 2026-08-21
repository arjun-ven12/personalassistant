import { GovernedApplicationInteractionResponseSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";

export const registerApplicationInteractionRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.post(
    "/api/application-interactions",
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
      return GovernedApplicationInteractionResponseSchema.parse(
        await context.applicationInteractions.execute({
          ownerId: identity.user.id,
          sessionId: identity.session.id,
          networkState: context.security.getNetworkState(request),
          requestId: request.id,
          ipAddress: request.ip,
          body: request.body,
        }),
      );
    },
  );
};


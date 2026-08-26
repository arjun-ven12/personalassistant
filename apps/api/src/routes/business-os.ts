import { BusinessOSExecutiveSummarySchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import type { ApiRouteContext } from "./context.js";

export const registerBusinessOSRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/business-os/summary",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const ownerId = context.security.getIdentity(request).user.id;
      return BusinessOSExecutiveSummarySchema.parse(
        await context.businessOS.summary(ownerId),
      );
    },
  );
};

import {
  AdapterLifecycleTransitionRequestSchema,
  AdapterSdkDashboardResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";

export const registerAdapterSdkRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/adapter-sdk",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AdapterSdkDashboardResponseSchema.parse(
        await context.adapterSdk.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/adapter-sdk/metadata",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AdapterSdkDashboardResponseSchema.shape.metadata.parse(
        (await context.adapterSdk.dashboard(identity.user.id)).metadata,
      );
    },
  );

  app.post(
    "/api/adapter-sdk/lifecycle",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
        context.security.inspectNetwork,
      ],
    },
    async (request) => {
      AdapterLifecycleTransitionRequestSchema.parse(request.body);
      const identity = context.security.getIdentity(request);
      return AdapterSdkDashboardResponseSchema.parse(
        await context.adapterSdk.transition({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );
};

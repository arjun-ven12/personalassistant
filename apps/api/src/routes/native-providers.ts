import { NativeProviderDashboardResponseSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";

const mutationGuards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
  context.security.inspectNetwork,
];

export const registerNativeProviderRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/native-providers",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return NativeProviderDashboardResponseSchema.parse(
        await context.nativeProviders.dashboard(identity.user.id),
      );
    },
  );

  app.post(
    "/api/native-providers/validate",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return NativeProviderDashboardResponseSchema.parse(
        await context.nativeProviders.validateProviders({
          ownerId: identity.user.id,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/native-providers/dispatch",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return NativeProviderDashboardResponseSchema.parse(
        await context.nativeProviders.dispatch({
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

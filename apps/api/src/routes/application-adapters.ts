import {
  ApplicationAdapterDashboardResponseSchema,
  RegistryIdSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const mutationGuards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];

const ApplicationIdBodySchema = z.object({ applicationId: RegistryIdSchema }).strict();

export const registerApplicationAdapterRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/application-adapters",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ApplicationAdapterDashboardResponseSchema.parse(
        await context.applicationAdapters.dashboard(identity.user.id),
      );
    },
  );

  app.post(
    "/api/application-adapters/trusted-applications",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ApplicationAdapterDashboardResponseSchema.parse(
        await context.applicationAdapters.trustApplication({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/application-adapters/permissions",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ApplicationAdapterDashboardResponseSchema.parse(
        await context.applicationAdapters.updatePermissions({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/application-adapters/capabilities/refresh",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { applicationId } = ApplicationIdBodySchema.parse(request.body);
      return ApplicationAdapterDashboardResponseSchema.parse(
        await context.applicationAdapters.refreshCapabilities({
          ownerId: identity.user.id,
          applicationId,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/application-adapters/synchronize",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { applicationId } = ApplicationIdBodySchema.parse(request.body);
      return ApplicationAdapterDashboardResponseSchema.parse(
        await context.applicationAdapters.synchronize({
          ownerId: identity.user.id,
          applicationId,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/application-adapters/revoke",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { applicationId } = ApplicationIdBodySchema.parse(request.body);
      return ApplicationAdapterDashboardResponseSchema.parse(
        await context.applicationAdapters.revoke({
          ownerId: identity.user.id,
          applicationId,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );
};

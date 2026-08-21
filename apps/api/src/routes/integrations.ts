import {
  IntegrationCapabilityListResponseSchema,
  IntegrationDashboardResponseSchema,
  IntegrationHealthResponseSchema,
  IntegrationListResponseSchema,
  IntegrationOperationListResponseSchema,
  IntegrationOperationResponseSchema,
  IntegrationPermissionListResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const IntegrationParametersSchema = z
  .object({ integrationId: z.string().min(3).max(120) })
  .strict();

const PermissionRequestSchema = z
  .object({
    integrationId: z.string().min(3).max(120),
    capabilityId: z.string().min(3).max(120),
    grant: z.boolean(),
  })
  .strict();

export const registerIntegrationRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/integrations/dashboard",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return IntegrationDashboardResponseSchema.parse(
        await context.integrations.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/integrations",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return IntegrationListResponseSchema.parse(
        await context.integrations.list(identity.user.id),
      );
    },
  );

  app.get(
    "/api/integrations/capabilities",
    { preHandler: [context.security.requireAuthentication] },
    () =>
      IntegrationCapabilityListResponseSchema.parse(
        context.integrations.capabilities(),
      ),
  );

  app.get(
    "/api/integrations/health",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return IntegrationHealthResponseSchema.parse(
        await context.integrations.health(identity.user.id),
      );
    },
  );

  app.get(
    "/api/integrations/permissions",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return IntegrationPermissionListResponseSchema.parse(
        await context.integrations.permissions(identity.user.id),
      );
    },
  );

  app.post(
    "/api/integrations/permissions",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = PermissionRequestSchema.parse(request.body);
      return IntegrationPermissionListResponseSchema.parse(
        await context.integrations.setPermission({
          ownerId: identity.user.id,
          integrationId: body.integrationId,
          capabilityId: body.capabilityId,
          grant: body.grant,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/integrations/:integrationId/disable",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { integrationId } = IntegrationParametersSchema.parse(request.params);
      return IntegrationDashboardResponseSchema.parse(
        await context.integrations.disable({
          ownerId: identity.user.id,
          integrationId,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/integrations/operations",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return IntegrationOperationListResponseSchema.parse(
        await context.integrations.operations(identity.user.id),
      );
    },
  );

  app.post(
    "/api/integrations/operations",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return IntegrationOperationResponseSchema.parse(
        await context.integrations.requestOperation({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );
};

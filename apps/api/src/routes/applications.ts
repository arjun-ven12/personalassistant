import {
  ApplicationIdParametersSchema,
  ApplicationListResponseSchema,
  ApplicationResponseSchema,
  CreateApplicationRequestSchema,
  UpdateApplicationRequestSchema,
} from "@alexa-control/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { ApiRouteContext } from "./context.js";
import { installCompanyRouteGuard } from "./company-guard.js";

const auditContext = (request: FastifyRequest) => ({
  ipAddress: request.ip,
  requestId: request.id,
});

export const registerApplicationRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  installCompanyRouteGuard(app, "/api/applications", context, ["/api/applications/installations", "/api/applications/discovery-"]);
  app.get(
    "/api/applications",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ApplicationListResponseSchema.parse(
        await context.registry.listApplications(identity.user.id),
      );
    },
  );

  app.post(
    "/api/applications",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const application = await context.registry.createApplication(
        identity.user.id,
        CreateApplicationRequestSchema.parse(request.body),
      );
      await context.governanceAudit({
        eventType: "APPLICATION_REGISTERED",
        ownerId: identity.user.id,
        outcome: "SUCCESS",
        reason: "Application metadata registered.",
        metadata: { applicationId: application.id },
        ...auditContext(request),
      });
      return ApplicationResponseSchema.parse(application);
    },
  );

  app.patch(
    "/api/applications/:applicationId",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { applicationId } = ApplicationIdParametersSchema.parse(request.params);
      const application = await context.registry.updateApplication(
        identity.user.id,
        applicationId,
        UpdateApplicationRequestSchema.parse(request.body),
      );
      await context.governanceAudit({
        eventType: "APPLICATION_UPDATED",
        ownerId: identity.user.id,
        outcome: "SUCCESS",
        reason: "Application metadata updated.",
        metadata: { applicationId },
        ...auditContext(request),
      });
      return ApplicationResponseSchema.parse(application);
    },
  );

  app.post(
    "/api/applications/:applicationId/disable",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { applicationId } = ApplicationIdParametersSchema.parse(request.params);
      const application = await context.registry.disableApplication(
        identity.user.id,
        applicationId,
      );
      await context.governanceAudit({
        eventType: "APPLICATION_DISABLED",
        ownerId: identity.user.id,
        outcome: "SUCCESS",
        reason: "Application metadata disabled.",
        metadata: { applicationId },
        ...auditContext(request),
      });
      return ApplicationResponseSchema.parse(application);
    },
  );
};

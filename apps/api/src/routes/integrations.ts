import {
  IntegrationCapabilityListResponseSchema,
  IntegrationDashboardResponseSchema,
  IntegrationHealthResponseSchema,
  IntegrationListResponseSchema,
  IntegrationOperationListResponseSchema,
  IntegrationOperationResponseSchema,
  IntegrationPermissionListResponseSchema,
  BusinessActionRequestSchema,
  BusinessExecutionRecordSchema,
  BusinessExternalEventInputSchema,
  BusinessOperationsDashboardSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";
import { installCompanyRouteGuard } from "./company-guard.js";

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
const BusinessExecutionParametersSchema = z.object({ executionId: z.string().uuid() }).strict();
const BusinessWebhookParametersSchema = z.object({ ownerId: z.string().uuid(), integrationId: z.enum(["gmail", "crm", "analytics", "github"]) }).strict();

export const registerIntegrationRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  installCompanyRouteGuard(
    app,
    "/api/integrations",
    context,
    ["/api/integrations/business/webhooks/"],
  );
  app.get(
    "/api/integrations/business/dashboard",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return BusinessOperationsDashboardSchema.parse(await context.integrations.businessDashboard(identity.user.id));
    },
  );

  app.post(
    "/api/integrations/business/actions",
    { preHandler: [context.security.requireAuthentication, context.security.requireTrustedOrigin, context.security.requireCsrf] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return BusinessExecutionRecordSchema.parse(await context.integrations.requestBusinessAction({ ownerId: identity.user.id, body: BusinessActionRequestSchema.parse(request.body), requestId: request.id, ipAddress: request.ip }));
    },
  );

  app.post(
    "/api/integrations/business/executions/:executionId/reconcile",
    { preHandler: [context.security.requireAuthentication, context.security.requireTrustedOrigin, context.security.requireCsrf] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { executionId } = BusinessExecutionParametersSchema.parse(request.params);
      return BusinessExecutionRecordSchema.parse(await context.integrations.reconcileBusinessAction({ ownerId: identity.user.id, executionId, requestId: request.id, ipAddress: request.ip }));
    },
  );

  app.post("/api/integrations/business/webhooks/:ownerId/:integrationId", async (request, reply) => {
    const { ownerId, integrationId } = BusinessWebhookParametersSchema.parse(request.params);
    const secret = process.env.BUSINESS_WEBHOOK_SECRET;
    if (!secret) return reply.code(503).send({ code: "WEBHOOK_VERIFIER_NOT_CONFIGURED", message: "Business webhook verification is not configured." });
    const body = BusinessExternalEventInputSchema.parse(request.body);
    if (body.integrationId !== integrationId) return reply.code(400).send({ code: "WEBHOOK_INTEGRATION_MISMATCH", message: "The signed event does not match the integration route." });
    const signature = z.string().regex(/^[a-f0-9]{64}$/).parse(request.headers["x-alexa-signature"]);
    const timestamp = z.string().regex(/^\d{10,16}$/).parse(request.headers["x-alexa-timestamp"]);
    return context.integrations.ingestBusinessWebhook({ ownerId, body, signature, timestamp, secret, requestId: request.id, ipAddress: request.ip });
  });

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

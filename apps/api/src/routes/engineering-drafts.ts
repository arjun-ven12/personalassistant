import type { FastifyInstance } from "fastify";
import { EngineeringDraftCreateOperationSchema } from "@alexa-control/shared";
import type { ApiRouteContext } from "./context.js";

export const registerEngineeringDraftRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.post(
    "/api/v1/device/engineering-drafts",
    {
      bodyLimit: 128_000,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      preHandler: [
        context.security.requireAuthentication,
        context.companyContext.requireCompany,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
        context.security.requireTrustedDevice,
        context.security.verifySignedRequest,
        context.security.verifyTransportNetwork,
      ],
    },
    async (request) => {
      if (!context.engineeringDrafts)
        throw Object.assign(new Error("DRAFT_DURABLE_STORAGE_REQUIRED"), {
          statusCode: 503,
        });
      const identity = context.security.getIdentity(request),
        company = context.companyContext.get(request);
      const envelope = context.security.getEnvelope(request);
      return context.engineeringDrafts.create(
        {
          ownerId: identity.user.id,
          companyId: company.companyId,
          sessionId: identity.session.id,
          deviceId: context.security.getDevice(request).id,
          operationId: envelope.commandId,
          signedExpiresAt: envelope.expiresAt,
          requestId: request.id,
          ipAddress: request.ip,
          networkState: context.security.getNetworkState(request),
        },
        EngineeringDraftCreateOperationSchema.parse(envelope.payload),
      );
    },
  );
};

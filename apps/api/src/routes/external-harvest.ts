import {
  BrainRuntimeSummarySchema,
  BrainFirstLookupResponseSchema,
  DelegationResultSchema,
  ExternalHarvestDashboardSchema,
  KnowledgeGapResponseSchema,
  PreparedDelegationSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";

export const registerExternalHarvestRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/agent-os/external-harvest",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ExternalHarvestDashboardSchema.parse(
        await context.externalHarvest.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agent-os/external-harvest/brain-summary",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return BrainRuntimeSummarySchema.parse(
        await context.externalHarvest.brainSummary(identity.user.id),
      );
    },
  );

  app.post(
    "/api/agent-os/external-harvest/brain-first-lookup",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return BrainFirstLookupResponseSchema.parse(
        await context.externalHarvest.brainFirstLookup({
          ownerId: identity.user.id,
          body: request.body,
        }),
      );
    },
  );

  app.post(
    "/api/agent-os/external-harvest/delegations/execute",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return DelegationResultSchema.parse(
        await context.externalHarvest.executeDelegation({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/agent-os/external-harvest/knowledge-gaps",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return KnowledgeGapResponseSchema.parse(
        await context.externalHarvest.knowledgeGaps({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/agent-os/external-harvest/delegations/prepare",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return PreparedDelegationSchema.parse(
        await context.externalHarvest.prepareDelegation({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );
};

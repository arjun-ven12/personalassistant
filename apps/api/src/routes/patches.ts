import {
  PatchDecisionResponseSchema,
  PatchListResponseSchema,
  PatchResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const PatchParametersSchema = z.object({ patchId: z.string().uuid() }).strict();

export const registerPatchRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  app.get(
    "/api/patches",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return PatchListResponseSchema.parse(
        await context.patches.list(identity.user.id),
      );
    },
  );

  app.get(
    "/api/patches/:patchId",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { patchId } = PatchParametersSchema.parse(request.params);
      return PatchResponseSchema.parse(
        await context.patches.get(identity.user.id, patchId),
      );
    },
  );

  app.post(
    "/api/patches",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return PatchResponseSchema.parse(
        await context.patches.generate({
          ownerId: identity.user.id,
          body: request.body,
          ipAddress: request.ip,
          requestId: request.id,
        }),
      );
    },
  );

  app.post(
    "/api/patches/:patchId/decision",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { patchId } = PatchParametersSchema.parse(request.params);
      return PatchDecisionResponseSchema.parse(
        await context.patches.decide({
          ownerId: identity.user.id,
          sessionId: identity.session.id,
          patchId,
          body: request.body,
          ipAddress: request.ip,
          requestId: request.id,
        }),
      );
    },
  );

  app.post(
    "/api/patches/:patchId/execute",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
        context.security.verifyPrivateNetwork,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { patchId } = PatchParametersSchema.parse(request.params);
      return PatchResponseSchema.parse(
        await context.patches.execute({
          ownerId: identity.user.id,
          sessionId: identity.session.id,
          patchId,
          body: request.body,
          networkState: context.security.getNetworkState(request),
          ipAddress: request.ip,
          requestId: request.id,
        }),
      );
    },
  );

  app.post(
    "/api/patches/:patchId/rollback",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { patchId } = PatchParametersSchema.parse(request.params);
      return PatchResponseSchema.parse(
        await context.patches.rollback({
          ownerId: identity.user.id,
          patchId,
          ipAddress: request.ip,
          requestId: request.id,
        }),
      );
    },
  );
};

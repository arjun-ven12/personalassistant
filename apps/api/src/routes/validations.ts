import {
  ValidationListResponseSchema,
  ValidationProfileListResponseSchema,
  ValidationResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { ExecutionError } from "../execution/errors.js";
import type { ApiRouteContext } from "./context.js";

const ValidationParametersSchema = z
  .object({ validationRunId: z.string().uuid() })
  .strict();

export const registerValidationRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/validation/profiles",
    { preHandler: [context.security.requireAuthentication] },
    () => ValidationProfileListResponseSchema.parse(context.validations.profiles()),
  );

  app.get(
    "/api/validations",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ValidationListResponseSchema.parse(
        await context.validations.list(identity.user.id),
      );
    },
  );

  app.post(
    "/api/validations",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ValidationResponseSchema.parse(
        await context.validations.create({
          ownerId: identity.user.id,
          body: request.body,
          ipAddress: request.ip,
          requestId: request.id,
        }),
      );
    },
  );

  app.get(
    "/api/validations/:validationRunId",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { validationRunId } = ValidationParametersSchema.parse(request.params);
      return ValidationResponseSchema.parse(
        await context.validations.get(identity.user.id, validationRunId),
      );
    },
  );

  app.post(
    "/api/validations/:validationRunId/start",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
        context.security.verifyTransportNetwork,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { validationRunId } = ValidationParametersSchema.parse(request.params);
      return ValidationResponseSchema.parse(
        await context.validations.start({
          ownerId: identity.user.id,
          sessionId: identity.session.id,
          validationRunId,
          body: request.body,
          networkState: context.security.getNetworkState(request),
          ipAddress: request.ip,
          requestId: request.id,
        }),
      );
    },
  );

  app.post(
    "/api/validations/:validationRunId/cancel",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { validationRunId } = ValidationParametersSchema.parse(request.params);
      const validation = await context.validations.cancel(
        identity.user.id,
        validationRunId,
        new Date().toISOString(),
      );
      const repository = await context.repositoryStore.findRepository(
        validation.repositoryId,
      );
      if (!repository || repository.ownerId !== identity.user.id)
        throw new ExecutionError(
          404,
          "REPOSITORY_NOT_FOUND",
          "Repository was not found.",
        );
      return ValidationResponseSchema.parse({ repository, validation });
    },
  );
};

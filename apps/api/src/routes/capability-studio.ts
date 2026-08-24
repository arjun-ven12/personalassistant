import { CapabilityStudioResponseSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";

const mutationGuards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];

export const registerCapabilityStudioRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/capability-studio",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CapabilityStudioResponseSchema.parse(
        await context.capabilityStudio.dashboard(identity.user.id),
      );
    },
  );

  const mutation = (
    path: string,
    handler: (input: {
      ownerId: string;
      body: unknown;
      requestId: string;
      ipAddress: string;
    }) => Promise<unknown>,
  ) => {
    app.post(path, { preHandler: mutationGuards(context) }, async (request) => {
      const identity = context.security.getIdentity(request);
      return CapabilityStudioResponseSchema.parse(
        await handler({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    });
  };

  mutation("/api/capability-studio/candidates/describe", (input) =>
    context.capabilityStudio.createFromDescription(input),
  );
  mutation("/api/capability-studio/candidates/recording", (input) =>
    context.capabilityStudio.createFromRecording(input),
  );
  mutation("/api/capability-studio/candidates/validate", (input) =>
    context.capabilityStudio.validate(input),
  );
  mutation("/api/capability-studio/candidates/test", (input) =>
    context.capabilityStudio.test(input),
  );
  mutation("/api/capability-studio/candidates/request-approval", (input) =>
    context.capabilityStudio.requestApproval(input),
  );
  mutation("/api/capability-studio/candidates/activate", (input) =>
    context.capabilityStudio.activate(input),
  );
  mutation("/api/capability-studio/candidates/state", (input) =>
    context.capabilityStudio.changeState(input),
  );
  mutation("/api/capability-studio/requests", (input) =>
    context.capabilityStudio.createRequest(input),
  );
};

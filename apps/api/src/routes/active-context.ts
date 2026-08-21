import {
  ActiveContextObservationSchema,
  ActiveContextResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";
import { authenticateTrustedDeviceEnvelope } from "./voice.js";

const ActiveContextQuerySchema = z.object({ deviceId: z.string().uuid() }).strict();

export const registerActiveContextRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.post(
    "/api/active-context/device",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request) => {
      const { device, envelope } = await authenticateTrustedDeviceEnvelope(
        request,
        context,
      );
      return ActiveContextResponseSchema.parse(
        await context.activeContext.update({
          ownerId: device.ownerId,
          deviceId: device.id,
          observation: ActiveContextObservationSchema.parse(envelope.payload),
          requestId: envelope.commandId,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/active-context",
    { preHandler: [context.security.requireAuthentication] },
    (request) => {
      const identity = context.security.getIdentity(request);
      const { deviceId } = ActiveContextQuerySchema.parse(request.query);
      return ActiveContextResponseSchema.parse(
        context.activeContext.current(identity.user.id, deviceId),
      );
    },
  );
};

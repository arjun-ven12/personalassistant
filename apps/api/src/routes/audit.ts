import { AuditListResponseSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const AuditQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export const registerAuditRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  app.get(
    "/api/audit",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { limit } = AuditQuerySchema.parse(request.query);
      return AuditListResponseSchema.parse(
        await context.identity.store.listAudit(identity.user.id, limit),
      );
    },
  );
};

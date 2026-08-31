import {
  PolicyEvaluationListResponseSchema,
  PolicyEvaluationRequestSchema,
  PolicyEvaluationResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";
import { installCompanyRouteGuard } from "./company-guard.js";

const HistoryQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
  .strict();

export const registerPolicyRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  installCompanyRouteGuard(app, "/api/policies", context);

  app.post(
    "/api/policies/evaluate",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { action } = PolicyEvaluationRequestSchema.parse(request.body);
      const networkResult = await context.networkVerifier.verify({
        remoteAddress: request.socket.remoteAddress ?? request.ip,
      });
      const evaluation = await context.governance.evaluate({
        ownerId: identity.user.id,
        sessionId: identity.session.id,
        action,
        networkVerification: networkResult.state,
        ipAddress: request.ip,
        requestId: request.id,
      });
      return PolicyEvaluationResponseSchema.parse({
        evaluation,
        networkVerification: networkResult.state,
      });
    },
  );

  app.get(
    "/api/policies/evaluations",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { limit } = HistoryQuerySchema.parse(request.query);
      return PolicyEvaluationListResponseSchema.parse(
        await context.governance.listEvaluations(identity.user.id, limit),
      );
    },
  );
};

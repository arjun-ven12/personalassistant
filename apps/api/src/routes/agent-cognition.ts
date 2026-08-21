import {
  CognitiveDashboardResponseSchema,
  CognitiveSearchQuerySchema,
  CognitiveSearchResponseSchema,
  ReflectionResponseSchema,
  ReasoningResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const AgentParametersSchema = z
  .object({ agentId: z.string().min(3).max(120) })
  .strict();

export const registerAgentCognitionRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/agent-cognition/dashboard",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CognitiveDashboardResponseSchema.parse(
        await context.agentCognition.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agent-cognition/search",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = CognitiveSearchQuerySchema.parse(request.query);
      return CognitiveSearchResponseSchema.parse(
        await context.agentCognition.search(identity.user.id, query),
      );
    },
  );

  app.post(
    "/api/agent-cognition/reflections",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ReflectionResponseSchema.parse(
        await context.agentCognition.reflect({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/agent-cognition/reason",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ReasoningResponseSchema.parse(
        await context.agentCognition.reason({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/agent-cognition/agents/:agentId/consolidate",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { agentId } = AgentParametersSchema.parse(request.params);
      return context.agentCognition.consolidate(
        identity.user.id,
        agentId,
        request.id,
        request.ip,
      );
    },
  );
};

import {
  AgentMemoryResponseSchema,
  EngineeringDecisionListResponseSchema,
  EngineeringDecisionResponseSchema,
  KnowledgeGraphResponseSchema,
  MemoryCenterResponseSchema,
  MemoryRecordResponseSchema,
  MemorySearchQuerySchema,
  MemorySearchResponseSchema,
  MemoryStatisticsSchema,
  MemorySuggestionListResponseSchema,
  MemoryTimelineResponseSchema,
  RepositoryMemoryResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const RepositoryParametersSchema = z
  .object({ repositoryId: z.string().uuid() })
  .strict();
const AgentParametersSchema = z
  .object({ agentId: z.string().min(3).max(120) })
  .strict();

export const registerMemoryRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/memory/center",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return MemoryCenterResponseSchema.parse(
        await context.memory.center(identity.user.id),
      );
    },
  );

  app.get(
    "/api/memory/search",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = MemorySearchQuerySchema.parse(request.query);
      return MemorySearchResponseSchema.parse(
        await context.memory.search(identity.user.id, query),
      );
    },
  );

  app.post(
    "/api/memory",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return MemoryRecordResponseSchema.parse(
        await context.memory.recordMemory({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/memory/graph",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return KnowledgeGraphResponseSchema.parse(
        await context.memory.graph(identity.user.id),
      );
    },
  );

  app.get(
    "/api/memory/decisions",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return EngineeringDecisionListResponseSchema.parse(
        await context.memory.decisions(identity.user.id),
      );
    },
  );

  app.post(
    "/api/memory/decisions",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return EngineeringDecisionResponseSchema.parse(
        await context.memory.recordDecision({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
          approver: identity.user.email,
        }),
      );
    },
  );

  app.get(
    "/api/memory/repositories/:repositoryId",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return RepositoryMemoryResponseSchema.parse(
        await context.memory.repositoryMemory(identity.user.id, repositoryId),
      );
    },
  );

  app.get(
    "/api/memory/agents/:agentId",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { agentId } = AgentParametersSchema.parse(request.params);
      return AgentMemoryResponseSchema.parse(
        await context.memory.agentMemory(identity.user.id, agentId),
      );
    },
  );

  app.get(
    "/api/memory/timeline",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return MemoryTimelineResponseSchema.parse(
        await context.memory.timeline(identity.user.id),
      );
    },
  );

  app.get(
    "/api/memory/suggestions",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return MemorySuggestionListResponseSchema.parse(
        await context.memory.suggestions(identity.user.id),
      );
    },
  );

  app.get(
    "/api/memory/statistics",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return MemoryStatisticsSchema.parse(
        await context.memory.statistics(identity.user.id),
      );
    },
  );
};

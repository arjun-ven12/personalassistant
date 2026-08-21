import {
  KnowledgeContextRequestSchema,
  KnowledgeContextResponseSchema,
  KnowledgeEntityResponseSchema,
  KnowledgeGraphDashboardResponseSchema,
  KnowledgePathQuerySchema,
  KnowledgePathResponseSchema,
  KnowledgeRelationshipSchema,
  KnowledgeSearchQuerySchema,
  KnowledgeSearchResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const EntityParamsSchema = z.object({ id: z.string().uuid() }).strict();
const MemoryParamsSchema = z.object({ memoryId: z.string().uuid() }).strict();

const mutationGuards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];

export const registerKnowledgeGraphRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/knowledge-graph",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return KnowledgeGraphDashboardResponseSchema.parse(
        await context.knowledgeGraph.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/knowledge-graph/entities",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = KnowledgeSearchQuerySchema.parse(request.query);
      return KnowledgeSearchResponseSchema.parse(
        await context.knowledgeGraph.search(identity.user.id, query),
      );
    },
  );

  app.post(
    "/api/knowledge-graph/entities",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return KnowledgeEntityResponseSchema.shape.entity.parse(
        await context.knowledgeGraph.createEntity({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/knowledge-graph/entities/:id",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = EntityParamsSchema.parse(request.params);
      return KnowledgeEntityResponseSchema.parse(
        await context.knowledgeGraph.entity(identity.user.id, params.id),
      );
    },
  );

  app.patch(
    "/api/knowledge-graph/entities/:id",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = EntityParamsSchema.parse(request.params);
      return KnowledgeEntityResponseSchema.shape.entity.parse(
        await context.knowledgeGraph.updateEntity({
          ownerId: identity.user.id,
          entityId: params.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/knowledge-graph/entities/:id/relationships",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = EntityParamsSchema.parse(request.params);
      return z
        .array(KnowledgeRelationshipSchema)
        .max(1_000)
        .parse(await context.knowledgeGraph.relationships(identity.user.id, params.id));
    },
  );

  app.get(
    "/api/knowledge-graph/entities/:id/neighbors",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = EntityParamsSchema.parse(request.params);
      return KnowledgeContextResponseSchema.parse(
        await context.knowledgeGraph.context(identity.user.id, {
          entityIds: [params.id],
          depth: 1,
          limit: 50,
        }),
      );
    },
  );

  app.get(
    "/api/knowledge-graph/entities/:id/evidence",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = EntityParamsSchema.parse(request.params);
      return KnowledgeEntityResponseSchema.parse(
        await context.knowledgeGraph.entity(identity.user.id, params.id),
      ).evidence;
    },
  );

  app.get(
    "/api/knowledge-graph/relationships",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return z
        .array(KnowledgeRelationshipSchema)
        .max(1_000)
        .parse(await context.knowledgeGraph.relationships(identity.user.id));
    },
  );

  app.post(
    "/api/knowledge-graph/relationships",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return KnowledgeRelationshipSchema.parse(
        await context.knowledgeGraph.createRelationship({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/knowledge-graph/search",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = KnowledgeSearchQuerySchema.parse(request.query);
      return KnowledgeSearchResponseSchema.parse(
        await context.knowledgeGraph.search(identity.user.id, query),
      );
    },
  );

  app.get(
    "/api/knowledge-graph/path",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = KnowledgePathQuerySchema.parse(request.query);
      return KnowledgePathResponseSchema.parse(
        await context.knowledgeGraph.path(identity.user.id, query),
      );
    },
  );

  app.get(
    "/api/knowledge-graph/context",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = KnowledgeContextRequestSchema.parse(request.query);
      return KnowledgeContextResponseSchema.parse(
        await context.knowledgeGraph.context(identity.user.id, query),
      );
    },
  );

  app.get(
    "/api/knowledge-graph/conflicts",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return KnowledgeGraphDashboardResponseSchema.parse(
        await context.knowledgeGraph.dashboard(identity.user.id),
      ).conflicts;
    },
  );

  app.post(
    "/api/knowledge-graph/promote-memory/:memoryId",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = MemoryParamsSchema.parse(request.params);
      return await context.knowledgeGraph.promoteMemory({
        ownerId: identity.user.id,
        memoryId: params.memoryId,
        requestId: request.id,
        ipAddress: request.ip,
      });
    },
  );
};

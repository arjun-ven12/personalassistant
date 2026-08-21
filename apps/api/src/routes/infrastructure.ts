import {
  EmbeddingJobListResponseSchema,
  HybridSearchRequestSchema,
  HybridSearchResponseSchema,
  InfrastructureStatusResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";

export const registerInfrastructureRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/infrastructure/status",
    { preHandler: [context.security.requireAuthentication] },
    async () =>
      InfrastructureStatusResponseSchema.parse(await context.infrastructure.status()),
  );

  app.get(
    "/api/infrastructure/redis",
    { preHandler: [context.security.requireAuthentication] },
    async () => {
      const health = await context.redis.health();
      return {
        mode: health.mode,
        available: health.available,
        latencyMs: health.latencyMs,
        namespace: context.redis.namespace,
      };
    },
  );

  app.get(
    "/api/infrastructure/cache/metrics",
    { preHandler: [context.security.requireAuthentication] },
    () => context.cache.metrics(),
  );

  app.get(
    "/api/infrastructure/workers",
    { preHandler: [context.security.requireAuthentication] },
    () => context.workers.status(),
  );

  app.get(
    "/api/infrastructure/embedding-jobs",
    { preHandler: [context.security.requireAuthentication] },
    () => EmbeddingJobListResponseSchema.parse(context.embeddings.listJobs()),
  );

  app.post(
    "/api/infrastructure/hybrid-search",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = HybridSearchRequestSchema.parse(request.body);
      return HybridSearchResponseSchema.parse(
        await context.retrieval.hybridSearch(identity.user.id, body),
      );
    },
  );
};

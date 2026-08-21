import {
  CognitiveActionImpactSchema,
  CognitiveContextPreviewSchema,
  CognitiveExportResponseSchema,
  CognitiveExplanationSchema,
  CognitiveItemSchema,
  CognitiveProvenanceSchema,
  MemoryStudioSearchQuerySchema,
  MemoryStudioSearchResponseSchema,
  EmbeddingInspectionSchema,
  MemoryStudioDashboardSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const IdParamsSchema = z.object({ id: z.string().min(1).max(300) }).strict();

const mutationGuards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];

export const registerMemoryStudioRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/memory-studio",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return MemoryStudioDashboardSchema.parse(
        await context.memoryStudio.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/memory-studio/overview",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return MemoryStudioDashboardSchema.parse(
        await context.memoryStudio.dashboard(identity.user.id),
      ).overview;
    },
  );

  app.get(
    "/api/memory-studio/search",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = MemoryStudioSearchQuerySchema.parse(request.query);
      return MemoryStudioSearchResponseSchema.parse(
        await context.memoryStudio.search(identity.user.id, query),
      );
    },
  );

  app.get(
    "/api/memory-studio/items/:id",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return CognitiveItemSchema.parse(
        await context.memoryStudio.getItem(identity.user.id, params.id),
      );
    },
  );

  app.get(
    "/api/memory-studio/items/:id/provenance",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return z
        .array(CognitiveProvenanceSchema)
        .max(100)
        .parse(await context.memoryStudio.provenance(identity.user.id, params.id));
    },
  );

  app.get(
    "/api/memory-studio/items/:id/usage",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return await context.memoryStudio.usage(identity.user.id, params.id);
    },
  );

  app.get(
    "/api/memory-studio/items/:id/history",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return await context.memoryStudio.history(identity.user.id, params.id);
    },
  );

  app.get(
    "/api/memory-studio/items/:id/related",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return z
        .array(CognitiveItemSchema)
        .max(50)
        .parse(await context.memoryStudio.related(identity.user.id, params.id));
    },
  );

  app.get(
    "/api/memory-studio/items/:id/explain",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return CognitiveExplanationSchema.parse(
        await context.memoryStudio.explain(identity.user.id, params.id),
      );
    },
  );

  app.patch(
    "/api/memory-studio/items/:id",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return await context.memoryStudio.update(
        identity.user.id,
        params.id,
        request.body,
      );
    },
  );

  app.post(
    "/api/memory-studio/items/:id/archive",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return CognitiveActionImpactSchema.parse(
        await context.memoryStudio.setArchived(identity.user.id, params.id, true),
      );
    },
  );

  app.post(
    "/api/memory-studio/items/:id/restore",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return CognitiveActionImpactSchema.parse(
        await context.memoryStudio.setArchived(identity.user.id, params.id, false),
      );
    },
  );

  app.post(
    "/api/memory-studio/items/:id/pin",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return CognitiveItemSchema.parse(
        await context.memoryStudio.setPinned(identity.user.id, params.id, true),
      );
    },
  );

  app.post(
    "/api/memory-studio/items/:id/unpin",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return CognitiveItemSchema.parse(
        await context.memoryStudio.setPinned(identity.user.id, params.id, false),
      );
    },
  );

  app.delete(
    "/api/memory-studio/items/:id",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return CognitiveActionImpactSchema.parse(
        await context.memoryStudio.deleteImpact(identity.user.id, params.id),
      );
    },
  );

  app.post(
    "/api/memory-studio/merge",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CognitiveActionImpactSchema.parse(
        await context.memoryStudio.merge(identity.user.id, request.body),
      );
    },
  );

  app.post(
    "/api/memory-studio/reindex",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = z
        .object({ itemId: z.string().min(1).max(300) })
        .strict()
        .parse(request.body);
      return CognitiveActionImpactSchema.parse(
        await context.memoryStudio.reindex(identity.user.id, body.itemId),
      );
    },
  );

  app.get(
    "/api/memory-studio/conflicts",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return (await context.memoryStudio.dashboard(identity.user.id)).conflicts;
    },
  );

  app.get(
    "/api/memory-studio/low-confidence",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return (await context.memoryStudio.dashboard(identity.user.id)).lowConfidence;
    },
  );

  app.get(
    "/api/memory-studio/stale",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return (await context.memoryStudio.dashboard(identity.user.id)).stale;
    },
  );

  app.get(
    "/api/memory-studio/embeddings",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return z
        .array(EmbeddingInspectionSchema)
        .max(100)
        .parse((await context.memoryStudio.dashboard(identity.user.id)).embeddings);
    },
  );

  app.get(
    "/api/memory-studio/health",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return (await context.memoryStudio.dashboard(identity.user.id)).health;
    },
  );

  app.post(
    "/api/memory-studio/context-preview",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CognitiveContextPreviewSchema.parse(
        await context.memoryStudio.contextPreview(identity.user.id, request.body),
      );
    },
  );

  app.get(
    "/api/memory-studio/export",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CognitiveExportResponseSchema.parse(
        await context.memoryStudio.export(identity.user.id),
      );
    },
  );
};

import {
  ApiDiscoveryResponseSchema,
  ArchitectureGraphResponseSchema,
  DatabaseDiscoveryResponseSchema,
  DependencyGraphResponseSchema,
  RepositoryDetailResponseSchema,
  RepositoryFilesResponseSchema,
  RepositoryInsightsResponseSchema,
  RepositoryCodeReviewResponseSchema,
  RepositoryDocumentationResponseSchema,
  RepositoryImpactAnalysisResponseSchema,
  RepositoryImplementationPlanResponseSchema,
  RepositoryListResponseSchema,
  RepositoryReindexRequestSchema,
  RepositoryReasoningMemorySchema,
  RepositoryReasoningResponseSchema,
  RepositorySearchResponseSchema,
  RepositoryTreeResponseSchema,
  RepositoryStatisticsSchema,
  SemanticDefinitionResponseSchema,
  SemanticReferencesResponseSchema,
  SemanticSearchResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";
import { installCompanyRouteGuard } from "./company-guard.js";

const RepositoryParametersSchema = z
  .object({ repositoryId: z.string().uuid() })
  .strict();

export const registerRepositoryRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  installCompanyRouteGuard(app, "/api/repositories", context);
  app.get(
    "/api/repositories",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return RepositoryListResponseSchema.parse(
        await context.repositories.list(identity.user.id),
      );
    },
  );

  app.get(
    "/api/repositories/:repositoryId",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return RepositoryDetailResponseSchema.parse(
        await context.repositories.get(identity.user.id, repositoryId),
      );
    },
  );

  app.post(
    "/api/repositories/:repositoryId/reindex",
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
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return context.repositories.reindex({
        ownerId: identity.user.id,
        sessionId: identity.session.id,
        repositoryId,
        reason: RepositoryReindexRequestSchema.parse(request.body).reason,
        networkState: context.security.getNetworkState(request),
        ipAddress: request.ip,
        requestId: request.id,
      });
    },
  );

  app.get(
    "/api/repositories/:repositoryId/tree",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return RepositoryTreeResponseSchema.parse(
        await context.repositories.tree(identity.user.id, repositoryId),
      );
    },
  );

  app.get(
    "/api/repositories/:repositoryId/files",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return RepositoryFilesResponseSchema.parse(
        await context.repositories.files(identity.user.id, repositoryId, request.query),
      );
    },
  );

  app.get(
    "/api/repositories/:repositoryId/search",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return RepositorySearchResponseSchema.parse(
        await context.repositories.search(
          identity.user.id,
          repositoryId,
          request.query,
        ),
      );
    },
  );

  app.get(
    "/api/repositories/:repositoryId/statistics",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      const statistics = await context.repositories.statistics(
        identity.user.id,
        repositoryId,
      );
      return statistics ? RepositoryStatisticsSchema.parse(statistics) : null;
    },
  );

  app.get(
    "/api/repositories/:repositoryId/semantic-search",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return SemanticSearchResponseSchema.parse(
        await context.repositories.semanticSearch(
          identity.user.id,
          repositoryId,
          request.query,
        ),
      );
    },
  );

  app.get(
    "/api/repositories/:repositoryId/definition",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return SemanticDefinitionResponseSchema.parse(
        await context.repositories.definition(
          identity.user.id,
          repositoryId,
          request.query,
        ),
      );
    },
  );

  app.get(
    "/api/repositories/:repositoryId/references",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return SemanticReferencesResponseSchema.parse(
        await context.repositories.references(
          identity.user.id,
          repositoryId,
          request.query,
        ),
      );
    },
  );

  app.get(
    "/api/repositories/:repositoryId/dependencies",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return DependencyGraphResponseSchema.parse(
        await context.repositories.dependencyGraph(identity.user.id, repositoryId),
      );
    },
  );

  app.get(
    "/api/repositories/:repositoryId/architecture",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return ArchitectureGraphResponseSchema.parse(
        await context.repositories.architectureGraph(identity.user.id, repositoryId),
      );
    },
  );

  app.get(
    "/api/repositories/:repositoryId/api-routes",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return ApiDiscoveryResponseSchema.parse(
        await context.repositories.apiDiscovery(identity.user.id, repositoryId),
      );
    },
  );

  app.get(
    "/api/repositories/:repositoryId/database-models",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return DatabaseDiscoveryResponseSchema.parse(
        await context.repositories.databaseDiscovery(identity.user.id, repositoryId),
      );
    },
  );

  app.get(
    "/api/repositories/:repositoryId/insights",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return RepositoryInsightsResponseSchema.parse(
        await context.repositories.insights(identity.user.id, repositoryId),
      );
    },
  );

  app.post(
    "/api/repositories/:repositoryId/engineering/question",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return RepositoryReasoningResponseSchema.parse(
        await context.repositories.engineeringQuestion({
          ownerId: identity.user.id,
          sessionId: identity.session.id,
          repositoryId,
          body: request.body,
        }),
      );
    },
  );

  app.post(
    "/api/repositories/:repositoryId/engineering/impact",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return RepositoryImpactAnalysisResponseSchema.parse(
        await context.repositories.impactAnalysis({
          ownerId: identity.user.id,
          sessionId: identity.session.id,
          repositoryId,
          body: request.body,
        }),
      );
    },
  );

  app.post(
    "/api/repositories/:repositoryId/engineering/plan",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return RepositoryImplementationPlanResponseSchema.parse(
        await context.repositories.implementationPlan({
          ownerId: identity.user.id,
          sessionId: identity.session.id,
          repositoryId,
          body: request.body,
        }),
      );
    },
  );

  app.post(
    "/api/repositories/:repositoryId/engineering/review",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return RepositoryCodeReviewResponseSchema.parse(
        await context.repositories.codeReview({
          ownerId: identity.user.id,
          sessionId: identity.session.id,
          repositoryId,
          body: request.body,
        }),
      );
    },
  );

  app.post(
    "/api/repositories/:repositoryId/engineering/documentation",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { repositoryId } = RepositoryParametersSchema.parse(request.params);
      return RepositoryDocumentationResponseSchema.parse(
        await context.repositories.documentation({
          ownerId: identity.user.id,
          sessionId: identity.session.id,
          repositoryId,
          body: request.body,
        }),
      );
    },
  );

  app.get(
    "/api/repositories/:repositoryId/engineering/memory",
    { preHandler: [context.security.requireAuthentication] },
    (request) => {
      const identity = context.security.getIdentity(request);
      RepositoryParametersSchema.parse(request.params);
      return RepositoryReasoningMemorySchema.parse(
        context.repositories.reasoningMemory(identity.session.id),
      );
    },
  );
};

import {
  CompanyCredentialReferenceSchema,
  CompanyDataDashboardSchema,
  CompanyDataPipelineSchema,
  CompanyDataPolicySchema,
  CompanyDataSourceSchema,
  CompanyDatasetSchema,
  CompanyGlossaryTermSchema,
  CompanyIntegrationBindingSchema,
  CompanyPipelineRunSchema,
  CompanySemanticSearchRequestSchema,
  CompanySemanticDocumentSchema,
  MetadataEntitySchema,
  MetadataLineageEdgeSchema,
  ResolvedCompanyAgentContextSchema,
  SemanticMetricObservationSchema,
  SemanticMetricQueryResultSchema,
  SemanticMetricSchema,
} from "@alexa-control/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";
import { installCompanyRouteGuard } from "./company-guard.js";

const IdParams = z.object({ id: z.string().uuid() }).strict();
const PipelineParams = z.object({ pipelineId: z.string().uuid() }).strict();
const MetricParams = z.object({ canonicalKey: z.string().min(2).max(160) }).strict();
const AssignmentParams = z.object({ assignmentId: z.string().uuid() }).strict();
const GlossaryQuery = z.object({ q: z.string().trim().min(1).max(160) }).strict();
const MetricQuery = z
  .object({
    assignmentId: z.string().uuid().optional(),
    taskId: z.string().uuid().optional(),
    reasonCapability: z.string().min(2).max(160).optional(),
  })
  .strict();
const mutation = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];
const scoped = (context: ApiRouteContext, request: FastifyRequest) => {
  const identity = context.security.getIdentity(request);
  const company = context.companyContext.get(request);
  return {
    ownerId: identity.user.id,
    companyId: company.companyId,
    requestId: request.id,
    ipAddress: request.ip,
  };
};

export const registerCompanyDataRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  installCompanyRouteGuard(app, "/api/company-data", context);
  app.get(
    "/api/company-data",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const scope = scoped(context, request);
      return CompanyDataDashboardSchema.parse(
        await context.companyData.dashboard(scope.ownerId, scope.companyId),
      );
    },
  );
  app.post(
    "/api/company-data/sources",
    { preHandler: mutation(context) },
    async (request) =>
      CompanyDataSourceSchema.parse(
        await context.companyData.createSource(scoped(context, request), request.body),
      ),
  );
  app.post(
    "/api/company-data/datasets",
    { preHandler: mutation(context) },
    async (request) =>
      CompanyDatasetSchema.parse(
        await context.companyData.createDataset(scoped(context, request), request.body),
      ),
  );
  app.post(
    "/api/company-data/pipelines",
    { preHandler: mutation(context) },
    async (request) =>
      CompanyDataPipelineSchema.parse(
        await context.companyData.createPipeline(
          scoped(context, request),
          request.body,
        ),
      ),
  );
  app.post(
    "/api/company-data/pipelines/:pipelineId/run",
    { preHandler: mutation(context) },
    async (request) =>
      CompanyPipelineRunSchema.parse(
        await context.companyData.runPipeline(
          scoped(context, request),
          PipelineParams.parse(request.params).pipelineId,
        ),
      ),
  );
  app.post(
    "/api/company-data/metadata",
    { preHandler: mutation(context) },
    async (request) =>
      MetadataEntitySchema.parse(
        await context.companyData.createMetadataEntity(
          scoped(context, request),
          request.body,
        ),
      ),
  );
  app.post(
    "/api/company-data/lineage",
    { preHandler: mutation(context) },
    async (request) =>
      MetadataLineageEdgeSchema.parse(
        await context.companyData.createLineageEdge(
          scoped(context, request),
          request.body,
        ),
      ),
  );
  app.get(
    "/api/company-data/lineage/:id",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const scope = scoped(context, request);
      return z
        .array(MetadataLineageEdgeSchema)
        .max(500)
        .parse(
          await context.companyData.lineage(
            scope.ownerId,
            scope.companyId,
            IdParams.parse(request.params).id,
          ),
        );
    },
  );
  app.post(
    "/api/company-data/glossary",
    { preHandler: mutation(context) },
    async (request) =>
      CompanyGlossaryTermSchema.parse(
        await context.companyData.createGlossaryTerm(
          scoped(context, request),
          request.body,
        ),
      ),
  );
  app.get(
    "/api/company-data/glossary/resolve",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const scope = scoped(context, request);
      return CompanyGlossaryTermSchema.nullable().parse(
        await context.companyData.resolveGlossary(
          scope.ownerId,
          scope.companyId,
          GlossaryQuery.parse(request.query).q,
        ),
      );
    },
  );
  app.post(
    "/api/company-data/metrics",
    { preHandler: mutation(context) },
    async (request) =>
      SemanticMetricSchema.parse(
        await context.companyData.createMetric(scoped(context, request), request.body),
      ),
  );
  app.post(
    "/api/company-data/metrics/:canonicalKey/observations",
    { preHandler: mutation(context) },
    async (request) =>
      SemanticMetricObservationSchema.parse(
        await context.companyData.recordMetric(
          scoped(context, request),
          MetricParams.parse(request.params).canonicalKey,
          request.body,
        ),
      ),
  );
  app.get(
    "/api/company-data/metrics/:canonicalKey",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const scope = scoped(context, request);
      const query = MetricQuery.parse(request.query);
      const canonicalKey = MetricParams.parse(request.params).canonicalKey;
      const result = SemanticMetricQueryResultSchema.parse(
        await context.companyData.queryMetric(
          scope.ownerId,
          scope.companyId,
          canonicalKey,
          query.assignmentId ? { assignmentId: query.assignmentId } : {},
        ),
      );
      await context.governanceAudit({
        eventType: "SENSITIVE_DATA_ACCESSED",
        ownerId: scope.ownerId,
        companyId: scope.companyId,
        ipAddress: scope.ipAddress,
        outcome: "SUCCESS",
        reason: "CANONICAL_COMPANY_METRIC_READ",
        requestId: scope.requestId,
        metadata: {
          metricId: result.definition.id,
          canonicalKey,
          assignmentId: query.assignmentId ?? "OWNER",
          taskId: query.taskId ?? "NONE",
          capability: query.reasonCapability ?? "company.metric.read",
        },
      });
      return result;
    },
  );
  app.post(
    "/api/company-data/credentials",
    { preHandler: mutation(context) },
    async (request) =>
      CompanyCredentialReferenceSchema.omit({ secretLocator: true }).parse(
        await context.companyData.upsertCredentialReference(
          scoped(context, request),
          request.body,
        ),
      ),
  );
  app.post(
    "/api/company-data/integrations",
    { preHandler: mutation(context) },
    async (request) =>
      CompanyIntegrationBindingSchema.parse(
        await context.companyData.upsertIntegrationBinding(
          scoped(context, request),
          request.body,
        ),
      ),
  );
  app.post(
    "/api/company-data/policy",
    { preHandler: mutation(context) },
    async (request) =>
      CompanyDataPolicySchema.parse(
        await context.companyData.updatePolicy(scoped(context, request), request.body),
      ),
  );
  app.post(
    "/api/company-data/memory/index",
    { preHandler: mutation(context) },
    async (request) =>
      CompanySemanticDocumentSchema.parse(
        await context.companyData.indexSemanticDocument(
          scoped(context, request),
          request.body,
        ),
      ),
  );
  app.post(
    "/api/company-data/memory/search",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const scope = scoped(context, request);
      const query = CompanySemanticSearchRequestSchema.parse(request.body);
      const results = z
        .array(
          z
            .object({ document: CompanySemanticDocumentSchema, score: z.number() })
            .strict(),
        )
        .max(50)
        .parse(
          await context.companyData.semanticSearch(
            scope.ownerId,
            scope.companyId,
            query,
          ),
        );
      if (
        results.some((item) =>
          ["CONFIDENTIAL", "RESTRICTED"].includes(item.document.sensitivity),
        )
      )
        await context.governanceAudit({
          eventType: "SENSITIVE_DATA_ACCESSED",
          ownerId: scope.ownerId,
          companyId: scope.companyId,
          ipAddress: scope.ipAddress,
          outcome: "SUCCESS",
          reason: "AUTHORIZED_COMPANY_SEMANTIC_RETRIEVAL",
          requestId: scope.requestId,
          metadata: {
            assignmentId: query.assignmentId ?? "OWNER",
            resultCount: results.length,
            entityTypes: query.entityTypes.join(",") || "ANY_AUTHORIZED",
          },
        });
      return results;
    },
  );
  app.get(
    "/api/company-data/agents/:assignmentId/context",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const scope = scoped(context, request);
      return ResolvedCompanyAgentContextSchema.parse(
        await context.companyData.resolveAgentContext(
          scope.ownerId,
          scope.companyId,
          AssignmentParams.parse(request.params).assignmentId,
        ),
      );
    },
  );
};

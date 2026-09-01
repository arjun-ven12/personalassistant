import {
  AIObservabilityTraceSchema,
  OwnerPortfolioDashboardSchema,
  PortfolioAIOverviewSchema,
  PortfolioAITraceQuerySchema,
  PortfolioAlertActionSchema,
  PortfolioAttentionSignalSchema,
  PortfolioMetricComparisonRequestSchema,
  PortfolioMetricCompatibilitySchema,
  PortfolioSystemOverviewSchema,
  PortfolioTraceQuerySchema,
  SystemTelemetrySpanSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const SignalParams = z.object({ signalId: z.string().min(1).max(240) }).strict();
const ExecutiveBriefSchema = z
  .object({
    generatedAt: z.iso.datetime(),
    summary: z.string().max(1_000),
    companiesNeedingAttention: z.array(z.string().max(160)).max(100),
    insights: OwnerPortfolioDashboardSchema.shape.insights,
    executed: z.literal(false),
  })
  .strict();

export const registerPortfolioRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  const owner = (request: Parameters<typeof context.security.getIdentity>[0]) =>
    context.security.getIdentity(request).user.id;
  app.get(
    "/api/portfolio",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      OwnerPortfolioDashboardSchema.parse(
        await context.portfolio.dashboard(owner(request)),
      ),
  );
  app.post(
    "/api/portfolio/compare",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      PortfolioMetricCompatibilitySchema.parse(
        await context.portfolio.compareMetrics(
          owner(request),
          PortfolioMetricComparisonRequestSchema.parse(request.body),
        ),
      ),
  );
  app.get(
    "/api/portfolio/system",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      PortfolioSystemOverviewSchema.parse(
        (await context.portfolio.dashboard(owner(request))).systemHealth,
      ),
  );
  app.get(
    "/api/portfolio/ai",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      PortfolioAIOverviewSchema.parse(
        (await context.portfolio.dashboard(owner(request))).aiHealth,
      ),
  );
  app.get(
    "/api/portfolio/traces",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const query = PortfolioTraceQuerySchema.parse(request.query);
      return z
        .array(SystemTelemetrySpanSchema)
        .max(500)
        .parse(
          await context.portfolio.listSystemSpans(owner(request), {
            limit: query.limit,
            ...(query.companyId ? { companyId: query.companyId } : {}),
            ...(query.traceId ? { traceId: query.traceId } : {}),
            ...(query.status ? { status: query.status } : {}),
          }),
        );
    },
  );
  app.get(
    "/api/portfolio/ai-traces",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const query = PortfolioAITraceQuerySchema.parse(request.query);
      return z
        .array(AIObservabilityTraceSchema)
        .max(500)
        .parse(
          await context.portfolio.listAITraces(owner(request), {
            limit: query.limit,
            ...(query.companyId ? { companyId: query.companyId } : {}),
            ...(query.provider ? { provider: query.provider } : {}),
            ...(query.model ? { model: query.model } : {}),
            ...(query.taskClass ? { taskClass: query.taskClass } : {}),
          }),
        );
    },
  );
  app.get(
    "/api/portfolio/brief",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      ExecutiveBriefSchema.parse(
        await context.executive.ownerPortfolioBrief(owner(request)),
      ),
  );
  app.post(
    "/api/portfolio/attention/:signalId",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) =>
      PortfolioAttentionSignalSchema.parse(
        await context.portfolio.updateAlert(
          owner(request),
          SignalParams.parse(request.params).signalId,
          PortfolioAlertActionSchema.parse(request.body),
          { requestId: request.id, ipAddress: request.ip },
        ),
      ),
  );
};

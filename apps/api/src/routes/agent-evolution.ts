import {
  BenchmarkResultRecordSchema,
  CapabilityMarketplaceRecordSchema,
  EvolutionAnalysisResponseSchema,
  EvolutionDashboardResponseSchema,
  EvolutionProposalRecordSchema,
  EvolutionProposalResponseSchema,
  EvolutionRecordSchema,
  EvolutionTimelineRecordSchema,
  SelfEvaluationRecordSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const LimitQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(500).default(200) })
  .strict();

export const registerAgentEvolutionRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/agent-evolution/dashboard",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return EvolutionDashboardResponseSchema.parse(
        await context.agentEvolution.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agent-evolution/expertise",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return z
        .array(EvolutionRecordSchema)
        .parse(await context.agentEvolution.expertise(identity.user.id));
    },
  );

  app.get(
    "/api/agent-evolution/proposals",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return z
        .array(EvolutionProposalRecordSchema)
        .parse(await context.agentEvolution.proposals(identity.user.id, query.limit));
    },
  );

  app.post(
    "/api/agent-evolution/proposals",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return EvolutionProposalResponseSchema.parse(
        await context.agentEvolution.createProposal({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/agent-evolution/analyse",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return EvolutionAnalysisResponseSchema.parse(
        await context.agentEvolution.analyse({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/agent-evolution/timeline",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return z
        .array(EvolutionTimelineRecordSchema)
        .parse(await context.agentEvolution.timeline(identity.user.id, query.limit));
    },
  );

  app.get(
    "/api/agent-evolution/benchmarks",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return z
        .array(BenchmarkResultRecordSchema)
        .parse(await context.agentEvolution.benchmarks(identity.user.id, query.limit));
    },
  );

  app.get(
    "/api/agent-evolution/self-evaluations",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return z
        .array(SelfEvaluationRecordSchema)
        .parse(
          await context.agentEvolution.selfEvaluations(identity.user.id, query.limit),
        );
    },
  );

  app.get(
    "/api/agent-evolution/marketplace",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return z
        .array(CapabilityMarketplaceRecordSchema)
        .parse(await context.agentEvolution.marketplace(identity.user.id));
    },
  );
};

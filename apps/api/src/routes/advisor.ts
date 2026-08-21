import {
  AdvisorDashboardResponseSchema,
  ArchitectureHealthListResponseSchema,
  EngineeringGoalListResponseSchema,
  EngineeringGoalResponseSchema,
  EngineeringMetricsResponseSchema,
  EngineeringRiskListResponseSchema,
  RecommendationListResponseSchema,
  ReleaseAssessmentListResponseSchema,
  RepositoryHealthListResponseSchema,
  RoadmapListResponseSchema,
  ScenarioSimulationResponseSchema,
  StrategicPlanResponseSchema,
  TechnicalDebtListResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const GoalParametersSchema = z.object({ goalId: z.string().uuid() }).strict();

export const registerAdvisorRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/advisor/dashboard",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AdvisorDashboardResponseSchema.parse(
        await context.advisor.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/advisor/goals",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return EngineeringGoalListResponseSchema.parse(
        await context.advisor.goals(identity.user.id),
      );
    },
  );

  app.post(
    "/api/advisor/goals",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return EngineeringGoalResponseSchema.parse(
        await context.advisor.createGoal({
          ownerId: identity.user.id,
          ownerEmail: identity.user.email,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/advisor/goals/:goalId/plan",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { goalId } = GoalParametersSchema.parse(request.params);
      return StrategicPlanResponseSchema.parse(
        await context.advisor.planGoal({
          ownerId: identity.user.id,
          goalId,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/advisor/recommendations",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return RecommendationListResponseSchema.parse(
        await context.advisor.recommendations(identity.user.id),
      );
    },
  );

  app.get(
    "/api/advisor/risks",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return EngineeringRiskListResponseSchema.parse(
        await context.advisor.risks(identity.user.id),
      );
    },
  );

  app.get(
    "/api/advisor/repository-health",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return RepositoryHealthListResponseSchema.parse(
        await context.advisor.repositoryHealth(identity.user.id),
      );
    },
  );

  app.get(
    "/api/advisor/architecture-health",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ArchitectureHealthListResponseSchema.parse(
        await context.advisor.architectureHealth(identity.user.id),
      );
    },
  );

  app.get(
    "/api/advisor/technical-debt",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return TechnicalDebtListResponseSchema.parse(
        await context.advisor.technicalDebt(identity.user.id),
      );
    },
  );

  app.get(
    "/api/advisor/roadmaps",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return RoadmapListResponseSchema.parse(
        await context.advisor.roadmaps(identity.user.id),
      );
    },
  );

  app.post(
    "/api/advisor/simulations",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ScenarioSimulationResponseSchema.parse(
        await context.advisor.simulate({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/advisor/release-readiness",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ReleaseAssessmentListResponseSchema.parse(
        await context.advisor.releaseReadiness(identity.user.id),
      );
    },
  );

  app.get(
    "/api/advisor/metrics",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return EngineeringMetricsResponseSchema.parse(
        await context.advisor.metrics(identity.user.id),
      );
    },
  );
};

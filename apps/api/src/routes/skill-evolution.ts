import { SkillEvolutionDashboardSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";

const mutationGuards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];

export const registerSkillEvolutionRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/skill-evolution",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SkillEvolutionDashboardSchema.parse(
        await context.skillEvolution.dashboard(identity.user.id),
      );
    },
  );

  app.post(
    "/api/skill-evolution/query",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SkillEvolutionDashboardSchema.parse(
        await context.skillEvolution.query({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  for (const [path, method] of [
    ["/api/skill-evolution/candidates", "createCandidate"],
    ["/api/skill-evolution/validate", "validate"],
    ["/api/skill-evolution/benchmark", "benchmark"],
    ["/api/skill-evolution/promote", "promote"],
    ["/api/skill-evolution/rollback", "rollback"],
    ["/api/skill-evolution/deprecate", "deprecate"],
    ["/api/skill-evolution/disable", "disable"],
    ["/api/skill-evolution/candidates/dismiss", "dismissCandidate"],
    ["/api/skill-evolution/candidates/suppress", "suppressCandidate"],
    ["/api/skill-evolution/shadow", "evaluateShadow"],
    ["/api/skill-evolution/canary", "evaluateCanary"],
  ] as const) {
    app.post(path, { preHandler: mutationGuards(context) }, async (request) => {
      const identity = context.security.getIdentity(request);
      return SkillEvolutionDashboardSchema.parse(
        await context.skillEvolution[method]({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    });
  }

  app.post(
    "/api/skill-evolution/candidates/build",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = request.body as { candidateId?: string };
      if (!body.candidateId) throw new Error("candidateId is required");
      return SkillEvolutionDashboardSchema.parse(
        await context.skillEvolution.generateSpecification({
          ownerId: identity.user.id,
          candidateId: body.candidateId,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/skill-evolution/draft-benchmark",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      await context.skillEvolution.runDraftBenchmark(identity.user.id, {
        live: false,
        baseline: true,
      });
      return SkillEvolutionDashboardSchema.parse(
        await context.skillEvolution.dashboard(identity.user.id),
      );
    },
  );
};

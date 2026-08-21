import {
  HabitPatternSchema,
  LearnedPreferenceSchema,
  LearningCandidateSchema,
  LearningDashboardResponseSchema,
  LearningEventSchema,
  LearningExplainResponseSchema,
  LearningStatsSchema,
  LearningSuggestionSchema,
  SequencePatternSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const IdParamsSchema = z.object({ id: z.string().uuid() }).strict();

const mutationGuards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];

export const registerLearningEngineRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/learning",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return LearningDashboardResponseSchema.parse(
        await context.learningEngine.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/learning/events",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return z
        .array(LearningEventSchema)
        .max(500)
        .parse(await context.learningEngineStore.listEvents(identity.user.id, 500));
    },
  );

  app.post(
    "/api/learning/events",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return await context.learningEngine.ingest({
        ownerId: identity.user.id,
        body: request.body,
        requestId: request.id,
        ipAddress: request.ip,
      });
    },
  );

  app.get(
    "/api/learning/candidates",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return z
        .array(LearningCandidateSchema)
        .max(500)
        .parse(await context.learningEngineStore.listCandidates(identity.user.id, 500));
    },
  );

  app.get(
    "/api/learning/preferences",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return z
        .array(LearnedPreferenceSchema)
        .max(500)
        .parse(
          await context.learningEngineStore.listPreferences(identity.user.id, 500),
        );
    },
  );

  app.post(
    "/api/learning/preferences",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return LearnedPreferenceSchema.parse(
        await context.learningEngine.teach({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/learning/habits",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return z
        .array(HabitPatternSchema)
        .max(200)
        .parse(await context.learningEngineStore.listHabits(identity.user.id, 200));
    },
  );

  app.get(
    "/api/learning/sequences",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return z
        .array(SequencePatternSchema)
        .max(200)
        .parse(await context.learningEngineStore.listSequences(identity.user.id, 200));
    },
  );

  app.post(
    "/api/learning/sequences",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return await context.learningEngine.observeSequence({
        ownerId: identity.user.id,
        body: request.body,
        requestId: request.id,
        ipAddress: request.ip,
      });
    },
  );

  app.get(
    "/api/learning/suggestions",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return z
        .array(LearningSuggestionSchema)
        .max(200)
        .parse(
          await context.learningEngineStore.listSuggestions(identity.user.id, 200),
        );
    },
  );

  app.get(
    "/api/learning/conflicts",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return LearningDashboardResponseSchema.parse(
        await context.learningEngine.dashboard(identity.user.id),
      ).conflicts;
    },
  );

  app.get(
    "/api/learning/stats",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return LearningStatsSchema.parse(
        (await context.learningEngine.dashboard(identity.user.id)).stats,
      );
    },
  );

  app.get(
    "/api/learning/explain/:id",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return LearningExplainResponseSchema.parse(
        await context.learningEngine.explain(identity.user.id, params.id),
      );
    },
  );

  app.post(
    "/api/learning/preferences/:id/approve",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return LearnedPreferenceSchema.parse(
        await context.learningEngine.approveCandidate(identity.user.id, params.id),
      );
    },
  );

  app.post(
    "/api/learning/preferences/:id/reject",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return LearningCandidateSchema.parse(
        await context.learningEngine.rejectCandidate(identity.user.id, params.id),
      );
    },
  );

  app.post(
    "/api/learning/suggestions/:id/accept",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return LearnedPreferenceSchema.parse(
        await context.learningEngine.acceptSuggestion(identity.user.id, params.id),
      );
    },
  );

  app.post(
    "/api/learning/suggestions/:id/reject",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const params = IdParamsSchema.parse(request.params);
      return LearningSuggestionSchema.parse(
        await context.learningEngine.rejectSuggestion(identity.user.id, params.id),
      );
    },
  );

  app.post(
    "/api/learning/recompute",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return z
        .array(LearningCandidateSchema)
        .max(1_000)
        .parse(await context.learningEngine.decay(identity.user.id));
    },
  );
};

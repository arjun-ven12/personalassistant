import {
  HumanUnderstandingDashboardResponseSchema,
  HumanUnderstandingResultSchema,
  CorpusDashboardResponseSchema,
  CorpusTestUtteranceResponseSchema,
  PersonalitySimulationRecordSchema,
  PreferenceLearningRecordSchema,
  PersonalityExportResponseSchema,
  ResponseExplanationRecordSchema,
  VersionCompareResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const mutationGuards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];

export const registerHumanUnderstandingRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  const dashboard = async (request: FastifyRequest) => {
    const identity = context.security.getIdentity(request);
    return HumanUnderstandingDashboardResponseSchema.parse(
      await context.humanUnderstanding.dashboard(identity.user.id),
    );
  };

  for (const path of [
    "/api/personality",
    "/api/personality/profile",
    "/api/personality/state",
    "/api/personality/studio",
    "/api/personality/learning",
    "/api/personality/history",
    "/api/personality/version",
    "/api/personality/identity",
    "/api/personality/traits",
    "/api/personality/policies",
    "/api/personality/profiles",
    "/api/personality/analytics",
    "/api/personality/why",
    "/api/personality/vocabulary",
    "/api/personality/aliases",
    "/api/personality/synonyms",
    "/api/personality/patterns",
    "/api/personality/statistics",
    "/api/human-understanding",
    "/api/human-understanding/intent",
    "/api/human-understanding/context",
    "/api/human-understanding/retrieval",
    "/api/human-understanding/confidence",
    "/api/human-understanding/clarification",
  ]) {
    app.get(path, { preHandler: [context.security.requireAuthentication] }, dashboard);
  }

  app.get(
    "/api/personality/bootstrap",
    { preHandler: [context.security.requireAuthentication] },
    dashboard,
  );

  app.post(
    "/api/personality/bootstrap",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return HumanUnderstandingDashboardResponseSchema.parse(
        await context.humanUnderstanding.bootstrap({
          ownerId: identity.user.id,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/personality/reset",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return HumanUnderstandingDashboardResponseSchema.parse(
        await context.humanUnderstanding.reset({
          ownerId: identity.user.id,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/personality/export",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return PersonalityExportResponseSchema.parse(
        await context.humanUnderstanding.export(identity.user.id),
      );
    },
  );

  app.post(
    "/api/personality/simulation",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return HumanUnderstandingResultSchema.parse(
        await context.humanUnderstanding.understand({
          ownerId: identity.user.id,
          body: { ...(request.body as object), simulateOnly: true },
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/personality/profile/switch",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = z.object({ profileName: z.string().min(1).max(120) }).parse(request.body);
      return HumanUnderstandingDashboardResponseSchema.parse(
        await context.humanUnderstanding.switchProfile({
          ownerId: identity.user.id,
          profileName: body.profileName,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/personality/learning/evidence",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = z
        .object({
          key: z.string().min(1).max(160),
          value: z.string().min(1).max(500),
          source: z.enum(["conversation", "manual", "workflow", "correction"]).default("manual"),
        })
        .parse(request.body);
      return PreferenceLearningRecordSchema.parse(
        await context.humanUnderstanding.recordLearning({
          ownerId: identity.user.id,
          key: body.key,
          value: body.value,
          source: body.source,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/personality/simulation/personality",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = z.object({ text: z.string().min(1).max(1_000) }).parse(request.body);
      return z
        .array(PersonalitySimulationRecordSchema)
        .parse(await context.humanUnderstanding.simulatePersonality({
          ownerId: identity.user.id,
          text: body.text,
        }));
    },
  );

  app.post(
    "/api/personality/why",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = z
        .object({
          response: z.string().min(1).max(2_000),
          plannerConfidence: z.number().min(0).max(1).nullable().optional(),
          aiUsed: z.boolean().optional(),
        })
        .parse(request.body);
      return ResponseExplanationRecordSchema.parse(
        await context.humanUnderstanding.explainResponse({
          ownerId: identity.user.id,
          response: body.response,
          ...(body.plannerConfidence !== undefined
            ? { plannerConfidence: body.plannerConfidence }
            : {}),
          ...(body.aiUsed !== undefined ? { aiUsed: body.aiUsed } : {}),
        }),
      );
    },
  );

  app.get(
    "/api/personality/corpus",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CorpusDashboardResponseSchema.parse(
        await context.humanUnderstanding.corpus.dashboard(identity.user.id),
      );
    },
  );

  app.post(
    "/api/personality/corpus/import",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = z
        .object({ markdownPath: z.string().min(1).max(1_000) })
        .parse(request.body);
      await context.humanUnderstanding.corpus.importFromMarkdown(
        identity.user.id,
        body.markdownPath,
      );
      return CorpusDashboardResponseSchema.parse(
        await context.humanUnderstanding.corpus.dashboard(identity.user.id),
      );
    },
  );

  app.post(
    "/api/personality/corpus/test-utterance",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = z.object({ utterance: z.string().min(1).max(1_000) }).parse(request.body);
      return CorpusTestUtteranceResponseSchema.parse(
        await context.humanUnderstanding.corpus.testUtterance(
          identity.user.id,
          body.utterance,
        ),
      );
    },
  );

  app.post(
    "/api/personality/version/compare",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return VersionCompareResponseSchema.parse(
        await context.humanUnderstanding.compareVersions(identity.user.id, request.body),
      );
    },
  );

  app.post(
    "/api/human-understanding",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return HumanUnderstandingResultSchema.parse(
        await context.humanUnderstanding.understand({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );
};

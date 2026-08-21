import { CommandStudioResponseSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const mutationGuards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];

const OptionalSkillQuerySchema = z
  .object({
    skillId: z.string().uuid().optional(),
    recordingId: z.string().uuid().optional(),
  })
  .strict();

export const registerIntentRecordingRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/command-studio",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CommandStudioResponseSchema.parse(
        await context.intentRecording.dashboard(identity.user.id),
      );
    },
  );

  app.post(
    "/api/command-studio/recordings",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CommandStudioResponseSchema.parse(
        await context.intentRecording.start({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/command-studio/events",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CommandStudioResponseSchema.parse(
        await context.intentRecording.recordEvent({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/command-studio/recordings/stop",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CommandStudioResponseSchema.parse(
        await context.intentRecording.stop({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/command-studio/generated/save",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CommandStudioResponseSchema.parse(
        await context.intentRecording.saveGeneratedCommand({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/command-studio/skills/save",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CommandStudioResponseSchema.parse(
        await context.intentRecording.saveGeneratedSkill({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/command-studio/workflows/validate",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = OptionalSkillQuerySchema.parse(request.body);
      return CommandStudioResponseSchema.parse(
        await context.intentRecording.validateWorkflow({
          ownerId: identity.user.id,
          ...(query.skillId ? { skillId: query.skillId } : {}),
          ...(query.recordingId ? { recordingId: query.recordingId } : {}),
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/command-studio/workflows/edit",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CommandStudioResponseSchema.parse(
        await context.intentRecording.editWorkflow({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/command-studio/workflows/simulate",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CommandStudioResponseSchema.parse(
        await context.intentRecording.simulateWorkflow({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/demonstrations/skills",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CommandStudioResponseSchema.parse(
        await context.intentRecording.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/demonstrations/timelines",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CommandStudioResponseSchema.parse(
        await context.intentRecording.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/demonstrations/execution-history",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CommandStudioResponseSchema.parse(
        await context.intentRecording.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/demonstrations/analytics",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CommandStudioResponseSchema.parse(
        await context.intentRecording.dashboard(identity.user.id),
      );
    },
  );
};

import { DesktopSkillsCenterResponseSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";

const mutationGuards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];

export const registerDesktopSkillRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/desktop-skills",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return DesktopSkillsCenterResponseSchema.parse(
        await context.desktopSkills.dashboard(identity.user.id),
      );
    },
  );

  app.post(
    "/api/desktop-skills/execute",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return DesktopSkillsCenterResponseSchema.parse(
        await context.desktopSkills.execute({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  for (const [path, method] of [
    ["/api/desktop-skills/pause", "pause"],
    ["/api/desktop-skills/resume", "resume"],
    ["/api/desktop-skills/cancel", "cancel"],
    ["/api/desktop-skills/recovery", "recover"],
  ] as const) {
    app.post(path, { preHandler: mutationGuards(context) }, async (request) => {
      const identity = context.security.getIdentity(request);
      return DesktopSkillsCenterResponseSchema.parse(
        await context.desktopSkills[method]({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    });
  }
};

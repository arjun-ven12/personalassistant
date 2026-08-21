import {
  ReflectionDashboardSchema,
  ReflectionEngineResponseSchema,
  ReflectionFeedbackRequestSchema,
  ReflectionRecordSchema,
  ReflectionQuerySchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import type { ApiRouteContext } from "./context.js";
export const registerReflectionRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/reflections",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      ReflectionDashboardSchema.parse(
        await context.reflection.dashboard(
          context.security.getIdentity(request).user.id,
        ),
      ),
  );
  app.post(
    "/api/reflections/query",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      request.raw.once("aborted", abort);
      try {
        return ReflectionEngineResponseSchema.parse(
          await context.reflection.query(
            context.security.getIdentity(request).user.id,
            ReflectionQuerySchema.parse(request.body),
            { signal: controller.signal },
          ),
        );
      } finally {
        request.raw.off("aborted", abort);
      }
    },
  );
  app.post(
    "/api/reflections/:reflectionId/feedback",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request, reply) => {
      const params = request.params as { reflectionId: string };
      const result = await context.reflection.recordFeedback(
        context.security.getIdentity(request).user.id,
        params.reflectionId,
        ReflectionFeedbackRequestSchema.parse(request.body),
      );
      if (!result) return reply.code(404).send({ error: "Reflection not found." });
      return ReflectionRecordSchema.parse(result);
    },
  );
};

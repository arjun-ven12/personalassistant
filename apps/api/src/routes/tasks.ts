import { TaskCenterResponseSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";

export const registerTaskRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  app.get(
    "/api/tasks",
    { preHandler: [context.security.requireAuthentication, context.companyContext.requireCompany] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return TaskCenterResponseSchema.parse(
        await context.tasks.dashboard(identity.user.id),
      );
    },
  );

  for (const [path, handler] of [
    ["/api/tasks", context.tasks.createTask.bind(context.tasks)],
    ["/api/tasks/trigger", context.tasks.triggerTask.bind(context.tasks)],
    ["/api/tasks/goals", context.tasks.createGoal.bind(context.tasks)],
    ["/api/tasks/routines", context.tasks.createRoutine.bind(context.tasks)],
    ["/api/tasks/checklists", context.tasks.createChecklist.bind(context.tasks)],
  ] as const) {
    app.post(
      path,
      {
        preHandler: [
          context.security.requireAuthentication,
          context.companyContext.requireCompany,
          context.security.requireTrustedOrigin,
          context.security.requireCsrf,
        ],
      },
      async (request) => {
        const identity = context.security.getIdentity(request);
        return TaskCenterResponseSchema.parse(
          await handler({
            ownerId: identity.user.id,
            body: request.body,
            requestId: request.id,
            ipAddress: request.ip,
          }),
        );
      },
    );
  }
};

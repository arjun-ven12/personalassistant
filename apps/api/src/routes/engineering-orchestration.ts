import { EngineeringObjectiveViewSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { installCompanyRouteGuard } from "./company-guard.js";
import type { ApiRouteContext } from "./context.js";

const Params = z.object({ objectiveId: z.string().uuid() }).strict();
const ClarificationParams = z
  .object({
    objectiveId: z.string().uuid(),
    clarificationId: z.string().uuid(),
  })
  .strict();
const ReplanBody = z
  .object({ taskId: z.string().uuid(), description: z.string().min(1).max(4_000) })
  .strict();

export const registerEngineeringOrchestrationRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  installCompanyRouteGuard(app, "/api/engineering-objectives", context);
  const read = [
    context.security.requireAuthentication,
    context.companyContext.requireCompany,
  ];
  const mutate = [
    ...read,
    context.security.requireTrustedOrigin,
    context.security.requireCsrf,
    context.security.verifyTransportNetwork,
  ];
  const managerContext = (request: Parameters<typeof context.companyContext.get>[0]) => {
    const company = context.companyContext.get(request);
    return {
      ownerId: company.ownerId,
      companyId: company.companyId,
      requestId: request.id,
      ipAddress: request.ip,
      sessionId: context.security.getIdentity(request).session.id,
      networkState: context.security.getNetworkState(request),
    };
  };

  app.get("/api/engineering-objectives", { preHandler: read }, async (request) => {
    const company = context.companyContext.get(request);
    return {
      objectives: await context.engineeringManager.list(
        company.ownerId,
        company.companyId,
      ),
    };
  });
  app.get(
    "/api/engineering-objectives/:objectiveId",
    { preHandler: read },
    async (request) => {
      const company = context.companyContext.get(request);
      const { objectiveId } = Params.parse(request.params);
      return EngineeringObjectiveViewSchema.parse(
        await context.engineeringManager.view(
          company.ownerId,
          company.companyId,
          objectiveId,
        ),
      );
    },
  );
  app.post("/api/engineering-objectives", { preHandler: mutate }, async (request) =>
    EngineeringObjectiveViewSchema.parse(
      await context.engineeringManager.create(managerContext(request), request.body),
    ),
  );
  for (const action of ["run", "pause", "resume", "cancel", "recover"] as const)
    app.post(
      `/api/engineering-objectives/:objectiveId/${action}`,
      { preHandler: mutate },
      async (request) => {
        const { objectiveId } = Params.parse(request.params);
        const input = managerContext(request);
        const response =
          action === "run"
            ? await context.engineeringManager.runReady(
                input,
                objectiveId,
                `api-${request.id}`,
              )
            : action === "pause"
              ? await context.engineeringManager.pause(input, objectiveId)
              : action === "resume"
                ? await context.engineeringManager.resume(input, objectiveId)
                : action === "cancel"
                  ? await context.engineeringManager.cancel(input, objectiveId)
                  : await context.engineeringManager.recover(input, objectiveId);
        return EngineeringObjectiveViewSchema.parse(response);
      },
    );
  app.post(
    "/api/engineering-objectives/:objectiveId/clarifications/:clarificationId/answer",
    { preHandler: mutate },
    async (request) => {
      const { objectiveId, clarificationId } = ClarificationParams.parse(
        request.params,
      );
      return EngineeringObjectiveViewSchema.parse(
        await context.engineeringManager.answerClarification(
          managerContext(request),
          objectiveId,
          clarificationId,
          request.body,
        ),
      );
    },
  );
  app.post(
    "/api/engineering-objectives/:objectiveId/replan",
    { preHandler: mutate },
    async (request) => {
      const { objectiveId } = Params.parse(request.params);
      const body = ReplanBody.parse(request.body);
      return EngineeringObjectiveViewSchema.parse(
        await context.engineeringManager.replanBlockedTask(
          managerContext(request),
          objectiveId,
          body.taskId,
          body.description,
        ),
      );
    },
  );
};

import {
  CreateEngineeringIntegrationRequestSchema,
  EngineeringIntegrationViewSchema,
  MergeEngineeringCandidateRequestSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { installCompanyRouteGuard } from "./company-guard.js";
import type { ApiRouteContext } from "./context.js";

const Params = z.object({ runId: z.string().uuid() }).strict();

export const registerEngineeringIntegrationRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  installCompanyRouteGuard(app, "/api/engineering-integrations", context);
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
  const integrationContext = (
    request: Parameters<typeof context.companyContext.get>[0],
  ) => {
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

  app.get("/api/engineering-integrations", { preHandler: read }, async (request) => {
    const company = context.companyContext.get(request);
    return {
      integrations: await context.engineeringIntegration.list(
        company.ownerId,
        company.companyId,
      ),
    };
  });
  app.get(
    "/api/engineering-integrations/:runId",
    { preHandler: read },
    async (request) => {
      const company = context.companyContext.get(request);
      const { runId } = Params.parse(request.params);
      return EngineeringIntegrationViewSchema.parse(
        await context.engineeringIntegration.view(
          company.ownerId,
          company.companyId,
          runId,
        ),
      );
    },
  );
  app.post("/api/engineering-integrations", { preHandler: mutate }, async (request) =>
    EngineeringIntegrationViewSchema.parse(
      await context.engineeringIntegration.create(
        integrationContext(request),
        CreateEngineeringIntegrationRequestSchema.parse(request.body),
      ),
    ),
  );
  for (const action of ["run", "cancel", "refresh-staleness"] as const)
    app.post(
      `/api/engineering-integrations/:runId/${action}`,
      { preHandler: mutate },
      async (request) => {
        const { runId } = Params.parse(request.params);
        const scoped = integrationContext(request);
        const response =
          action === "run"
            ? await context.engineeringIntegration.execute(
                scoped,
                runId,
                `api-${request.id}`,
              )
            : action === "cancel"
              ? await context.engineeringIntegration.cancel(scoped, runId)
              : await context.engineeringIntegration.refreshStaleness(scoped, runId);
        return EngineeringIntegrationViewSchema.parse(response);
      },
    );
  app.post("/api/engineering-integrations/:runId/merge", { preHandler: mutate }, async (request) => {
    const { runId } = Params.parse(request.params);
    return EngineeringIntegrationViewSchema.parse(await context.engineeringIntegration.merge(
      integrationContext(request), runId, MergeEngineeringCandidateRequestSchema.parse(request.body),
    ));
  });
};

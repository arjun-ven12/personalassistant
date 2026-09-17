import {
  EngineeringControlCenterSchema,
  EngineeringDeliverySchema,
  EngineeringProjectRegistryEntrySchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { installCompanyRouteGuard } from "./company-guard.js";
import type { ApiRouteContext } from "./context.js";

const Params = z.object({ deliveryId: z.string().uuid() }).strict();

export const registerEngineeringDeliveryRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  installCompanyRouteGuard(app, "/api/engineering-deliveries", context);
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
  const scoped = (request: Parameters<typeof context.companyContext.get>[0]) => {
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

  app.get("/api/engineering-deliveries", { preHandler: read }, async (request) => {
    const company = context.companyContext.get(request);
    return {
      deliveries: (
        await context.engineeringDelivery.list(company.ownerId, company.companyId)
      ).map((value) => EngineeringDeliverySchema.parse(value)),
    };
  });
  app.get(
    "/api/engineering-deliveries/projects",
    { preHandler: read },
    async (request) => {
      const company = context.companyContext.get(request);
      return {
        projects: z
          .array(EngineeringProjectRegistryEntrySchema)
          .parse(
            await context.engineeringDelivery.projects(
              company.ownerId,
              company.companyId,
            ),
          ),
      };
    },
  );
  app.get(
    "/api/engineering-deliveries/:deliveryId",
    { preHandler: read },
    async (request) => {
      const company = context.companyContext.get(request);
      return EngineeringControlCenterSchema.parse(
        await context.engineeringDelivery.controlCenter(
          company.ownerId,
          company.companyId,
          Params.parse(request.params).deliveryId,
        ),
      );
    },
  );
  app.post("/api/engineering-deliveries", { preHandler: mutate }, async (request) =>
    EngineeringControlCenterSchema.parse(
      await context.engineeringDelivery.create(scoped(request), request.body),
    ),
  );
  for (const action of ["run", "pause", "resume", "cancel"] as const)
    app.post(
      `/api/engineering-deliveries/:deliveryId/${action}`,
      { preHandler: mutate },
      async (request) => {
        const id = Params.parse(request.params).deliveryId;
        const service = context.engineeringDelivery;
        const value =
          action === "run"
            ? await service.drive(scoped(request), id)
            : action === "pause"
              ? await service.pause(scoped(request), id)
              : action === "resume"
                ? await service.resume(scoped(request), id)
                : await service.cancel(scoped(request), id);
        return EngineeringControlCenterSchema.parse(value);
      },
    );
  app.post(
    "/api/engineering-deliveries/:deliveryId/instructions",
    { preHandler: mutate },
    async (request) =>
      EngineeringControlCenterSchema.parse(
        await context.engineeringDelivery.addInstruction(
          scoped(request),
          Params.parse(request.params).deliveryId,
          request.body,
        ),
      ),
  );
  for (const action of ["status", "restart", "stop"] as const)
    app.post(
      `/api/engineering-deliveries/:deliveryId/preview/${action}`,
      { preHandler: mutate },
      async (request) =>
        EngineeringControlCenterSchema.parse(
          await context.engineeringDelivery.previewControl(
            scoped(request),
            Params.parse(request.params).deliveryId,
            action,
          ),
        ),
    );
};

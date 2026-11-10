import {
  ApproveLaunchPackageRequestSchema,
  CancelLaunchPostRequestSchema,
  CreateLaunchPackageRequestSchema,
  LaunchPackageSchema,
  ReviseLaunchPostRequestSchema,
  RetryLaunchStageRequestSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiRouteContext } from "./context.js";

const params = z.object({ id: z.string().uuid() }).strict();
const versionParams = z
  .object({ id: z.string().uuid(), version: z.coerce.number().int().positive() })
  .strict();
export const registerLaunchWorkflowRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  const read = [
    context.security.requireAuthentication,
    context.companyContext.requireCompany,
  ];
  const write = [
    ...read,
    context.security.requireTrustedOrigin,
    context.security.requireCsrf,
  ];
  app.post("/api/launch-packages", { preHandler: write }, async (request) =>
    LaunchPackageSchema.parse(
      await context.launchWorkflow.create({
        ownerId: context.security.getIdentity(request).user.id,
        body: CreateLaunchPackageRequestSchema.parse(request.body),
        requestId: request.id,
        ipAddress: request.ip,
      }),
    ),
  );
  app.get("/api/launch-packages/:id", { preHandler: read }, async (request) =>
    LaunchPackageSchema.parse(
      await context.launchWorkflow.find(
        context.security.getIdentity(request).user.id,
        params.parse(request.params).id,
      ),
    ),
  );
  app.get(
    "/api/launch-packages/:id/versions/:version",
    { preHandler: read },
    async (request) => {
      const { id, version } = versionParams.parse(request.params);
      return LaunchPackageSchema.parse(
        await context.launchWorkflow.findVersion(
          context.security.getIdentity(request).user.id,
          id,
          version,
        ),
      );
    },
  );
  app.post("/api/launch-packages/:id/advance", { preHandler: write }, async (request) =>
    LaunchPackageSchema.parse(
      await context.launchWorkflow.advance({
        ownerId: context.security.getIdentity(request).user.id,
        id: params.parse(request.params).id,
        requestId: request.id,
        ipAddress: request.ip,
      }),
    ),
  );
  app.post("/api/launch-packages/:id/retry", { preHandler: write }, async (request) =>
    LaunchPackageSchema.parse(
      await context.launchWorkflow.retryBlockedStage({
        ownerId: context.security.getIdentity(request).user.id,
        id: params.parse(request.params).id,
        body: RetryLaunchStageRequestSchema.parse(request.body),
        requestId: request.id,
        ipAddress: request.ip,
      }),
    ),
  );
  app.post("/api/launch-packages/:id/approve", { preHandler: write }, async (request) =>
    LaunchPackageSchema.parse(
      await context.launchWorkflow.approve({
        ownerId: context.security.getIdentity(request).user.id,
        id: params.parse(request.params).id,
        body: ApproveLaunchPackageRequestSchema.parse(request.body),
        requestId: request.id,
        ipAddress: request.ip,
      }),
    ),
  );
  app.patch("/api/launch-packages/:id/posts", { preHandler: write }, async (request) =>
    LaunchPackageSchema.parse(
      await context.launchWorkflow.revisePost({
        ownerId: context.security.getIdentity(request).user.id,
        id: params.parse(request.params).id,
        body: ReviseLaunchPostRequestSchema.parse(request.body),
        requestId: request.id,
        ipAddress: request.ip,
      }),
    ),
  );
  app.post(
    "/api/launch-packages/:id/posts/cancel",
    { preHandler: write },
    async (request) =>
      LaunchPackageSchema.parse(
        await context.launchWorkflow.cancelPost({
          ownerId: context.security.getIdentity(request).user.id,
          id: params.parse(request.params).id,
          body: CancelLaunchPostRequestSchema.parse(request.body),
          requestId: request.id,
          ipAddress: request.ip,
        }),
      ),
  );
};

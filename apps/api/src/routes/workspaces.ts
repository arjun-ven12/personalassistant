import {
  CreateWorkspaceRequestSchema,
  UpdateWorkspaceRequestSchema,
  WorkspaceIdParametersSchema,
  WorkspaceListResponseSchema,
  WorkspaceResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { ApiRouteContext } from "./context.js";
import { installCompanyRouteGuard } from "./company-guard.js";

const auditContext = (request: FastifyRequest) => ({
  ipAddress: request.ip,
  requestId: request.id,
});

export const registerWorkspaceRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  installCompanyRouteGuard(app, "/api/workspaces", context);
  app.get(
    "/api/workspaces",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return WorkspaceListResponseSchema.parse(
        await context.registry.listWorkspaces(identity.user.id),
      );
    },
  );

  app.post(
    "/api/workspaces",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const workspace = await context.registry.createWorkspace(
        identity.user.id,
        CreateWorkspaceRequestSchema.parse(request.body),
      );
      await context.governanceAudit({
        eventType: "WORKSPACE_REGISTERED",
        ownerId: identity.user.id,
        outcome: "SUCCESS",
        reason: "Workspace metadata registered without filesystem access.",
        metadata: { workspaceId: workspace.id },
        ...auditContext(request),
      });
      return WorkspaceResponseSchema.parse(workspace);
    },
  );

  app.patch(
    "/api/workspaces/:workspaceId",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { workspaceId } = WorkspaceIdParametersSchema.parse(request.params);
      const workspace = await context.registry.updateWorkspace(
        identity.user.id,
        workspaceId,
        UpdateWorkspaceRequestSchema.parse(request.body),
      );
      await context.governanceAudit({
        eventType: "WORKSPACE_UPDATED",
        ownerId: identity.user.id,
        outcome: "SUCCESS",
        reason: "Workspace metadata updated.",
        metadata: { workspaceId },
        ...auditContext(request),
      });
      return WorkspaceResponseSchema.parse(workspace);
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/disable",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { workspaceId } = WorkspaceIdParametersSchema.parse(request.params);
      const workspace = await context.registry.disableWorkspace(
        identity.user.id,
        workspaceId,
      );
      await context.governanceAudit({
        eventType: "WORKSPACE_DISABLED",
        ownerId: identity.user.id,
        outcome: "SUCCESS",
        reason: "Workspace metadata disabled.",
        metadata: { workspaceId },
        ...auditContext(request),
      });
      return WorkspaceResponseSchema.parse(workspace);
    },
  );
};

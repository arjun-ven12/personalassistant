import {
  AgentConfigurationListResponseSchema,
  AgentManifestListResponseSchema,
  AgentOsHealthListResponseSchema,
  AgentOsDashboardResponseSchema,
  AgentOsMetricsListResponseSchema,
  AgentPackageListResponseSchema,
  AgentSessionListResponseSchema,
  AgentSessionResponseSchema,
  AgentVersionListResponseSchema,
  ContextPackageListResponseSchema,
  KnowledgeSourceListResponseSchema,
  PermissionProfileListResponseSchema,
  RuntimeEventListResponseSchema,
  ToolRegistryListResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const LimitQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(500).default(100) })
  .strict();

export const registerAgentOsRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/agent-os/dashboard",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentOsDashboardResponseSchema.parse(
        await context.agentOs.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agent-os/manifests",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentManifestListResponseSchema.parse(
        await context.agentOs.listManifests(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agent-os/packages",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return AgentPackageListResponseSchema.parse(
        await context.agentOs.listPackages(identity.user.id, query.limit),
      );
    },
  );

  app.get(
    "/api/agent-os/sessions",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return AgentSessionListResponseSchema.parse(
        await context.agentOs.listSessions(identity.user.id, query.limit),
      );
    },
  );

  app.post(
    "/api/agent-os/sessions",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentSessionResponseSchema.parse(
        await context.agentOs.startSession({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/agent-os/events",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return RuntimeEventListResponseSchema.parse(
        await context.agentOs.listEvents(identity.user.id, query.limit),
      );
    },
  );

  app.get(
    "/api/agent-os/configurations",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return AgentConfigurationListResponseSchema.parse(
        await context.agentOs.listConfigurations(identity.user.id, query.limit),
      );
    },
  );

  app.get(
    "/api/agent-os/tools",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ToolRegistryListResponseSchema.parse(
        await context.agentOs.listTools(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agent-os/permission-profiles",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return PermissionProfileListResponseSchema.parse(
        await context.agentOs.listPermissionProfiles(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agent-os/knowledge-sources",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return KnowledgeSourceListResponseSchema.parse(
        await context.agentOs.listKnowledgeSources(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agent-os/health",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentOsHealthListResponseSchema.parse(
        await context.agentOs.listHealth(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agent-os/metrics",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentOsMetricsListResponseSchema.parse(
        await context.agentOs.listMetrics(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agent-os/versions",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return AgentVersionListResponseSchema.parse(
        await context.agentOs.listVersions(identity.user.id, query.limit),
      );
    },
  );

  app.get(
    "/api/agent-os/context-packages",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return ContextPackageListResponseSchema.parse(
        await context.agentOs.listContextPackages(identity.user.id, query.limit),
      );
    },
  );
};

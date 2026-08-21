import {
  AgentConsensusListResponseSchema,
  AgentConsensusResponseSchema,
  AgentDashboardResponseSchema,
  AgentHealthListResponseSchema,
  AgentListResponseSchema,
  AgentMessageListResponseSchema,
  AgentMessageResponseSchema,
  AgentMetricsListResponseSchema,
  AgentPromotionListResponseSchema,
  AgentTaskListResponseSchema,
  AgentTaskResponseSchema,
  AgentTemplateListResponseSchema,
  CapabilityListResponseSchema,
  CapabilitySearchQuerySchema,
  DynamicAgentListResponseSchema,
  DynamicWorkforceDashboardResponseSchema,
  AgentLifecycleListResponseSchema,
  AgentPerformanceListResponseSchema,
  RetireDynamicAgentRequestSchema,
  TeamCompositionListResponseSchema,
  TeamCompositionResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const AgentTaskParametersSchema = z.object({ taskId: z.string().uuid() }).strict();
const AgentParametersSchema = z
  .object({ agentId: z.string().min(3).max(120) })
  .strict();
const CompleteTaskRequestSchema = z
  .object({
    resultSummary: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const registerAgentRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  app.get(
    "/api/agents/dashboard",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentDashboardResponseSchema.parse(
        await context.agents.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agents",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentListResponseSchema.parse(await context.agents.list(identity.user.id));
    },
  );

  app.get(
    "/api/agents/tasks",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentTaskListResponseSchema.parse(
        await context.agentStore.listTasks(identity.user.id, 100),
      );
    },
  );

  app.post(
    "/api/agents/tasks",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentTaskResponseSchema.parse(
        await context.agents.assignTask({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/agents/tasks/:taskId/complete",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { taskId } = AgentTaskParametersSchema.parse(request.params);
      const body = CompleteTaskRequestSchema.parse(request.body);
      return AgentTaskResponseSchema.parse(
        await context.agents.completeTask({
          ownerId: identity.user.id,
          taskId,
          resultSummary: body.resultSummary,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/agents/messages",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentMessageListResponseSchema.parse(
        await context.agentStore.listMessages(identity.user.id, 100),
      );
    },
  );

  app.post(
    "/api/agents/messages",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentMessageResponseSchema.parse(
        await context.agents.sendMessage({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/agents/consensus",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentConsensusListResponseSchema.parse(
        await context.agentStore.listConsensus(identity.user.id, 100),
      );
    },
  );

  app.post(
    "/api/agents/consensus",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentConsensusResponseSchema.parse(
        await context.agents.createConsensus({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/agents/health",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentHealthListResponseSchema.parse(
        await context.agentStore.listHealth(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agents/metrics",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentMetricsListResponseSchema.parse(
        await context.agentStore.listMetrics(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agents/dynamic/workforce",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return DynamicWorkforceDashboardResponseSchema.parse(
        await context.agentFactory.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agents/templates",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentTemplateListResponseSchema.parse(
        await context.agentFactory.templates(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agents/capabilities",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = z
        .object({
          q: z.string().trim().min(1).max(200).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        })
        .strict()
        .parse(request.query);
      return CapabilityListResponseSchema.parse(
        query.q
          ? await context.agentFactory.searchCapabilities(
              identity.user.id,
              query.q,
              query.limit,
            )
          : await context.agentFactory.capabilities(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agents/capabilities/search",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = CapabilitySearchQuerySchema.parse(request.query);
      return CapabilityListResponseSchema.parse(
        await context.agentFactory.searchCapabilities(
          identity.user.id,
          query.q,
          query.limit,
        ),
      );
    },
  );

  app.post(
    "/api/agents/team-compositions",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return TeamCompositionResponseSchema.parse(
        await context.agentFactory.composeTeam({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/agents/team-compositions",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return TeamCompositionListResponseSchema.parse(
        await context.agentFactory.compositions(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agents/dynamic",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = z
        .object({ includeArchived: z.coerce.boolean().default(false) })
        .strict()
        .parse(request.query);
      return DynamicAgentListResponseSchema.parse(
        await context.agentFactory.dynamicAgents(
          identity.user.id,
          query.includeArchived,
        ),
      );
    },
  );

  app.post(
    "/api/agents/dynamic/:agentId/retire",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { agentId } = AgentParametersSchema.parse(request.params);
      const body = RetireDynamicAgentRequestSchema.parse(request.body);
      return DynamicAgentListResponseSchema.element.parse(
        await context.agentFactory.retireAgent({
          ownerId: identity.user.id,
          agentId,
          reason: body.reason,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/agents/lifecycle",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentLifecycleListResponseSchema.parse(
        await context.agentFactory.lifecycle(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agents/performance",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentPerformanceListResponseSchema.parse(
        await context.agentFactory.performance(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agents/promotions",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentPromotionListResponseSchema.parse(
        await context.agentFactory.promotions(identity.user.id),
      );
    },
  );
};

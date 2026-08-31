import {
  AgentEconomyAccountResponseSchema,
  AgentEconomyDashboardSchema,
  AllocateAgentCreditsRequestSchema,
  EnrollAgentEconomyRequestSchema,
  UpdateAgentEconomyStatusRequestSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const AgentParametersSchema = z.object({ agentId: z.string().min(3).max(120) }).strict();

export const registerAgentEconomyRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  app.get(
    "/api/agent-economy/dashboard",
    { preHandler: [context.security.requireAuthentication, context.companyContext.requireCompany] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentEconomyDashboardSchema.parse(await context.agentEconomy.dashboard(identity.user.id));
    },
  );

  app.post(
    "/api/agent-economy/agents/:agentId/enroll",
    { preHandler: [context.security.requireAuthentication, context.companyContext.requireCompany, context.security.requireTrustedOrigin, context.security.requireCsrf] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { agentId } = AgentParametersSchema.parse(request.params);
      const account = await context.agentEconomy.enroll(identity.user.id, agentId, EnrollAgentEconomyRequestSchema.parse(request.body), request.id, request.ip);
      return AgentEconomyAccountResponseSchema.parse({ account });
    },
  );

  app.post(
    "/api/agent-economy/agents/:agentId/allocate",
    { preHandler: [context.security.requireAuthentication, context.companyContext.requireCompany, context.security.requireTrustedOrigin, context.security.requireCsrf] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { agentId } = AgentParametersSchema.parse(request.params);
      const body = AllocateAgentCreditsRequestSchema.parse(request.body);
      const account = await context.agentEconomy.allocate({ ownerId: identity.user.id, agentId, amount: body.amount, reasonCode: body.reasonCode, idempotencyKey: body.idempotencyKey, requestId: request.id, ipAddress: request.ip });
      return AgentEconomyAccountResponseSchema.parse({ account });
    },
  );

  app.post(
    "/api/agent-economy/agents/:agentId/status",
    { preHandler: [context.security.requireAuthentication, context.companyContext.requireCompany, context.security.requireTrustedOrigin, context.security.requireCsrf] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { agentId } = AgentParametersSchema.parse(request.params);
      const body = UpdateAgentEconomyStatusRequestSchema.parse(request.body);
      const account = await context.agentEconomy.setStatus(identity.user.id, agentId, body.status, request.id, request.ip);
      return AgentEconomyAccountResponseSchema.parse({ account });
    },
  );
};

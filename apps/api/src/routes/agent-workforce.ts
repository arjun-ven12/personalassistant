import {
  UpdateWorkforceActivationRequestSchema,
  WorkforceAgentDetailSchema,
  WorkforceGraphResponseSchema,
  WorkforceImportReportSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const AgentParametersSchema = z.object({ agentId: z.string().min(3).max(120) }).strict();

const mutationGuards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];

export const registerAgentWorkforceRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/agent-workforce/preview",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return WorkforceImportReportSchema.parse(
        await context.agentWorkforce.preview(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agent-workforce/graph",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return WorkforceGraphResponseSchema.parse(
        await context.agentWorkforce.graph(identity.user.id, request.query),
      );
    },
  );

  app.get(
    "/api/agent-workforce/agents/:agentId",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { agentId } = AgentParametersSchema.parse(request.params);
      return WorkforceAgentDetailSchema.parse(
        await context.agentWorkforce.detail(identity.user.id, agentId),
      );
    },
  );

  app.post(
    "/api/agent-workforce/bootstrap",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return WorkforceImportReportSchema.parse(
        await context.agentWorkforce.bootstrap(identity.user.id, request.id, request.ip),
      );
    },
  );

  app.post(
    "/api/agent-workforce/agents/:agentId/activation",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { agentId } = AgentParametersSchema.parse(request.params);
      const { state } = UpdateWorkforceActivationRequestSchema.parse(request.body);
      return WorkforceAgentDetailSchema.parse(
        await context.agentWorkforce.setActivation(
          identity.user.id,
          agentId,
          state,
          request.id,
          request.ip,
        ),
      );
    },
  );
};

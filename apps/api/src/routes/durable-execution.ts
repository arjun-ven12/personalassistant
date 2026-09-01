import {
  CreateCrossCompanyPolicyRequestSchema,
  CreateCrossCompanyServiceRequestSchema,
  CrossCompanyCollaborationPolicySchema,
  CrossCompanyServiceRequestSchema,
  DurableExecutionDashboardSchema,
  SandboxExecutionRequestSchema,
  SandboxExecutionResultSchema,
} from "@alexa-control/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";
import { installCompanyRouteGuard } from "./company-guard.js";

const IdParams = z.object({ id: z.string().uuid() }).strict();
const DecisionSchema = z
  .object({
    decision: z.enum(["ACCEPT", "REJECT", "CLARIFY"]),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
const DashboardQuery = z.object({ companyId: z.string().uuid().optional() }).strict();
const SandboxBody = SandboxExecutionRequestSchema.omit({
  ownerId: true,
  companyId: true,
});
const mutation = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];
const owner = (context: ApiRouteContext, request: FastifyRequest) =>
  context.security.getIdentity(request).user.id;
const audit = (request: FastifyRequest) => ({
  requestId: request.id,
  ipAddress: request.ip,
});

export const registerDurableExecutionRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  installCompanyRouteGuard(app, "/api/company-collaboration", context);
  app.put(
    "/api/company-collaboration/policy",
    { preHandler: mutation(context) },
    async (request) =>
      CrossCompanyCollaborationPolicySchema.parse(
        await context.durableExecution.upsertPolicy(
          owner(context, request),
          context.companyContext.get(request).companyId,
          CreateCrossCompanyPolicyRequestSchema.parse(request.body),
          audit(request),
        ),
      ),
  );
  app.get(
    "/api/cross-company-services",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      DurableExecutionDashboardSchema.parse(
        await context.durableExecution.dashboard(
          owner(context, request),
          DashboardQuery.parse(request.query).companyId,
        ),
      ),
  );
  app.post(
    "/api/cross-company-services",
    { preHandler: mutation(context) },
    async (request) =>
      CrossCompanyServiceRequestSchema.parse(
        await context.durableExecution.createRequest(
          owner(context, request),
          CreateCrossCompanyServiceRequestSchema.parse(request.body),
          audit(request),
        ),
      ),
  );
  app.post(
    "/api/cross-company-services/:id/decision",
    { preHandler: mutation(context) },
    async (request) => {
      const body = DecisionSchema.parse(request.body);
      return CrossCompanyServiceRequestSchema.parse(
        await context.durableExecution.destinationDecision(
          owner(context, request),
          IdParams.parse(request.params).id,
          body.decision,
          body.reason,
          audit(request),
        ),
      );
    },
  );
  app.post(
    "/api/cross-company-services/:id/cancel",
    { preHandler: mutation(context) },
    async (request) =>
      CrossCompanyServiceRequestSchema.parse(
        await context.durableExecution.cancel(
          owner(context, request),
          IdParams.parse(request.params).id,
          audit(request),
        ),
      ),
  );
  installCompanyRouteGuard(app, "/api/sandbox-executions", context);
  app.post(
    "/api/sandbox-executions",
    { preHandler: mutation(context) },
    async (request) => {
      const body = SandboxBody.parse(request.body);
      return SandboxExecutionResultSchema.parse(
        await context.sandboxExecution.execute(
          {
            ...body,
            ownerId: owner(context, request),
            companyId: context.companyContext.get(request).companyId,
          },
          audit(request),
        ),
      );
    },
  );
};

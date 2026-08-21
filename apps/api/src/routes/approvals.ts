import {
  ApprovalDecisionRequestSchema,
  ApprovalIdParametersSchema,
  ApprovalListResponseSchema,
  ApprovalResponseSchema,
  ApprovalStatusSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const ApprovalQuerySchema = z
  .object({ status: ApprovalStatusSchema.optional() })
  .strict();

export const registerApprovalRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/approvals",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { status } = ApprovalQuerySchema.parse(request.query);
      return ApprovalListResponseSchema.parse(
        await context.governance.listApprovals(identity.user.id, status),
      );
    },
  );

  app.get(
    "/api/approvals/:approvalId",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { approvalId } = ApprovalIdParametersSchema.parse(request.params);
      return ApprovalResponseSchema.parse(
        await context.approvals.get(identity.user.id, approvalId),
      );
    },
  );

  app.post(
    "/api/approvals/:approvalId/approve",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      ApprovalDecisionRequestSchema.parse(request.body ?? {});
      const identity = context.security.getIdentity(request);
      const { approvalId } = ApprovalIdParametersSchema.parse(request.params);
      const approval = await context.approvals.get(identity.user.id, approvalId);
      const recentAuthenticationRequired =
        approval.approvalRequirement === "recent_authentication";
      if (recentAuthenticationRequired) {
        await context.securityState.consumeGrant(identity, "approve_high_risk_action");
      }
      return ApprovalResponseSchema.parse(
        await context.approvals.approve(
          identity.user.id,
          approvalId,
          identity.session.id,
          {
            ipAddress: request.ip,
            requestId: request.id,
          },
          recentAuthenticationRequired,
        ),
      );
    },
  );

  app.post(
    "/api/approvals/:approvalId/reject",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const input = ApprovalDecisionRequestSchema.parse(request.body ?? {});
      const identity = context.security.getIdentity(request);
      const { approvalId } = ApprovalIdParametersSchema.parse(request.params);
      return ApprovalResponseSchema.parse(
        await context.approvals.reject(
          identity.user.id,
          approvalId,
          identity.session.id,
          { ipAddress: request.ip, requestId: request.id },
          input.reason,
        ),
      );
    },
  );

  app.post(
    "/api/approvals/:approvalId/cancel",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      ApprovalDecisionRequestSchema.parse(request.body ?? {});
      const identity = context.security.getIdentity(request);
      const { approvalId } = ApprovalIdParametersSchema.parse(request.params);
      return ApprovalResponseSchema.parse(
        await context.approvals.cancel(
          identity.user.id,
          approvalId,
          identity.session.id,
          {
            ipAddress: request.ip,
            requestId: request.id,
          },
        ),
      );
    },
  );
};

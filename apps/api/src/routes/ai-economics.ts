import {
  AIBudgetPolicySchema,
  AIPricingSchema,
  AIEconomicContextSchema,
  AIEconomicOverrideDescriptorSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiRouteContext } from "./context.js";

const guards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];
const estimateBody = z
  .object({
    providerId: z.string().min(1).max(80),
    modelId: z.string().min(1).max(160),
    locality: z.enum(["LOCAL", "REMOTE"]),
    purpose: z.string().min(1).max(40),
    autonomyMode: z
      .enum(["INTERACTIVE", "ASSISTED", "AUTONOMOUS", "SCHEDULED"])
      .default("INTERACTIVE"),
    estimatedInputTokens: z.number().int().nonnegative().max(100_000),
    maxOutputTokens: z.number().int().nonnegative().max(32_768),
  })
  .strict();

export const registerAIEconomicsRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/ai/economics/health",
    { preHandler: [context.security.requireAuthentication] },
    (request) =>
      context.aiEconomics.health(context.security.getIdentity(request).user.id),
  );
  app.post(
    "/api/ai/economics/overrides/:approvalId/grant",
    { preHandler: guards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const approvalId = z.object({ approvalId: z.string().uuid() }).parse(request.params).approvalId;
      const body = z.object({ descriptor: z.object({
        ownerId: z.string().uuid(), requestId: z.string().uuid(), purpose: z.string(),
        requestedAdditionalSpendUsd: z.string(), maxAdditionalSpendUsd: z.string(),
        expiresAt: z.string(), agentId: z.string().uuid().optional(), workflowId: z.string().uuid().optional(),
        workflowRunId: z.string().uuid().optional(), taskId: z.string().uuid().optional(),
        costCenter: z.string().optional(), providerId: z.string().optional(), modelId: z.string().optional(),
      }).strict() }).strict().parse(request.body);
      return context.aiEconomics.createOverrideGrantFromApproval({
        ownerId: identity.user.id, approvalId,
        descriptor: AIEconomicOverrideDescriptorSchema.parse(body.descriptor),
        recentAuthenticationVerified: true,
        auditContext: { ipAddress: request.ip, requestId: request.id },
      });
    },
  );
  app.get(
    "/api/ai/economics/overview",
    { preHandler: [context.security.requireAuthentication] },
    (request) =>
      context.aiEconomics.overview(context.security.getIdentity(request).user.id),
  );
  app.get(
    "/api/ai/economics/budgets",
    { preHandler: [context.security.requireAuthentication] },
    (request) =>
      context.aiEconomics.listPolicies(context.security.getIdentity(request).user.id),
  );
  app.post(
    "/api/ai/economics/budgets",
    { preHandler: guards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = AIBudgetPolicySchema.parse({
        ...(request.body as object),
        id: crypto.randomUUID(),
        ownerId: identity.user.id,
      });
      await context.governanceAudit({
        eventType: "GOVERNANCE_STATE_CHANGED",
        ownerId: identity.user.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "AI budget policy created.",
        requestId: request.id,
        metadata: { policyId: body.id, scope: body.scope, period: body.period },
      });
      return context.aiEconomics.upsertPolicy(body);
    },
  );
  app.put(
    "/api/ai/economics/budgets/:id",
    { preHandler: guards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const id = z.object({ id: z.string().uuid() }).parse(request.params).id;
      const existing = (await context.aiEconomics.listPolicies(identity.user.id)).find(
        (item) => item.id === id,
      );
      if (!existing) throw new Error("BUDGET_POLICY_NOT_FOUND");
      const body = AIBudgetPolicySchema.parse({
        ...(request.body as object),
        id,
        ownerId: identity.user.id,
      });
      await context.governanceAudit({
        eventType: "GOVERNANCE_STATE_CHANGED",
        ownerId: identity.user.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "AI budget policy updated.",
        requestId: request.id,
        metadata: { policyId: id },
      });
      return context.aiEconomics.upsertPolicy(body);
    },
  );
  app.delete(
    "/api/ai/economics/budgets/:id",
    { preHandler: guards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const id = z.object({ id: z.string().uuid() }).parse(request.params).id;
      const removed = await context.aiEconomics.removePolicy(identity.user.id, id);
      if (!removed) throw new Error("BUDGET_POLICY_NOT_FOUND");
      return { removed: true, id };
    },
  );
  app.post("/api/ai/economics/estimate", { preHandler: guards(context) }, (request) => {
    const identity = context.security.getIdentity(request);
    const body = estimateBody.parse(request.body);
    return context.aiEconomics.estimate(
      body,
      AIEconomicContextSchema.parse({
        ownerId: identity.user.id,
        purpose: body.purpose,
        autonomyMode: body.autonomyMode,
      }),
    );
  });
  app.get(
    "/api/ai/economics/pricing",
    { preHandler: [context.security.requireAuthentication] },
    () => context.aiEconomics.listPricing(),
  );
  app.put(
    "/api/ai/economics/pricing/:id",
    { preHandler: guards(context) },
    async (request, reply) => {
      z.object({ id: z.string().uuid() }).parse(request.params);
      AIPricingSchema.omit({ id: true }).parse(request.body);
      return reply.code(403).send({
        code: "SYSTEM_PRICING_MUTATION_FORBIDDEN",
        message:
          "System-global pricing can only be changed by trusted deployment administration.",
      });
    },
  );
  app.get(
    "/api/ai/economics/usage",
    { preHandler: [context.security.requireAuthentication] },
    (request) => {
      const identity = context.security.getIdentity(request);
      const query = z
        .object({ limit: z.coerce.number().int().min(1).max(1_000).default(500) })
        .parse(request.query);
      return context.aiEconomics.listLedger(identity.user.id, query.limit);
    },
  );
  app.get(
    "/api/ai/economics/reservations",
    { preHandler: [context.security.requireAuthentication] },
    (request) =>
      context.aiEconomics.listReservations(
        context.security.getIdentity(request).user.id,
      ),
  );
};

import {
  AIRouterRequestSchema,
  AIPrivacyRequirementSchema,
  AIRiskLevelSchema,
  AILocalityPreferenceSchema,
  AILatencyPreferenceSchema,
  AIModelSelectorSchema,
  AIModelRoleSchema,
  AIProviderDescriptorSchema,
  AIProviderHealthSchema,
  AIRequestPurposeSchema,
  CognitiveContextProfileSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiRouteContext } from "./context.js";

const mutationGuards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];
const selector = z
  .object({
    type: z.enum(["MODEL", "ROLE"]),
    providerId: z.string().min(1).max(80).optional(),
    modelId: z.string().min(1).max(160).optional(),
    role: AIModelRoleSchema.optional(),
  })
  .strict();
const testRequest = z
  .object({
    selector,
    purpose: z.string().min(1).max(40),
    input: z.string().trim().min(1).max(8_000),
  })
  .strict();
const roleParams = z.object({ role: AIModelRoleSchema }).strict();
const roleBody = z
  .object({
    providerId: z.string().min(1).max(80),
    modelId: z.string().min(1).max(160),
    enabled: z.boolean().default(true),
  })
  .strict();
const routerBody = z
  .object({
    input: z.string().trim().min(1).max(16_000),
    purpose: AIRequestPurposeSchema,
    requestedRole: AIModelRoleSchema.optional(),
    selector: AIModelSelectorSchema.optional(),
    risk: AIRiskLevelSchema.default("LOW"),
    privacy: AIPrivacyRequirementSchema.default("STANDARD"),
    locality: AILocalityPreferenceSchema.default("PREFER_LOCAL"),
    latency: AILatencyPreferenceSchema.default("BALANCED"),
    allowCloud: z.boolean().default(true),
    allowFallback: z.boolean().default(true),
    allowClarification: z.boolean().default(true),
    deterministicResolved: z.boolean().default(false),
    maxAttempts: z.number().int().min(1).max(3).default(3),
    contextProfile: CognitiveContextProfileSchema.optional(),
    taskText: z.string().max(16_000).optional(),
    maxContextTokens: z.number().int().positive().max(128_000).optional(),
  })
  .strict();

const makeRouterRequest = (
  body: z.infer<typeof routerBody>,
  requestId: string,
  ownerId?: string,
) =>
  AIRouterRequestSchema.parse({
    requestId,
    model: body.selector,
    purpose: body.purpose,
    input: [{ role: "user", content: [{ type: "text", text: body.input }] }],
    outputMode: "TEXT",
    requestedRole: body.requestedRole,
    risk: body.risk,
    privacy: body.privacy,
    locality: body.locality,
    latency: body.latency,
    allowCloud: body.allowCloud,
    allowFallback: body.allowFallback,
    allowClarification: body.allowClarification,
    deterministicResolved: body.deterministicResolved,
    maxAttempts: body.maxAttempts,
    contextProfile: body.contextProfile,
    taskText: body.taskText,
    maxContextTokens: body.maxContextTokens,
    ...(ownerId
      ? {
          economicContext: {
            ownerId,
            purpose: body.purpose,
            autonomyMode: "INTERACTIVE" as const,
            priority: "IMPORTANT" as const,
          },
        }
      : {}),
  });

export const registerAIRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  app.get(
    "/api/ai/providers",
    { preHandler: [context.security.requireAuthentication] },
    async () => {
      const providers = context.aiRuntime.listProviders();
      const health = await context.aiRuntime.providerHealth();
      return providers.map((provider) =>
        AIProviderDescriptorSchema.parse({
          ...provider,
          health: health.find((item) => item.providerId === provider.providerId),
        }),
      );
    },
  );
  app.get(
    "/api/ai/providers/health",
    { preHandler: [context.security.requireAuthentication] },
    async () => context.aiRuntime.providerHealth(),
  );
  app.get(
    "/api/ai/providers/:providerId",
    { preHandler: [context.security.requireAuthentication] },
    (request) => {
      const providerId = z
        .object({ providerId: z.string().min(1).max(80) })
        .parse(request.params).providerId;
      return AIProviderDescriptorSchema.parse(
        context.aiRuntime
          .listProviders()
          .find((item) => item.providerId === providerId),
      );
    },
  );
  app.get(
    "/api/ai/providers/:providerId/health",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const providerId = z
        .object({ providerId: z.string().min(1).max(80) })
        .parse(request.params).providerId;
      const health = (await context.aiRuntime.providerHealth()).find(
        (item) => item.providerId === providerId,
      );
      return AIProviderHealthSchema.parse(health);
    },
  );
  app.get(
    "/api/ai/models",
    { preHandler: [context.security.requireAuthentication] },
    () => context.aiRuntime.listModels(),
  );
  app.get(
    "/api/ai/models/:modelId",
    { preHandler: [context.security.requireAuthentication] },
    (request) => {
      const modelId = z
        .object({ modelId: z.string().min(1).max(160) })
        .parse(request.params).modelId;
      return (
        context.aiRuntime.listModels().find((item) => item.modelId === modelId) ?? {
          error: "MODEL_NOT_FOUND",
        }
      );
    },
  );
  app.get(
    "/api/ai/model-roles",
    { preHandler: [context.security.requireAuthentication] },
    () => context.aiRuntime.listRoles(),
  );
  app.put(
    "/api/ai/model-roles/:role",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const role = roleParams.parse(request.params).role;
      const body = roleBody.parse(request.body);
      const mapping = context.aiRuntime.setRole({ role, ...body });
      await context.governanceAudit({
        eventType: "GOVERNANCE_STATE_CHANGED",
        ownerId: identity.user.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "AI model role mapping changed; mapping grants no execution authority.",
        requestId: request.id,
        metadata: {
          role,
          providerId: body.providerId,
          modelId: body.modelId,
          enabled: body.enabled,
        },
      });
      return mapping;
    },
  );
  app.post("/api/ai/test", { preHandler: mutationGuards(context) }, async (request) => {
    const identity = context.security.getIdentity(request);
    const body = testRequest.parse(request.body);
    const parsedSelector =
      body.selector.type === "ROLE"
        ? { type: "ROLE" as const, role: body.selector.role! }
        : {
            type: "MODEL" as const,
            providerId: body.selector.providerId!,
            modelId: body.selector.modelId!,
          };
    const result = await context.aiRouter.execute({
      requestId: request.id,
      model: parsedSelector,
      purpose: AIRequestPurposeSchema.parse(body.purpose),
      input: [{ role: "user", content: [{ type: "text", text: body.input }] }],
      outputMode: "TEXT",
      timeoutMs: 45_000,
      metadata: { ownerId: identity.user.id, diagnostic: true },
      economicContext: {
        ownerId: identity.user.id,
        purpose: AIRequestPurposeSchema.parse(body.purpose),
        autonomyMode: "INTERACTIVE",
        priority: "IMPORTANT",
      },
    });
    return {
      providerId: result.providerId,
      modelId: result.modelId,
      latencyMs: result.latencyMs,
      usage: result.usage ?? null,
      outputText: result.outputText ?? null,
      outcome: result.outcome,
      executionPerformed: false,
    };
  });
  app.post(
    "/api/ai/test-structured",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = testRequest.parse(request.body);
      const parsedSelector =
        body.selector.type === "ROLE"
          ? { type: "ROLE" as const, role: body.selector.role! }
          : {
              type: "MODEL" as const,
              providerId: body.selector.providerId!,
              modelId: body.selector.modelId!,
            };
      const result = await context.aiRouter.executeStructured({
        requestId: request.id,
        model: parsedSelector,
        purpose: AIRequestPurposeSchema.parse(body.purpose),
        input: [{ role: "user", content: [{ type: "text", text: body.input }] }],
        outputMode: "STRUCTURED",
        timeoutMs: 45_000,
        economicContext: {
          ownerId: identity.user.id,
          purpose: AIRequestPurposeSchema.parse(body.purpose),
          autonomyMode: "INTERACTIVE",
          priority: "IMPORTANT",
        },
        schemaName: "DiagnosticClassification",
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: { category: { type: "string" }, confidence: { type: "number" } },
          required: ["category", "confidence"],
        },
        schema: z
          .object({ category: z.string().min(1), confidence: z.number().min(0).max(1) })
          .strict(),
      });
      return {
        providerId: result.providerId,
        modelId: result.modelId,
        latencyMs: result.latencyMs,
        usage: result.usage ?? null,
        structuredOutput: result.structuredOutput ?? null,
        validated: result.outcome === "SUCCESS",
        outcome: result.outcome,
        executionPerformed: false,
        ownerId: identity.user.id,
      };
    },
  );
  app.get(
    "/api/ai/activity",
    { preHandler: [context.security.requireAuthentication] },
    () => context.aiRuntime.activityList(),
  );
  app.post(
    "/api/ai/requests/:requestId/cancel",
    { preHandler: mutationGuards(context) },
    (request, reply) => {
      const identity = context.security.getIdentity(request);
      const requestId = z.object({ requestId: z.string().uuid() }).parse(request.params).requestId;
      if (!context.aiRouter.cancel(identity.user.id, requestId))
        return reply.code(404).send({ code: "AI_REQUEST_NOT_FOUND", message: "Active AI request was not found." });
      return { requestId, cancelled: true };
    },
  );
  app.post(
    "/api/ai/router/simulate",
    { preHandler: mutationGuards(context) },
    (request) => {
      const body = routerBody.parse(request.body);
      return context.aiRouter.assess(makeRouterRequest(body, request.id));
    },
  );
  app.post(
    "/api/ai/router/execute",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const body = routerBody.parse(request.body);
      const identity = context.security.getIdentity(request);
      return context.aiRouter.execute(
        makeRouterRequest(body, request.id, identity.user.id),
      );
    },
  );
  app.post(
    "/api/ai/router/execute-structured",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const body = routerBody.parse(request.body);
      const identity = context.security.getIdentity(request);
      const result = await context.aiRouter.executeStructured({
        ...makeRouterRequest(body, request.id, identity.user.id),
        outputMode: "STRUCTURED",
        schemaName: "DiagnosticInterpretation",
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            intent: { type: "string" },
            entities: { type: "object", additionalProperties: true },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            clarificationRequired: { type: "boolean" },
            clarificationQuestion: { type: "string" },
          },
          required: ["intent", "entities", "confidence", "clarificationRequired"],
        },
        schema: z
          .object({
            intent: z.string().min(1),
            entities: z.record(z.string(), z.unknown()),
            confidence: z.number().min(0).max(1),
            clarificationRequired: z.boolean(),
            clarificationQuestion: z.string().optional(),
          })
          .strict(),
      });
      return result;
    },
  );
  app.get(
    "/api/ai/router/metrics",
    { preHandler: [context.security.requireAuthentication] },
    () => context.aiRouter.metrics(),
  );
  app.get(
    "/api/ai/router/events",
    { preHandler: [context.security.requireAuthentication] },
    () => context.aiRouter.activity(),
  );
};

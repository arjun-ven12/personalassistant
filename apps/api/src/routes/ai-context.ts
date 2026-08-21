import {
  CognitiveContextPackageSchema,
  CognitiveContextProfileSchema,
  CognitiveContextRequestSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiRouteContext } from "./context.js";

const guards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];
const publicInputContextSchema = z
  .object({
    sourceType: z.enum(["USER", "EXTERNAL"]),
    content: z.json(),
  })
  .strict();
const bodySchema = z
  .object({
    purpose: z.string().min(1).max(40),
    taskText: z.string().max(16_000).optional(),
    requestedProfile: CognitiveContextProfileSchema.default("GENERAL_CONVERSATION"),
    privacy: z.enum(["STANDARD", "LOCAL_ONLY", "NO_EXTERNAL"]).default("STANDARD"),
    maxContextTokens: z.number().int().positive().max(128_000).optional(),
    economicMaxInputTokens: z.number().int().positive().max(128_000).optional(),
    modelContextWindow: z.number().int().positive().max(1_000_000).optional(),
    maxOutputTokens: z.number().int().nonnegative().max(32_768).optional(),
    reasoningReserveTokens: z.number().int().nonnegative().max(32_768).optional(),
    providerOverheadTokens: z.number().int().nonnegative().max(8_192).optional(),
    safetyMarginTokens: z.number().int().nonnegative().max(8_192).optional(),
    conversationId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    workflowId: z.string().uuid().optional(),
    workflowRunId: z.string().uuid().optional(),
    taskId: z.string().uuid().optional(),
    agentId: z.string().min(3).max(120).optional(),
    providerId: z.string().max(80).optional(),
    modelId: z.string().max(160).optional(),
    locality: z.enum(["LOCAL", "REMOTE"]).optional(),
    inputContext: z.array(publicInputContextSchema).max(40).optional(),
  })
  .strict();

export const registerAIContextRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.post(
    "/api/ai/context/compose",
    { preHandler: guards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = bodySchema.parse(request.body);
      return context.cognitiveContext.compose(
        CognitiveContextRequestSchema.parse({
          ...body,
          inputContext: body.inputContext?.map((block) => ({
            ...block,
            trustLevel: block.sourceType === "EXTERNAL" ? "UNTRUSTED" : "TRUSTED",
          })),
          ownerId: identity.user.id,
          providerTrust: body.locality === "LOCAL" ? "TRUSTED_LOCAL" : "UNTRUSTED",
        }),
      );
    },
  );
  app.post(
    "/api/ai/context/simulate",
    { preHandler: guards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = bodySchema.parse(request.body);
      return context.cognitiveContext.compose(
        CognitiveContextRequestSchema.parse({
          ...body,
          inputContext: body.inputContext?.map((block) => ({
            ...block,
            trustLevel: block.sourceType === "EXTERNAL" ? "UNTRUSTED" : "TRUSTED",
          })),
          ownerId: identity.user.id,
          providerTrust: body.locality === "LOCAL" ? "TRUSTED_LOCAL" : "UNTRUSTED",
        }),
      );
    },
  );
  app.get(
    "/api/ai/context/profiles",
    { preHandler: [context.security.requireAuthentication] },
    () => CognitiveContextProfileSchema.options,
  );
  app.get(
    "/api/ai/context/traces",
    { preHandler: [context.security.requireAuthentication] },
    (request, reply) => {
      const identity = context.security.getIdentity(request);
      reply.header("cache-control", "no-store");
      return context.cognitiveContext.listTraceMetadata(identity.user.id);
    },
  );
  app.get(
    "/api/ai/context/traces/:id",
    { preHandler: [context.security.requireAuthentication] },
    (request, reply) => {
      const identity = context.security.getIdentity(request);
      const id = z.object({ id: z.string().uuid() }).parse(request.params).id;
      const trace = context.cognitiveContext.getTrace(identity.user.id, id);
      if (!trace) throw new Error("CONTEXT_TRACE_NOT_FOUND");
      reply.header("cache-control", "no-store");
      return {
        privacyWarning:
          "This explicit owner-scoped diagnostic can contain private context. Do not copy it into logs or external systems.",
        trace: CognitiveContextPackageSchema.parse(trace),
      };
    },
  );
  app.get(
    "/api/ai/context/health",
    { preHandler: [context.security.requireAuthentication] },
    () => context.cognitiveContext.health(),
  );
};

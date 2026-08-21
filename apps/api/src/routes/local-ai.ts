import {
  LocalAIHealthSchema,
  LocalIntentInterpretationSchema,
  LocalAIStatsSchema,
  LocalModelDefinitionSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const mutationGuards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];
const ModelParams = z.object({ id: z.string().min(1).max(80) }).strict();
const TestBody = z
  .object({
    mode: z.enum(["conversation", "interpretation"]),
    prompt: z.string().trim().min(1).max(4_000),
    context: z.record(z.string(), z.json()).optional(),
  })
  .strict();

export const registerLocalAIRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/ai/local",
    { preHandler: [context.security.requireAuthentication] },
    () => context.localAI.health(),
  );
  app.get(
    "/api/ai/local/health",
    { preHandler: [context.security.requireAuthentication] },
    async () => LocalAIHealthSchema.parse(await context.localAI.health()),
  );
  app.get(
    "/api/ai/local/models",
    { preHandler: [context.security.requireAuthentication] },
    async () => ({
      registered: context.localAI.registry.list(),
      installed: await context.localAI.listModels(),
    }),
  );
  app.get(
    "/api/ai/local/models/:id",
    { preHandler: [context.security.requireAuthentication] },
    (request) =>
      LocalModelDefinitionSchema.parse(
        context.localAI.model(ModelParams.parse(request.params).id),
      ),
  );
  app.get(
    "/api/ai/local/stats",
    { preHandler: [context.security.requireAuthentication] },
    () => LocalAIStatsSchema.parse(context.localAI.stats()),
  );
  app.post(
    "/api/ai/local/test",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = TestBody.parse(request.body);
      const common = {
        requestId: request.id,
        model: {
          type: "MODEL" as const,
          providerId: "ollama",
          modelId: context.localAI.registry.resolveRole("CONVERSATION")?.modelName ?? "gemma3:4b",
        },
        input: [{ role: "user" as const, content: [{ type: "text" as const, text: body.prompt }] }],
        privacy: "LOCAL_ONLY" as const,
        locality: "LOCAL_ONLY" as const,
        allowCloud: false,
        allowFallback: false,
        economicContext: {
          ownerId: identity.user.id,
          purpose: body.mode === "interpretation" ? "INTERPRETATION" as const : "CONVERSATION" as const,
          autonomyMode: "INTERACTIVE" as const,
          priority: "IMPORTANT" as const,
        },
        ...(body.context
          ? {
              context: [{ sourceType: "EXTERNAL" as const, trustLevel: "UNTRUSTED" as const, content: body.context }],
            }
          : {}),
      };
      if (body.mode === "interpretation") {
        const routed = await context.aiRouter.executeStructured({
          ...common,
          purpose: "INTERPRETATION",
          outputMode: "STRUCTURED",
          schemaName: "LocalIntentInterpretation",
          schema: LocalIntentInterpretationSchema,
        });
        return {
          mode: body.mode,
          model: routed.modelId ?? null,
          validated: routed.structuredOutput ?? null,
          outcome: routed.outcome,
        };
      }
      const routed = await context.aiRouter.execute({
        ...common,
        purpose: "CONVERSATION",
        outputMode: "TEXT",
      });
      return {
        mode: body.mode,
        model: routed.modelId ?? null,
        response: routed.outputText ?? null,
        outcome: routed.outcome,
      };
    },
  );
  app.post(
    "/api/ai/local/models/:id/load",
    { preHandler: mutationGuards(context) },
    async (request) => context.localAI.load(ModelParams.parse(request.params).id),
  );
  app.post(
    "/api/ai/local/models/:id/unload",
    { preHandler: mutationGuards(context) },
    async (request) => context.localAI.unload(ModelParams.parse(request.params).id),
  );
};

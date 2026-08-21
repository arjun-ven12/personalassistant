import type { AIModelRole } from "@alexa-control/shared";
import { AIRuntimeService } from "./runtime-service.js";
import { AIModelRegistry, AIProviderRegistry } from "./registry.js";
import { OllamaProvider } from "./providers/ollama.js";
import { OpenAIProvider } from "./providers/openai.js";
import type { LocalModelRuntime } from "../local-ai/runtime.js";
import { AIEconomicsService } from "./economics/service.js";
import { CognitiveContextService } from "./context/service.js";
import { AIRouterService } from "./router/service.js";

export const createAIRuntime = (input: {
  ollamaRuntime: LocalModelRuntime;
  ollamaEnabled: boolean;
  ollamaModel: string;
  ollamaMaxConcurrentRequests?: number;
  openAIEnabled: boolean;
  openAIKey?: string;
  openAIModel: string;
  openAIBaseUrl: string;
  roleMappings?: Array<[AIModelRole, string, string]>;
}) => {
  const providers = new AIProviderRegistry();
  const models = new AIModelRegistry();
  const ollama = new OllamaProvider(
    input.ollamaRuntime,
    input.ollamaModel,
    input.ollamaEnabled,
    input.ollamaMaxConcurrentRequests ?? 1,
  );
  const openai = new OpenAIProvider(
    input.openAIEnabled ? input.openAIKey : undefined,
    input.openAIModel,
    input.openAIBaseUrl,
    fetch,
    input.openAIEnabled,
  );
  providers.register(ollama);
  providers.register(openai);
  models.upsert(ollama.modelDescriptor());
  models.upsert(openai.modelDescriptor());
  const runtime = new AIRuntimeService(providers, models);
  const mappings: Array<[AIModelRole, string, string]> = input.roleMappings ?? [
    ["FAST_INTERPRETER", "openai", input.openAIModel],
    ["GENERAL_REASONER", "openai", input.openAIModel],
    ["WRITER", "openai", input.openAIModel],
    ["CODER", "openai", input.openAIModel],
    ["DEEP_REASONER", "openai", input.openAIModel],
  ];
  for (const [role, providerId, modelId] of mappings)
    runtime.setRole({ role, providerId, modelId, enabled: true });
  return runtime;
};

export const createCanonicalAIServices = (
  runtime: AIRuntimeService,
  economics = new AIEconomicsService(),
  context = new CognitiveContextService(),
) => {
  runtime.requirePaidInferenceAuthorization(async ({ ownerId, reservationId }) =>
    Boolean(await economics.verifyActiveReservation(ownerId, reservationId)),
  );
  return {
    aiRuntime: runtime,
    aiEconomics: economics,
    cognitiveContext: context,
    aiRouter: new AIRouterService(runtime, economics, context),
  };
};

import {
  AIContextBlockSchema,
  LocalAIHealthSchema,
  LocalAIStatsSchema,
  LocalIntentInterpretationSchema,
  type LocalAIHealth,
  type LocalInferenceEvent,
  type LocalInferencePriority,
} from "@alexa-control/shared";

import type { AIRouterService } from "../ai/router/service.js";
import { LocalAIError } from "./errors.js";
import type { LocalModelRegistry } from "./registry.js";
import type { LocalModelRuntime, OllamaModelInfo } from "./runtime.js";

/**
 * @deprecated Compatibility facade for local-model administration. Production
 * inference delegates to AIRouter and this class owns no inference queue.
 */
export class LocalAIService {
  private canonicalRouter?: AIRouterService;

  constructor(
    readonly runtime: LocalModelRuntime,
    readonly registry: LocalModelRegistry,
    private readonly options: {
      enabled: boolean;
      modelName: string;
      maxConcurrentRequests: number;
      interpretationTimeoutMs: number;
      conversationTimeoutMs: number;
      structuredRetries: number;
      contextMaxCharacters: number;
    },
  ) {}

  useCanonicalRouter(router: AIRouterService) {
    this.canonicalRouter = router;
  }

  async health(): Promise<LocalAIHealth> {
    if (!this.options.enabled)
      return this.healthResult(false, false, false, "UNAVAILABLE");
    const runtimeAvailable = await this.runtime.healthCheck();
    const modelAvailable =
      runtimeAvailable && (await this.runtime.isModelAvailable(this.options.modelName));
    return this.healthResult(
      runtimeAvailable,
      modelAvailable,
      false,
      modelAvailable ? "AVAILABLE" : runtimeAvailable ? "ERROR" : "UNAVAILABLE",
    );
  }

  async listModels(): Promise<OllamaModelInfo[]> {
    return this.runtime.listModels();
  }

  model(id: string) {
    const model = this.registry.getById(id);
    if (!model)
      throw new LocalAIError(
        "MODEL_NOT_REGISTERED",
        "The requested local model is not registered.",
      );
    return model;
  }

  async load(id: string) {
    const model = this.model(id);
    if (!(await this.runtime.healthCheck()))
      throw new LocalAIError("RUNTIME_UNAVAILABLE", "Ollama is unavailable.", true);
    await this.runtime.loadModel(model.modelName);
    return this.health();
  }

  async unload(id: string) {
    const model = this.model(id);
    await this.runtime.unloadModel(model.modelName);
    return this.health();
  }

  async interpret(input: {
    ownerId?: string;
    text: string;
    context?: Record<string, unknown>;
    priority?: LocalInferencePriority;
    source?: LocalInferenceEvent["source"];
    requestId?: string;
  }) {
    const router = this.requireCanonicalRouter();
    const result = await router.executeStructured({
      requestId: input.requestId ?? crypto.randomUUID(),
      purpose: "INTERPRETATION",
      requestedRole: "FAST_INTERPRETER",
      privacy: "LOCAL_ONLY",
      locality: "LOCAL_ONLY",
      allowCloud: false,
      input: [{ role: "user", content: [{ type: "text", text: input.text }] }],
      outputMode: "STRUCTURED",
      ...(input.context
        ? { context: [AIContextBlockSchema.parse({ sourceType: "EXTERNAL", trustLevel: "UNTRUSTED", content: input.context })] }
        : {}),
      ...(input.ownerId
        ? { economicContext: { ownerId: input.ownerId, purpose: "INTERPRETATION", autonomyMode: "INTERACTIVE", priority: "IMPORTANT" } }
        : {}),
      schemaName: "LocalIntentInterpretation",
      schema: LocalIntentInterpretationSchema,
    });
    if (result.outcome !== "SUCCESS" || !result.structuredOutput)
      throw new LocalAIError("CANONICAL_ROUTING_FAILED", result.decision.reason, true);
    return result.structuredOutput;
  }

  async converse(input: {
    ownerId?: string;
    prompt: string;
    context?: Record<string, unknown>;
    priority?: LocalInferencePriority;
    source?: LocalInferenceEvent["source"];
    requestId?: string;
  }) {
    const router = this.requireCanonicalRouter();
    const result = await router.execute({
      requestId: input.requestId ?? crypto.randomUUID(),
      purpose: "CONVERSATION",
      requestedRole: "GENERAL_REASONER",
      privacy: "LOCAL_ONLY",
      locality: "LOCAL_ONLY",
      allowCloud: false,
      input: [{ role: "user", content: [{ type: "text", text: input.prompt }] }],
      ...(input.context
        ? { context: [AIContextBlockSchema.parse({ sourceType: "EXTERNAL", trustLevel: "UNTRUSTED", content: input.context })] }
        : {}),
      ...(input.ownerId
        ? { economicContext: { ownerId: input.ownerId, purpose: "CONVERSATION", autonomyMode: "INTERACTIVE", priority: "IMPORTANT" } }
        : {}),
    });
    if (result.outcome !== "SUCCESS" || !result.outputText)
      throw new LocalAIError("CANONICAL_ROUTING_FAILED", result.decision.reason, true);
    return result.outputText;
  }

  stats() {
    const metrics = this.canonicalRouter?.metrics();
    return LocalAIStatsSchema.parse({
      requestCount: metrics?.local ?? 0,
      failureCount: metrics?.failed ?? 0,
      averageLatencyMs: 0,
      lastLatencyMs: null,
      queueDepth: 0,
      events: [],
    });
  }

  private requireCanonicalRouter() {
    if (!this.canonicalRouter)
      throw new LocalAIError(
        "CANONICAL_ROUTER_REQUIRED",
        "Legacy local inference is disabled; attach the canonical AIRouter.",
      );
    return this.canonicalRouter;
  }

  private healthResult(
    runtimeAvailable: boolean,
    modelAvailable: boolean,
    modelReady: boolean,
    state: LocalAIHealth["state"],
  ) {
    return LocalAIHealthSchema.parse({
      enabled: this.options.enabled,
      runtime: this.runtime.id,
      runtimeAvailable,
      baseUrl: "local",
      model: this.options.modelName,
      modelAvailable,
      modelReady,
      state,
      queueDepth: 0,
      lastLatencyMs: null,
      averageLatencyMs: 0,
      requestCount: this.canonicalRouter?.metrics().local ?? 0,
      failureCount: this.canonicalRouter?.metrics().failed ?? 0,
      lastSuccessfulRequest: null,
    });
  }
}

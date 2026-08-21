import type { AIBenchmarkExecutionCase } from "@alexa-control/shared";
import type { HumanUnderstandingService } from "../../human-understanding/service.js";
import type { CognitiveContextService } from "../context/service.js";
import type { AIRouterService } from "../router/service.js";
import type { AIBenchmarkExecutor, AIBenchmarkObservation } from "./service.js";

const deterministicCategories = new Set<AIBenchmarkExecutionCase["category"]>([
  "VOICE_INTERPRETATION",
  "INTENT_CLASSIFICATION",
  "ENTITY_EXTRACTION",
  "CLARIFICATION",
  "NON_EXECUTION",
]);

export const createProductionBenchmarkExecutor =
  (dependencies: {
    humanUnderstanding: HumanUnderstandingService;
    router: AIRouterService;
    context: CognitiveContextService;
  }): AIBenchmarkExecutor =>
  async (item, runtime): Promise<AIBenchmarkObservation> => {
    if (deterministicCategories.has(item.category)) {
      const started = performance.now();
      const result = await dependencies.humanUnderstanding.understand({
        ownerId: runtime.ownerId,
        requestId: crypto.randomUUID(),
        ipAddress: "benchmark",
        body: {
          text: item.input,
          source: item.category === "VOICE_INTERPRETATION" ? "voice" : "text",
          simulateOnly: runtime.mode === "DRY_RUN",
        },
      });
      return {
        output: {
          intent: result.selectedIntent?.intentId ?? null,
          entities: Object.fromEntries(
            result.entities.map((entity) => [entity.type, entity.value]),
          ),
        },
        nonExecution: result.plannerInput.mustNotExecute === true,
        clarificationRequired: result.clarification !== null,
        executionAttempted: false,
        latencyMs: Math.round(performance.now() - started),
      };
    }

    const started = performance.now();
    const response = await dependencies.router.execute({
      requestId: crypto.randomUUID(),
      purpose:
        item.category === "CODING"
          ? "CODING"
          : item.category === "BUSINESS_ANALYSIS"
            ? "REASONING"
            : "OTHER",
      input: [{ role: "user", content: [{ type: "text", text: item.input }] }],
      taskText: item.input,
      privacy: item.privacy ?? "STANDARD",
      locality: runtime.mode === "LIVE_PAID" ? "PREFER_LOCAL" : "LOCAL_ONLY",
      allowCloud: runtime.mode === "LIVE_PAID",
      allowFallback: true,
      allowClarification: true,
      maxAttempts: 2,
      economicContext: {
        ownerId: runtime.ownerId,
        purpose: item.category === "CODING" ? "CODING" : "OTHER",
        autonomyMode: "INTERACTIVE",
        priority: "IMPORTANT",
        costCenter: "benchmark",
      },
    });
    const trace = response.decision.contextId
      ? dependencies.context.getTrace(runtime.ownerId, response.decision.contextId)
      : undefined;
    const output =
      response.structuredOutput ??
      (response.outputText ? { text: response.outputText } : undefined);
    const locality = trace?.providerBoundary.locality;
    return {
      ...(output === undefined ? {} : { output }),
      ...(response.providerId ? { providerId: response.providerId } : {}),
      ...(response.modelId ? { modelId: response.modelId } : {}),
      ...(locality ? { locality } : {}),
      latencyMs: Math.round(performance.now() - started),
      ...(response.usage?.inputTokens === undefined
        ? {}
        : { inputTokens: response.usage.inputTokens }),
      ...(response.usage?.outputTokens === undefined
        ? {}
        : { outputTokens: response.usage.outputTokens }),
      ...(trace ? { contextTokens: trace.estimatedTokens } : {}),
      ...(trace ? { contextIncludedIds: trace.blocks.map((block) => block.id) } : {}),
      ...(trace
        ? {
            contextOmittedIds: trace.omittedCandidates.map(
              (candidate) => candidate.blockId,
            ),
          }
        : {}),
      ...(trace
        ? {
            privacyViolation:
              trace.providerBoundary.locality === "REMOTE" &&
              trace.blocks.some(
                (block) =>
                  block.sensitivity === "SECRET" || block.sensitivity === "RESTRICTED",
              ),
          }
        : {}),
      clarificationRequired: response.outcome === "CLARIFICATION_REQUIRED",
      executionAttempted: false,
      ...(response.outcome === "ROUTING_FAILED" ||
      response.outcome === "CAPABILITY_UNAVAILABLE"
        ? { errorCode: response.outcome }
        : {}),
    };
  };

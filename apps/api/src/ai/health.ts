import { AIRuntimeHealthSchema, type AIRuntimeHealth } from "@alexa-control/shared";
import type { AIRuntimeService } from "./runtime-service.js";
import type { CognitiveContextService } from "./context/service.js";
import type { AIEconomicsService } from "./economics/service.js";

export class AIRuntimeHealthService {
  constructor(
    private readonly runtime: AIRuntimeService,
    private readonly context: CognitiveContextService,
    private readonly economics: AIEconomicsService,
  ) {}
  async get(): Promise<AIRuntimeHealth> {
    const providers = await this.runtime.providerHealth();
    const descriptors = this.runtime.listProviders();
    const contextHealth = this.context.health();
    const economicsHealth = await this.economics.health();
    const components: AIRuntimeHealth["components"] = [
      {
        name: "deterministic",
        status: "HEALTHY",
        detail: "Deterministic governance and routing paths are available.",
      },
      {
        name: "context",
        status: contextHealth.status === "READY" ? "HEALTHY" : "DEGRADED",
        detail:
          contextHealth.status === "READY"
            ? `${contextHealth.registeredSources.length} owner-scoped production context source(s).`
            : `Context ${contextHealth.status}: ${contextHealth.requiredSourceFailures.join(", ") || contextHealth.degradedSources.join(", ") || "not ready"}.`,
      },
      {
        name: "economics",
        status:
          economicsHealth.status === "READY"
            ? "HEALTHY"
            : economicsHealth.status === "UNAVAILABLE"
              ? "UNAVAILABLE"
              : "DEGRADED",
        detail: `${economicsHealth.persistence}: ${economicsHealth.reasons.join(", ") || "ready"}`,
      },
    ];
    for (const provider of providers)
      components.push({
        name: `provider:${provider.providerId}`,
        status:
          provider.status === "HEALTHY"
            ? "HEALTHY"
            : provider.status === "UNAVAILABLE" || provider.status === "UNCONFIGURED"
              ? "UNAVAILABLE"
              : "DEGRADED",
        detail: provider.errorCategory ?? provider.status,
      });
    const isHealthyType = (providerId: string, type: "LOCAL" | "REMOTE") => {
      const descriptor = descriptors.find((item) => item.providerId === providerId);
      return type === "LOCAL"
        ? descriptor?.providerType === "LOCAL"
        : descriptor?.providerType !== "LOCAL";
    };
    const hasLocal = providers.some(
      (item) => isHealthyType(item.providerId, "LOCAL") && item.status === "HEALTHY",
    );
    const hasCloud = providers.some(
      (item) => isHealthyType(item.providerId, "REMOTE") && item.status === "HEALTHY",
    );
    const overall = components.some((item) => item.status === "DEGRADED")
      ? "DEGRADED"
      : components.some((item) => item.status === "UNAVAILABLE") &&
          !hasLocal &&
          !hasCloud
        ? "CONSTRAINED"
        : "HEALTHY";
    const contextReady = contextHealth.status === "READY";
    const governedCloudReady = hasCloud && economicsHealth.status === "READY";
    const readiness = !contextReady
      ? "DEGRADED"
      : hasLocal && governedCloudReady
        ? "HYBRID_READY"
        : hasLocal
          ? "LOCAL_READY"
          : governedCloudReady
            ? "CLOUD_READY"
            : "DETERMINISTIC_READY";
    return AIRuntimeHealthSchema.parse({
      overall,
      readiness,
      components,
      checkedAt: new Date().toISOString(),
    });
  }
}

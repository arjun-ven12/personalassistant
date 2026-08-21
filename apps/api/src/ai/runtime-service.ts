import {
  AIModelRoleMappingSchema,
  type AIInferenceRequest,
  type AIInferenceResponse,
  type AIModelRoleMapping,
} from "@alexa-control/shared";
import { AIProviderError } from "./errors.js";
import type { AIModelRegistry, AIProviderRegistry } from "./registry.js";
import { type ResolvedAIModel } from "./registry.js";
import type {
  AIStructuredInferenceRequest,
  AIStructuredInferenceResponse,
  AIProviderExecutionOptions,
} from "./provider.js";
import { ensureRequest } from "./provider.js";

export class AIRuntimeService {
  private paidInferenceAuthorizer:
    ((permit: PaidInferencePermit) => Promise<boolean>) | undefined;
  private readonly activity: Array<{
    requestId: string;
    providerId: string;
    modelId: string;
    purpose: AIInferenceRequest["purpose"];
    status: string;
    latencyMs: number;
    createdAt: string;
  }> = [];
  constructor(
    readonly providers: AIProviderRegistry,
    readonly models: AIModelRegistry,
  ) {}
  requirePaidInferenceAuthorization(
    authorizer: (permit: PaidInferencePermit) => Promise<boolean>,
  ) {
    this.paidInferenceAuthorizer = authorizer;
  }
  resolveModel(selector: NonNullable<AIInferenceRequest["model"]>): ResolvedAIModel {
    const model = this.models.resolve(selector);
    if (!model.enabled)
      throw new AIProviderError(
        "MODEL_UNAVAILABLE",
        `Model ${model.modelId} is disabled.`,
        model.providerId,
      );
    const provider = this.providers.get(model.providerId);
    if (!provider.describe().enabled)
      throw new AIProviderError(
        "PROVIDER_UNAVAILABLE",
        `Provider ${model.providerId} is disabled.`,
        model.providerId,
      );
    return { provider, model };
  }
  resolveRole(role: AIModelRoleMapping["role"]) {
    const mapping = this.models
      .listRoles()
      .find((item) => item.role === role && item.enabled);
    if (!mapping)
      throw new AIProviderError(
        "MODEL_ROLE_UNCONFIGURED",
        `No enabled model role mapping exists for ${role}.`,
      );
    return this.resolveModel({
      type: "MODEL",
      providerId: mapping.providerId,
      modelId: mapping.modelId,
    });
  }
  setRole(mapping: AIModelRoleMapping) {
    const parsed = AIModelRoleMappingSchema.parse(mapping);
    const model = this.models.get(parsed.providerId, parsed.modelId);
    if (parsed.role === "VISION" && !model.capabilities.vision)
      throw new AIProviderError(
        "CAPABILITY_NOT_SUPPORTED",
        "The selected model does not support vision.",
        parsed.providerId,
      );
    this.models.setRole(parsed);
    return parsed;
  }
  async generate(
    request: AIInferenceRequest,
    permit?: PaidInferencePermit,
    options?: AIProviderExecutionOptions,
  ): Promise<AIInferenceResponse> {
    const parsed = ensureRequest(request);
    const resolved = parsed.model
      ? this.resolveModel(parsed.model)
      : this.resolveRole(this.purposeRole(parsed.purpose));
    this.validateCapabilities(resolved, parsed);
    await this.validateEconomicPermit(resolved, permit);
    try {
      const result = await resolved.provider.generate({
        ...parsed,
        model: {
          type: "MODEL",
          providerId: resolved.model.providerId,
          modelId: resolved.model.modelId,
        },
      }, options);
      this.record(parsed, result);
      return result;
    } catch (error) {
      this.recordFailure(parsed, resolved, error);
      throw error;
    }
  }
  async generateStructured<T>(
    request: AIStructuredInferenceRequest<T>,
    permit?: PaidInferencePermit,
    options?: AIProviderExecutionOptions,
  ): Promise<AIStructuredInferenceResponse<T>> {
    const parsed = ensureRequest(request);
    const resolved = parsed.model
      ? this.resolveModel(parsed.model)
      : this.resolveRole(this.purposeRole(parsed.purpose));
    this.validateCapabilities(resolved, parsed);
    await this.validateEconomicPermit(resolved, permit);
    try {
      const result = await resolved.provider.generateStructured({
        ...request,
        ...parsed,
        model: {
          type: "MODEL",
          providerId: resolved.model.providerId,
          modelId: resolved.model.modelId,
        },
      }, options);
      this.record(parsed, result);
      return result;
    } catch (error) {
      this.recordFailure(parsed, resolved, error);
      throw error;
    }
  }
  listProviders() {
    return this.providers.list();
  }
  listModels() {
    return this.models.list();
  }
  listRoles() {
    return this.models.listRoles();
  }
  async providerHealth() {
    return this.providers.health();
  }
  activityList() {
    return this.activity.slice(-100).reverse();
  }
  private purposeRole(
    purpose: AIInferenceRequest["purpose"],
  ): AIModelRoleMapping["role"] {
    if (
      purpose === "INTERPRETATION" ||
      purpose === "CLASSIFICATION" ||
      purpose === "EXTRACTION"
    )
      return "FAST_INTERPRETER";
    if (purpose === "CODING") return "CODER";
    if (purpose === "WRITING") return "WRITER";
    if (purpose === "VISION") return "VISION";
    if (purpose === "REASONING" || purpose === "PLANNING_ASSIST")
      return "GENERAL_REASONER";
    return "GENERAL_REASONER";
  }
  private validateCapabilities(resolved: ResolvedAIModel, request: AIInferenceRequest) {
    if (request.outputMode !== "TEXT" && !resolved.model.capabilities.structuredOutput)
      throw new AIProviderError(
        "CAPABILITY_NOT_SUPPORTED",
        "The selected model does not support structured output.",
        resolved.provider.providerId,
      );
    if (request.purpose === "VISION" && !resolved.model.capabilities.vision)
      throw new AIProviderError(
        "CAPABILITY_NOT_SUPPORTED",
        "The selected model does not support vision.",
        resolved.provider.providerId,
      );
    const chars = JSON.stringify(request).length;
    if (resolved.model.contextWindow && chars > resolved.model.contextWindow * 4)
      throw new AIProviderError(
        "CONTEXT_LIMIT_EXCEEDED",
        "The request exceeds the model context limit.",
        resolved.provider.providerId,
      );
  }
  private async validateEconomicPermit(
    resolved: ResolvedAIModel,
    permit: PaidInferencePermit | undefined,
  ) {
    if (resolved.model.locality !== "REMOTE" || !this.paidInferenceAuthorizer) return;
    if (!permit || !(await this.paidInferenceAuthorizer(permit)))
      throw new AIProviderError(
        "PROVIDER_UNAVAILABLE",
        "Paid inference was blocked because no active durable economic reservation was supplied.",
        resolved.provider.providerId,
      );
  }
  private record(
    request: AIInferenceRequest,
    result: Pick<
      AIInferenceResponse,
      "requestId" | "providerId" | "modelId" | "status" | "latencyMs"
    >,
  ) {
    this.activity.push({
      requestId: result.requestId,
      providerId: result.providerId,
      modelId: result.modelId,
      purpose: request.purpose,
      status: result.status,
      latencyMs: result.latencyMs,
      createdAt: new Date().toISOString(),
    });
  }
  private recordFailure(
    request: AIInferenceRequest,
    resolved: ResolvedAIModel,
    error: unknown,
  ) {
    this.activity.push({
      requestId: request.requestId ?? "unknown",
      providerId: resolved.provider.providerId,
      modelId: resolved.model.modelId,
      purpose: request.purpose,
      status: error instanceof AIProviderError ? error.code : "FAILED",
      latencyMs: 0,
      createdAt: new Date().toISOString(),
    });
  }
}

export type PaidInferencePermit = {
  ownerId: string;
  reservationId: string;
};

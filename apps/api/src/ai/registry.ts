import type {
  AIProvider,
} from "./provider.js";
import type {
  AIModelDescriptor,
  AIModelRole,
  AIModelRoleMapping,
  AIProviderDescriptor,
  AIProviderHealth,
  AIModelSelector,
} from "@alexa-control/shared";
import { AIProviderError } from "./errors.js";

export class AIProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();
  register(provider: AIProvider) {
    if (this.providers.has(provider.providerId))
      throw new AIProviderError(
        "INVALID_REQUEST",
        `Provider ${provider.providerId} is already registered.`,
        provider.providerId,
      );
    this.providers.set(provider.providerId, provider);
  }
  unregister(providerId: string) {
    this.providers.delete(providerId);
  }
  get(providerId: string) {
    const provider = this.providers.get(providerId);
    if (!provider)
      throw new AIProviderError(
        "PROVIDER_UNAVAILABLE",
        `Provider ${providerId} is not registered.`,
        providerId,
      );
    return provider;
  }
  has(providerId: string) {
    return this.providers.has(providerId);
  }
  list(): AIProviderDescriptor[] {
    return [...this.providers.values()].map((provider) => provider.describe());
  }
  async health(): Promise<AIProviderHealth[]> {
    return Promise.all(
      [...this.providers.values()].map((provider) => provider.healthCheck()),
    );
  }
}

export class AIModelRegistry {
  private readonly models = new Map<string, AIModelDescriptor>();
  private readonly roles = new Map<AIModelRole, AIModelRoleMapping>();
  register(model: AIModelDescriptor) {
    const key = `${model.providerId}:${model.modelId}`;
    if (this.models.has(key))
      throw new AIProviderError(
        "INVALID_REQUEST",
        `Model ${key} is already registered.`,
        model.providerId,
      );
    this.models.set(key, model);
  }
  upsert(model: AIModelDescriptor) {
    this.models.set(`${model.providerId}:${model.modelId}`, model);
  }
  get(providerId: string, modelId: string) {
    const model = this.models.get(`${providerId}:${modelId}`);
    if (!model)
      throw new AIProviderError(
        "MODEL_NOT_FOUND",
        `Model ${modelId} is not registered.`,
        providerId,
      );
    return model;
  }
  list() {
    return [...this.models.values()];
  }
  setRole(mapping: AIModelRoleMapping) {
    this.get(mapping.providerId, mapping.modelId);
    this.roles.set(mapping.role, mapping);
  }
  listRoles() {
    return [...this.roles.values()];
  }
  resolve(selector: AIModelSelector): AIModelDescriptor {
    if (selector.type === "MODEL")
      return this.get(selector.providerId, selector.modelId);
    const mapping = this.roles.get(selector.role);
    if (!mapping || !mapping.enabled)
      throw new AIProviderError(
        "MODEL_ROLE_UNCONFIGURED",
        `No enabled model role mapping exists for ${selector.role}.`,
      );
    return this.get(mapping.providerId, mapping.modelId);
  }
}

export type ResolvedAIModel = { provider: AIProvider; model: AIModelDescriptor };

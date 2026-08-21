import type {
  EmbeddingProvider,
  EmbeddingProviderHealth,
  EmbeddingRequest,
} from "./provider.js";
import { EmbeddingRequestSchema } from "./provider.js";

export class EmbeddingProviderRegistry {
  private readonly providers = new Map<string, EmbeddingProvider>();

  register(provider: EmbeddingProvider) {
    if (this.providers.has(provider.providerId))
      throw new Error("EMBEDDING_PROVIDER_ALREADY_REGISTERED");
    this.providers.set(provider.providerId, provider);
  }

  get(providerId: string) {
    return this.providers.get(providerId);
  }

  list() {
    return [...this.providers.values()];
  }
}

export class EmbeddingRuntimeService {
  constructor(
    readonly registry: EmbeddingProviderRegistry,
    readonly selectedProviderId?: string,
  ) {}

  async health(): Promise<EmbeddingProviderHealth> {
    const provider = this.selectedProviderId
      ? this.registry.get(this.selectedProviderId)
      : undefined;
    return provider
      ? provider.healthCheck()
      : {
          providerId: this.selectedProviderId ?? "none",
          status: "UNCONFIGURED",
          errorCode: "EMBEDDING_PROVIDER_UNAVAILABLE",
        };
  }

  status() {
    const provider = this.selectedProviderId
      ? this.registry.get(this.selectedProviderId)
      : undefined;
    return {
      provider: provider?.providerId ?? "disabled",
      model: provider?.modelId ?? "none",
      enabled: Boolean(provider),
    };
  }

  async embed(request: EmbeddingRequest) {
    const parsed = EmbeddingRequestSchema.parse(request);
    const provider = this.selectedProviderId
      ? this.registry.get(this.selectedProviderId)
      : undefined;
    if (!provider) throw new Error("EMBEDDING_PROVIDER_DISABLED");
    return provider.embed(parsed);
  }
}

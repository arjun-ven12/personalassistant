import {
  InfrastructureStatusResponseSchema,
  type InfrastructureStatusResponse,
} from "@alexa-control/shared";

import type { PostgresDatabase } from "../persistence/database.js";
import type { CacheService } from "./cache-service.js";
import type { EmbeddingService } from "./embedding-service.js";
import type { RedisService } from "./redis-service.js";
import type { RetrievalServiceOptions } from "./retrieval-service.js";
import type { WorkerService } from "./worker-service.js";

export interface InfrastructureServiceOptions {
  memoryEnabled: boolean;
  retrievalLimit: number;
  similarityThreshold: number;
  maxContext: number;
  vectorDimensions: number;
}

export class InfrastructureMetricsService {
  constructor(
    readonly redis: RedisService,
    readonly cache: CacheService,
    readonly embeddings: EmbeddingService,
    readonly workers: WorkerService,
    readonly retrieval: RetrievalServiceOptions,
    readonly options: InfrastructureServiceOptions,
    readonly database?: PostgresDatabase,
  ) {}

  async status(): Promise<InfrastructureStatusResponse> {
    const redis = await this.redis.health();
    const embeddingStatus = this.embeddings.status();
    const pgvector =
      this.database &&
      (await this.database.pgvectorStatus().catch(() => "unavailable"));
    return InfrastructureStatusResponseSchema.parse({
      redis: {
        status:
          this.redis.mode === "disabled"
            ? "not_configured"
            : redis.available
              ? "ready"
              : "unavailable",
        mode: this.redis.mode,
        namespace: this.redis.namespace,
        latencyMs: redis.latencyMs,
      },
      cache: this.cache.metrics(),
      postgres: {
        status: this.database ? "ready" : "disabled",
        sourceOfTruth: true,
      },
      pgvector: {
        status:
          pgvector === "ready" ? "ready" : this.database ? "unavailable" : "disabled",
        dimensions: this.options.vectorDimensions,
      },
      embeddings: {
        status: embeddingStatus.enabled ? "ready" : "disabled",
        provider: embeddingStatus.provider,
        model: embeddingStatus.model,
        queueLength: embeddingStatus.queueLength,
      },
      workers: this.workers.status(),
      retrieval: {
        semanticSearchEnabled: this.retrieval.semanticSearchEnabled,
        hybridSearchEnabled: this.retrieval.hybridSearchEnabled,
        keywordWeight: this.retrieval.keywordWeight,
        vectorWeight: this.retrieval.vectorWeight,
      },
      memory: {
        enabled: this.options.memoryEnabled,
        retrievalLimit: this.options.retrievalLimit,
        similarityThreshold: this.options.similarityThreshold,
        maxContext: this.options.maxContext,
      },
    });
  }
}

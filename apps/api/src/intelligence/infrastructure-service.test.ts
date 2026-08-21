import { describe, expect, it } from "vitest";

import { CacheService } from "./cache-service.js";
import { EmbeddingService } from "./embedding-service.js";
import { InfrastructureMetricsService } from "./infrastructure-service.js";
import { RedisService } from "./redis-service.js";
import { WorkerService } from "./worker-service.js";

describe("InfrastructureMetricsService", () => {
  it("reports disabled Redis and embedding infrastructure without leaking secrets", async () => {
    const redis = new RedisService({ namespace: "test" });
    const cache = new CacheService(redis, {
      enabled: false,
      namespace: "test",
      defaultTtlSeconds: 900,
    });
    const embeddings = new EmbeddingService({
      provider: "disabled",
      model: "text-embedding-3-small",
      batchSize: 32,
      maxRetries: 3,
      dimensions: 1536,
    });
    const workers = new WorkerService({
      enabled: false,
      workerCount: 0,
      concurrency: 1,
    });
    const service = new InfrastructureMetricsService(
      redis,
      cache,
      embeddings,
      workers,
      {
        semanticSearchEnabled: false,
        hybridSearchEnabled: true,
        keywordWeight: 0.35,
        vectorWeight: 0.65,
        similarityThreshold: 0.75,
        retrievalLimit: 12,
      },
      {
        memoryEnabled: true,
        retrievalLimit: 12,
        similarityThreshold: 0.75,
        maxContext: 40,
        vectorDimensions: 1536,
      },
    );

    const status = await service.status();
    expect(status.redis.status).toBe("not_configured");
    expect(status.embeddings.status).toBe("disabled");
    expect(JSON.stringify(status)).not.toContain("sk-");
  });
});

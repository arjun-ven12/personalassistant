import {
  EmbeddingJobRecordSchema,
  type EmbeddingJobRecord,
} from "@alexa-control/shared";
import { OpenAIEmbeddingProvider } from "../ai/embeddings/openai.js";
import {
  EmbeddingProviderRegistry,
  EmbeddingRuntimeService,
} from "../ai/embeddings/runtime.js";

export interface EmbeddingServiceOptions {
  provider: "openai" | "disabled";
  model: string;
  apiKey?: string;
  batchSize: number;
  maxRetries: number;
  dimensions: number;
}

export class EmbeddingService {
  readonly #jobs = new Map<string, EmbeddingJobRecord>();
  readonly runtime: EmbeddingRuntimeService;

  constructor(
    readonly options: EmbeddingServiceOptions,
    readonly now: () => Date = () => new Date(),
  ) {
    const registry = new EmbeddingProviderRegistry();
    if (options.provider === "openai")
      registry.register(new OpenAIEmbeddingProvider(options.model, options.apiKey));
    this.runtime = new EmbeddingRuntimeService(
      registry,
      options.provider === "openai" ? "openai" : undefined,
    );
  }

  status() {
    return {
      provider: this.options.provider,
      model: this.options.model,
      enabled: this.options.provider === "openai" && Boolean(this.options.apiKey),
      queueLength: [...this.#jobs.values()].filter((job) => job.status === "queued")
        .length,
    };
  }

  listJobs(limit = 500) {
    return [...this.#jobs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((job) => structuredClone(job));
  }

  enqueue(input: {
    ownerId: string;
    memoryId?: string | null;
    targetType: EmbeddingJobRecord["targetType"];
    targetId: string;
  }) {
    const at = this.now().toISOString();
    const job = EmbeddingJobRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      memoryId: input.memoryId ?? null,
      targetType: input.targetType,
      targetId: input.targetId,
      provider: this.options.provider,
      model: this.options.model,
      status: this.status().enabled ? "queued" : "failed",
      attempts: 0,
      lastErrorCode: this.status().enabled ? null : "EMBEDDING_PROVIDER_DISABLED",
      createdAt: at,
      updatedAt: at,
    });
    this.#jobs.set(job.id, job);
    return job;
  }

  async embed(input: string) {
    return (await this.runtime.embed({ input })).embedding;
  }
}

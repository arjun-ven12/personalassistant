import { z } from "zod";

export const InfrastructureComponentStatusSchema = z.enum([
  "ready",
  "degraded",
  "unavailable",
  "disabled",
  "not_configured",
]);

export const WorkerJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "retrying",
]);

export const RetrievalModeSchema = z.enum(["keyword", "vector", "hybrid"]);

export const CacheMetricsSchema = z
  .object({
    enabled: z.boolean(),
    namespace: z.string().min(1).max(120),
    hits: z.number().int().nonnegative(),
    misses: z.number().int().nonnegative(),
    writes: z.number().int().nonnegative(),
    invalidations: z.number().int().nonnegative(),
    hitRate: z.number().min(0).max(1),
    averageLatencyMs: z.number().nonnegative(),
  })
  .strict();

export const WorkerQueueStatusSchema = z
  .object({
    enabled: z.boolean(),
    workerCount: z.number().int().nonnegative().max(1_000),
    concurrency: z.number().int().nonnegative().max(10_000),
    queued: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
  })
  .strict();

export const EmbeddingJobRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    memoryId: z.string().uuid().nullable(),
    targetType: z.enum([
      "memory",
      "decision",
      "repository",
      "agent",
      "workflow",
      "knowledge_node",
    ]),
    targetId: z.string().min(1).max(255),
    provider: z.enum(["openai", "disabled"]),
    model: z.string().min(1).max(120),
    status: WorkerJobStatusSchema,
    attempts: z.number().int().nonnegative().max(100),
    lastErrorCode: z.string().max(120).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const RetrievalLogRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    query: z.string().min(1).max(500),
    mode: RetrievalModeSchema,
    resultCount: z.number().int().nonnegative().max(1_000),
    latencyMs: z.number().nonnegative(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const InfrastructureStatusResponseSchema = z
  .object({
    redis: z
      .object({
        status: InfrastructureComponentStatusSchema,
        mode: z.enum(["upstash", "standard", "disabled"]),
        namespace: z.string().min(1).max(120),
        latencyMs: z.number().nonnegative().nullable(),
      })
      .strict(),
    cache: CacheMetricsSchema,
    postgres: z
      .object({
        status: InfrastructureComponentStatusSchema,
        sourceOfTruth: z.literal(true),
      })
      .strict(),
    pgvector: z
      .object({
        status: InfrastructureComponentStatusSchema,
        dimensions: z.number().int().positive(),
      })
      .strict(),
    embeddings: z
      .object({
        status: InfrastructureComponentStatusSchema,
        provider: z.enum(["openai", "disabled"]),
        model: z.string().min(1).max(120),
        queueLength: z.number().int().nonnegative(),
      })
      .strict(),
    workers: WorkerQueueStatusSchema,
    retrieval: z
      .object({
        semanticSearchEnabled: z.boolean(),
        hybridSearchEnabled: z.boolean(),
        keywordWeight: z.number().min(0).max(1),
        vectorWeight: z.number().min(0).max(1),
      })
      .strict(),
    memory: z
      .object({
        enabled: z.boolean(),
        retrievalLimit: z.number().int().positive(),
        similarityThreshold: z.number().min(0).max(1),
        maxContext: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

export const HybridSearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    repositoryId: z.string().uuid().optional(),
    workflowId: z.string().uuid().optional(),
    agentId: z.string().min(3).max(120).optional(),
    limit: z.number().int().min(1).max(100).default(12),
    mode: RetrievalModeSchema.default("hybrid"),
  })
  .strict();

export const HybridSearchResultSchema = z
  .object({
    memoryId: z.string().uuid(),
    title: z.string().min(1).max(255),
    summary: z.string().max(2_000),
    score: z.number().min(0),
    keywordScore: z.number().min(0),
    vectorScore: z.number().min(0),
    recencyScore: z.number().min(0),
    importanceScore: z.number().min(0),
    confidence: z.number().min(0).max(1),
    evidenceRefs: z.array(z.string().min(1).max(500)).max(50),
  })
  .strict();

export const HybridSearchResponseSchema = z
  .object({
    mode: RetrievalModeSchema,
    results: z.array(HybridSearchResultSchema).max(100),
  })
  .strict();

export const EmbeddingJobListResponseSchema = z
  .array(EmbeddingJobRecordSchema)
  .max(500);

export type InfrastructureStatusResponse = z.infer<
  typeof InfrastructureStatusResponseSchema
>;
export type EmbeddingJobRecord = z.infer<typeof EmbeddingJobRecordSchema>;
export type HybridSearchRequest = z.infer<typeof HybridSearchRequestSchema>;
export type HybridSearchResponse = z.infer<typeof HybridSearchResponseSchema>;
export type CacheMetrics = z.infer<typeof CacheMetricsSchema>;
export type WorkerQueueStatus = z.infer<typeof WorkerQueueStatusSchema>;

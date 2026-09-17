import {
  HybridSearchRequestSchema,
  HybridSearchResponseSchema,
  type HybridSearchResponse,
  type MemoryRecord,
} from "@alexa-control/shared";

import type { MemoryStore } from "../memory/store.js";
import type { EmbeddingService } from "./embedding-service.js";

export interface RetrievalServiceOptions {
  semanticSearchEnabled: boolean;
  hybridSearchEnabled: boolean;
  keywordWeight: number;
  vectorWeight: number;
  similarityThreshold: number;
  retrievalLimit: number;
}

export class RetrievalService {
  constructor(
    readonly memoryStore: MemoryStore,
    readonly embeddings: EmbeddingService,
    readonly options: RetrievalServiceOptions,
    readonly now: () => Date = () => new Date(),
  ) {}

  async hybridSearch(ownerId: string, input: unknown): Promise<HybridSearchResponse> {
    const request = HybridSearchRequestSchema.parse(input);
    // This legacy store has no compatible document-vector query contract. Do not
    // buy query embeddings or compare them to locally fabricated vectors.
    if (request.mode === "vector")
      throw Object.assign(
        new Error("Vector retrieval is unavailable for this legacy memory source."),
        { code: "VECTOR_RETRIEVAL_UNAVAILABLE", statusCode: 503 },
      );
    const query = request.query.toLowerCase();
    const lexical = await this.memoryStore.searchMemories(ownerId, {
      q: request.query,
      repositoryId: request.repositoryId,
      agentId: request.agentId,
      limit: Math.max(request.limit, this.options.retrievalLimit),
    });
    const all =
      request.mode === "keyword"
        ? lexical
        : [
            ...new Map(
              [
                ...lexical,
                ...(await this.memoryStore.listMemories(ownerId, 1_000)),
              ].map((memory) => [memory.id, memory]),
            ).values(),
          ];
    const ranked = all
      .filter(
        (memory) =>
          memory.ownerId === ownerId &&
          (!memory.expiresAt || Date.parse(memory.expiresAt) > this.now().getTime()),
      )
      .filter(
        (memory) =>
          !request.repositoryId || memory.repositoryId === request.repositoryId,
      )
      .filter((memory) => !request.agentId || memory.agentId === request.agentId)
      .filter(
        (memory) => !request.workflowId || memory.workflowId === request.workflowId,
      )
      .map((memory) => this.rankMemory(memory, query))
      .filter((result) => result.keywordScore > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, request.limit);
    return HybridSearchResponseSchema.parse({
      mode: "keyword",
      results: ranked,
    });
  }

  rankMemory(memory: MemoryRecord, query: string) {
    const haystack = [
      memory.title,
      memory.summary,
      memory.content,
      memory.tags.join(" "),
      memory.evidence.map((evidence) => evidence.reference).join(" "),
    ]
      .join(" ")
      .toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    const keywordScore =
      terms.length === 0
        ? 0
        : terms.filter((term) => haystack.includes(term)).length / terms.length;
    const vectorScore = 0;
    const ageMs = Math.max(0, this.now().getTime() - Date.parse(memory.updatedAt));
    const recencyScore = Math.exp(-ageMs / (1000 * 60 * 60 * 24 * 30));
    const importanceScore = memory.importance / 100;
    const weighted = keywordScore;
    const score =
      weighted * 0.68 +
      recencyScore * 0.08 +
      importanceScore * 0.14 +
      memory.confidence * 0.1;
    return {
      memoryId: memory.id,
      title: memory.title,
      summary: memory.summary,
      score,
      keywordScore,
      vectorScore,
      recencyScore,
      importanceScore,
      confidence: memory.confidence,
      evidenceRefs: memory.evidence.map((evidence) => evidence.reference),
    };
  }
}

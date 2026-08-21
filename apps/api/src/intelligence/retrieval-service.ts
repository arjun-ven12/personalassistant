import {
  HybridSearchRequestSchema,
  HybridSearchResponseSchema,
  type HybridSearchRequest,
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
    const query = request.query.toLowerCase();
    const lexical = await this.memoryStore.searchMemories(ownerId, {
      q: request.mode === "vector" ? "" : request.query,
      repositoryId: request.repositoryId,
      agentId: request.agentId,
      limit: Math.max(request.limit, this.options.retrievalLimit),
    });
    const all =
      request.mode === "keyword"
        ? lexical
        : await this.memoryStore.listMemories(ownerId, 1_000);
    const queryEmbedding =
      this.options.semanticSearchEnabled && this.embeddings.status().enabled
        ? await this.embeddings.embed(request.query).catch(() => null)
        : null;
    const ranked = all
      .filter(
        (memory) =>
          !request.repositoryId || memory.repositoryId === request.repositoryId,
      )
      .filter((memory) => !request.agentId || memory.agentId === request.agentId)
      .filter(
        (memory) => !request.workflowId || memory.workflowId === request.workflowId,
      )
      .map((memory) => this.rankMemory(memory, query, queryEmbedding, request))
      .filter((result) =>
        request.mode === "vector"
          ? result.vectorScore >= this.options.similarityThreshold
          : result.score > 0,
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, request.limit);
    return HybridSearchResponseSchema.parse({
      mode: request.mode,
      results: ranked,
    });
  }

  rankMemory(
    memory: MemoryRecord,
    query: string,
    queryEmbedding: number[] | null,
    request: HybridSearchRequest,
  ) {
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
    const vectorScore = queryEmbedding
      ? cosine(queryEmbedding, deterministicVector(haystack, queryEmbedding.length))
      : deterministicSimilarity(query, haystack);
    const ageMs = Math.max(0, this.now().getTime() - Date.parse(memory.updatedAt));
    const recencyScore = Math.exp(-ageMs / (1000 * 60 * 60 * 24 * 30));
    const importanceScore = memory.importance / 100;
    const weighted =
      request.mode === "keyword"
        ? keywordScore
        : request.mode === "vector"
          ? vectorScore
          : keywordScore * this.options.keywordWeight +
            vectorScore * this.options.vectorWeight;
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

const deterministicSimilarity = (query: string, text: string) => {
  if (!query) return 0;
  const queryTokens = new Set(query.split(/\W+/).filter(Boolean));
  const textTokens = new Set(text.split(/\W+/).filter(Boolean));
  if (queryTokens.size === 0 || textTokens.size === 0) return 0;
  const overlap = [...queryTokens].filter((token) => textTokens.has(token)).length;
  return overlap / Math.sqrt(queryTokens.size * textTokens.size);
};

const deterministicVector = (text: string, dimensions: number) => {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (let index = 0; index < text.length; index += 1) {
    const bucket = index % dimensions;
    vector[bucket] = (vector[bucket] ?? 0) + text.charCodeAt(index) / 255;
  }
  return normalize(vector);
};

const normalize = (vector: number[]) => {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude ? vector.map((value) => value / magnitude) : vector;
};

const cosine = (left: number[], right: number[]) => {
  const size = Math.min(left.length, right.length);
  let dot = 0;
  for (let index = 0; index < size; index += 1) dot += left[index]! * right[index]!;
  return Math.max(0, Math.min(1, dot));
};

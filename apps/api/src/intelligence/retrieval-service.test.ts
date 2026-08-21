import { describe, expect, it } from "vitest";

import { MemoryRecordSchema } from "@alexa-control/shared";
import { EmbeddingService } from "./embedding-service.js";
import { RetrievalService } from "./retrieval-service.js";
import { InMemoryMemoryStore } from "../memory/store.js";

describe("RetrievalService", () => {
  it("combines keyword, vector fallback, importance, recency, and confidence", async () => {
    const ownerId = crypto.randomUUID();
    const store = new InMemoryMemoryStore();
    const at = new Date().toISOString();
    const relevant = MemoryRecordSchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId,
      repositoryId: null,
      agentId: null,
      workflowId: null,
      memoryType: "semantic",
      source: "owner",
      title: "Authentication uses secure sessions",
      summary: "Login uses HttpOnly opaque sessions and CSRF.",
      content: "Authentication does not replace policy evaluation.",
      tags: ["auth", "security"],
      importance: 90,
      confidence: 0.95,
      evidence: [],
      version: 1,
      createdAt: at,
      updatedAt: at,
      lastAccessedAt: null,
      expiresAt: null,
    });
    const irrelevant = MemoryRecordSchema.parse({
      ...relevant,
      id: crypto.randomUUID(),
      title: "Deployment notes",
      summary: "Tailscale Serve remains private.",
      content: "No public Funnel.",
      tags: ["deployment"],
      importance: 30,
      confidence: 0.5,
    });
    store.saveMemory(relevant);
    store.saveMemory(irrelevant);
    const retrieval = new RetrievalService(
      store,
      new EmbeddingService({
        provider: "disabled",
        model: "text-embedding-3-small",
        batchSize: 32,
        maxRetries: 3,
        dimensions: 1536,
      }),
      {
        semanticSearchEnabled: true,
        hybridSearchEnabled: true,
        keywordWeight: 0.35,
        vectorWeight: 0.65,
        similarityThreshold: 0.1,
        retrievalLimit: 12,
      },
    );

    const result = await retrieval.hybridSearch(ownerId, {
      query: "authentication sessions csrf",
      mode: "hybrid",
      limit: 5,
    });

    expect(result.results[0]?.memoryId).toBe(relevant.id);
    expect(result.results[0]?.score).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { CacheService } from "../intelligence/cache-service.js";
import { EmbeddingService } from "../intelligence/embedding-service.js";
import { RedisService } from "../intelligence/redis-service.js";
import { SemanticRetrievalService } from "./service.js";
import { InMemorySemanticRetrievalStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
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
  const service = new SemanticRetrievalService(
    new InMemorySemanticRetrievalStore(),
    cache,
    embeddings,
    audit,
  );
  return { audits, ownerId, service };
};

describe("SemanticRetrievalService", () => {
  it("resolves exact navigation targets deterministically", async () => {
    const { audits, ownerId, service } = setup();
    const response = await service.search({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        query: "Commands",
        source: "voice",
      },
    });

    expect(response.resolution).toBe("resolved");
    expect(response.selected?.routePath).toBe("/commands");
    expect(response.selected?.matchKind).toBe("exact");
    expect(audits.map((audit) => audit.eventType)).toContain(
      "SEMANTIC_RETRIEVAL_RESOLVED",
    );
  });

  it("resolves built-in aliases without AI fallback", async () => {
    const { ownerId, service } = setup();
    const response = await service.search({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        query: "create command",
        source: "voice",
      },
    });

    expect(response.resolution).toBe("resolved");
    expect(response.selected?.objectKey).toBe("page:command-studio");
    expect(response.selected?.matchKind).toBe("alias");
  });

  it("uses deterministic synonyms before fallback", async () => {
    const { ownerId, service } = setup();
    const response = await service.search({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        query: "show knowledge",
        source: "dashboard",
      },
    });

    expect(response.resolution).toBe("resolved");
    expect(response.selected?.routePath).toBe("/memory");
    expect(response.selected?.matchKind).toBe("synonym");
  });

  it("escalates low-confidence requests without guessing", async () => {
    const { audits, ownerId, service } = setup();
    const response = await service.search({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        query: "banana airplane violet",
        source: "voice",
      },
    });

    expect(response.resolution).toBe("ai_fallback_required");
    expect(response.selected).toBeNull();
    expect(response.aiEscalationReason).toMatch(/confidence/);
    expect(audits.map((audit) => audit.eventType)).toContain(
      "SEMANTIC_RETRIEVAL_ESCALATED",
    );
  });

  it("does not retrieve hidden semantic objects", async () => {
    const { ownerId, service } = setup();
    const dashboard = await service.registerObject({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        objectKey: "secret:hidden",
        displayName: "Hidden Deploy",
        aliases: ["deploy secret"],
        description: "Hidden action that should not resolve.",
        category: "command",
        visibility: "hidden",
        supportedActions: ["open"],
      },
    });
    expect(dashboard.registry.some((item) => item.objectKey === "secret:hidden")).toBe(
      true,
    );

    const response = await service.search({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        query: "hidden deploy",
        source: "voice",
      },
    });

    expect(response.resolution).toBe("ai_fallback_required");
    expect(response.candidates.some((item) => item.objectKey === "secret:hidden")).toBe(
      false,
    );
  });
});

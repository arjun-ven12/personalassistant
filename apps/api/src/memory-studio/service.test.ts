import { describe, expect, it } from "vitest";
import {
  MemoryRecordSchema,
  KnowledgeEntitySchema,
  LearnedPreferenceSchema,
} from "@alexa-control/shared";

import { InMemoryHumanUnderstandingStore } from "../human-understanding/store.js";
import { InMemoryKnowledgeGraphStore } from "../knowledge-graph/store.js";
import { InMemoryLearningEngineStore } from "../learning-engine/store.js";
import { defaultLearningScope } from "../learning-engine/service.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { CognitiveQueryService } from "./service.js";
import { InMemoryMemoryStudioStore } from "./store.js";

const ownerId = "00000000-0000-4000-8000-00000000019d";
const otherOwnerId = "00000000-0000-4000-8000-000000000199";
const at = "2026-08-07T00:00:00.000Z";

const makeService = () => {
  const memoryStore = new InMemoryMemoryStore();
  const graphStore = new InMemoryKnowledgeGraphStore();
  const learningStore = new InMemoryLearningEngineStore();
  const humanStore = new InMemoryHumanUnderstandingStore();
  const studioStore = new InMemoryMemoryStudioStore();
  const auditEvents: unknown[] = [];
  const service = new CognitiveQueryService(
    studioStore,
    memoryStore,
    graphStore,
    learningStore,
    humanStore,
    (input) => {
      auditEvents.push(input);
    },
    () => new Date(at),
  );
  return { service, memoryStore, graphStore, learningStore, humanStore, auditEvents };
};

const seedPostgresMemory = (input: ReturnType<typeof makeService>) => {
  input.memoryStore.saveMemory(
    MemoryRecordSchema.parse({
      schemaVersion: "1",
      id: "00000000-0000-4000-8000-000000000001",
      ownerId,
      repositoryId: null,
      agentId: null,
      workflowId: null,
      memoryType: "semantic",
      source: "owner",
      title: "Database architecture discussion",
      summary: "Project uses PostgreSQL and pgvector for durable cognitive storage.",
      content: "PostgreSQL remains the source of truth.",
      tags: ["database", "postgresql"],
      importance: 95,
      confidence: 0.98,
      evidence: [
        {
          sourceType: "manual",
          reference: "architecture-note",
          excerpt: "Use PostgreSQL + pgvector.",
          observedAt: at,
        },
      ],
      version: 1,
      createdAt: at,
      updatedAt: at,
      lastAccessedAt: null,
      expiresAt: null,
    }),
  );
  input.graphStore.saveEntity(
    KnowledgeEntitySchema.parse({
      id: "00000000-0000-4000-8000-000000000002",
      ownerId,
      entityType: "DATABASE",
      canonicalName: "PostgreSQL",
      normalizedName: "postgresql",
      displayName: "PostgreSQL",
      description: "Primary database.",
      status: "active",
      confidence: 0.96,
      sourceType: "manual",
      sourceId: "architecture-note",
      sourceUri: null,
      firstObservedAt: at,
      lastObservedAt: at,
      metadata: {},
      tags: ["database"],
      aliases: ["Postgres"],
      externalIdentifiers: {},
      embeddingReference: "embedding:postgresql",
      isArchived: false,
      isPinned: false,
      provenance: [
        {
          sourceType: "manual",
          sourceId: "architecture-note",
          sourceUri: null,
          sourceTimestamp: at,
          extractionMethod: "manual",
          confidence: 0.96,
          evidenceSnippet: "PostgreSQL database",
          createdBySystem: false,
          ownerConfirmed: true,
        },
      ],
      version: 1,
      createdAt: at,
      updatedAt: at,
    }),
  );
  input.learningStore.savePreference(
    LearnedPreferenceSchema.parse({
      id: "00000000-0000-4000-8000-000000000003",
      ownerId,
      category: "PREFERRED_APPLICATION",
      subject: "browser",
      value: "chrome",
      context: defaultLearningScope(),
      confidence: 0.97,
      sourceCandidateId: null,
      effectiveFrom: at,
      effectiveUntil: null,
      locked: false,
      manualOverride: false,
      status: "ACTIVE",
      createdAt: at,
      updatedAt: at,
      version: 1,
      explanation: "Chrome was selected repeatedly for browser tasks.",
    }),
  );
};

describe("CognitiveQueryService", () => {
  it("searches across memory, knowledge graph, and learning records", async () => {
    const serviceContext = makeService();
    seedPostgresMemory(serviceContext);

    const result = await serviceContext.service.search(ownerId, {
      q: "PostgreSQL",
      limit: 20,
      cursor: 0,
    });

    expect(result.items.map((item) => item.itemType)).toEqual(
      expect.arrayContaining(["MEMORY", "KNOWLEDGE_ENTITY"]),
    );
    expect(result.items.some((item) => item.title.includes("PostgreSQL"))).toBe(true);
  });

  it("explains learned preferences without exposing hidden reasoning", async () => {
    const serviceContext = makeService();
    seedPostgresMemory(serviceContext);

    const result = await serviceContext.service.search(ownerId, {
      q: "Chrome",
      limit: 10,
      cursor: 0,
    });
    const preference = result.items.find(
      (item) => item.itemType === "LEARNED_PREFERENCE",
    );
    expect(preference).toBeDefined();

    const explanation = await serviceContext.service.explain(
      ownerId,
      preference?.id ?? "",
    );
    expect(explanation.whyRemembered).toContain("learned preference");
    expect(explanation.hiddenReasoningExposed).toBe(false);
    expect(explanation.confidenceSignals.confidence).toBe(0.97);
  });

  it("archives, restores, pins, and unpins through Studio metadata", async () => {
    const serviceContext = makeService();
    seedPostgresMemory(serviceContext);
    const memory = (
      await serviceContext.service.search(ownerId, {
        q: "database architecture",
        limit: 5,
        cursor: 0,
      })
    ).items[0]!;

    const archived = await serviceContext.service.setArchived(ownerId, memory.id, true);
    expect(archived.item.archived).toBe(true);
    const pinned = await serviceContext.service.setPinned(ownerId, memory.id, true);
    expect(pinned.pinned).toBe(true);
    const unpinned = await serviceContext.service.setPinned(ownerId, memory.id, false);
    expect(unpinned.pinned).toBe(false);
    const restored = await serviceContext.service.setArchived(
      ownerId,
      memory.id,
      false,
    );
    expect(restored.item.archived).toBe(false);
  });

  it("returns a fail-closed delete impact preview", async () => {
    const serviceContext = makeService();
    seedPostgresMemory(serviceContext);
    const item = (
      await serviceContext.service.search(ownerId, {
        q: "PostgreSQL",
        limit: 5,
        cursor: 0,
      })
    ).items[0]!;

    const impact = await serviceContext.service.deleteImpact(ownerId, item.id);
    expect(impact.allowed).toBe(false);
    expect(impact.destructive).toBe(true);
    expect(impact.explanation).toContain("Permanent deletion is prohibited");
  });

  it("builds bounded context previews with LLMs disabled", async () => {
    const serviceContext = makeService();
    seedPostgresMemory(serviceContext);

    const preview = await serviceContext.service.contextPreview(ownerId, {
      input: "What do you remember about PostgreSQL?",
      confidenceThreshold: 0.4,
      graphDepth: 1,
      limit: 5,
    });

    expect(preview.llmRequired).toBe(false);
    expect(preview.included.length).toBeGreaterThan(0);
    expect(preview.included.length).toBeLessThanOrEqual(5);
  });

  it("keeps owner scopes isolated", async () => {
    const serviceContext = makeService();
    seedPostgresMemory(serviceContext);

    const otherResult = await serviceContext.service.search(otherOwnerId, {
      q: "PostgreSQL",
      limit: 20,
      cursor: 0,
    });

    expect(otherResult.items).toHaveLength(0);
  });
});

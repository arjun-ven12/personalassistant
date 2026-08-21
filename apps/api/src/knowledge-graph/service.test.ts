import { describe, expect, it } from "vitest";
import { MemoryRecordSchema } from "@alexa-control/shared";

import { InMemoryAgentStore } from "../agents/store.js";
import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { InMemoryWorkflowStore } from "../workflows/store.js";
import { PersonalKnowledgeGraphService } from "./service.js";
import { InMemoryKnowledgeGraphStore } from "./store.js";

const ownerId = "00000000-0000-4000-8000-000000000019";
const at = "2026-08-07T00:00:00.000Z";

const makeService = () => {
  const memoryStore = new InMemoryMemoryStore();
  const graphStore = new InMemoryKnowledgeGraphStore();
  const auditEvents: unknown[] = [];
  const service = new PersonalKnowledgeGraphService(
    graphStore,
    memoryStore,
    new InMemoryRepositoryStore(),
    new InMemoryAgentStore(),
    new InMemoryWorkflowStore(),
    new InMemoryApplicationAdapterStore(),
    (input) => {
      auditEvents.push(input);
    },
    () => new Date(at),
  );
  return { service, memoryStore, graphStore, auditEvents };
};

describe("PersonalKnowledgeGraphService", () => {
  it("deduplicates entities by normalized canonical name and resolves aliases", async () => {
    const { service } = makeService();
    const first = await service.upsertEntity(ownerId, {
      entityType: "PROJECT",
      canonicalName: "Quant's Trade",
      aliases: ["quant"],
      tags: ["trading"],
      sourceType: "manual",
      confidence: 0.9,
    });
    const second = await service.upsertEntity(ownerId, {
      entityType: "PROJECT",
      canonicalName: "quants trade",
      aliases: ["qt"],
      tags: ["workspace"],
      sourceType: "conversation",
      sourceId: "conversation-1",
      confidence: 0.8,
    });

    expect(second.id).toBe(first.id);
    expect(second.confidence).toBe(0.9);
    expect(second.aliases).toEqual(expect.arrayContaining(["quant", "qt"]));

    const result = await service.search(ownerId, { q: "qt", limit: 10, depth: 1 });
    expect(result.entities.map((entity) => entity.id)).toContain(first.id);
  });

  it("stores relationships and finds bounded paths", async () => {
    const { service } = makeService();
    const project = await service.upsertEntity(ownerId, {
      entityType: "PROJECT",
      canonicalName: "Quant's Trade",
      sourceType: "manual",
      confidence: 0.95,
    });
    const repository = await service.upsertEntity(ownerId, {
      entityType: "REPOSITORY",
      canonicalName: "personalassistant",
      sourceType: "repository",
      confidence: 0.95,
    });
    const app = await service.upsertEntity(ownerId, {
      entityType: "APPLICATION",
      canonicalName: "VS Code",
      sourceType: "application_adapter",
      confidence: 0.95,
    });
    await service.upsertRelationship(ownerId, {
      sourceEntityId: project.id,
      targetEntityId: repository.id,
      relationshipType: "HAS_REPOSITORY",
      sourceType: "manual",
      confidence: 0.9,
    });
    await service.upsertRelationship(ownerId, {
      sourceEntityId: repository.id,
      targetEntityId: app.id,
      relationshipType: "USES",
      sourceType: "manual",
      confidence: 0.9,
    });

    const path = await service.path(ownerId, {
      from: project.id,
      to: app.id,
      maxDepth: 3,
    });
    expect(path.paths.length).toBeGreaterThan(0);
    expect(path.paths[0]?.entities.map((entity) => entity.id)).toEqual([
      project.id,
      repository.id,
      app.id,
    ]);
  });

  it("records fact conflicts without silently merging contradictory claims", async () => {
    const { service } = makeService();
    const project = await service.upsertEntity(ownerId, {
      entityType: "PROJECT",
      canonicalName: "Quant's Trade",
      sourceType: "manual",
      confidence: 0.95,
    });

    await service.addFact({
      ownerId,
      subjectEntityId: project.id,
      predicate: "status",
      valueType: "string",
      value: "active",
      sourceType: "manual",
      confidence: 0.9,
    });
    await service.addFact({
      ownerId,
      subjectEntityId: project.id,
      predicate: "status",
      valueType: "string",
      value: "paused",
      sourceType: "conversation",
      sourceId: "conversation-2",
      confidence: 0.8,
    });

    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.conflicts).toHaveLength(1);
    expect(dashboard.conflicts[0]?.reason).toContain("Conflicting fact");
  });

  it("promotes durable memory into graph entities only when evidence thresholds pass", async () => {
    const { service, memoryStore, auditEvents } = makeService();
    memoryStore.saveMemory(
      MemoryRecordSchema.parse({
        schemaVersion: "1",
        id: "00000000-0000-4000-8000-000000000111",
        ownerId,
        repositoryId: null,
        agentId: null,
        workflowId: null,
        memoryType: "preference",
        source: "owner",
        title: "Quant project preference",
        summary: "Owner prefers VS Code for Quant project work.",
        content: "Quant project preference: Owner prefers VS Code for Quant project work.",
        tags: ["project", "preference"],
        importance: 90,
        confidence: 0.92,
        evidence: [
          {
            sourceType: "manual",
            reference: "manual-note",
            excerpt: "Owner confirmed.",
            observedAt: at,
          },
          {
            sourceType: "conversation",
            reference: "conversation-1",
            excerpt: "Repeated preference.",
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

    const promotion = await service.promoteMemory({
      ownerId,
      memoryId: "00000000-0000-4000-8000-000000000111",
      requestId: "test",
      ipAddress: "127.0.0.1",
    });

    expect(promotion.status).toBe("promoted");
    expect(promotion.entityIds.length).toBe(1);
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "KNOWLEDGE_GRAPH_UPDATED" }),
      ]),
    );
  });
});

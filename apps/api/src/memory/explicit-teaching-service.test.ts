import { describe, expect, it } from "vitest";

import { InMemoryAgentStore } from "../agents/store.js";
import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { PersonalKnowledgeGraphService } from "../knowledge-graph/service.js";
import { InMemoryKnowledgeGraphStore } from "../knowledge-graph/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { InMemoryWorkflowStore } from "../workflows/store.js";
import { MemoryIndexerService } from "./service.js";
import { InMemoryMemoryStore } from "./store.js";
import { ExplicitMemoryTeachingService } from "./explicit-teaching-service.js";

const makeService = () => {
  const audit: GovernanceAuditWriter = () => undefined;
  const memoryStore = new InMemoryMemoryStore();
  const repositoryStore = new InMemoryRepositoryStore();
  const agentStore = new InMemoryAgentStore();
  const workflowStore = new InMemoryWorkflowStore();
  const memory = new MemoryIndexerService(
    memoryStore,
    repositoryStore,
    agentStore,
    workflowStore,
    audit,
  );
  const graph = new PersonalKnowledgeGraphService(
    new InMemoryKnowledgeGraphStore(),
    memoryStore,
    repositoryStore,
    agentStore,
    workflowStore,
    new InMemoryApplicationAdapterStore(),
    audit,
  );
  return {
    memory,
    service: new ExplicitMemoryTeachingService(memory, memoryStore, graph),
  };
};

const teach = (service: ExplicitMemoryTeachingService, ownerId: string, content: string) =>
  service.teach({
    ownerId,
    requestId: crypto.randomUUID(),
    ipAddress: "127.0.0.1",
    body: { type: "FACT", content, entityRefs: [] },
  });

describe("ExplicitMemoryTeachingService", () => {
  it("stores owner-confirmed preferences through the existing searchable memory service", async () => {
    const { service, memory } = makeService();
    const ownerId = crypto.randomUUID();

    const result = await teach(service, ownerId, "I prefer concise emails.");

    expect(result.memory.source).toBe("owner");
    expect(result.memory.tags).toContain("owner_explicit");
    expect(result.memory.evidence[0]?.reference).toMatch(/^OWNER_EXPLICIT:/);
    expect((await memory.search(ownerId, { q: "concise emails", limit: 10 })).memories)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: result.memory.id })]));
  });

  it("links aliases and person-to-project relationships in the existing graph", async () => {
    const { service } = makeService();
    const ownerId = crypto.randomUUID();

    const alias = await teach(service, ownerId, "When I say Orion, I mean Project Orion.");
    const relationship = await teach(
      service,
      ownerId,
      "Sarah Tan is the designer for Project Orion.",
    );

    expect(alias.linkedEntityIds).toHaveLength(1);
    expect(relationship.linkedEntityIds).toHaveLength(2);
    expect(relationship.linkedRelationshipIds).toHaveLength(1);
  });

  it("keeps conflicting owner facts reviewable instead of overwriting them", async () => {
    const { service } = makeService();
    const ownerId = crypto.randomUUID();

    await teach(service, ownerId, "Project Orion launches in October.");
    const result = await teach(service, ownerId, "Project Orion launches in November.");

    expect(result.conflictCreated).toBe(true);
  });

  it("deduplicates equivalent owner-teaching records and rejects secret-like content", async () => {
    const { service } = makeService();
    const ownerId = crypto.randomUUID();

    await teach(service, ownerId, "My preferred IDE is VS Code.");
    const duplicate = await teach(service, ownerId, "My preferred IDE is VS Code.");

    expect(duplicate.duplicate).toBe(true);
    await expect(teach(service, ownerId, "My password is not-for-memory.")).rejects.toMatchObject({
      code: "SENSITIVE_MEMORY_CONTENT_DENIED",
    });
  });

  it("keeps explicit memory strictly owner-scoped", async () => {
    const { service } = makeService();
    const ownerA = crypto.randomUUID();
    const ownerB = crypto.randomUUID();

    await teach(service, ownerA, "Project Orion launches in October.");
    const ownerBResult = await teach(service, ownerB, "I prefer concise emails.");

    expect(ownerBResult.memory.ownerId).toBe(ownerB);
    expect(ownerBResult.memory.content).not.toContain("Project Orion");
  });
});

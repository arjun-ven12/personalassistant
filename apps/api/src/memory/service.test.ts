import { describe, expect, it } from "vitest";

import { RepositorySchema } from "@alexa-control/shared";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import { AgentRegistryService } from "../agents/service.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { MemoryIndexerService } from "./service.js";
import { InMemoryMemoryStore } from "./store.js";
import { InMemoryWorkflowStore } from "../workflows/store.js";

const setup = async () => {
  const ownerId = crypto.randomUUID();
  const audits: Array<{ eventType: string }> = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const repositoryStore = new InMemoryRepositoryStore();
  const repository = repositoryStore.upsertRepository(
    RepositorySchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId,
      workspaceId: "project",
      indexStatus: "INDEXED",
      activeGeneration: 1,
      activeFingerprint: "a".repeat(64),
      lastIndexedAt: new Date().toISOString(),
      lastFailureCode: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );
  const agentStore = new InMemoryAgentStore();
  await new AgentRegistryService(agentStore, audit).ensureBuiltIns(ownerId);
  const service = new MemoryIndexerService(
    new InMemoryMemoryStore(),
    repositoryStore,
    agentStore,
    new InMemoryWorkflowStore(),
    audit,
  );
  return { audits, ownerId, repository, service };
};

describe("MemoryIndexerService", () => {
  it("records owner-scoped memories with evidence and searchable retrieval", async () => {
    const { audits, ownerId, repository, service } = await setup();
    const created = await service.recordMemory({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        repositoryId: repository.id,
        memoryType: "preference",
        source: "owner",
        title: "Prefer small auditable changes",
        summary: "Phase work should preserve fail-closed security boundaries.",
        content: "Avoid unrelated refactors and keep evidence attached.",
        tags: ["security", "style"],
        importance: 85,
        confidence: 0.95,
        evidence: [
          {
            sourceType: "manual",
            reference: "AGENTS.md",
            excerpt: "Keep implementations small and auditable.",
            observedAt: new Date().toISOString(),
          },
        ],
      },
    });

    expect(created.memory.ownerId).toBe(ownerId);
    expect(created.memory.evidence[0]?.reference).toBe("AGENTS.md");
    const result = await service.search(ownerId, { q: "auditable", limit: 10 });
    expect(result.memories[0]?.id).toBe(created.memory.id);
    expect(audits.some((event) => event.eventType === "MEMORY_RECORDED")).toBe(true);
  });

  it("logs engineering decisions and exposes graph, timeline, and suggestions", async () => {
    const { audits, ownerId, service } = await setup();
    const response = await service.recordDecision({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      approver: "owner@example.com",
      body: {
        decision: "Suggestions remain advisory",
        reason: "Phase 8 must not take autonomous actions.",
        alternatives: ["Auto-apply suggestions", "Disable suggestions"],
      },
    });

    expect(response.decision.status).toBe("active");
    const center = await service.center(ownerId);
    expect(center.decisions[0]?.id).toBe(response.decision.id);
    expect(center.graph.nodes.some((node) => node.kind === "decision")).toBe(true);
    expect(
      center.timeline.some(
        (event) => event.eventType === "ENGINEERING_DECISION_LOGGED",
      ),
    ).toBe(true);
    expect(center.suggestions.every((suggestion) => suggestion.status === "open")).toBe(
      true,
    );
    expect(
      audits.some((event) => event.eventType === "ENGINEERING_DECISION_LOGGED"),
    ).toBe(true);
  });
});

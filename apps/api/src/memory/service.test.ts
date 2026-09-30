import { describe, expect, it } from "vitest";

import { RepositorySchema } from "@alexa-control/shared";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import { AgentRegistryService } from "../agents/service.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { MemoryIndexerService } from "./service.js";
import { InMemoryMemoryStore } from "./store.js";
import { InMemoryWorkflowStore } from "../workflows/store.js";
import { companyScope } from "../companies/scope.js";

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
  it("promotes only validated stable engineering facts and isolates company scope", async () => {
    const { audits, ownerId, repository, service } = await setup();
    const companyId = crypto.randomUUID();
    const otherCompanyId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const resultId = crypto.randomUUID();
    const promoted = await companyScope.run(
      { ownerId, companyId, role: "OWNER", requestId: "memory-promotion" },
      () =>
        service.promoteEngineeringFacts({
          ownerId,
          companyId,
          repositoryId: repository.id,
          agentId: "coding_agent",
          taskId,
          resultId,
          artifacts: [
            {
              type: "ARCHITECTURE_DECISION",
              title: "Use existing repository service",
              summary: "Repository access remains behind the registered service.",
            },
            {
              type: "BLOCKER",
              title: "Transient model error",
              summary: "Do not retain transient error spam.",
            },
          ],
          requestId: "memory-promotion",
          ipAddress: "127.0.0.1",
        }),
    );
    expect(promoted.promotedMemoryIds).toHaveLength(1);
    const sameCompany = await companyScope.run(
      { ownerId, companyId, role: "OWNER", requestId: "memory-read" },
      () =>
        service.retrieveEngineeringContext({
          ownerId,
          companyId,
          repositoryId: repository.id,
          agentId: "coding_agent",
          taskId,
        }),
    );
    expect(sameCompany.refs).toEqual(promoted.promotedMemoryIds);
    const otherCompany = await companyScope.run(
      { ownerId, companyId: otherCompanyId, role: "OWNER", requestId: "memory-deny" },
      () =>
        service.retrieveEngineeringContext({
          ownerId,
          companyId: otherCompanyId,
          repositoryId: repository.id,
          agentId: "coding_agent",
          taskId,
        }),
    );
    expect(otherCompany.refs).toEqual([]);
    expect(
      audits.some((event) => event.eventType === "ENGINEERING_MEMORY_PROMOTED"),
    ).toBe(true);
  });

  it("retrieves a relevant older project decision ahead of unrelated high-ranked memories", async () => {
    const { ownerId, repository, service } = await setup();
    const companyId = crypto.randomUUID();
    await companyScope.run(
      { ownerId, companyId, role: "OWNER", requestId: "memory-relevance" },
      async () => {
        const relevant = await service.promoteEngineeringFacts({
          ownerId,
          companyId,
          repositoryId: repository.id,
          agentId: "coding_agent",
          taskId: crypto.randomUUID(),
          resultId: crypto.randomUUID(),
          artifacts: [{
            type: "ARCHITECTURE_DECISION",
            title: "Use Zod at API boundaries",
            summary: "Validate endpoint inputs with the shared Zod schemas.",
          }],
          requestId: "memory-relevance-decision",
          ipAddress: "127.0.0.1",
        });
        const existing = (await service.store.searchMemories(ownerId, {
          q: "Zod",
          repositoryId: repository.id,
          limit: 1,
        }))[0]!;
        await service.store.saveMemory({ ...existing, importance: 1 });
        for (let batch = 0; batch < 3; batch += 1) {
          await service.promoteEngineeringFacts({
            ownerId,
            companyId,
            repositoryId: repository.id,
            agentId: "coding_agent",
            taskId: crypto.randomUUID(),
            resultId: crypto.randomUUID(),
            artifacts: Array.from({ length: 5 }, (_, index) => ({
              type: "TEST_EXPECTATIONS" as const,
              title: `Unrelated fixture ${batch}-${index}`,
              summary: "Maintain the unrelated fixture convention.",
            })),
            requestId: `memory-relevance-noise-${batch}`,
            ipAddress: "127.0.0.1",
          });
        }
        const withoutTask = await service.retrieveEngineeringContext({
          ownerId,
          companyId,
          repositoryId: repository.id,
          agentId: "coding_agent",
          taskId: crypto.randomUUID(),
        });
        expect(withoutTask.refs).not.toContain(relevant.promotedMemoryIds[0]);
        const withTask = await service.retrieveEngineeringContext({
          ownerId,
          companyId,
          repositoryId: repository.id,
          agentId: "coding_agent",
          taskId: crypto.randomUUID(),
          taskContext: "Add a new API endpoint with Zod input validation.",
        });
        expect(withTask.refs[0]).toBe(relevant.promotedMemoryIds[0]);
        expect(withTask.summaries[0]).toContain("Zod");
      },
    );
  });

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

  it("rejects credential-like content at the legacy memory write boundary", async () => {
    const { ownerId, service } = await setup();
    await expect(service.recordMemory({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        memoryType: "preference",
        source: "owner",
        title: "Credential preference",
        summary: "My password is a placeholder value.",
        content: "Do not retain this.",
        tags: [],
        importance: 50,
        confidence: 1,
        evidence: [],
      },
    })).rejects.toMatchObject({ code: "SENSITIVE_MEMORY_CONTENT_DENIED" });
    expect(await service.store.listMemories(ownerId, 10)).toEqual([]);
    await expect(service.recordDecision({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      approver: "owner",
      body: {
        decision: "Keep the existing boundary",
        reason: "A password note must not be stored.",
        alternatives: [],
        evidence: [],
      },
    })).rejects.toMatchObject({ code: "SENSITIVE_MEMORY_CONTENT_DENIED" });
  });

  it("omits a previously stored sensitive record from engineering context", async () => {
    const { ownerId, repository, service } = await setup();
    const companyId = crypto.randomUUID();
    await companyScope.run(
      { ownerId, companyId, role: "OWNER", requestId: "sensitive-context" },
      async () => {
        const promoted = await service.promoteEngineeringFacts({
          ownerId,
          companyId,
          repositoryId: repository.id,
          agentId: "coding_agent",
          taskId: crypto.randomUUID(),
          resultId: crypto.randomUUID(),
          artifacts: [{
            type: "ARCHITECTURE_DECISION",
            title: "Legacy project note",
            summary: "Keep this bounded.",
          }],
          requestId: "sensitive-context-promotion",
          ipAddress: "127.0.0.1",
        });
        const memory = (await service.store.searchMemories(ownerId, {
          q: "Legacy project note", repositoryId: repository.id, limit: 1,
        }))[0]!;
        await service.store.saveMemory({
          ...memory,
          summary: "A legacy password note must not enter an AI context.",
        });
        const context = await service.retrieveEngineeringContext({
          ownerId,
          companyId,
          repositoryId: repository.id,
          agentId: "coding_agent",
          taskId: crypto.randomUUID(),
          taskContext: "Legacy project note",
        });
        expect(context.refs).not.toContain(promoted.promotedMemoryIds[0]);
        expect(context.summaries).toEqual([]);
      },
    );
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

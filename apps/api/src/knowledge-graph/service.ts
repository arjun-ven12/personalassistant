import {
  CreateKnowledgeEntityRequestSchema,
  CreateKnowledgeRelationshipRequestSchema,
  KnowledgeConflictSchema,
  KnowledgeContextRequestSchema,
  KnowledgeContextResponseSchema,
  KnowledgeEntityAliasSchema,
  KnowledgeEntityResponseSchema,
  KnowledgeEntitySchema,
  KnowledgeEntityTypeSchema,
  KnowledgeEvidenceSchema,
  KnowledgeFactSchema,
  KnowledgeGraphDashboardResponseSchema,
  KnowledgeGraphEventSchema,
  KnowledgePathQuerySchema,
  KnowledgePathResponseSchema,
  KnowledgePromotionSchema,
  KnowledgeRelationshipSchema,
  KnowledgeRelationshipTypeSchema,
  KnowledgeSearchQuerySchema,
  KnowledgeSearchResponseSchema,
  UpdateKnowledgeEntityRequestSchema,
  type KnowledgeEntity,
  type KnowledgeRelationship,
} from "@alexa-control/shared";
import type { z } from "zod";

import type { ApplicationAdapterStore } from "../application-adapters/store.js";
import type { AgentStore } from "../agents/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { MemoryStore } from "../memory/store.js";
import type { RepositoryStore } from "../repositories/store.js";
import type { WorkflowStore } from "../workflows/store.js";
import type { KnowledgeGraphStore } from "./store.js";

export const normalizeKnowledgeName = (value: string) =>
  value
    .trim()
    .replace(/[’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/'s\b/gi, "s")
    .replace(/[^a-z0-9_.:/\-\s']/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const stableUuid = (input: string) => {
  const bytes = new TextEncoder().encode(input);
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  const hex = Math.abs(hash).toString(16).padStart(12, "0").slice(0, 12);
  return `00000000-0000-4000-8000-${hex}`;
};

export class PersonalKnowledgeGraphService {
  constructor(
    readonly store: KnowledgeGraphStore,
    readonly memoryStore: MemoryStore,
    readonly repositoryStore: RepositoryStore,
    readonly agentStore: AgentStore,
    readonly workflowStore: WorkflowStore,
    readonly applicationAdapterStore: ApplicationAdapterStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    await this.seedTrustedSources(ownerId);
    return KnowledgeGraphDashboardResponseSchema.parse({
      statistics: await this.store.statistics(ownerId),
      entityTypes: KnowledgeEntityTypeSchema.options,
      relationshipTypes: KnowledgeRelationshipTypeSchema.options,
      recentEntities: await this.store.listEntities(ownerId, 50),
      recentRelationships: await this.store.listRelationships(ownerId, 100),
      conflicts: await this.store.listConflicts(ownerId, "open"),
      events: await this.store.listEvents(ownerId, 100),
    });
  }

  async createEntity(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = CreateKnowledgeEntityRequestSchema.parse(input.body);
    const entity = await this.upsertEntity(input.ownerId, parsed);
    await this.audit({
      ownerId: input.ownerId,
      eventType: "KNOWLEDGE_GRAPH_UPDATED",
      outcome: "SUCCESS",
      reason: "Owner-scoped knowledge entity was validated and persisted.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: {
        action: "knowledge.entity.upsert",
        resourceType: "knowledge_entity",
        resourceId: entity.id,
        entityType: entity.entityType,
      },
    });
    return entity;
  }

  async updateEntity(input: {
    ownerId: string;
    entityId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const current = await this.requireEntity(input.ownerId, input.entityId);
    const body = UpdateKnowledgeEntityRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    const updated = KnowledgeEntitySchema.parse({
      ...current,
      ...body,
      aliases: body.aliases ?? current.aliases,
      description: body.description === undefined ? current.description : body.description,
      version: current.version + 1,
      updatedAt: at,
    });
    await this.store.saveEntity(updated);
    await this.recordEvent(input.ownerId, "KNOWLEDGE_ENTITY_UPDATED", updated.id, null, null, `Updated ${updated.displayName}`, "Entity metadata changed.");
    await this.audit({
      ownerId: input.ownerId,
      eventType: "KNOWLEDGE_GRAPH_UPDATED",
      outcome: "SUCCESS",
      reason: "Owner-scoped knowledge entity update was schema-validated.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: {
        action: "knowledge.entity.update",
        resourceType: "knowledge_entity",
        resourceId: updated.id,
      },
    });
    return updated;
  }

  async entity(ownerId: string, entityId: string) {
    const entity = await this.requireEntity(ownerId, entityId);
    return KnowledgeEntityResponseSchema.parse({
      entity,
      aliases: await this.store.listAliases(ownerId, entity.id),
      facts: await this.store.listFacts(ownerId, entity.id),
      relationships: await this.store.listRelationshipsForEntity(ownerId, entity.id),
      evidence: await this.store.listEvidence(ownerId, { entityId: entity.id }),
    });
  }

  async search(ownerId: string, rawQuery: unknown) {
    await this.seedTrustedSources(ownerId);
    const query = KnowledgeSearchQuerySchema.parse(rawQuery);
    const direct = await this.store.searchEntities(ownerId, {
      q: query.q,
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.tag ? { tag: query.tag } : {}),
      limit: query.limit,
    });
    const aliasEntities = await this.entitiesFromAlias(ownerId, query.q);
    const entities = uniqueEntities([...aliasEntities, ...direct]).slice(0, query.limit);
    const relationships: KnowledgeRelationship[] = [];
    const facts = [];
    for (const entity of entities.slice(0, 20)) {
      const localContext = await this.neighborhood(ownerId, entity.id, query.depth);
      relationships.push(...localContext.relationships);
      facts.push(...(await this.store.listFacts(ownerId, entity.id)));
    }
    return KnowledgeSearchResponseSchema.parse({
      query,
      entities,
      relationships: uniqueRelationships(relationships).slice(0, 500),
      facts: facts.slice(0, 200),
    });
  }

  async createRelationship(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = CreateKnowledgeRelationshipRequestSchema.parse(input.body);
    const relationship = await this.upsertRelationship(input.ownerId, parsed);
    await this.audit({
      ownerId: input.ownerId,
      eventType: "KNOWLEDGE_GRAPH_UPDATED",
      outcome: "SUCCESS",
      reason: "Owner-scoped relationship was validated and persisted.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: {
        action: "knowledge.relationship.upsert",
        resourceType: "knowledge_relationship",
        resourceId: relationship.id,
        relationshipType: relationship.relationshipType,
      },
    });
    return relationship;
  }

  async relationships(ownerId: string, entityId?: string) {
    return entityId
      ? this.store.listRelationshipsForEntity(ownerId, entityId)
      : this.store.listRelationships(ownerId, 1_000);
  }

  async context(ownerId: string, body: unknown) {
    await this.seedTrustedSources(ownerId);
    const parsed = KnowledgeContextRequestSchema.parse(body);
    const byId: KnowledgeEntity[] = [];
    for (const entityId of parsed.entityIds) {
      const entity = await this.store.findEntity(ownerId, entityId);
      if (entity) byId.push(entity);
    }
    const fromText = parsed.text ? await this.resolveEntities(ownerId, parsed.text, parsed.limit) : [];
    const resolvedEntities = uniqueEntities([...byId, ...fromText]).slice(0, parsed.limit);
    const neighborhoods = [];
    for (const entity of resolvedEntities) {
      neighborhoods.push(await this.neighborhood(ownerId, entity.id, parsed.depth));
    }
    const relatedEntities = uniqueEntities(neighborhoods.flatMap((item) => item.entities)).slice(0, 100);
    const relationships = uniqueRelationships(neighborhoods.flatMap((item) => item.relationships)).slice(0, 500);
    const relevantFacts = [];
    for (const entity of resolvedEntities) {
      relevantFacts.push(...(await this.store.listFacts(ownerId, entity.id)));
    }
    const averageConfidence = resolvedEntities.length
      ? resolvedEntities.reduce((sum, entity) => sum + entity.confidence, 0) / resolvedEntities.length
      : 0;
    return KnowledgeContextResponseSchema.parse({
      resolvedEntities,
      relatedEntities,
      relationships,
      relevantFacts: relevantFacts.slice(0, 200),
      conflicts: await this.store.listConflicts(ownerId, "open"),
      sourceConfidence: averageConfidence,
      explanation: resolvedEntities.length
        ? "Knowledge context was built from exact names, aliases, trusted structured sources, and bounded graph expansion."
        : "No deterministic graph entity resolved; Human Understanding should clarify or continue with ordinary retrieval.",
    });
  }

  async path(ownerId: string, rawQuery: unknown) {
    await this.seedTrustedSources(ownerId);
    const query = KnowledgePathQuerySchema.parse(rawQuery);
    const from = (await this.resolveEntities(ownerId, query.from, 1))[0] ?? null;
    const to = (await this.resolveEntities(ownerId, query.to, 1))[0] ?? null;
    if (!from || !to) return KnowledgePathResponseSchema.parse({ from, to, paths: [] });
    const paths = await this.findPaths(ownerId, from, to, query.maxDepth);
    return KnowledgePathResponseSchema.parse({ from, to, paths });
  }

  async promoteMemory(input: {
    ownerId: string;
    memoryId: string;
    requestId: string;
    ipAddress: string;
  }) {
    const memory = await this.memoryStore.findMemory(input.ownerId, input.memoryId);
    if (!memory) throw new Error("Memory not found.");
    const shouldPromote =
      memory.importance >= 70 ||
      ["semantic", "repository", "procedural"].includes(memory.memoryType) ||
      /decision|project|goal|uses|depends|repository|agent/i.test(`${memory.title} ${memory.summary}`);
    const at = this.now().toISOString();
    const promotion = KnowledgePromotionSchema.parse({
      id: stableUuid(`${input.ownerId}:promotion:${memory.id}`),
      ownerId: input.ownerId,
      memoryId: memory.id,
      status: shouldPromote ? "promoted" : "candidate",
      reason: shouldPromote
        ? "Memory contains durable project/decision/relationship signal."
        : "Memory retained as a candidate; evidence is not yet durable enough.",
      entityIds: [],
      relationshipIds: [],
      confidence: shouldPromote ? Math.max(0.75, memory.confidence) : 0.45,
      createdAt: at,
      updatedAt: at,
    });
    if (shouldPromote) {
      const entity = await this.upsertEntity(input.ownerId, {
        entityType: "MEMORY",
        canonicalName: memory.title,
        displayName: memory.title,
        description: memory.summary,
        aliases: [],
        tags: memory.tags,
        metadata: { memoryType: memory.memoryType },
        sourceType: "memory",
        sourceId: memory.id,
        confidence: memory.confidence,
        ownerConfirmed: false,
      });
      promotion.entityIds.push(entity.id);
    }
    await this.store.savePromotion(promotion);
    await this.recordEvent(input.ownerId, "KNOWLEDGE_MEMORY_PROMOTION", promotion.entityIds[0] ?? null, null, null, "Memory promotion evaluated", promotion.reason);
    await this.audit({
      ownerId: input.ownerId,
      eventType: "KNOWLEDGE_GRAPH_UPDATED",
      outcome: "SUCCESS",
      reason: "Memory promotion used deterministic durability criteria.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: {
        action: "knowledge.memory.promote",
        resourceType: "memory",
        resourceId: memory.id,
        status: promotion.status,
      },
    });
    return promotion;
  }

  async upsertEntity(ownerId: string, rawInput: z.input<typeof CreateKnowledgeEntityRequestSchema>) {
    const input = CreateKnowledgeEntityRequestSchema.parse(rawInput);
    const at = this.now().toISOString();
    const normalizedName = normalizeKnowledgeName(input.canonicalName);
    const existing = await this.store.findEntityByName(ownerId, input.entityType, normalizedName);
    const provenance = {
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      sourceUri: null,
      sourceTimestamp: at,
      extractionMethod: input.sourceType === "manual" ? "manual" : "structured",
      confidence: input.confidence,
      evidenceSnippet: input.description ?? input.canonicalName,
      createdBySystem: input.sourceType !== "manual",
      ownerConfirmed: input.ownerConfirmed,
    } as const;
    const entity = KnowledgeEntitySchema.parse({
      id: existing?.id ?? stableUuid(`${ownerId}:entity:${input.entityType}:${normalizedName}`),
      ownerId,
      entityType: input.entityType,
      canonicalName: input.canonicalName,
      normalizedName,
      displayName: input.displayName ?? input.canonicalName,
      description: input.description ?? existing?.description ?? null,
      status: existing?.status ?? "active",
      confidence: existing ? Math.max(existing.confidence, input.confidence) : input.confidence,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      sourceUri: null,
      firstObservedAt: existing?.firstObservedAt ?? at,
      lastObservedAt: at,
      metadata: { ...(existing?.metadata ?? {}), ...input.metadata },
      tags: [...new Set([...(existing?.tags ?? []), ...input.tags])].slice(0, 50),
      aliases: [...new Set([...(existing?.aliases ?? []), ...input.aliases])].slice(0, 100),
      externalIdentifiers: existing?.externalIdentifiers ?? {},
      embeddingReference: existing?.embeddingReference ?? null,
      isArchived: existing?.isArchived ?? false,
      isPinned: existing?.isPinned ?? false,
      provenance: [...(existing?.provenance ?? []), provenance].slice(-100),
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    });
    await this.store.saveEntity(entity);
    for (const alias of [input.canonicalName, entity.displayName, ...entity.aliases]) {
      await this.store.saveAlias(
        KnowledgeEntityAliasSchema.parse({
          id: stableUuid(`${ownerId}:alias:${entity.id}:${normalizeKnowledgeName(alias)}`),
          ownerId,
          entityId: entity.id,
          alias,
          normalizedAlias: normalizeKnowledgeName(alias),
          confidence: input.confidence,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          ownerConfirmed: input.ownerConfirmed,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
    await this.store.saveEvidence(
      KnowledgeEvidenceSchema.parse({
        id: stableUuid(`${ownerId}:evidence:entity:${entity.id}:${input.sourceType}:${input.sourceId ?? at}`),
        ownerId,
        entityId: entity.id,
        relationshipId: null,
        factId: null,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        sourceUri: null,
        evidenceSnippet: input.description ?? input.canonicalName,
        confidence: input.confidence,
        observedAt: at,
        createdAt: at,
      }),
    );
    await this.recordEvent(ownerId, existing ? "KNOWLEDGE_ENTITY_OBSERVED" : "KNOWLEDGE_ENTITY_CREATED", entity.id, null, null, entity.displayName, "Entity was resolved through deterministic upsert.");
    return entity;
  }

  async upsertRelationship(ownerId: string, rawInput: z.input<typeof CreateKnowledgeRelationshipRequestSchema>) {
    const input = CreateKnowledgeRelationshipRequestSchema.parse(rawInput);
    await this.requireEntity(ownerId, input.sourceEntityId);
    await this.requireEntity(ownerId, input.targetEntityId);
    const at = this.now().toISOString();
    const existing = await this.store.findRelationshipByTriple({
      ownerId,
      sourceEntityId: input.sourceEntityId,
      targetEntityId: input.targetEntityId,
      relationshipType: input.relationshipType,
    });
    const relationship = KnowledgeRelationshipSchema.parse({
      id: existing?.id ?? stableUuid(`${ownerId}:relationship:${input.sourceEntityId}:${input.relationshipType}:${input.targetEntityId}`),
      ownerId,
      sourceEntityId: input.sourceEntityId,
      targetEntityId: input.targetEntityId,
      relationshipType: input.relationshipType,
      direction: "forward",
      confidence: existing
        ? Math.min(1, Math.max(existing.confidence, input.confidence) + 0.02)
        : input.confidence,
      strength: existing ? Math.max(existing.strength, input.strength) : input.strength,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      evidenceCount: (existing?.evidenceCount ?? 0) + 1,
      firstObservedAt: existing?.firstObservedAt ?? at,
      lastObservedAt: at,
      validFrom: existing?.validFrom ?? null,
      validUntil: existing?.validUntil ?? null,
      metadata: existing?.metadata ?? {},
      provenance: [
        ...(existing?.provenance ?? []),
        {
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          sourceUri: null,
          sourceTimestamp: at,
          extractionMethod: input.sourceType === "manual" ? "manual" : "structured",
          confidence: input.confidence,
          evidenceSnippet: input.evidenceSnippet ?? null,
          createdBySystem: input.sourceType !== "manual",
          ownerConfirmed: input.sourceType === "manual",
        },
      ].slice(-100),
      isArchived: existing?.isArchived ?? false,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    });
    await this.store.saveRelationship(relationship);
    await this.store.saveEvidence(
      KnowledgeEvidenceSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        entityId: null,
        relationshipId: relationship.id,
        factId: null,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        sourceUri: null,
        evidenceSnippet: input.evidenceSnippet ?? `${input.relationshipType}`,
        confidence: input.confidence,
        observedAt: at,
        createdAt: at,
      }),
    );
    await this.recordEvent(ownerId, existing ? "KNOWLEDGE_RELATIONSHIP_OBSERVED" : "KNOWLEDGE_RELATIONSHIP_CREATED", null, relationship.id, null, relationship.relationshipType, "Relationship was resolved through deterministic upsert.");
    return relationship;
  }

  async addFact(input: {
    ownerId: string;
    subjectEntityId: string;
    predicate: string;
    valueType: "string" | "number" | "boolean" | "date" | "json" | "entity";
    value: unknown;
    sourceType: "manual" | "memory" | "repository" | "system" | "conversation";
    sourceId?: string;
    confidence?: number;
  }) {
    await this.requireEntity(input.ownerId, input.subjectEntityId);
    const at = this.now().toISOString();
    const activeFacts = (await this.store.listFacts(input.ownerId, input.subjectEntityId))
      .filter((fact) => fact.predicate === input.predicate && !fact.validUntil && !fact.isArchived);
    const conflicting = activeFacts.find((fact) => JSON.stringify(fact.value) !== JSON.stringify(input.value));
    if (conflicting) {
      await this.store.saveConflict(
        KnowledgeConflictSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          entityId: input.subjectEntityId,
          factAId: conflicting.id,
          factBId: null,
          relationshipAId: null,
          relationshipBId: null,
          reason: `Conflicting fact for ${input.predicate}; existing value differs from new evidence.`,
          status: "open",
          resolution: null,
          createdAt: at,
          resolvedAt: null,
        }),
      );
    }
    const fact = KnowledgeFactSchema.parse({
      id: stableUuid(`${input.ownerId}:fact:${input.subjectEntityId}:${input.predicate}:${JSON.stringify(input.value)}`),
      ownerId: input.ownerId,
      subjectEntityId: input.subjectEntityId,
      predicate: input.predicate,
      valueType: input.valueType,
      value: input.value,
      confidence: input.confidence ?? 0.8,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      validFrom: null,
      validUntil: null,
      firstObservedAt: at,
      lastObservedAt: at,
      ownerConfirmed: input.sourceType === "manual",
      provenance: [],
      isArchived: false,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveFact(fact);
    return fact;
  }

  private async resolveEntities(ownerId: string, text: string, limit: number) {
    const normalized = normalizeKnowledgeName(text);
    const directById = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
      ? await this.store.findEntity(ownerId, text)
      : null;
    const exact = await this.store.searchEntities(ownerId, { q: normalized, limit });
    const aliases = await this.entitiesFromAlias(ownerId, normalized);
    return uniqueEntities([...(directById ? [directById] : []), ...aliases, ...exact]).slice(0, limit);
  }

  private async entitiesFromAlias(ownerId: string, q: string) {
    const normalized = normalizeKnowledgeName(q);
    const aliases = await this.store.findAlias(ownerId, normalized);
    const entities: KnowledgeEntity[] = [];
    for (const alias of aliases) {
      const entity = await this.store.findEntity(ownerId, alias.entityId);
      if (entity) entities.push(entity);
    }
    return entities;
  }

  private async neighborhood(ownerId: string, rootEntityId: string, depth: number) {
    const seen = new Set([rootEntityId]);
    const entities: KnowledgeEntity[] = [];
    const relationships: KnowledgeRelationship[] = [];
    let frontier = [rootEntityId];
    for (let level = 0; level < depth; level += 1) {
      const next: string[] = [];
      for (const entityId of frontier) {
        const local = await this.store.listRelationshipsForEntity(ownerId, entityId);
        relationships.push(...local);
        for (const relationship of local) {
          const other =
            relationship.sourceEntityId === entityId
              ? relationship.targetEntityId
              : relationship.sourceEntityId;
          if (seen.has(other)) continue;
          seen.add(other);
          next.push(other);
          const entity = await this.store.findEntity(ownerId, other);
          if (entity) entities.push(entity);
        }
      }
      frontier = next.slice(0, 50);
    }
    return { entities: uniqueEntities(entities), relationships: uniqueRelationships(relationships) };
  }

  private async findPaths(ownerId: string, from: KnowledgeEntity, to: KnowledgeEntity, maxDepth: number) {
    const queue: Array<{ entity: KnowledgeEntity; entities: KnowledgeEntity[]; relationships: KnowledgeRelationship[] }> = [
      { entity: from, entities: [from], relationships: [] },
    ];
    const paths: Array<{ entities: KnowledgeEntity[]; relationships: KnowledgeRelationship[]; confidence: number }> = [];
    while (queue.length && paths.length < 25) {
      const current = queue.shift()!;
      if (current.relationships.length >= maxDepth) continue;
      const relationships = await this.store.listRelationshipsForEntity(ownerId, current.entity.id);
      for (const relationship of relationships) {
        const nextId =
          relationship.sourceEntityId === current.entity.id
            ? relationship.targetEntityId
            : relationship.sourceEntityId;
        if (current.entities.some((entity) => entity.id === nextId)) continue;
        const next = await this.store.findEntity(ownerId, nextId);
        if (!next) continue;
        const candidate = {
          entity: next,
          entities: [...current.entities, next],
          relationships: [...current.relationships, relationship],
        };
        if (next.id === to.id) {
          paths.push({
            entities: candidate.entities,
            relationships: candidate.relationships,
            confidence:
              candidate.relationships.reduce((sum, item) => sum + item.confidence, 0) /
              candidate.relationships.length,
          });
        } else {
          queue.push(candidate);
        }
      }
    }
    return paths;
  }

  private async seedTrustedSources(ownerId: string) {
    const [repositories, agents, workflows, applications] = await Promise.all([
      this.repositoryStore.listRepositories(ownerId),
      this.agentStore.listAgents(ownerId),
      this.workflowStore.list(ownerId, 100),
      this.applicationAdapterStore.listTrustedApplications(ownerId, 100),
    ]);
    for (const repository of repositories.slice(0, 100)) {
      await this.upsertEntity(ownerId, {
        entityType: "REPOSITORY",
        canonicalName: repository.workspaceId,
        displayName: repository.workspaceId,
        description: `Registered repository workspace ${repository.workspaceId}.`,
        aliases: [repository.id],
        tags: ["repository", repository.indexStatus.toLowerCase()],
        metadata: { repositoryId: repository.id, workspaceId: repository.workspaceId },
        sourceType: "repository",
        sourceId: repository.id,
        confidence: 0.99,
        ownerConfirmed: false,
      });
    }
    for (const agent of agents.slice(0, 100)) {
      await this.upsertEntity(ownerId, {
        entityType: "AGENT",
        canonicalName: agent.id,
        displayName: agent.displayName,
        description: agent.healthSummary,
        aliases: [agent.role],
        tags: ["agent", agent.status],
        metadata: { role: agent.role, capabilities: agent.capabilities },
        sourceType: "agent",
        sourceId: agent.id,
        confidence: 0.99,
        ownerConfirmed: false,
      });
    }
    for (const workflow of workflows.slice(0, 100)) {
      await this.upsertEntity(ownerId, {
        entityType: "WORKFLOW",
        canonicalName: workflow.goal,
        displayName: workflow.goal,
        description: workflow.planSummary,
        aliases: [workflow.id],
        tags: ["workflow", workflow.status.toLowerCase()],
        metadata: { workflowId: workflow.id },
        sourceType: "workflow",
        sourceId: workflow.id,
        confidence: 0.95,
        ownerConfirmed: false,
      });
    }
    for (const application of applications.slice(0, 100)) {
      await this.upsertEntity(ownerId, {
        entityType: "APPLICATION",
        canonicalName: application.applicationName,
        displayName: application.applicationName,
        description: `Trusted application ${application.bundleIdentifier}.`,
        aliases: [application.id, application.stableIdentifier, application.bundleIdentifier],
        tags: ["application", application.status],
        metadata: { applicationId: application.id, bundleIdentifier: application.bundleIdentifier },
        sourceType: "application_adapter",
        sourceId: application.id,
        confidence: 0.99,
        ownerConfirmed: false,
      });
    }
  }

  private async requireEntity(ownerId: string, entityId: string) {
    const entity = await this.store.findEntity(ownerId, entityId);
    if (!entity) throw new Error("Knowledge entity not found.");
    return entity;
  }

  private async recordEvent(
    ownerId: string,
    eventType: string,
    entityId: string | null,
    relationshipId: string | null,
    factId: string | null,
    title: string,
    summary: string,
  ) {
    const at = this.now().toISOString();
    await this.store.saveEvent(
      KnowledgeGraphEventSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        eventType,
        entityId,
        relationshipId,
        factId,
        title,
        summary,
        createdAt: at,
      }),
    );
  }
}

const uniqueEntities = (entities: KnowledgeEntity[]) =>
  [...new Map(entities.map((entity) => [entity.id, entity])).values()];

const uniqueRelationships = (relationships: KnowledgeRelationship[]) =>
  [...new Map(relationships.map((relationship) => [relationship.id, relationship])).values()];

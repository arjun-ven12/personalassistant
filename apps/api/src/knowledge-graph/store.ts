import {
  KnowledgeConflictSchema,
  KnowledgeEntityAliasSchema,
  KnowledgeEntitySchema,
  KnowledgeEvidenceSchema,
  KnowledgeFactSchema,
  KnowledgeGraphEventSchema,
  KnowledgePromotionSchema,
  KnowledgeRelationshipSchema,
  type KnowledgeConflict,
  type KnowledgeEntity,
  type KnowledgeEntityAlias,
  type KnowledgeEvidence,
  type KnowledgeFact,
  type KnowledgeGraphEvent,
  type KnowledgePromotion,
  type KnowledgeRelationship,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface KnowledgeGraphStore {
  saveEntity(entity: KnowledgeEntity): Awaitable<void>;
  findEntity(ownerId: string, entityId: string): Awaitable<KnowledgeEntity | undefined>;
  findEntityByName(
    ownerId: string,
    entityType: string | null,
    normalizedName: string,
  ): Awaitable<KnowledgeEntity | undefined>;
  listEntities(ownerId: string, limit: number): Awaitable<KnowledgeEntity[]>;
  searchEntities(ownerId: string, query: {
    q?: string;
    entityType?: string;
    tag?: string;
    limit: number;
  }): Awaitable<KnowledgeEntity[]>;
  saveAlias(alias: KnowledgeEntityAlias): Awaitable<void>;
  listAliases(ownerId: string, entityId?: string): Awaitable<KnowledgeEntityAlias[]>;
  findAlias(ownerId: string, normalizedAlias: string): Awaitable<KnowledgeEntityAlias[]>;
  saveRelationship(relationship: KnowledgeRelationship): Awaitable<void>;
  findRelationship(ownerId: string, relationshipId: string): Awaitable<KnowledgeRelationship | undefined>;
  findRelationshipByTriple(input: {
    ownerId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: string;
  }): Awaitable<KnowledgeRelationship | undefined>;
  listRelationships(ownerId: string, limit: number): Awaitable<KnowledgeRelationship[]>;
  listRelationshipsForEntity(ownerId: string, entityId: string): Awaitable<KnowledgeRelationship[]>;
  saveFact(fact: KnowledgeFact): Awaitable<void>;
  listFacts(ownerId: string, entityId?: string): Awaitable<KnowledgeFact[]>;
  saveEvidence(evidence: KnowledgeEvidence): Awaitable<void>;
  listEvidence(ownerId: string, target: {
    entityId?: string;
    relationshipId?: string;
    factId?: string;
  }): Awaitable<KnowledgeEvidence[]>;
  saveConflict(conflict: KnowledgeConflict): Awaitable<void>;
  listConflicts(ownerId: string, status?: "open" | "resolved" | "dismissed"): Awaitable<KnowledgeConflict[]>;
  savePromotion(promotion: KnowledgePromotion): Awaitable<void>;
  listPromotions(ownerId: string, limit: number): Awaitable<KnowledgePromotion[]>;
  saveEvent(event: KnowledgeGraphEvent): Awaitable<void>;
  listEvents(ownerId: string, limit: number): Awaitable<KnowledgeGraphEvent[]>;
  statistics(ownerId: string): Awaitable<{
    entityCount: number;
    relationshipCount: number;
    factCount: number;
    evidenceCount: number;
    conflictCount: number;
    sourceCount: number;
    embeddingCount: number;
  }>;
}

const clone = <T>(value: T): T => structuredClone(value);

const byUpdated = <T extends { updatedAt?: string; createdAt: string }>(items: T[], limit: number) =>
  items
    .sort((left, right) =>
      (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt),
    )
    .slice(0, limit)
    .map(clone);

export class InMemoryKnowledgeGraphStore implements KnowledgeGraphStore {
  readonly #entities = new Map<string, KnowledgeEntity>();
  readonly #aliases = new Map<string, KnowledgeEntityAlias>();
  readonly #relationships = new Map<string, KnowledgeRelationship>();
  readonly #facts = new Map<string, KnowledgeFact>();
  readonly #evidence = new Map<string, KnowledgeEvidence>();
  readonly #conflicts = new Map<string, KnowledgeConflict>();
  readonly #promotions = new Map<string, KnowledgePromotion>();
  readonly #events = new Map<string, KnowledgeGraphEvent>();

  saveEntity(entity: KnowledgeEntity) {
    const parsed = KnowledgeEntitySchema.parse(entity);
    this.#entities.set(parsed.id, clone(parsed));
  }

  findEntity(ownerId: string, entityId: string) {
    const entity = this.#entities.get(entityId);
    return entity?.ownerId === ownerId ? clone(entity) : undefined;
  }

  findEntityByName(ownerId: string, entityType: string | null, normalizedName: string) {
    const entity = [...this.#entities.values()].find(
      (item) =>
        item.ownerId === ownerId &&
        !item.isArchived &&
        item.normalizedName === normalizedName &&
        (!entityType || item.entityType === entityType),
    );
    return entity ? clone(entity) : undefined;
  }

  listEntities(ownerId: string, limit: number) {
    return byUpdated(
      [...this.#entities.values()].filter((entity) => entity.ownerId === ownerId),
      limit,
    );
  }

  searchEntities(ownerId: string, query: {
    q?: string;
    entityType?: string;
    tag?: string;
    limit: number;
  }) {
    const needle = (query.q ?? "").toLowerCase();
    return byUpdated(
      [...this.#entities.values()]
        .filter((entity) => entity.ownerId === ownerId && !entity.isArchived)
        .filter((entity) => !query.entityType || entity.entityType === query.entityType)
        .filter((entity) => !query.tag || entity.tags.includes(query.tag))
        .filter(
          (entity) =>
            !needle ||
            entity.normalizedName.includes(needle) ||
            entity.displayName.toLowerCase().includes(needle) ||
            entity.aliases.some((alias) => alias.toLowerCase().includes(needle)) ||
            entity.tags.some((tag) => tag.toLowerCase().includes(needle)),
        ),
      query.limit,
    );
  }

  saveAlias(alias: KnowledgeEntityAlias) {
    const parsed = KnowledgeEntityAliasSchema.parse(alias);
    this.#aliases.set(parsed.id, clone(parsed));
  }

  listAliases(ownerId: string, entityId?: string) {
    return byUpdated(
      [...this.#aliases.values()].filter(
        (alias) => alias.ownerId === ownerId && (!entityId || alias.entityId === entityId),
      ),
      500,
    );
  }

  findAlias(ownerId: string, normalizedAlias: string) {
    return byUpdated(
      [...this.#aliases.values()].filter(
        (alias) => alias.ownerId === ownerId && alias.normalizedAlias === normalizedAlias,
      ),
      25,
    );
  }

  saveRelationship(relationship: KnowledgeRelationship) {
    const parsed = KnowledgeRelationshipSchema.parse(relationship);
    this.#relationships.set(parsed.id, clone(parsed));
  }

  findRelationship(ownerId: string, relationshipId: string) {
    const relationship = this.#relationships.get(relationshipId);
    return relationship?.ownerId === ownerId ? clone(relationship) : undefined;
  }

  findRelationshipByTriple(input: {
    ownerId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: string;
  }) {
    const relationship = [...this.#relationships.values()].find(
      (item) =>
        item.ownerId === input.ownerId &&
        item.sourceEntityId === input.sourceEntityId &&
        item.targetEntityId === input.targetEntityId &&
        item.relationshipType === input.relationshipType,
    );
    return relationship ? clone(relationship) : undefined;
  }

  listRelationships(ownerId: string, limit: number) {
    return byUpdated(
      [...this.#relationships.values()].filter((relationship) => relationship.ownerId === ownerId),
      limit,
    );
  }

  listRelationshipsForEntity(ownerId: string, entityId: string) {
    return byUpdated(
      [...this.#relationships.values()].filter(
        (relationship) =>
          relationship.ownerId === ownerId &&
          !relationship.isArchived &&
          (relationship.sourceEntityId === entityId || relationship.targetEntityId === entityId),
      ),
      1_000,
    );
  }

  saveFact(fact: KnowledgeFact) {
    const parsed = KnowledgeFactSchema.parse(fact);
    this.#facts.set(parsed.id, clone(parsed));
  }

  listFacts(ownerId: string, entityId?: string) {
    return byUpdated(
      [...this.#facts.values()].filter(
        (fact) => fact.ownerId === ownerId && (!entityId || fact.subjectEntityId === entityId),
      ),
      1_000,
    );
  }

  saveEvidence(evidence: KnowledgeEvidence) {
    const parsed = KnowledgeEvidenceSchema.parse(evidence);
    this.#evidence.set(parsed.id, clone(parsed));
  }

  listEvidence(ownerId: string, target: {
    entityId?: string;
    relationshipId?: string;
    factId?: string;
  }) {
    return [...this.#evidence.values()]
      .filter((evidence) => evidence.ownerId === ownerId)
      .filter((evidence) => !target.entityId || evidence.entityId === target.entityId)
      .filter((evidence) => !target.relationshipId || evidence.relationshipId === target.relationshipId)
      .filter((evidence) => !target.factId || evidence.factId === target.factId)
      .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
      .slice(0, 500)
      .map(clone);
  }

  saveConflict(conflict: KnowledgeConflict) {
    const parsed = KnowledgeConflictSchema.parse(conflict);
    this.#conflicts.set(parsed.id, clone(parsed));
  }

  listConflicts(ownerId: string, status?: "open" | "resolved" | "dismissed") {
    return [...this.#conflicts.values()]
      .filter((conflict) => conflict.ownerId === ownerId && (!status || conflict.status === status))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 500)
      .map(clone);
  }

  savePromotion(promotion: KnowledgePromotion) {
    const parsed = KnowledgePromotionSchema.parse(promotion);
    this.#promotions.set(parsed.id, clone(parsed));
  }

  listPromotions(ownerId: string, limit: number) {
    return byUpdated(
      [...this.#promotions.values()].filter((promotion) => promotion.ownerId === ownerId),
      limit,
    );
  }

  saveEvent(event: KnowledgeGraphEvent) {
    const parsed = KnowledgeGraphEventSchema.parse(event);
    this.#events.set(parsed.id, clone(parsed));
  }

  listEvents(ownerId: string, limit: number) {
    return [...this.#events.values()]
      .filter((event) => event.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map(clone);
  }

  statistics(ownerId: string) {
    const sourceKeys = new Set(
      [...this.#entities.values()]
        .filter((entity) => entity.ownerId === ownerId)
        .map((entity) => `${entity.sourceType}:${entity.sourceId ?? ""}`),
    );
    return {
      entityCount: [...this.#entities.values()].filter((item) => item.ownerId === ownerId).length,
      relationshipCount: [...this.#relationships.values()].filter((item) => item.ownerId === ownerId).length,
      factCount: [...this.#facts.values()].filter((item) => item.ownerId === ownerId).length,
      evidenceCount: [...this.#evidence.values()].filter((item) => item.ownerId === ownerId).length,
      conflictCount: [...this.#conflicts.values()].filter((item) => item.ownerId === ownerId && item.status === "open").length,
      sourceCount: sourceKeys.size,
      embeddingCount: [...this.#entities.values()].filter((item) => item.ownerId === ownerId && item.embeddingReference).length,
    };
  }
}

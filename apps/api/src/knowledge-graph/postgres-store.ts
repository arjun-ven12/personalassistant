import type { Pool } from "pg";

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

import type { KnowledgeGraphStore } from "./store.js";

const rows = <T>(result: { rows: Array<{ data: unknown }> }, schema: { parse(value: unknown): T }) =>
  result.rows.map((row) => schema.parse(row.data));

export class PostgresKnowledgeGraphStore implements KnowledgeGraphStore {
  constructor(readonly pool: Pool) {}

  async saveEntity(entity: KnowledgeEntity) {
    const parsed = KnowledgeEntitySchema.parse(entity);
    await this.pool.query(
      `INSERT INTO knowledge_entities(
        id,owner_id,entity_type,canonical_name,normalized_name,source_type,source_id,
        confidence,status,first_observed_at,last_observed_at,is_archived,is_pinned,
        created_at,updated_at,data
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT(owner_id,entity_type,normalized_name) DO UPDATE SET
        canonical_name=EXCLUDED.canonical_name,
        source_type=EXCLUDED.source_type,
        source_id=EXCLUDED.source_id,
        confidence=GREATEST(knowledge_entities.confidence, EXCLUDED.confidence),
        status=EXCLUDED.status,
        last_observed_at=GREATEST(knowledge_entities.last_observed_at, EXCLUDED.last_observed_at),
        is_archived=EXCLUDED.is_archived,
        is_pinned=EXCLUDED.is_pinned,
        updated_at=EXCLUDED.updated_at,
        data=EXCLUDED.data`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.entityType,
        parsed.canonicalName,
        parsed.normalizedName,
        parsed.sourceType,
        parsed.sourceId,
        parsed.confidence,
        parsed.status,
        parsed.firstObservedAt,
        parsed.lastObservedAt,
        parsed.isArchived,
        parsed.isPinned,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async findEntity(ownerId: string, entityId: string) {
    const result = await this.pool.query<{ data: unknown }>(
      "SELECT data FROM knowledge_entities WHERE owner_id=$1 AND id=$2",
      [ownerId, entityId],
    );
    return result.rows[0] ? KnowledgeEntitySchema.parse(result.rows[0].data) : undefined;
  }

  async findEntityByName(ownerId: string, entityType: string | null, normalizedName: string) {
    const result = await this.pool.query<{ data: unknown }>(
      `SELECT data FROM knowledge_entities
       WHERE owner_id=$1 AND normalized_name=$2 AND ($3::text IS NULL OR entity_type=$3)
       ORDER BY confidence DESC LIMIT 1`,
      [ownerId, normalizedName, entityType],
    );
    return result.rows[0] ? KnowledgeEntitySchema.parse(result.rows[0].data) : undefined;
  }

  async listEntities(ownerId: string, limit: number) {
    return rows(
      await this.pool.query(
        "SELECT data FROM knowledge_entities WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT $2",
        [ownerId, limit],
      ),
      KnowledgeEntitySchema,
    );
  }

  async searchEntities(ownerId: string, query: {
    q?: string;
    entityType?: string;
    tag?: string;
    limit: number;
  }) {
    const needle = `%${(query.q ?? "").toLowerCase()}%`;
    return rows(
      await this.pool.query(
        `SELECT data FROM knowledge_entities
         WHERE owner_id=$1
           AND is_archived=false
           AND ($2::text IS NULL OR entity_type=$2)
           AND ($3::text IS NULL OR data->'tags' ? $3)
           AND (
             $4::text = '%%'
             OR normalized_name LIKE $4
             OR lower(canonical_name) LIKE $4
             OR lower(data->>'displayName') LIKE $4
             OR lower(data::text) LIKE $4
           )
         ORDER BY confidence DESC, updated_at DESC
         LIMIT $5`,
        [ownerId, query.entityType ?? null, query.tag ?? null, needle, query.limit],
      ),
      KnowledgeEntitySchema,
    );
  }

  async saveAlias(alias: KnowledgeEntityAlias) {
    const parsed = KnowledgeEntityAliasSchema.parse(alias);
    await this.pool.query(
      `INSERT INTO knowledge_entity_aliases(
        id,owner_id,entity_id,normalized_alias,confidence,source_type,source_id,
        created_at,updated_at,data
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT(owner_id,normalized_alias,entity_id) DO UPDATE SET
        confidence=GREATEST(knowledge_entity_aliases.confidence, EXCLUDED.confidence),
        updated_at=EXCLUDED.updated_at,
        data=EXCLUDED.data`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.entityId,
        parsed.normalizedAlias,
        parsed.confidence,
        parsed.sourceType,
        parsed.sourceId,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async listAliases(ownerId: string, entityId?: string) {
    return rows(
      await this.pool.query(
        `SELECT data FROM knowledge_entity_aliases
         WHERE owner_id=$1 AND ($2::uuid IS NULL OR entity_id=$2)
         ORDER BY confidence DESC, updated_at DESC LIMIT 500`,
        [ownerId, entityId ?? null],
      ),
      KnowledgeEntityAliasSchema,
    );
  }

  async findAlias(ownerId: string, normalizedAlias: string) {
    return rows(
      await this.pool.query(
        `SELECT data FROM knowledge_entity_aliases
         WHERE owner_id=$1 AND normalized_alias=$2
         ORDER BY confidence DESC LIMIT 25`,
        [ownerId, normalizedAlias],
      ),
      KnowledgeEntityAliasSchema,
    );
  }

  async saveRelationship(relationship: KnowledgeRelationship) {
    const parsed = KnowledgeRelationshipSchema.parse(relationship);
    await this.pool.query(
      `INSERT INTO knowledge_relationships(
        id,owner_id,source_entity_id,target_entity_id,relationship_type,source_type,source_id,
        confidence,strength,evidence_count,first_observed_at,last_observed_at,valid_from,
        valid_until,is_archived,created_at,updated_at,data
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT(owner_id,source_entity_id,target_entity_id,relationship_type) DO UPDATE SET
        confidence=GREATEST(knowledge_relationships.confidence, EXCLUDED.confidence),
        strength=GREATEST(knowledge_relationships.strength, EXCLUDED.strength),
        evidence_count=knowledge_relationships.evidence_count + 1,
        last_observed_at=GREATEST(knowledge_relationships.last_observed_at, EXCLUDED.last_observed_at),
        is_archived=EXCLUDED.is_archived,
        updated_at=EXCLUDED.updated_at,
        data=EXCLUDED.data`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.sourceEntityId,
        parsed.targetEntityId,
        parsed.relationshipType,
        parsed.sourceType,
        parsed.sourceId,
        parsed.confidence,
        parsed.strength,
        parsed.evidenceCount,
        parsed.firstObservedAt,
        parsed.lastObservedAt,
        parsed.validFrom,
        parsed.validUntil,
        parsed.isArchived,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async findRelationship(ownerId: string, relationshipId: string) {
    const result = await this.pool.query<{ data: unknown }>(
      "SELECT data FROM knowledge_relationships WHERE owner_id=$1 AND id=$2",
      [ownerId, relationshipId],
    );
    return result.rows[0]
      ? KnowledgeRelationshipSchema.parse(result.rows[0].data)
      : undefined;
  }

  async findRelationshipByTriple(input: {
    ownerId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: string;
  }) {
    const result = await this.pool.query<{ data: unknown }>(
      `SELECT data FROM knowledge_relationships
       WHERE owner_id=$1 AND source_entity_id=$2 AND target_entity_id=$3 AND relationship_type=$4`,
      [input.ownerId, input.sourceEntityId, input.targetEntityId, input.relationshipType],
    );
    return result.rows[0]
      ? KnowledgeRelationshipSchema.parse(result.rows[0].data)
      : undefined;
  }

  async listRelationships(ownerId: string, limit: number) {
    return rows(
      await this.pool.query(
        "SELECT data FROM knowledge_relationships WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT $2",
        [ownerId, limit],
      ),
      KnowledgeRelationshipSchema,
    );
  }

  async listRelationshipsForEntity(ownerId: string, entityId: string) {
    return rows(
      await this.pool.query(
        `SELECT data FROM knowledge_relationships
         WHERE owner_id=$1 AND is_archived=false
           AND (source_entity_id=$2 OR target_entity_id=$2)
         ORDER BY confidence DESC, updated_at DESC LIMIT 1000`,
        [ownerId, entityId],
      ),
      KnowledgeRelationshipSchema,
    );
  }

  async saveFact(fact: KnowledgeFact) {
    const parsed = KnowledgeFactSchema.parse(fact);
    await this.pool.query(
      `INSERT INTO knowledge_facts(
        id,owner_id,subject_entity_id,predicate,value_type,source_type,source_id,
        confidence,valid_from,valid_until,first_observed_at,last_observed_at,
        is_archived,created_at,updated_at,data
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT(id) DO UPDATE SET
        confidence=EXCLUDED.confidence,
        valid_until=EXCLUDED.valid_until,
        is_archived=EXCLUDED.is_archived,
        updated_at=EXCLUDED.updated_at,
        data=EXCLUDED.data`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.subjectEntityId,
        parsed.predicate,
        parsed.valueType,
        parsed.sourceType,
        parsed.sourceId,
        parsed.confidence,
        parsed.validFrom,
        parsed.validUntil,
        parsed.firstObservedAt,
        parsed.lastObservedAt,
        parsed.isArchived,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async listFacts(ownerId: string, entityId?: string) {
    return rows(
      await this.pool.query(
        `SELECT data FROM knowledge_facts
         WHERE owner_id=$1 AND ($2::uuid IS NULL OR subject_entity_id=$2)
         ORDER BY updated_at DESC LIMIT 1000`,
        [ownerId, entityId ?? null],
      ),
      KnowledgeFactSchema,
    );
  }

  async saveEvidence(evidence: KnowledgeEvidence) {
    const parsed = KnowledgeEvidenceSchema.parse(evidence);
    await this.pool.query(
      `INSERT INTO knowledge_evidence(
        id,owner_id,entity_id,relationship_id,fact_id,source_type,source_id,
        confidence,observed_at,created_at,data
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.entityId,
        parsed.relationshipId,
        parsed.factId,
        parsed.sourceType,
        parsed.sourceId,
        parsed.confidence,
        parsed.observedAt,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  async listEvidence(ownerId: string, target: {
    entityId?: string;
    relationshipId?: string;
    factId?: string;
  }) {
    return rows(
      await this.pool.query(
        `SELECT data FROM knowledge_evidence
         WHERE owner_id=$1
           AND ($2::uuid IS NULL OR entity_id=$2)
           AND ($3::uuid IS NULL OR relationship_id=$3)
           AND ($4::uuid IS NULL OR fact_id=$4)
         ORDER BY observed_at DESC LIMIT 500`,
        [ownerId, target.entityId ?? null, target.relationshipId ?? null, target.factId ?? null],
      ),
      KnowledgeEvidenceSchema,
    );
  }

  async saveConflict(conflict: KnowledgeConflict) {
    const parsed = KnowledgeConflictSchema.parse(conflict);
    await this.pool.query(
      `INSERT INTO knowledge_conflicts(id,owner_id,entity_id,status,created_at,resolved_at,data)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,resolved_at=EXCLUDED.resolved_at,data=EXCLUDED.data`,
      [parsed.id, parsed.ownerId, parsed.entityId, parsed.status, parsed.createdAt, parsed.resolvedAt, parsed],
    );
  }

  async listConflicts(ownerId: string, status?: "open" | "resolved" | "dismissed") {
    return rows(
      await this.pool.query(
        `SELECT data FROM knowledge_conflicts
         WHERE owner_id=$1 AND ($2::text IS NULL OR status=$2)
         ORDER BY created_at DESC LIMIT 500`,
        [ownerId, status ?? null],
      ),
      KnowledgeConflictSchema,
    );
  }

  async savePromotion(promotion: KnowledgePromotion) {
    const parsed = KnowledgePromotionSchema.parse(promotion);
    await this.pool.query(
      `INSERT INTO knowledge_promotions(id,owner_id,memory_id,status,confidence,created_at,updated_at,data)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(owner_id,memory_id) DO UPDATE SET
        status=EXCLUDED.status, confidence=EXCLUDED.confidence, updated_at=EXCLUDED.updated_at, data=EXCLUDED.data`,
      [parsed.id, parsed.ownerId, parsed.memoryId, parsed.status, parsed.confidence, parsed.createdAt, parsed.updatedAt, parsed],
    );
  }

  async listPromotions(ownerId: string, limit: number) {
    return rows(
      await this.pool.query(
        "SELECT data FROM knowledge_promotions WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT $2",
        [ownerId, limit],
      ),
      KnowledgePromotionSchema,
    );
  }

  async saveEvent(event: KnowledgeGraphEvent) {
    const parsed = KnowledgeGraphEventSchema.parse(event);
    await this.pool.query(
      `INSERT INTO knowledge_graph_events(id,owner_id,event_type,entity_id,relationship_id,fact_id,created_at,data)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.eventType,
        parsed.entityId,
        parsed.relationshipId,
        parsed.factId,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  async listEvents(ownerId: string, limit: number) {
    return rows(
      await this.pool.query(
        "SELECT data FROM knowledge_graph_events WHERE owner_id=$1 ORDER BY created_at DESC LIMIT $2",
        [ownerId, limit],
      ),
      KnowledgeGraphEventSchema,
    );
  }

  async statistics(ownerId: string) {
    const result = await this.pool.query(
      `SELECT
        (SELECT count(*)::int FROM knowledge_entities WHERE owner_id=$1) entity_count,
        (SELECT count(*)::int FROM knowledge_relationships WHERE owner_id=$1) relationship_count,
        (SELECT count(*)::int FROM knowledge_facts WHERE owner_id=$1) fact_count,
        (SELECT count(*)::int FROM knowledge_evidence WHERE owner_id=$1) evidence_count,
        (SELECT count(*)::int FROM knowledge_conflicts WHERE owner_id=$1 AND status='open') conflict_count,
        (SELECT count(DISTINCT source_type || ':' || coalesce(source_id,''))::int FROM knowledge_entities WHERE owner_id=$1) source_count,
        (SELECT count(*)::int FROM knowledge_entity_embeddings WHERE owner_id=$1) embedding_count`,
      [ownerId],
    );
    const row = (result.rows[0] ?? {}) as Record<string, number | undefined>;
    return {
      entityCount: row.entity_count ?? 0,
      relationshipCount: row.relationship_count ?? 0,
      factCount: row.fact_count ?? 0,
      evidenceCount: row.evidence_count ?? 0,
      conflictCount: row.conflict_count ?? 0,
      sourceCount: row.source_count ?? 0,
      embeddingCount: row.embedding_count ?? 0,
    };
  }
}

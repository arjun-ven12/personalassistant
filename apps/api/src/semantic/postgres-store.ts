import {
  ContextRankingRecordSchema,
  EmbeddingVersionRecordSchema,
  RetrievalHistoryRecordSchema,
  RetrievalMetricRecordSchema,
  SemanticAliasRecordSchema,
  SemanticEmbeddingRecordSchema,
  SemanticPermissionRecordSchema,
  SemanticRegistryObjectSchema,
  SemanticUsageRecordSchema,
  SynonymRecordSchema,
  type ContextRankingRecord,
  type EmbeddingVersionRecord,
  type RetrievalHistoryRecord,
  type RetrievalMetricRecord,
  type SemanticAliasRecord,
  type SemanticEmbeddingRecord,
  type SemanticPermissionRecord,
  type SemanticRegistryObject,
  type SemanticUsageRecord,
  type SynonymRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { SemanticRetrievalStore } from "./store.js";

const list = async <T>(
  pool: Pool,
  table: string,
  ownerId: string,
  order: string,
  limit: number,
  schema: { parse: (value: unknown) => T },
) => {
  const result = await pool.query<{ record: unknown }>(
    `SELECT record FROM ${table} WHERE owner_id=$1 ORDER BY ${order} DESC LIMIT $2`,
    [ownerId, limit],
  );
  return result.rows.map((row) => schema.parse(row.record));
};

const insertRecord = async (
  pool: Pool,
  table: string,
  record: { id: string; ownerId: string },
  columns: Record<string, string | number | boolean | null>,
) => {
  const names = ["id", "owner_id", ...Object.keys(columns), "record"];
  const values = [record.id, record.ownerId, ...Object.values(columns), record];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
  await pool.query(
    `INSERT INTO ${table}(${names.join(",")}) VALUES (${placeholders})
     ON CONFLICT (owner_id, id) DO UPDATE SET record=EXCLUDED.record`,
    values,
  );
};

export class PostgresSemanticRetrievalStore implements SemanticRetrievalStore {
  constructor(readonly pool: Pool) {}

  async saveObject(record: SemanticRegistryObject) {
    const parsed = SemanticRegistryObjectSchema.parse(record);
    await insertRecord(this.pool, "semantic_registry", parsed, {
      object_key: parsed.objectKey,
      display_name: parsed.displayName,
      category: parsed.category,
      visibility: parsed.visibility,
      creation_source: parsed.creationSource,
      route_path: parsed.routePath,
      updated_at: parsed.updatedAt,
    });
  }
  listObjects(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_registry",
      ownerId,
      "updated_at",
      limit,
      SemanticRegistryObjectSchema,
    );
  }
  async getObject(ownerId: string, objectId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM semantic_registry WHERE owner_id=$1 AND id=$2",
      [ownerId, objectId],
    );
    return result.rows[0] ? SemanticRegistryObjectSchema.parse(result.rows[0].record) : null;
  }
  async getObjectByKey(ownerId: string, objectKey: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM semantic_registry WHERE owner_id=$1 AND object_key=$2",
      [ownerId, objectKey],
    );
    return result.rows[0] ? SemanticRegistryObjectSchema.parse(result.rows[0].record) : null;
  }
  async saveAlias(record: SemanticAliasRecord) {
    const parsed = SemanticAliasRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_aliases", parsed, {
      object_id: parsed.objectId,
      normalized_alias: parsed.normalizedAlias,
      source: parsed.source,
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  listAliases(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_aliases",
      ownerId,
      "updated_at",
      limit,
      SemanticAliasRecordSchema,
    );
  }
  async saveEmbedding(record: SemanticEmbeddingRecord) {
    const parsed = SemanticEmbeddingRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_embeddings", parsed, {
      object_id: parsed.objectId,
      provider: parsed.provider,
      model: parsed.model,
      embedding_version: parsed.embeddingVersion,
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  listEmbeddings(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_embeddings",
      ownerId,
      "updated_at",
      limit,
      SemanticEmbeddingRecordSchema,
    );
  }
  async saveEmbeddingVersion(record: EmbeddingVersionRecord) {
    const parsed = EmbeddingVersionRecordSchema.parse(record);
    await insertRecord(this.pool, "embedding_versions", parsed, {
      object_id: parsed.objectId,
      version: parsed.version,
      created_at: parsed.createdAt,
    });
  }
  listEmbeddingVersions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "embedding_versions",
      ownerId,
      "created_at",
      limit,
      EmbeddingVersionRecordSchema,
    );
  }
  async saveSynonym(record: SynonymRecord) {
    const parsed = SynonymRecordSchema.parse(record);
    await insertRecord(this.pool, "synonym_dictionary", {
      ...parsed,
      ownerId: parsed.ownerId ?? "00000000-0000-0000-0000-000000000000",
    }, {
      term: parsed.term,
      source: parsed.source,
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  async listSynonyms(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM synonym_dictionary
       WHERE owner_id=$1 OR owner_id='00000000-0000-0000-0000-000000000000'
       ORDER BY updated_at DESC LIMIT $2`,
      [ownerId, limit],
    );
    return result.rows.map((row) => SynonymRecordSchema.parse(row.record));
  }
  async saveHistory(record: RetrievalHistoryRecord) {
    const parsed = RetrievalHistoryRecordSchema.parse(record);
    await insertRecord(this.pool, "retrieval_history", parsed, {
      source: parsed.source,
      resolution: parsed.resolution,
      selected_object_id: parsed.selectedObjectId,
      created_at: parsed.createdAt,
    });
  }
  listHistory(ownerId: string, limit: number) {
    return list(
      this.pool,
      "retrieval_history",
      ownerId,
      "created_at",
      limit,
      RetrievalHistoryRecordSchema,
    );
  }
  async saveMetric(record: RetrievalMetricRecord) {
    const parsed = RetrievalMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "retrieval_metrics", parsed, {
      source: parsed.source,
      resolution: parsed.resolution,
      latency_ms: parsed.latencyMs,
      measured_at: parsed.measuredAt,
    });
  }
  listMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "retrieval_metrics",
      ownerId,
      "measured_at",
      limit,
      RetrievalMetricRecordSchema,
    );
  }
  async saveUsage(record: SemanticUsageRecord) {
    const parsed = SemanticUsageRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_usage", parsed, {
      object_id: parsed.objectId,
      source: parsed.source,
      success: parsed.success,
      used_at: parsed.usedAt,
    });
  }
  listUsage(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_usage",
      ownerId,
      "used_at",
      limit,
      SemanticUsageRecordSchema,
    );
  }
  async saveContextRanking(record: ContextRankingRecord) {
    const parsed = ContextRankingRecordSchema.parse(record);
    await insertRecord(this.pool, "context_ranking", parsed, {
      context_key: parsed.contextKey,
      object_id: parsed.objectId,
      weight: parsed.weight,
      updated_at: parsed.updatedAt,
    });
  }
  listContextRankings(ownerId: string, limit: number) {
    return list(
      this.pool,
      "context_ranking",
      ownerId,
      "updated_at",
      limit,
      ContextRankingRecordSchema,
    );
  }
  async savePermission(record: SemanticPermissionRecord) {
    const parsed = SemanticPermissionRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_permissions", parsed, {
      object_id: parsed.objectId,
      permission: parsed.permission,
      allowed: parsed.allowed,
      updated_at: parsed.updatedAt,
    });
  }
  listPermissions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_permissions",
      ownerId,
      "updated_at",
      limit,
      SemanticPermissionRecordSchema,
    );
  }
}

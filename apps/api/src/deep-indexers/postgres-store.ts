import {
  SemanticFingerprintRecordSchema,
  SemanticIndexerHealthRecordSchema,
  SemanticIndexEventRecordSchema,
  SemanticIndexSessionRecordSchema,
  SemanticIndexVersionRecordSchema,
  SemanticProviderIndexerRecordSchema,
  SemanticRelationshipUpdateRecordSchema,
  SemanticSearchStatisticsRecordSchema,
  type SemanticFingerprintRecord,
  type SemanticIndexerHealthRecord,
  type SemanticIndexEventRecord,
  type SemanticIndexSessionRecord,
  type SemanticIndexVersionRecord,
  type SemanticProviderIndexerRecord,
  type SemanticRelationshipUpdateRecord,
  type SemanticSearchStatisticsRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { DeepIndexerStore } from "./store.js";

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
  const updates = [...Object.keys(columns), "record"]
    .map((name) => `${name}=EXCLUDED.${name}`)
    .join(",");
  await pool.query(
    `INSERT INTO ${table}(${names.join(",")}) VALUES (${placeholders})
     ON CONFLICT (owner_id, id) DO UPDATE SET ${updates}`,
    values,
  );
};

export class PostgresDeepIndexerStore implements DeepIndexerStore {
  constructor(readonly pool: Pool) {}

  async saveIndexer(record: SemanticProviderIndexerRecord) {
    const parsed = SemanticProviderIndexerRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_provider_indexers", parsed, {
      provider_id: parsed.providerId,
      application_id: parsed.applicationId,
      indexer_type: parsed.indexerType,
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  listIndexers(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_provider_indexers",
      ownerId,
      "updated_at",
      limit,
      SemanticProviderIndexerRecordSchema,
    );
  }
  async getIndexer(ownerId: string, indexerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM semantic_provider_indexers WHERE owner_id=$1 AND id=$2",
      [ownerId, indexerId],
    );
    return result.rows[0]
      ? SemanticProviderIndexerRecordSchema.parse(result.rows[0].record)
      : null;
  }
  async saveSession(record: SemanticIndexSessionRecord) {
    const parsed = SemanticIndexSessionRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_index_sessions", parsed, {
      indexer_id: parsed.indexerId,
      provider_id: parsed.providerId,
      application_id: parsed.applicationId,
      mode: parsed.mode,
      status: parsed.status,
      started_at: parsed.startedAt,
    });
  }
  listSessions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_index_sessions",
      ownerId,
      "started_at",
      limit,
      SemanticIndexSessionRecordSchema,
    );
  }
  async saveEvent(record: SemanticIndexEventRecord) {
    const parsed = SemanticIndexEventRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_index_events", parsed, {
      indexer_id: parsed.indexerId,
      provider_id: parsed.providerId,
      application_id: parsed.applicationId,
      event_type: parsed.eventType,
      occurred_at: parsed.occurredAt,
    });
    await insertRecord(this.pool, "semantic_event_log", parsed, {
      indexer_id: parsed.indexerId,
      provider_id: parsed.providerId,
      application_id: parsed.applicationId,
      event_type: parsed.eventType,
      occurred_at: parsed.occurredAt,
    });
  }
  listEvents(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_index_events",
      ownerId,
      "occurred_at",
      limit,
      SemanticIndexEventRecordSchema,
    );
  }
  async saveVersion(record: SemanticIndexVersionRecord) {
    const parsed = SemanticIndexVersionRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_index_versions", parsed, {
      object_id: parsed.objectId,
      source_provider_id: parsed.sourceProviderId,
      indexed_at: parsed.indexedAt,
    });
  }
  listVersions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_index_versions",
      ownerId,
      "indexed_at",
      limit,
      SemanticIndexVersionRecordSchema,
    );
  }
  async saveFingerprint(record: SemanticFingerprintRecord) {
    const parsed = SemanticFingerprintRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_fingerprints", parsed, {
      object_id: parsed.objectId,
      source_provider_id: parsed.sourceProviderId,
      calculated_at: parsed.calculatedAt,
    });
  }
  listFingerprints(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_fingerprints",
      ownerId,
      "calculated_at",
      limit,
      SemanticFingerprintRecordSchema,
    );
  }
  async saveRelationshipUpdate(record: SemanticRelationshipUpdateRecord) {
    const parsed = SemanticRelationshipUpdateRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_relationship_updates", parsed, {
      from_object_id: parsed.fromObjectId,
      to_object_id: parsed.toObjectId,
      relationship: parsed.relationship,
      occurred_at: parsed.occurredAt,
    });
  }
  listRelationshipUpdates(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_relationship_updates",
      ownerId,
      "occurred_at",
      limit,
      SemanticRelationshipUpdateRecordSchema,
    );
  }
  async saveHealth(record: SemanticIndexerHealthRecord) {
    const parsed = SemanticIndexerHealthRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_index_health", parsed, {
      indexer_id: parsed.indexerId,
      status: parsed.status,
      checked_at: parsed.checkedAt,
    });
  }
  listHealth(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_index_health",
      ownerId,
      "checked_at",
      limit,
      SemanticIndexerHealthRecordSchema,
    );
  }
  async saveSearchStatistics(record: SemanticSearchStatisticsRecord) {
    const parsed = SemanticSearchStatisticsRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_search_statistics", parsed, {
      measured_at: parsed.measuredAt,
    });
  }
  async getSearchStatistics(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM semantic_search_statistics WHERE owner_id=$1 ORDER BY measured_at DESC LIMIT 1",
      [ownerId],
    );
    return result.rows[0]
      ? SemanticSearchStatisticsRecordSchema.parse(result.rows[0].record)
      : null;
  }
}

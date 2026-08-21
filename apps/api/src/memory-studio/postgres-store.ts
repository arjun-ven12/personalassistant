import type { Pool } from "pg";

import {
  CognitiveAuditLinkRecordSchema,
  CognitiveItemControlRecordSchema,
  CognitiveItemUsageRecordSchema,
  CognitiveItemVersionRecordSchema,
  type CognitiveAuditLinkRecord,
  type CognitiveItemControlRecord,
  type CognitiveItemUsageRecord,
  type CognitiveItemVersionRecord,
  type MemoryStudioStore,
} from "./store.js";

const list = async <T>(
  pool: Pool,
  table: string,
  ownerId: string,
  itemId: string,
  order: string,
  limit: number,
  schema: { parse: (value: unknown) => T },
) => {
  const result = await pool.query<{ record: unknown }>(
    `SELECT record FROM ${table} WHERE owner_id=$1 AND item_id=$2 ORDER BY ${order} DESC LIMIT $3`,
    [ownerId, itemId, limit],
  );
  return result.rows.map((row) => schema.parse(row.record));
};

export class PostgresMemoryStudioStore implements MemoryStudioStore {
  constructor(readonly pool: Pool) {}

  async saveControl(record: CognitiveItemControlRecord) {
    const parsed = CognitiveItemControlRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO cognitive_item_controls(id,owner_id,item_id,archived,pinned,updated_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (owner_id,item_id) DO UPDATE
       SET archived=$4,pinned=$5,updated_at=$6,record=$7`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.itemId,
        parsed.archived,
        parsed.pinned,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async getControl(ownerId: string, itemId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM cognitive_item_controls WHERE owner_id=$1 AND item_id=$2",
      [ownerId, itemId],
    );
    return result.rows[0]
      ? CognitiveItemControlRecordSchema.parse(result.rows[0].record)
      : null;
  }

  async listControls(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM cognitive_item_controls WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT $2",
      [ownerId, limit],
    );
    return result.rows.map((row) => CognitiveItemControlRecordSchema.parse(row.record));
  }

  async saveUsage(record: CognitiveItemUsageRecord) {
    const parsed = CognitiveItemUsageRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO cognitive_item_usage(id,owner_id,item_id,use_type,source,used_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.itemId,
        parsed.useType,
        parsed.source,
        parsed.usedAt,
        parsed,
      ],
    );
  }

  listUsage(ownerId: string, itemId: string, limit: number) {
    return list(
      this.pool,
      "cognitive_item_usage",
      ownerId,
      itemId,
      "used_at",
      limit,
      CognitiveItemUsageRecordSchema,
    );
  }

  async saveVersion(record: CognitiveItemVersionRecord) {
    const parsed = CognitiveItemVersionRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO cognitive_item_versions(id,owner_id,item_id,version,change_type,created_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.itemId,
        parsed.version,
        parsed.changeType,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  listVersions(ownerId: string, itemId: string, limit: number) {
    return list(
      this.pool,
      "cognitive_item_versions",
      ownerId,
      itemId,
      "created_at",
      limit,
      CognitiveItemVersionRecordSchema,
    );
  }

  async saveAuditLink(record: CognitiveAuditLinkRecord) {
    const parsed = CognitiveAuditLinkRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO cognitive_item_audit_links(id,owner_id,item_id,event_type,created_at,record)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.itemId,
        parsed.eventType,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  listAuditLinks(ownerId: string, itemId: string, limit: number) {
    return list(
      this.pool,
      "cognitive_item_audit_links",
      ownerId,
      itemId,
      "created_at",
      limit,
      CognitiveAuditLinkRecordSchema,
    );
  }
}

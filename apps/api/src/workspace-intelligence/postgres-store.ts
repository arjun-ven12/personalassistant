import {
  SemanticIndexRecordSchema,
  SemanticNavigationRecordSchema,
  SemanticWorkspaceRecordSchema,
  WorkspaceMemoryRecordSchema,
  WorkspaceSemanticContextSchema,
  WorkspaceSemanticObjectSchema,
  WorkspaceSemanticRelationshipSchema,
  type SemanticIndexRecord,
  type SemanticNavigationRecord,
  type SemanticWorkspaceRecord,
  type WorkspaceMemoryRecord,
  type WorkspaceSemanticContext,
  type WorkspaceSemanticObject,
  type WorkspaceSemanticRelationship,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { WorkspaceIntelligenceStore } from "./store.js";

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

export class PostgresWorkspaceIntelligenceStore implements WorkspaceIntelligenceStore {
  constructor(readonly pool: Pool) {}

  async saveWorkspace(record: SemanticWorkspaceRecord) {
    const parsed = SemanticWorkspaceRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_workspaces", parsed, {
      application_id: parsed.applicationId,
      provider_id: parsed.providerId,
      domain: parsed.domain,
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  listWorkspaces(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_workspaces",
      ownerId,
      "updated_at",
      limit,
      SemanticWorkspaceRecordSchema,
    );
  }
  async saveObject(record: WorkspaceSemanticObject) {
    const parsed = WorkspaceSemanticObjectSchema.parse(record);
    await insertRecord(this.pool, "workspace_semantic_objects", parsed, {
      application_id: parsed.applicationId,
      provider_id: parsed.providerId,
      object_type: parsed.objectType,
      title: parsed.title,
      updated_at: parsed.updatedAt,
    });
  }
  listObjects(ownerId: string, limit: number) {
    return list(
      this.pool,
      "workspace_semantic_objects",
      ownerId,
      "updated_at",
      limit,
      WorkspaceSemanticObjectSchema,
    );
  }
  async getObject(ownerId: string, objectId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM workspace_semantic_objects WHERE owner_id=$1 AND id=$2",
      [ownerId, objectId],
    );
    return result.rows[0]
      ? WorkspaceSemanticObjectSchema.parse(result.rows[0].record)
      : null;
  }
  async saveRelationship(record: WorkspaceSemanticRelationship) {
    const parsed = WorkspaceSemanticRelationshipSchema.parse(record);
    await insertRecord(this.pool, "workspace_semantic_relationships", parsed, {
      from_object_id: parsed.fromObjectId,
      to_object_id: parsed.toObjectId,
      relationship: parsed.relationship,
      created_at: parsed.createdAt,
    });
  }
  listRelationships(ownerId: string, limit: number) {
    return list(
      this.pool,
      "workspace_semantic_relationships",
      ownerId,
      "created_at",
      limit,
      WorkspaceSemanticRelationshipSchema,
    );
  }
  async saveContext(record: WorkspaceSemanticContext) {
    const parsed = WorkspaceSemanticContextSchema.parse(record);
    await insertRecord(this.pool, "workspace_semantic_context", parsed, {
      current_application_id: parsed.currentApplicationId,
      current_object_id: parsed.currentObjectId,
      updated_at: parsed.updatedAt,
    });
  }
  listContexts(ownerId: string, limit: number) {
    return list(
      this.pool,
      "workspace_semantic_context",
      ownerId,
      "updated_at",
      limit,
      WorkspaceSemanticContextSchema,
    );
  }
  async saveIndex(record: SemanticIndexRecord) {
    const parsed = SemanticIndexRecordSchema.parse(record);
    await insertRecord(this.pool, "workspace_semantic_indexes", parsed, {
      object_id: parsed.objectId,
      indexed_at: parsed.indexedAt,
    });
  }
  listIndexes(ownerId: string, limit: number) {
    return list(
      this.pool,
      "workspace_semantic_indexes",
      ownerId,
      "indexed_at",
      limit,
      SemanticIndexRecordSchema,
    );
  }
  async saveNavigation(record: SemanticNavigationRecord) {
    const parsed = SemanticNavigationRecordSchema.parse(record);
    await insertRecord(this.pool, "workspace_semantic_navigation", parsed, {
      resolved_object_id: parsed.resolvedObjectId,
      created_at: parsed.createdAt,
    });
  }
  listNavigation(ownerId: string, limit: number) {
    return list(
      this.pool,
      "workspace_semantic_navigation",
      ownerId,
      "created_at",
      limit,
      SemanticNavigationRecordSchema,
    );
  }
  async saveMemory(record: WorkspaceMemoryRecord) {
    const parsed = WorkspaceMemoryRecordSchema.parse(record);
    await insertRecord(this.pool, "workspace_memory", parsed, {
      object_id: parsed.objectId,
      memory_type: parsed.memoryType,
      last_used_at: parsed.lastUsedAt,
    });
  }
  listMemory(ownerId: string, limit: number) {
    return list(
      this.pool,
      "workspace_memory",
      ownerId,
      "last_used_at",
      limit,
      WorkspaceMemoryRecordSchema,
    );
  }
}

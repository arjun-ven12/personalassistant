import {
  AdapterActionHistoryRecordSchema,
  AdapterHealthMetricRecordSchema,
  AdapterPermissionStatusRecordSchema,
  ApplicationContextSnapshotRecordSchema,
  ApplicationSessionRecord18ESchema,
  ApplicationUsageRecord18ESchema,
  SemanticActionHistoryRecordSchema,
  type AdapterActionHistoryRecord,
  type AdapterHealthMetricRecord,
  type AdapterPermissionStatusRecord,
  type ApplicationContextSnapshotRecord,
  type ApplicationSessionRecord18E,
  type ApplicationUsageRecord18E,
  type SemanticActionHistoryRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { CoreAdapterStore } from "./store.js";

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

export class PostgresCoreAdapterStore implements CoreAdapterStore {
  constructor(readonly pool: Pool) {}

  async saveSession(record: ApplicationSessionRecord18E) {
    const parsed = ApplicationSessionRecord18ESchema.parse(record);
    await insertRecord(this.pool, "core_application_sessions", parsed, {
      adapter_id: parsed.adapterId,
      application_id: parsed.applicationId,
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  listSessions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "core_application_sessions",
      ownerId,
      "updated_at",
      limit,
      ApplicationSessionRecord18ESchema,
    );
  }
  async saveContextSnapshot(record: ApplicationContextSnapshotRecord) {
    const parsed = ApplicationContextSnapshotRecordSchema.parse(record);
    await insertRecord(this.pool, "application_context_snapshots", parsed, {
      adapter_id: parsed.adapterId,
      application_id: parsed.applicationId,
      captured_at: parsed.capturedAt,
    });
  }
  listContextSnapshots(ownerId: string, limit: number) {
    return list(
      this.pool,
      "application_context_snapshots",
      ownerId,
      "captured_at",
      limit,
      ApplicationContextSnapshotRecordSchema,
    );
  }
  async saveActionHistory(record: AdapterActionHistoryRecord) {
    const parsed = AdapterActionHistoryRecordSchema.parse(record);
    await insertRecord(this.pool, "adapter_action_history", parsed, {
      adapter_id: parsed.adapterId,
      application_id: parsed.applicationId,
      capability_id: parsed.capabilityId,
      status: parsed.status,
      requested_at: parsed.requestedAt,
    });
  }
  listActionHistory(ownerId: string, limit: number) {
    return list(
      this.pool,
      "adapter_action_history",
      ownerId,
      "requested_at",
      limit,
      AdapterActionHistoryRecordSchema,
    );
  }
  async saveHealthMetric(record: AdapterHealthMetricRecord) {
    const parsed = AdapterHealthMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "adapter_health_metrics", parsed, {
      adapter_id: parsed.adapterId,
      application_id: parsed.applicationId,
      measured_at: parsed.measuredAt,
    });
  }
  listHealthMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "adapter_health_metrics",
      ownerId,
      "measured_at",
      limit,
      AdapterHealthMetricRecordSchema,
    );
  }
  async savePermissionStatus(record: AdapterPermissionStatusRecord) {
    const parsed = AdapterPermissionStatusRecordSchema.parse(record);
    await insertRecord(this.pool, "adapter_permission_status", parsed, {
      adapter_id: parsed.adapterId,
      application_id: parsed.applicationId,
      permission: parsed.permission,
      updated_at: parsed.updatedAt,
    });
  }
  listPermissionStatus(ownerId: string, limit: number) {
    return list(
      this.pool,
      "adapter_permission_status",
      ownerId,
      "updated_at",
      limit,
      AdapterPermissionStatusRecordSchema,
    );
  }
  async saveSemanticAction(record: SemanticActionHistoryRecord) {
    const parsed = SemanticActionHistoryRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_action_history", parsed, {
      adapter_id: parsed.adapterId,
      application_id: parsed.applicationId,
      capability_id: parsed.capabilityId,
      outcome: parsed.outcome,
      created_at: parsed.createdAt,
    });
  }
  listSemanticActions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_action_history",
      ownerId,
      "created_at",
      limit,
      SemanticActionHistoryRecordSchema,
    );
  }
  async saveUsage(record: ApplicationUsageRecord18E) {
    const parsed = ApplicationUsageRecord18ESchema.parse(record);
    await insertRecord(this.pool, "application_usage", parsed, {
      adapter_id: parsed.adapterId,
      application_id: parsed.applicationId,
      updated_at: parsed.updatedAt,
    });
  }
  listUsage(ownerId: string, limit: number) {
    return list(
      this.pool,
      "application_usage",
      ownerId,
      "updated_at",
      limit,
      ApplicationUsageRecord18ESchema,
    );
  }
}

import {
  AdapterCompatibilityRecordSchema,
  AdapterDependencyRecordSchema,
  AdapterLifecycleRecordSchema,
  AdapterSandboxRecordSchema,
  AdapterSdkContractRecordSchema,
  AdapterUsageRecordSchema,
  type AdapterCompatibilityRecord,
  type AdapterDependencyRecord,
  type AdapterLifecycleRecord,
  type AdapterSandboxRecord,
  type AdapterSdkContractRecord,
  type AdapterUsageRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { AdapterSdkStore } from "./store.js";

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

export class PostgresAdapterSdkStore implements AdapterSdkStore {
  constructor(readonly pool: Pool) {}

  async saveContract(record: AdapterSdkContractRecord) {
    const parsed = AdapterSdkContractRecordSchema.parse(record);
    await insertRecord(this.pool, "adapter_sdk_contracts", parsed, {
      application_id: parsed.applicationId,
      adapter_instance_id: parsed.adapterInstanceId,
      lifecycle_state: parsed.lifecycleState,
      updated_at: parsed.updatedAt,
    });
  }
  listContracts(ownerId: string, limit: number) {
    return list(
      this.pool,
      "adapter_sdk_contracts",
      ownerId,
      "updated_at",
      limit,
      AdapterSdkContractRecordSchema,
    );
  }
  async getContractByAdapterInstance(ownerId: string, adapterInstanceId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM adapter_sdk_contracts WHERE owner_id=$1 AND adapter_instance_id=$2 ORDER BY updated_at DESC LIMIT 1",
      [ownerId, adapterInstanceId],
    );
    return result.rows[0]
      ? AdapterSdkContractRecordSchema.parse(result.rows[0].record)
      : null;
  }
  async saveLifecycle(record: AdapterLifecycleRecord) {
    const parsed = AdapterLifecycleRecordSchema.parse(record);
    await insertRecord(this.pool, "adapter_lifecycle", parsed, {
      application_id: parsed.applicationId,
      adapter_instance_id: parsed.adapterInstanceId,
      to_state: parsed.toState,
      occurred_at: parsed.occurredAt,
    });
  }
  listLifecycle(ownerId: string, limit: number) {
    return list(
      this.pool,
      "adapter_lifecycle",
      ownerId,
      "occurred_at",
      limit,
      AdapterLifecycleRecordSchema,
    );
  }
  async saveSandbox(record: AdapterSandboxRecord) {
    const parsed = AdapterSandboxRecordSchema.parse(record);
    await insertRecord(this.pool, "adapter_sandboxes", parsed, {
      application_id: parsed.applicationId,
      adapter_instance_id: parsed.adapterInstanceId,
      updated_at: parsed.updatedAt,
    });
  }
  listSandboxes(ownerId: string, limit: number) {
    return list(
      this.pool,
      "adapter_sandboxes",
      ownerId,
      "updated_at",
      limit,
      AdapterSandboxRecordSchema,
    );
  }
  async saveDependency(record: AdapterDependencyRecord) {
    const parsed = AdapterDependencyRecordSchema.parse(record);
    await insertRecord(this.pool, "adapter_dependencies", parsed, {
      application_id: parsed.applicationId,
      adapter_instance_id: parsed.adapterInstanceId,
      dependency_type: parsed.dependencyType,
      updated_at: parsed.updatedAt,
    });
  }
  listDependencies(ownerId: string, limit: number) {
    return list(
      this.pool,
      "adapter_dependencies",
      ownerId,
      "updated_at",
      limit,
      AdapterDependencyRecordSchema,
    );
  }
  async saveUsage(record: AdapterUsageRecord) {
    const parsed = AdapterUsageRecordSchema.parse(record);
    await insertRecord(this.pool, "adapter_usage", parsed, {
      application_id: parsed.applicationId,
      adapter_instance_id: parsed.adapterInstanceId,
      operation: parsed.operation,
      recorded_at: parsed.recordedAt,
    });
  }
  listUsage(ownerId: string, limit: number) {
    return list(
      this.pool,
      "adapter_usage",
      ownerId,
      "recorded_at",
      limit,
      AdapterUsageRecordSchema,
    );
  }
  async saveCompatibility(record: AdapterCompatibilityRecord) {
    const parsed = AdapterCompatibilityRecordSchema.parse(record);
    await insertRecord(this.pool, "adapter_compatibility", parsed, {
      application_id: parsed.applicationId,
      adapter_instance_id: parsed.adapterInstanceId,
      compatibility: parsed.compatibility,
      checked_at: parsed.checkedAt,
    });
  }
  listCompatibility(ownerId: string, limit: number) {
    return list(
      this.pool,
      "adapter_compatibility",
      ownerId,
      "checked_at",
      limit,
      AdapterCompatibilityRecordSchema,
    );
  }
}

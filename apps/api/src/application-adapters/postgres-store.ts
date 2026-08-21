import {
  AdapterInstanceRecordSchema,
  AdapterMetricRecordSchema,
  AdapterPluginRecordSchema,
  AdapterVersionRecordSchema,
  ApplicationCapabilityRecordSchema,
  ApplicationContextRecordSchema,
  ApplicationEventRecordSchema,
  ApplicationHealthRecordSchema,
  ApplicationPermissionRecordSchema,
  ApplicationProfileRecordSchema,
  TrustedApplicationRecordSchema,
  type AdapterInstanceRecord,
  type AdapterMetricRecord,
  type AdapterPluginRecord,
  type AdapterVersionRecord,
  type ApplicationCapabilityRecord,
  type ApplicationContextRecord,
  type ApplicationEventRecord,
  type ApplicationHealthRecord,
  type ApplicationPermissionRecord,
  type ApplicationProfileRecord,
  type TrustedApplicationRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { ApplicationAdapterStore } from "./store.js";

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

export class PostgresApplicationAdapterStore implements ApplicationAdapterStore {
  constructor(readonly pool: Pool) {}

  async saveTrustedApplication(record: TrustedApplicationRecord) {
    const parsed = TrustedApplicationRecordSchema.parse(record);
    await insertRecord(this.pool, "trusted_applications", parsed, {
      stable_identifier: parsed.stableIdentifier,
      bundle_identifier: parsed.bundleIdentifier,
      status: parsed.status,
      trust_level: parsed.trustLevel,
      updated_at: parsed.updatedAt,
    });
  }
  listTrustedApplications(ownerId: string, limit: number) {
    return list(
      this.pool,
      "trusted_applications",
      ownerId,
      "updated_at",
      limit,
      TrustedApplicationRecordSchema,
    );
  }
  async getTrustedApplication(ownerId: string, applicationId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM trusted_applications WHERE owner_id=$1 AND id=$2",
      [ownerId, applicationId],
    );
    return result.rows[0]
      ? TrustedApplicationRecordSchema.parse(result.rows[0].record)
      : null;
  }
  async saveApplicationProfile(record: ApplicationProfileRecord) {
    const parsed = ApplicationProfileRecordSchema.parse(record);
    await insertRecord(this.pool, "application_profiles", parsed, {
      application_id: parsed.applicationId,
      updated_at: parsed.updatedAt,
    });
  }
  listApplicationProfiles(ownerId: string, limit: number) {
    return list(
      this.pool,
      "application_profiles",
      ownerId,
      "updated_at",
      limit,
      ApplicationProfileRecordSchema,
    );
  }
  async saveApplicationCapability(record: ApplicationCapabilityRecord) {
    const parsed = ApplicationCapabilityRecordSchema.parse(record);
    await insertRecord(this.pool, "application_capabilities", parsed, {
      application_id: parsed.applicationId,
      capability: parsed.capability,
      source: parsed.source,
      updated_at: parsed.updatedAt,
    });
  }
  listApplicationCapabilities(ownerId: string, limit: number) {
    return list(
      this.pool,
      "application_capabilities",
      ownerId,
      "updated_at",
      limit,
      ApplicationCapabilityRecordSchema,
    );
  }
  async saveAdapterInstance(record: AdapterInstanceRecord) {
    const parsed = AdapterInstanceRecordSchema.parse(record);
    await insertRecord(this.pool, "adapter_instances", parsed, {
      application_id: parsed.applicationId,
      adapter_type: parsed.adapterType,
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  listAdapterInstances(ownerId: string, limit: number) {
    return list(
      this.pool,
      "adapter_instances",
      ownerId,
      "updated_at",
      limit,
      AdapterInstanceRecordSchema,
    );
  }
  async saveAdapterPlugin(record: AdapterPluginRecord) {
    const parsed = AdapterPluginRecordSchema.parse(record);
    await insertRecord(this.pool, "adapter_plugins", parsed, {
      application_id: parsed.applicationId,
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  listAdapterPlugins(ownerId: string, limit: number) {
    return list(
      this.pool,
      "adapter_plugins",
      ownerId,
      "updated_at",
      limit,
      AdapterPluginRecordSchema,
    );
  }
  async saveApplicationPermission(record: ApplicationPermissionRecord) {
    const parsed = ApplicationPermissionRecordSchema.parse(record);
    await insertRecord(this.pool, "application_permissions", parsed, {
      application_id: parsed.applicationId,
      permission: parsed.permission,
      granted: parsed.granted,
      updated_at: parsed.updatedAt,
    });
  }
  listApplicationPermissions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "application_permissions",
      ownerId,
      "updated_at",
      limit,
      ApplicationPermissionRecordSchema,
    );
  }
  async saveApplicationContext(record: ApplicationContextRecord) {
    const parsed = ApplicationContextRecordSchema.parse(record);
    await insertRecord(this.pool, "application_context", parsed, {
      current_application_id: parsed.currentApplicationId,
      updated_at: parsed.updatedAt,
    });
  }
  listApplicationContext(ownerId: string, limit: number) {
    return list(
      this.pool,
      "application_context",
      ownerId,
      "updated_at",
      limit,
      ApplicationContextRecordSchema,
    );
  }
  async saveApplicationEvent(record: ApplicationEventRecord) {
    const parsed = ApplicationEventRecordSchema.parse(record);
    await insertRecord(this.pool, "application_events", parsed, {
      application_id: parsed.applicationId,
      event_type: parsed.eventType,
      occurred_at: parsed.occurredAt,
    });
  }
  listApplicationEvents(ownerId: string, limit: number) {
    return list(
      this.pool,
      "application_events",
      ownerId,
      "occurred_at",
      limit,
      ApplicationEventRecordSchema,
    );
  }
  async saveAdapterMetric(record: AdapterMetricRecord) {
    const parsed = AdapterMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "adapter_metrics", parsed, {
      application_id: parsed.applicationId,
      metric_name: parsed.metricName,
      measured_at: parsed.measuredAt,
    });
  }
  listAdapterMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "adapter_metrics",
      ownerId,
      "measured_at",
      limit,
      AdapterMetricRecordSchema,
    );
  }
  async saveAdapterVersion(record: AdapterVersionRecord) {
    const parsed = AdapterVersionRecordSchema.parse(record);
    await insertRecord(this.pool, "adapter_versions", parsed, {
      application_id: parsed.applicationId,
      adapter_id: parsed.adapterId,
      recorded_at: parsed.recordedAt,
    });
  }
  listAdapterVersions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "adapter_versions",
      ownerId,
      "recorded_at",
      limit,
      AdapterVersionRecordSchema,
    );
  }
  async saveApplicationHealth(record: ApplicationHealthRecord) {
    const parsed = ApplicationHealthRecordSchema.parse(record);
    await insertRecord(this.pool, "application_health", parsed, {
      application_id: parsed.applicationId,
      status: parsed.status,
      checked_at: parsed.checkedAt,
    });
  }
  listApplicationHealth(ownerId: string, limit: number) {
    return list(
      this.pool,
      "application_health",
      ownerId,
      "checked_at",
      limit,
      ApplicationHealthRecordSchema,
    );
  }
}

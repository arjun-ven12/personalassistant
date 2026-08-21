import {
  ApprovedTerminalCommandRecordSchema,
  NativeProviderRecordSchema,
  ProviderCapabilityRecordSchema,
  ProviderDiagnosticRecordSchema,
  ProviderExecutionRecordSchema,
  ProviderHealthRecordSchema,
  ProviderMetricRecordSchema,
  ProviderValidationRecordSchema,
  type ApprovedTerminalCommandRecord,
  type NativeProviderRecord,
  type ProviderCapabilityRecord,
  type ProviderDiagnosticRecord,
  type ProviderExecutionRecord,
  type ProviderHealthRecord,
  type ProviderMetricRecord,
  type ProviderValidationRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { NativeProviderStore } from "./store.js";

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

export class PostgresNativeProviderStore implements NativeProviderStore {
  constructor(readonly pool: Pool) {}

  async saveProvider(record: NativeProviderRecord) {
    const parsed = NativeProviderRecordSchema.parse(record);
    await insertRecord(this.pool, "native_providers", parsed, {
      application_id: parsed.applicationId,
      provider_type: parsed.providerType,
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  listProviders(ownerId: string, limit: number) {
    return list(
      this.pool,
      "native_providers",
      ownerId,
      "updated_at",
      limit,
      NativeProviderRecordSchema,
    );
  }
  async getProvider(ownerId: string, providerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM native_providers WHERE owner_id=$1 AND id=$2",
      [ownerId, providerId],
    );
    return result.rows[0]
      ? NativeProviderRecordSchema.parse(result.rows[0].record)
      : null;
  }
  async saveCapability(record: ProviderCapabilityRecord) {
    const parsed = ProviderCapabilityRecordSchema.parse(record);
    await insertRecord(this.pool, "provider_capabilities", parsed, {
      provider_id: parsed.providerId,
      capability: parsed.capability,
      enabled: parsed.enabled,
      updated_at: parsed.updatedAt,
    });
  }
  listCapabilities(ownerId: string, limit: number) {
    return list(
      this.pool,
      "provider_capabilities",
      ownerId,
      "updated_at",
      limit,
      ProviderCapabilityRecordSchema,
    );
  }
  async saveHealth(record: ProviderHealthRecord) {
    const parsed = ProviderHealthRecordSchema.parse(record);
    await insertRecord(this.pool, "provider_health", parsed, {
      provider_id: parsed.providerId,
      status: parsed.status,
      health_score: parsed.healthScore,
      checked_at: parsed.checkedAt,
    });
  }
  listHealth(ownerId: string, limit: number) {
    return list(
      this.pool,
      "provider_health",
      ownerId,
      "checked_at",
      limit,
      ProviderHealthRecordSchema,
    );
  }
  async saveValidation(record: ProviderValidationRecord) {
    const parsed = ProviderValidationRecordSchema.parse(record);
    await insertRecord(this.pool, "provider_validation", parsed, {
      provider_id: parsed.providerId,
      status: parsed.status,
      validated_at: parsed.validatedAt,
    });
  }
  listValidation(ownerId: string, limit: number) {
    return list(
      this.pool,
      "provider_validation",
      ownerId,
      "validated_at",
      limit,
      ProviderValidationRecordSchema,
    );
  }
  async saveExecution(record: ProviderExecutionRecord) {
    const parsed = ProviderExecutionRecordSchema.parse(record);
    await insertRecord(this.pool, "provider_execution", parsed, {
      provider_id: parsed.providerId,
      capability: parsed.capability,
      status: parsed.status,
      requested_at: parsed.requestedAt,
    });
  }
  listExecution(ownerId: string, limit: number) {
    return list(
      this.pool,
      "provider_execution",
      ownerId,
      "requested_at",
      limit,
      ProviderExecutionRecordSchema,
    );
  }
  async saveMetric(record: ProviderMetricRecord) {
    const parsed = ProviderMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "provider_metrics", parsed, {
      provider_id: parsed.providerId,
      metric_name: parsed.metricName,
      measured_at: parsed.measuredAt,
    });
  }
  listMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "provider_metrics",
      ownerId,
      "measured_at",
      limit,
      ProviderMetricRecordSchema,
    );
  }
  async saveDiagnostic(record: ProviderDiagnosticRecord) {
    const parsed = ProviderDiagnosticRecordSchema.parse(record);
    await insertRecord(this.pool, "provider_diagnostics", parsed, {
      provider_id: parsed.providerId,
      severity: parsed.severity,
      created_at: parsed.createdAt,
    });
  }
  listDiagnostics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "provider_diagnostics",
      ownerId,
      "created_at",
      limit,
      ProviderDiagnosticRecordSchema,
    );
  }
  async saveApprovedCommand(record: ApprovedTerminalCommandRecord) {
    const parsed = ApprovedTerminalCommandRecordSchema.parse(record);
    await insertRecord(this.pool, "approved_terminal_commands", parsed, {
      name: parsed.name,
      enabled: parsed.enabled,
      updated_at: parsed.updatedAt,
    });
  }
  listApprovedCommands(ownerId: string, limit: number) {
    return list(
      this.pool,
      "approved_terminal_commands",
      ownerId,
      "updated_at",
      limit,
      ApprovedTerminalCommandRecordSchema,
    );
  }
  async getApprovedCommand(ownerId: string, commandId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM approved_terminal_commands WHERE owner_id=$1 AND id=$2",
      [ownerId, commandId],
    );
    return result.rows[0]
      ? ApprovedTerminalCommandRecordSchema.parse(result.rows[0].record)
      : null;
  }
}

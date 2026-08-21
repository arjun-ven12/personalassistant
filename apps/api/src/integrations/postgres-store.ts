import {
  IntegrationHealthSchema,
  IntegrationOperationRecordSchema,
  IntegrationPermissionSchema,
  IntegrationRecordSchema,
  IntegrationUsageSchema,
  type IntegrationHealth,
  type IntegrationOperationRecord,
  type IntegrationPermission,
  type IntegrationRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { IntegrationStore } from "./store.js";

export class PostgresIntegrationStore implements IntegrationStore {
  constructor(readonly pool: Pool) {}

  async upsertIntegration(integration: IntegrationRecord) {
    const parsed = IntegrationRecordSchema.parse(integration);
    await this.pool.query(
      `INSERT INTO integrations(id,owner_id,provider,category,status,installed_at,updated_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (owner_id,id) DO UPDATE
       SET status=$5,updated_at=$7,record=$8`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.provider,
        parsed.category,
        parsed.status,
        parsed.installedAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async findIntegration(ownerId: string, integrationId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM integrations WHERE owner_id=$1 AND id=$2",
      [ownerId, integrationId],
    );
    return result.rows[0]
      ? IntegrationRecordSchema.parse(result.rows[0].record)
      : undefined;
  }

  async listIntegrations(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM integrations WHERE owner_id=$1 ORDER BY provider ASC",
      [ownerId],
    );
    return result.rows.map((row) => IntegrationRecordSchema.parse(row.record));
  }

  async savePermission(permission: IntegrationPermission) {
    const parsed = IntegrationPermissionSchema.parse(permission);
    await this.pool.query(
      `INSERT INTO integration_permissions(
        id,owner_id,integration_id,capability_id,state,updated_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (owner_id,integration_id,capability_id) DO UPDATE
       SET state=$5,updated_at=$6,record=$7`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.integrationId,
        parsed.capabilityId,
        parsed.state,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async listPermissions(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM integration_permissions WHERE owner_id=$1 ORDER BY integration_id,capability_id",
      [ownerId],
    );
    return result.rows.map((row) => IntegrationPermissionSchema.parse(row.record));
  }

  async findPermission(ownerId: string, integrationId: string, capabilityId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM integration_permissions
       WHERE owner_id=$1 AND integration_id=$2 AND capability_id=$3`,
      [ownerId, integrationId, capabilityId],
    );
    return result.rows[0]
      ? IntegrationPermissionSchema.parse(result.rows[0].record)
      : undefined;
  }

  async saveHealth(health: IntegrationHealth) {
    const parsed = IntegrationHealthSchema.parse(health);
    await this.pool.query(
      `INSERT INTO integration_health(integration_id,state,checked_at,record)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (integration_id) DO UPDATE
       SET state=$2,checked_at=$3,record=$4`,
      [parsed.integrationId, parsed.state, parsed.checkedAt, parsed],
    );
  }

  async listHealth(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT h.record
       FROM integration_health h
       JOIN integrations i ON i.id=h.integration_id
       WHERE i.owner_id=$1
       ORDER BY h.integration_id`,
      [ownerId],
    );
    return result.rows.map((row) => IntegrationHealthSchema.parse(row.record));
  }

  async saveOperation(operation: IntegrationOperationRecord) {
    const parsed = IntegrationOperationRecordSchema.parse(operation);
    await this.pool.query(
      `INSERT INTO integration_events(
        id,owner_id,integration_id,capability_id,operation,status,requested_at,updated_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE
       SET status=$6,updated_at=$8,record=$9`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.integrationId,
        parsed.capabilityId,
        parsed.operation,
        parsed.status,
        parsed.requestedAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async listOperations(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM integration_events WHERE owner_id=$1 ORDER BY requested_at DESC LIMIT $2",
      [ownerId, limit],
    );
    return result.rows.map((row) => IntegrationOperationRecordSchema.parse(row.record));
  }

  async incrementUsage(input: {
    ownerId: string;
    integrationId: string;
    denied?: boolean;
    failed?: boolean;
    at: string;
  }) {
    await this.pool.query(
      `INSERT INTO integration_usage(
        owner_id,integration_id,operation_count,denied_count,failure_count,last_operation_at
       ) VALUES ($1,$2,1,$3,$4,$5)
       ON CONFLICT (owner_id,integration_id) DO UPDATE
       SET operation_count=integration_usage.operation_count+1,
           denied_count=integration_usage.denied_count+$3,
           failure_count=integration_usage.failure_count+$4,
           last_operation_at=$5`,
      [
        input.ownerId,
        input.integrationId,
        input.denied ? 1 : 0,
        input.failed ? 1 : 0,
        input.at,
      ],
    );
  }

  async listUsage(ownerId: string) {
    const result = await this.pool.query<{
      integration_id: string;
      operation_count: number;
      denied_count: number;
      failure_count: number;
      last_operation_at: Date | null;
    }>(
      `SELECT integration_id,operation_count,denied_count,failure_count,last_operation_at
       FROM integration_usage WHERE owner_id=$1 ORDER BY integration_id`,
      [ownerId],
    );
    return result.rows.map((row) =>
      IntegrationUsageSchema.parse({
        integrationId: row.integration_id,
        operationCount: Number(row.operation_count),
        deniedCount: Number(row.denied_count),
        failureCount: Number(row.failure_count),
        lastOperationAt: row.last_operation_at?.toISOString() ?? null,
      }),
    );
  }
}

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
  BusinessExecutionRecordSchema, BusinessExternalEventSchema, ExternalMetricObservationSchema, OutcomeAttributionSchema, BusinessEntityMappingSchema, IntegrationSyncCheckpointSchema,
  type BusinessExecutionRecord, type BusinessExternalEvent, type ExternalMetricObservation, type OutcomeAttribution, type BusinessEntityMapping, type IntegrationSyncCheckpoint,
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

  async saveBusinessExecution(value:BusinessExecutionRecord){const parsed=BusinessExecutionRecordSchema.parse(value);await this.pool.query(`INSERT INTO business_execution_records(id,owner_id,integration_id,idempotency_key,status,requested_at,updated_at,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(owner_id,integration_id,idempotency_key) DO UPDATE SET status=$5,updated_at=$7,record=$8`,[parsed.id,parsed.ownerId,parsed.integrationId,parsed.idempotencyKey,parsed.status,parsed.requestedAt,parsed.updatedAt,parsed]);}
  async findBusinessExecution(ownerId:string,integrationId:string,idempotencyKey:string){const result=await this.pool.query<{record:unknown}>("SELECT record FROM business_execution_records WHERE owner_id=$1 AND integration_id=$2 AND idempotency_key=$3",[ownerId,integrationId,idempotencyKey]);return result.rows[0]?BusinessExecutionRecordSchema.parse(result.rows[0].record):undefined;}
  async listBusinessExecutions(ownerId:string,limit:number){const result=await this.pool.query<{record:unknown}>("SELECT record FROM business_execution_records WHERE owner_id=$1 ORDER BY requested_at DESC LIMIT $2",[ownerId,limit]);return result.rows.map((row)=>BusinessExecutionRecordSchema.parse(row.record));}
  async saveExternalEvent(value:BusinessExternalEvent){const parsed=BusinessExternalEventSchema.parse(value);const result=await this.pool.query(`INSERT INTO business_external_events(id,owner_id,integration_id,external_event_id,occurred_at,received_at,record) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(owner_id,integration_id,external_event_id) DO NOTHING`,[parsed.id,parsed.ownerId,parsed.integrationId,parsed.externalEventId,parsed.occurredAt,parsed.receivedAt,parsed]);return (result.rowCount??0)>0;}
  async updateExternalEvent(value:BusinessExternalEvent){const parsed=BusinessExternalEventSchema.parse(value);await this.pool.query("UPDATE business_external_events SET record=$4 WHERE owner_id=$1 AND integration_id=$2 AND external_event_id=$3",[parsed.ownerId,parsed.integrationId,parsed.externalEventId,parsed]);}
  async listExternalEvents(ownerId:string,limit:number){const result=await this.pool.query<{record:unknown}>("SELECT record FROM business_external_events WHERE owner_id=$1 ORDER BY occurred_at DESC LIMIT $2",[ownerId,limit]);return result.rows.map((row)=>BusinessExternalEventSchema.parse(row.record));}
  async saveExternalMetric(value:ExternalMetricObservation){const parsed=ExternalMetricObservationSchema.parse(value);await this.pool.query("INSERT INTO external_metric_observations(id,owner_id,objective_id,experiment_id,metric_id,observed_at,record) VALUES($1,$2,$3,$4,$5,$6,$7)",[parsed.id,parsed.ownerId,parsed.objectiveId,parsed.experimentId,parsed.metricId,parsed.observedAt,parsed]);}
  async listExternalMetrics(ownerId:string,limit:number){const result=await this.pool.query<{record:unknown}>("SELECT record FROM external_metric_observations WHERE owner_id=$1 ORDER BY observed_at DESC LIMIT $2",[ownerId,limit]);return result.rows.map((row)=>ExternalMetricObservationSchema.parse(row.record));}
  async saveAttribution(value:OutcomeAttribution){const parsed=OutcomeAttributionSchema.parse(value);await this.pool.query("INSERT INTO outcome_attributions(id,owner_id,objective_id,experiment_id,created_at,record) VALUES($1,$2,$3,$4,$5,$6)",[parsed.id,parsed.ownerId,parsed.objectiveId,parsed.experimentId,parsed.createdAt,parsed]);}
  async listAttributions(ownerId:string,limit:number){const result=await this.pool.query<{record:unknown}>("SELECT record FROM outcome_attributions WHERE owner_id=$1 ORDER BY created_at DESC LIMIT $2",[ownerId,limit]);return result.rows.map((row)=>OutcomeAttributionSchema.parse(row.record));}
  async saveEntityMapping(value:BusinessEntityMapping){const parsed=BusinessEntityMappingSchema.parse(value);await this.pool.query(`INSERT INTO business_entity_mappings(id,owner_id,integration_id,entity_type,external_id,internal_entity_id,last_synced_at,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(owner_id,integration_id,entity_type,external_id) DO UPDATE SET internal_entity_id=$6,last_synced_at=$7,record=$8`,[parsed.id,parsed.ownerId,parsed.integrationId,parsed.entityType,parsed.externalId,parsed.internalEntityId,parsed.lastSyncedAt,parsed]);}
  async listEntityMappings(ownerId:string){const result=await this.pool.query<{record:unknown}>("SELECT record FROM business_entity_mappings WHERE owner_id=$1 ORDER BY last_synced_at DESC",[ownerId]);return result.rows.map((row)=>BusinessEntityMappingSchema.parse(row.record));}
  async saveSyncCheckpoint(value:IntegrationSyncCheckpoint){const parsed=IntegrationSyncCheckpointSchema.parse(value);await this.pool.query(`INSERT INTO integration_sync_checkpoints(owner_id,integration_id,stream,updated_at,record) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner_id,integration_id,stream) DO UPDATE SET updated_at=$4,record=$5`,[parsed.ownerId,parsed.integrationId,parsed.stream,parsed.updatedAt,parsed]);}
  async listSyncCheckpoints(ownerId:string){const result=await this.pool.query<{record:unknown}>("SELECT record FROM integration_sync_checkpoints WHERE owner_id=$1 ORDER BY integration_id,stream",[ownerId]);return result.rows.map((row)=>IntegrationSyncCheckpointSchema.parse(row.record));}
}

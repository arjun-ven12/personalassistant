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
  BusinessExecutionRecordSchema, BusinessExternalEventSchema, ExternalMetricObservationSchema, OutcomeAttributionSchema, BusinessEntityMappingSchema, IntegrationSyncCheckpointSchema, CommercialFactSchema,
  type BusinessExecutionRecord, type BusinessExternalEvent, type ExternalMetricObservation, type OutcomeAttribution, type BusinessEntityMapping, type IntegrationSyncCheckpoint, type CommercialFact,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { CommercialAggregateReservation,CommercialMutationRecord,CommercialWorkflowRecord,IntegrationStore } from "./store.js";
import { companyScope } from "../companies/scope.js";

export class PostgresIntegrationStore implements IntegrationStore {
  constructor(readonly pool: Pool) {}

  async upsertIntegration(integration: IntegrationRecord) {
    const parsed = IntegrationRecordSchema.parse(integration);
    await this.pool.query(
      `INSERT INTO integrations(id,owner_id,provider,category,status,installed_at,updated_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (owner_id,company_id,id) DO UPDATE
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
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async findIntegration(ownerId: string, integrationId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM integrations WHERE owner_id=$1 AND id=$2 AND ($3::uuid IS NULL OR company_id=$3)",
      [ownerId, integrationId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows[0]
      ? IntegrationRecordSchema.parse(result.rows[0].record)
      : undefined;
  }

  async listIntegrations(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM integrations WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY provider ASC",
      [ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => IntegrationRecordSchema.parse(row.record));
  }

  async savePermission(permission: IntegrationPermission) {
    const parsed = IntegrationPermissionSchema.parse(permission);
    await this.pool.query(
      `INSERT INTO integration_permissions(
        id,owner_id,integration_id,capability_id,state,updated_at,record,company_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (owner_id,company_id,integration_id,capability_id) DO UPDATE
       SET state=$5,updated_at=$6,record=$7`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.integrationId,
        parsed.capabilityId,
        parsed.state,
        parsed.updatedAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listPermissions(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM integration_permissions WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY integration_id,capability_id",
      [ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => IntegrationPermissionSchema.parse(row.record));
  }

  async findPermission(ownerId: string, integrationId: string, capabilityId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM integration_permissions
       WHERE owner_id=$1 AND integration_id=$2 AND capability_id=$3
       AND ($4::uuid IS NULL OR company_id=$4)`,
      [ownerId, integrationId, capabilityId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows[0]
      ? IntegrationPermissionSchema.parse(result.rows[0].record)
      : undefined;
  }

  async saveHealth(ownerId: string, health: IntegrationHealth) {
    const parsed = IntegrationHealthSchema.parse(health);
    const context = companyScope.current(ownerId);
    if (!context) throw new Error("Company context is required for integration health.");
    await this.pool.query(
      `INSERT INTO integration_health(integration_id,state,checked_at,record,owner_id,company_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (owner_id,company_id,integration_id) DO UPDATE
       SET state=$2,checked_at=$3,record=$4`,
      [parsed.integrationId, parsed.state, parsed.checkedAt, parsed, ownerId, context.companyId],
    );
  }

  async listHealth(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT h.record
       FROM integration_health h
       JOIN integrations i ON i.id=h.integration_id AND i.owner_id=h.owner_id AND i.company_id=h.company_id
       WHERE h.owner_id=$1 AND ($2::uuid IS NULL OR h.company_id=$2)
       ORDER BY h.integration_id`,
      [ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => IntegrationHealthSchema.parse(row.record));
  }

  async saveOperation(operation: IntegrationOperationRecord) {
    const parsed = IntegrationOperationRecordSchema.parse(operation);
    await this.pool.query(
      `INSERT INTO integration_events(
        id,owner_id,integration_id,capability_id,operation,status,requested_at,updated_at,record,company_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listOperations(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM integration_events WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY requested_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
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
        owner_id,integration_id,operation_count,denied_count,failure_count,last_operation_at,company_id
       ) VALUES ($1,$2,1,$3,$4,$5,$6)
       ON CONFLICT (owner_id,company_id,integration_id) DO UPDATE
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
        companyScope.companyId(input.ownerId) ?? null,
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
       FROM integration_usage WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY integration_id`,
      [ownerId, companyScope.companyId(ownerId) ?? null],
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

  async saveBusinessExecution(value:BusinessExecutionRecord){const parsed=BusinessExecutionRecordSchema.parse(value);await this.pool.query(`INSERT INTO business_execution_records(id,owner_id,integration_id,idempotency_key,status,requested_at,updated_at,record,company_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(owner_id,company_id,integration_id,idempotency_key) DO UPDATE SET status=$5,updated_at=$7,record=$8`,[parsed.id,parsed.ownerId,parsed.integrationId,parsed.idempotencyKey,parsed.status,parsed.requestedAt,parsed.updatedAt,parsed,companyScope.companyId(parsed.ownerId)??null]);}
  async findBusinessExecution(ownerId:string,integrationId:string,idempotencyKey:string){const result=await this.pool.query<{record:unknown}>("SELECT record FROM business_execution_records WHERE owner_id=$1 AND integration_id=$2 AND idempotency_key=$3 AND ($4::uuid IS NULL OR company_id=$4)",[ownerId,integrationId,idempotencyKey,companyScope.companyId(ownerId)??null]);return result.rows[0]?BusinessExecutionRecordSchema.parse(result.rows[0].record):undefined;}
  async listBusinessExecutions(ownerId:string,limit:number){const result=await this.pool.query<{record:unknown}>("SELECT record FROM business_execution_records WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY requested_at DESC LIMIT $2",[ownerId,limit,companyScope.companyId(ownerId)??null]);return result.rows.map((row)=>BusinessExecutionRecordSchema.parse(row.record));}
  async saveExternalEvent(value:BusinessExternalEvent){const parsed=BusinessExternalEventSchema.parse(value);const result=await this.pool.query(`INSERT INTO business_external_events(id,owner_id,integration_id,external_event_id,occurred_at,received_at,record,company_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(owner_id,company_id,integration_id,external_event_id) DO NOTHING`,[parsed.id,parsed.ownerId,parsed.integrationId,parsed.externalEventId,parsed.occurredAt,parsed.receivedAt,parsed,companyScope.companyId(parsed.ownerId)??null]);return (result.rowCount??0)>0;}
  async updateExternalEvent(value:BusinessExternalEvent){const parsed=BusinessExternalEventSchema.parse(value);await this.pool.query("UPDATE business_external_events SET record=$4 WHERE owner_id=$1 AND integration_id=$2 AND external_event_id=$3 AND ($5::uuid IS NULL OR company_id=$5)",[parsed.ownerId,parsed.integrationId,parsed.externalEventId,parsed,companyScope.companyId(parsed.ownerId)??null]);}
  async listExternalEvents(ownerId:string,limit:number){const result=await this.pool.query<{record:unknown}>("SELECT record FROM business_external_events WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY occurred_at DESC LIMIT $2",[ownerId,limit,companyScope.companyId(ownerId)??null]);return result.rows.map((row)=>BusinessExternalEventSchema.parse(row.record));}
  async saveExternalMetric(value:ExternalMetricObservation){const parsed=ExternalMetricObservationSchema.parse(value);await this.pool.query("INSERT INTO external_metric_observations(id,owner_id,objective_id,experiment_id,metric_id,observed_at,record,company_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[parsed.id,parsed.ownerId,parsed.objectiveId,parsed.experimentId,parsed.metricId,parsed.observedAt,parsed,companyScope.companyId(parsed.ownerId)??null]);}
  async listExternalMetrics(ownerId:string,limit:number){const result=await this.pool.query<{record:unknown}>("SELECT record FROM external_metric_observations WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY observed_at DESC LIMIT $2",[ownerId,limit,companyScope.companyId(ownerId)??null]);return result.rows.map((row)=>ExternalMetricObservationSchema.parse(row.record));}
  async saveAttribution(value:OutcomeAttribution){const parsed=OutcomeAttributionSchema.parse(value);await this.pool.query("INSERT INTO outcome_attributions(id,owner_id,objective_id,experiment_id,created_at,record,company_id) VALUES($1,$2,$3,$4,$5,$6,$7)",[parsed.id,parsed.ownerId,parsed.objectiveId,parsed.experimentId,parsed.createdAt,parsed,companyScope.companyId(parsed.ownerId)??null]);}
  async listAttributions(ownerId:string,limit:number){const result=await this.pool.query<{record:unknown}>("SELECT record FROM outcome_attributions WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY created_at DESC LIMIT $2",[ownerId,limit,companyScope.companyId(ownerId)??null]);return result.rows.map((row)=>OutcomeAttributionSchema.parse(row.record));}
  async saveEntityMapping(value:BusinessEntityMapping){const parsed=BusinessEntityMappingSchema.parse(value);await this.pool.query(`INSERT INTO business_entity_mappings(id,owner_id,integration_id,entity_type,external_id,internal_entity_id,last_synced_at,record,company_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(owner_id,company_id,integration_id,entity_type,external_id) DO UPDATE SET internal_entity_id=$6,last_synced_at=$7,record=$8`,[parsed.id,parsed.ownerId,parsed.integrationId,parsed.entityType,parsed.externalId,parsed.internalEntityId,parsed.lastSyncedAt,parsed,companyScope.companyId(parsed.ownerId)??null]);}
  async listEntityMappings(ownerId:string){const result=await this.pool.query<{record:unknown}>("SELECT record FROM business_entity_mappings WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY last_synced_at DESC",[ownerId,companyScope.companyId(ownerId)??null]);return result.rows.map((row)=>BusinessEntityMappingSchema.parse(row.record));}
  async saveSyncCheckpoint(value:IntegrationSyncCheckpoint){const parsed=IntegrationSyncCheckpointSchema.parse(value);await this.pool.query(`INSERT INTO integration_sync_checkpoints(owner_id,integration_id,stream,updated_at,record,company_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_id,company_id,integration_id,stream) DO UPDATE SET updated_at=$4,record=$5`,[parsed.ownerId,parsed.integrationId,parsed.stream,parsed.updatedAt,parsed,companyScope.companyId(parsed.ownerId)??null]);}
  async listSyncCheckpoints(ownerId:string){const result=await this.pool.query<{record:unknown}>("SELECT record FROM integration_sync_checkpoints WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY integration_id,stream",[ownerId,companyScope.companyId(ownerId)??null]);return result.rows.map((row)=>IntegrationSyncCheckpointSchema.parse(row.record));}
  async saveCommercialFact(value:CommercialFact){const parsed=CommercialFactSchema.parse(value);const result=await this.pool.query(`INSERT INTO commercial_facts(id,owner_id,company_id,canonical_event_id,source_role,occurred_at,record) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(owner_id,company_id,canonical_event_id,source_role) DO UPDATE SET occurred_at=EXCLUDED.occurred_at,record=EXCLUDED.record WHERE commercial_facts.source_role<>'BOOK_REVENUE' AND commercial_facts.occurred_at<EXCLUDED.occurred_at`,[parsed.id,parsed.ownerId,parsed.companyId,parsed.canonicalEventId,parsed.sourceRole,parsed.occurredAt,parsed]);return (result.rowCount??0)>0;}
  async listCommercialFacts(ownerId:string,limit:number){const result=await this.pool.query<{record:unknown}>("SELECT record FROM commercial_facts WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY occurred_at DESC LIMIT $2",[ownerId,limit,companyScope.companyId(ownerId)??null]);return result.rows.map((row)=>CommercialFactSchema.parse(row.record));}
  async acquireCommercialMutationLease(input:{ownerId:string;companyId:string;provider:string;resourceType:string;resourceId:string;token:string;now:string;expiresAt:string}){const result=await this.pool.query<{fence:string;lease_expires_at:Date}>(`INSERT INTO commercial_mutation_leases(owner_id,company_id,provider,resource_type,resource_id,lease_token,fence,lease_expires_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,1,$8,$7) ON CONFLICT(owner_id,company_id,provider,resource_type,resource_id) DO UPDATE SET lease_token=$6,fence=commercial_mutation_leases.fence+1,lease_expires_at=$8,updated_at=$7 WHERE commercial_mutation_leases.lease_expires_at<=$7 RETURNING fence,lease_expires_at`,[input.ownerId,input.companyId,input.provider,input.resourceType,input.resourceId,input.token,input.now,input.expiresAt]);const row=result.rows[0];return row?{key:`${input.ownerId}:${input.companyId}:${input.provider}:${input.resourceType}:${input.resourceId}`,token:input.token,fence:Number(row.fence),expiresAt:row.lease_expires_at.toISOString()}:null;}
  async validateCommercialMutationLease(input:{ownerId:string;companyId:string;provider:string;resourceType:string;resourceId:string;token:string;fence:number;now:string}){const result=await this.pool.query("SELECT 1 FROM commercial_mutation_leases WHERE owner_id=$1 AND company_id=$2 AND provider=$3 AND resource_type=$4 AND resource_id=$5 AND lease_token=$6 AND fence=$7 AND lease_expires_at>$8",[input.ownerId,input.companyId,input.provider,input.resourceType,input.resourceId,input.token,input.fence,input.now]);return (result.rowCount??0)>0;}
  async releaseCommercialMutationLease(input:{ownerId:string;companyId:string;provider:string;resourceType:string;resourceId:string;token:string;fence:number}){const result=await this.pool.query("DELETE FROM commercial_mutation_leases WHERE owner_id=$1 AND company_id=$2 AND provider=$3 AND resource_type=$4 AND resource_id=$5 AND lease_token=$6 AND fence=$7",[input.ownerId,input.companyId,input.provider,input.resourceType,input.resourceId,input.token,input.fence]);return (result.rowCount??0)>0;}
  async findLastCommercialMutation(input:{ownerId:string;companyId:string;provider:string;resourceType:string;resourceId:string;capability:string}){const result=await this.pool.query<{record:CommercialMutationRecord}>("SELECT record FROM commercial_mutation_history WHERE owner_id=$1 AND company_id=$2 AND provider=$3 AND resource_type=$4 AND resource_id=$5 AND capability=$6 ORDER BY succeeded_at DESC LIMIT 1",[input.ownerId,input.companyId,input.provider,input.resourceType,input.resourceId,input.capability]);return result.rows[0]?.record;}
  async recordCommercialMutation(value:CommercialMutationRecord){await this.pool.query(`INSERT INTO commercial_mutation_history(owner_id,company_id,provider,resource_type,resource_id,capability,idempotency_key,succeeded_at,fence,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(owner_id,company_id,provider,idempotency_key) DO NOTHING`,[value.ownerId,value.companyId,value.provider,value.resourceType,value.resourceId,value.capability,value.idempotencyKey,value.succeededAt,value.fence,value]);}
  async reserveCommercialAggregate(input:{reservation:CommercialAggregateReservation;limitMinor:number}){const client=await this.pool.connect();try{await client.query("BEGIN");const r=input.reservation;await client.query(`INSERT INTO commercial_aggregate_buckets(owner_id,company_id,provider,action_class,currency,day_key,consumed_minor,updated_at) VALUES($1,$2,$3,$4,$5,$6,0,$7) ON CONFLICT DO NOTHING`,[r.ownerId,r.companyId,r.provider,r.actionClass,r.currency,r.dayKey,r.updatedAt]);const prior=await client.query<{amount_minor:string;idempotency_key:string}>("SELECT amount_minor,idempotency_key FROM commercial_aggregate_reservations WHERE id=$1 FOR UPDATE",[r.id]);const bucket=await client.query<{consumed_minor:string}>("SELECT consumed_minor FROM commercial_aggregate_buckets WHERE owner_id=$1 AND company_id=$2 AND provider=$3 AND action_class=$4 AND currency=$5 AND day_key=$6 FOR UPDATE",[r.ownerId,r.companyId,r.provider,r.actionClass,r.currency,r.dayKey]);const consumed=BigInt(bucket.rows[0]?.consumed_minor??0);if(prior.rows[0]){if(Number(prior.rows[0].amount_minor)!==r.amountMinor||prior.rows[0].idempotency_key!==r.idempotencyKey)throw new Error("Aggregate reservation identity conflict.");await client.query("COMMIT");return {accepted:true,consumedMinor:Number(consumed)};}const next=consumed+BigInt(r.amountMinor);if(next>BigInt(input.limitMinor)){await client.query("ROLLBACK");return {accepted:false,consumedMinor:Number(consumed)};}await client.query(`INSERT INTO commercial_aggregate_reservations(id,owner_id,company_id,provider,action_class,currency,day_key,amount_minor,idempotency_key,status,created_at,updated_at,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'RESERVED',$10,$11,$12)`,[r.id,r.ownerId,r.companyId,r.provider,r.actionClass,r.currency,r.dayKey,r.amountMinor,r.idempotencyKey,r.createdAt,r.updatedAt,r]);await client.query("UPDATE commercial_aggregate_buckets SET consumed_minor=$7,updated_at=$8 WHERE owner_id=$1 AND company_id=$2 AND provider=$3 AND action_class=$4 AND currency=$5 AND day_key=$6",[r.ownerId,r.companyId,r.provider,r.actionClass,r.currency,r.dayKey,next.toString(),r.updatedAt]);await client.query("COMMIT");return {accepted:true,consumedMinor:Number(next)};}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}
  async settleCommercialAggregate(id:string,status:"COMMITTED"|"RELEASED"){const client=await this.pool.connect();try{await client.query("BEGIN");const result=await client.query<{owner_id:string;company_id:string;provider:string;action_class:string;currency:string;day_key:string;amount_minor:string;status:string;record:CommercialAggregateReservation}>("SELECT * FROM commercial_aggregate_reservations WHERE id=$1 FOR UPDATE",[id]);const row=result.rows[0];if(!row||row.status!=="RESERVED"){await client.query("ROLLBACK");return false;}if(status==="RELEASED")await client.query("UPDATE commercial_aggregate_buckets SET consumed_minor=consumed_minor-$7,updated_at=now() WHERE owner_id=$1 AND company_id=$2 AND provider=$3 AND action_class=$4 AND currency=$5 AND day_key=$6",[row.owner_id,row.company_id,row.provider,row.action_class,row.currency,row.day_key,row.amount_minor]);await client.query("UPDATE commercial_aggregate_reservations SET status=$2,updated_at=now(),record=jsonb_set(record,'{status}',to_jsonb($2::text)) WHERE id=$1",[id,status]);await client.query("COMMIT");return true;}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}
  async saveCommercialWorkflow(value:CommercialWorkflowRecord){const result=await this.pool.query<{record:CommercialWorkflowRecord}>(`INSERT INTO commercial_workflow_runs(id,owner_id,company_id,template,trigger_key,status,step,updated_at,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(owner_id,company_id,template,trigger_key) DO UPDATE SET status=CASE WHEN commercial_workflow_runs.id=$1 THEN $6 ELSE commercial_workflow_runs.status END,step=CASE WHEN commercial_workflow_runs.id=$1 THEN $7 ELSE commercial_workflow_runs.step END,updated_at=CASE WHEN commercial_workflow_runs.id=$1 THEN $8 ELSE commercial_workflow_runs.updated_at END,record=CASE WHEN commercial_workflow_runs.id=$1 THEN $9 ELSE commercial_workflow_runs.record END RETURNING record`,[value.id,value.ownerId,value.companyId,value.template,value.triggerKey,value.status,value.step,value.updatedAt,value]);return result.rows[0]!.record;}
  async findCommercialWorkflow(ownerId:string,companyId:string,template:CommercialWorkflowRecord["template"],triggerKey:string){const result=await this.pool.query<{record:CommercialWorkflowRecord}>("SELECT record FROM commercial_workflow_runs WHERE owner_id=$1 AND company_id=$2 AND template=$3 AND trigger_key=$4",[ownerId,companyId,template,triggerKey]);return result.rows[0]?.record;}
  async transitionCommercialWorkflow(value:CommercialWorkflowRecord,expectedStep:number,expectedStatus:CommercialWorkflowRecord["status"]){const result=await this.pool.query("UPDATE commercial_workflow_runs SET status=$2,step=$3,updated_at=$4,record=$5 WHERE id=$1 AND owner_id=$6 AND company_id=$7 AND step=$8 AND status=$9",[value.id,value.status,value.step,value.updatedAt,value,value.ownerId,value.companyId,expectedStep,expectedStatus]);return (result.rowCount??0)>0;}
}

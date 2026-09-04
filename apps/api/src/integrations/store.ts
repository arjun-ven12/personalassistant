import {
  IntegrationHealthSchema,
  IntegrationOperationRecordSchema,
  IntegrationPermissionSchema,
  IntegrationRecordSchema,
  IntegrationUsageSchema,
  BusinessExecutionRecordSchema,
  BusinessExternalEventSchema,
  ExternalMetricObservationSchema,
  OutcomeAttributionSchema,
  BusinessEntityMappingSchema,
  IntegrationSyncCheckpointSchema,
  CommercialFactSchema,
  type IntegrationHealth,
  type IntegrationOperationRecord,
  type IntegrationPermission,
  type IntegrationRecord,
  type IntegrationUsage,
  type BusinessExecutionRecord,
  type BusinessExternalEvent,
  type ExternalMetricObservation,
  type OutcomeAttribution,
  type BusinessEntityMapping,
  type IntegrationSyncCheckpoint,
  type CommercialFact,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";
import { companyScope } from "../companies/scope.js";

const scopeKey = (ownerId: string, id: string) => `${ownerId}:${companyScope.companyId(ownerId) ?? "owner-default"}:${id}`;
const scopePrefix = (ownerId: string) => `${ownerId}:${companyScope.companyId(ownerId) ?? "owner-default"}:`;

export type CommercialActionClass="PAYMENT_EXECUTION"|"REFUND"|"AD_SPEND_INCREASE"|"DISCOUNT_IMPACT"|"INVENTORY_VALUE_ADJUSTMENT";
export interface CommercialMutationLease {key:string;token:string;fence:number;expiresAt:string;}
export interface CommercialMutationRecord {ownerId:string;companyId:string;provider:string;resourceType:string;resourceId:string;capability:string;idempotencyKey:string;succeededAt:string;fence:number;}
export interface CommercialAggregateReservation {id:string;ownerId:string;companyId:string;provider:string;actionClass:CommercialActionClass;currency:string;dayKey:string;amountMinor:number;idempotencyKey:string;status:"RESERVED"|"COMMITTED"|"RELEASED";createdAt:string;updatedAt:string;}
export interface CommercialWorkflowRecord {id:string;ownerId:string;companyId:string;template:"REFUND"|"ACCOUNTS_RECEIVABLE"|"INVENTORY"|"CAMPAIGN_OPTIMIZATION";triggerKey:string;status:"PLANNED"|"WAITING_APPROVAL"|"EXECUTING"|"RECONCILING"|"COMPLETED"|"BLOCKED";step:number;state:Record<string,unknown>;createdAt:string;updatedAt:string;}

export interface IntegrationStore {
  upsertIntegration(integration: IntegrationRecord): Awaitable<void>;
  findIntegration(
    ownerId: string,
    integrationId: string,
  ): Awaitable<IntegrationRecord | undefined>;
  listIntegrations(ownerId: string): Awaitable<IntegrationRecord[]>;
  savePermission(permission: IntegrationPermission): Awaitable<void>;
  listPermissions(ownerId: string): Awaitable<IntegrationPermission[]>;
  findPermission(
    ownerId: string,
    integrationId: string,
    capabilityId: string,
  ): Awaitable<IntegrationPermission | undefined>;
  saveHealth(ownerId: string, health: IntegrationHealth): Awaitable<void>;
  listHealth(ownerId: string): Awaitable<IntegrationHealth[]>;
  saveOperation(operation: IntegrationOperationRecord): Awaitable<void>;
  listOperations(
    ownerId: string,
    limit: number,
  ): Awaitable<IntegrationOperationRecord[]>;
  incrementUsage(input: {
    ownerId: string;
    integrationId: string;
    denied?: boolean;
    failed?: boolean;
    at: string;
  }): Awaitable<void>;
  listUsage(ownerId: string): Awaitable<IntegrationUsage[]>;
  saveBusinessExecution(record: BusinessExecutionRecord): Awaitable<void>;
  findBusinessExecution(ownerId: string, integrationId: string, idempotencyKey: string): Awaitable<BusinessExecutionRecord | undefined>;
  listBusinessExecutions(ownerId: string, limit: number): Awaitable<BusinessExecutionRecord[]>;
  saveExternalEvent(event: BusinessExternalEvent): Awaitable<boolean>;
  updateExternalEvent(event: BusinessExternalEvent): Awaitable<void>;
  listExternalEvents(ownerId: string, limit: number): Awaitable<BusinessExternalEvent[]>;
  saveExternalMetric(observation: ExternalMetricObservation): Awaitable<void>;
  listExternalMetrics(ownerId: string, limit: number): Awaitable<ExternalMetricObservation[]>;
  saveAttribution(attribution: OutcomeAttribution): Awaitable<void>;
  listAttributions(ownerId: string, limit: number): Awaitable<OutcomeAttribution[]>;
  saveEntityMapping(mapping: BusinessEntityMapping): Awaitable<void>;
  listEntityMappings(ownerId: string): Awaitable<BusinessEntityMapping[]>;
  saveSyncCheckpoint(checkpoint: IntegrationSyncCheckpoint): Awaitable<void>;
  listSyncCheckpoints(ownerId: string): Awaitable<IntegrationSyncCheckpoint[]>;
  saveCommercialFact(fact: CommercialFact): Awaitable<boolean>;
  listCommercialFacts(ownerId: string, limit: number): Awaitable<CommercialFact[]>;
  acquireCommercialMutationLease(input:{ownerId:string;companyId:string;provider:string;resourceType:string;resourceId:string;token:string;now:string;expiresAt:string}):Awaitable<CommercialMutationLease|null>;
  validateCommercialMutationLease(input:{ownerId:string;companyId:string;provider:string;resourceType:string;resourceId:string;token:string;fence:number;now:string}):Awaitable<boolean>;
  releaseCommercialMutationLease(input:{ownerId:string;companyId:string;provider:string;resourceType:string;resourceId:string;token:string;fence:number}):Awaitable<boolean>;
  findLastCommercialMutation(input:{ownerId:string;companyId:string;provider:string;resourceType:string;resourceId:string;capability:string}):Awaitable<CommercialMutationRecord|undefined>;
  recordCommercialMutation(record:CommercialMutationRecord):Awaitable<void>;
  reserveCommercialAggregate(input:{reservation:CommercialAggregateReservation;limitMinor:number}):Awaitable<{accepted:boolean;consumedMinor:number}>;
  settleCommercialAggregate(id:string,status:"COMMITTED"|"RELEASED"):Awaitable<boolean>;
  saveCommercialWorkflow(record:CommercialWorkflowRecord):Awaitable<CommercialWorkflowRecord>;
  findCommercialWorkflow(ownerId:string,companyId:string,template:CommercialWorkflowRecord["template"],triggerKey:string):Awaitable<CommercialWorkflowRecord|undefined>;
  transitionCommercialWorkflow(record:CommercialWorkflowRecord,expectedStep:number,expectedStatus:CommercialWorkflowRecord["status"]):Awaitable<boolean>;
}

export class InMemoryIntegrationStore implements IntegrationStore {
  readonly #integrations = new Map<string, IntegrationRecord>();
  readonly #permissions = new Map<string, IntegrationPermission>();
  readonly #health = new Map<string, IntegrationHealth>();
  readonly #operations = new Map<string, IntegrationOperationRecord>();
  readonly #usage = new Map<string, IntegrationUsage & { ownerId: string }>();
  readonly #businessExecutions = new Map<string, BusinessExecutionRecord>();
  readonly #externalEvents = new Map<string, BusinessExternalEvent>();
  readonly #externalMetrics = new Map<string, ExternalMetricObservation>();
  readonly #attributions = new Map<string, OutcomeAttribution>();
  readonly #mappings = new Map<string, BusinessEntityMapping>();
  readonly #checkpoints = new Map<string, IntegrationSyncCheckpoint>();
  readonly #commercialFacts = new Map<string, CommercialFact>();
  readonly #commercialLeases=new Map<string,CommercialMutationLease>();
  readonly #commercialMutations=new Map<string,CommercialMutationRecord>();
  readonly #aggregateReservations=new Map<string,CommercialAggregateReservation>();
  readonly #aggregateBuckets=new Map<string,bigint>();
  readonly #commercialWorkflows=new Map<string,CommercialWorkflowRecord>();

  upsertIntegration(integration: IntegrationRecord) {
    const parsed = IntegrationRecordSchema.parse(integration);
    this.#integrations.set(scopeKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  findIntegration(ownerId: string, integrationId: string) {
    const integration = this.#integrations.get(scopeKey(ownerId, integrationId));
    return integration ? structuredClone(integration) : undefined;
  }

  listIntegrations(ownerId: string) {
    return [...this.#integrations.entries()]
      .filter(([key,integration]) => key.startsWith(scopePrefix(ownerId)) && integration.ownerId === ownerId)
      .map(([,integration])=>integration)
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .map((integration) => structuredClone(integration));
  }

  savePermission(permission: IntegrationPermission) {
    const parsed = IntegrationPermissionSchema.parse(permission);
    this.#permissions.set(
      scopeKey(parsed.ownerId, `${parsed.integrationId}:${parsed.capabilityId}`),
      structuredClone(parsed),
    );
  }

  listPermissions(ownerId: string) {
    return [...this.#permissions.entries()]
      .filter(([key,permission]) => key.startsWith(scopePrefix(ownerId)) && permission.ownerId === ownerId)
      .map(([,permission])=>permission)
      .map((permission) => structuredClone(permission));
  }

  findPermission(ownerId: string, integrationId: string, capabilityId: string) {
    const permission = this.#permissions.get(
      scopeKey(ownerId, `${integrationId}:${capabilityId}`),
    );
    return permission ? structuredClone(permission) : undefined;
  }

  saveHealth(ownerId: string, health: IntegrationHealth) {
    const parsed = IntegrationHealthSchema.parse(health);
    this.#health.set(scopeKey(ownerId, parsed.integrationId), structuredClone(parsed));
  }

  listHealth(ownerId: string) {
    const integrationIds = new Set(
      [...this.#integrations.entries()]
        .filter(([key,integration]) => key.startsWith(scopePrefix(ownerId)) && integration.ownerId === ownerId)
        .map(([,integration])=>integration)
        .map((integration) => integration.id),
    );
    return [...this.#health.entries()]
      .filter(([key, health]) => key.startsWith(scopePrefix(ownerId)) && integrationIds.has(health.integrationId))
      .map(([, health]) => health)
      .map((health) => structuredClone(health));
  }

  saveOperation(operation: IntegrationOperationRecord) {
    const parsed = IntegrationOperationRecordSchema.parse(operation);
    this.#operations.set(scopeKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  listOperations(ownerId: string, limit: number) {
    return [...this.#operations.entries()]
      .filter(([key, operation]) => key.startsWith(scopePrefix(ownerId)) && operation.ownerId === ownerId)
      .map(([, operation]) => operation)
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
      .slice(0, limit)
      .map((operation) => structuredClone(operation));
  }

  incrementUsage(input: {
    ownerId: string;
    integrationId: string;
    denied?: boolean;
    failed?: boolean;
    at: string;
  }) {
    const key = scopeKey(input.ownerId, input.integrationId);
    const current =
      this.#usage.get(key) ??
      IntegrationUsageSchema.parse({
        integrationId: input.integrationId,
        operationCount: 0,
        deniedCount: 0,
        failureCount: 0,
        lastOperationAt: null,
      });
    this.#usage.set(key, {
      ...current,
      ownerId: input.ownerId,
      operationCount: current.operationCount + 1,
      deniedCount: current.deniedCount + (input.denied ? 1 : 0),
      failureCount: current.failureCount + (input.failed ? 1 : 0),
      lastOperationAt: input.at,
    });
  }

  listUsage(ownerId: string) {
    return [...this.#usage.entries()]
      .filter(([key, usage]) => key.startsWith(scopePrefix(ownerId)) && usage.ownerId === ownerId)
      .map(([, usage]) => usage)
      .map((usage) =>
        IntegrationUsageSchema.parse({
          integrationId: usage.integrationId,
          operationCount: usage.operationCount,
          deniedCount: usage.deniedCount,
          failureCount: usage.failureCount,
          lastOperationAt: usage.lastOperationAt,
        }),
      );
  }

  saveBusinessExecution(record: BusinessExecutionRecord) {
    const parsed = BusinessExecutionRecordSchema.parse(record);
    this.#businessExecutions.set(scopeKey(parsed.ownerId, `${parsed.integrationId}:${parsed.idempotencyKey}`), structuredClone(parsed));
  }
  findBusinessExecution(ownerId: string, integrationId: string, idempotencyKey: string) {
    const value = this.#businessExecutions.get(scopeKey(ownerId, `${integrationId}:${idempotencyKey}`));
    return value ? structuredClone(value) : undefined;
  }
  listBusinessExecutions(ownerId: string, limit: number) {
    return [...this.#businessExecutions.entries()].filter(([key,item]) => key.startsWith(scopePrefix(ownerId))&&item.ownerId===ownerId).map(([,item])=>item).sort((a,b) => b.requestedAt.localeCompare(a.requestedAt)).slice(0,limit).map((item) => structuredClone(item));
  }
  saveExternalEvent(event: BusinessExternalEvent) {
    const parsed = BusinessExternalEventSchema.parse(event); const key=scopeKey(parsed.ownerId, `${parsed.integrationId}:${parsed.externalEventId}`);
    if(this.#externalEvents.has(key)) return false; this.#externalEvents.set(key,structuredClone(parsed)); return true;
  }
  updateExternalEvent(event:BusinessExternalEvent){const parsed=BusinessExternalEventSchema.parse(event);this.#externalEvents.set(scopeKey(parsed.ownerId, `${parsed.integrationId}:${parsed.externalEventId}`),structuredClone(parsed));}
  listExternalEvents(ownerId: string, limit: number) { return [...this.#externalEvents.entries()].filter(([key,item])=>key.startsWith(scopePrefix(ownerId))&&item.ownerId===ownerId).map(([,item])=>item).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,limit).map((item)=>structuredClone(item)); }
  saveExternalMetric(value: ExternalMetricObservation) { const parsed=ExternalMetricObservationSchema.parse(value);this.#externalMetrics.set(scopeKey(parsed.ownerId, parsed.id),structuredClone(parsed)); }
  listExternalMetrics(ownerId:string,limit:number){return [...this.#externalMetrics.entries()].filter(([key,item])=>key.startsWith(scopePrefix(ownerId))&&item.ownerId===ownerId).map(([,item])=>item).sort((a,b)=>b.observedAt.localeCompare(a.observedAt)).slice(0,limit).map((item)=>structuredClone(item));}
  saveAttribution(value:OutcomeAttribution){const parsed=OutcomeAttributionSchema.parse(value);this.#attributions.set(scopeKey(parsed.ownerId, parsed.id),structuredClone(parsed));}
  listAttributions(ownerId:string,limit:number){return [...this.#attributions.entries()].filter(([key,item])=>key.startsWith(scopePrefix(ownerId))&&item.ownerId===ownerId).map(([,item])=>item).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,limit).map((item)=>structuredClone(item));}
  saveEntityMapping(value:BusinessEntityMapping){const parsed=BusinessEntityMappingSchema.parse(value);this.#mappings.set(scopeKey(parsed.ownerId, `${parsed.integrationId}:${parsed.entityType}:${parsed.externalId}`),structuredClone(parsed));}
  listEntityMappings(ownerId:string){return [...this.#mappings.entries()].filter(([key,item])=>key.startsWith(scopePrefix(ownerId))&&item.ownerId===ownerId).map(([,item])=>structuredClone(item));}
  saveSyncCheckpoint(value:IntegrationSyncCheckpoint){const parsed=IntegrationSyncCheckpointSchema.parse(value);this.#checkpoints.set(scopeKey(parsed.ownerId, `${parsed.integrationId}:${parsed.stream}`),structuredClone(parsed));}
  listSyncCheckpoints(ownerId:string){return [...this.#checkpoints.entries()].filter(([key,item])=>key.startsWith(scopePrefix(ownerId))&&item.ownerId===ownerId).map(([,item])=>structuredClone(item));}
  saveCommercialFact(value:CommercialFact){const parsed=CommercialFactSchema.parse(value);const key=scopeKey(parsed.ownerId,`${parsed.canonicalEventId}:${parsed.sourceRole}`),current=this.#commercialFacts.get(key);if(current&&(parsed.sourceRole==="BOOK_REVENUE"||current.occurredAt>=parsed.occurredAt))return false;this.#commercialFacts.set(key,structuredClone(parsed));return true;}
  listCommercialFacts(ownerId:string,limit:number){return [...this.#commercialFacts.entries()].filter(([key,item])=>key.startsWith(scopePrefix(ownerId))&&item.ownerId===ownerId).map(([,item])=>item).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,limit).map((item)=>structuredClone(item));}
  acquireCommercialMutationLease(input:{ownerId:string;companyId:string;provider:string;resourceType:string;resourceId:string;token:string;now:string;expiresAt:string}){const key=`${input.ownerId}:${input.companyId}:${input.provider}:${input.resourceType}:${input.resourceId}`;const current=this.#commercialLeases.get(key);if(current&&current.expiresAt>input.now)return null;const lease={key,token:input.token,fence:(current?.fence??0)+1,expiresAt:input.expiresAt};this.#commercialLeases.set(key,lease);return structuredClone(lease);}
  validateCommercialMutationLease(input:{ownerId:string;companyId:string;provider:string;resourceType:string;resourceId:string;token:string;fence:number;now:string}){const current=this.#commercialLeases.get(`${input.ownerId}:${input.companyId}:${input.provider}:${input.resourceType}:${input.resourceId}`);return Boolean(current&&current.token===input.token&&current.fence===input.fence&&current.expiresAt>input.now);}
  releaseCommercialMutationLease(input:{ownerId:string;companyId:string;provider:string;resourceType:string;resourceId:string;token:string;fence:number}){const key=`${input.ownerId}:${input.companyId}:${input.provider}:${input.resourceType}:${input.resourceId}`,current=this.#commercialLeases.get(key);if(!current||current.token!==input.token||current.fence!==input.fence)return false;this.#commercialLeases.delete(key);return true;}
  findLastCommercialMutation(input:{ownerId:string;companyId:string;provider:string;resourceType:string;resourceId:string;capability:string}){const value=this.#commercialMutations.get(`${input.ownerId}:${input.companyId}:${input.provider}:${input.resourceType}:${input.resourceId}:${input.capability}`);return value?structuredClone(value):undefined;}
  recordCommercialMutation(value:CommercialMutationRecord){this.#commercialMutations.set(`${value.ownerId}:${value.companyId}:${value.provider}:${value.resourceType}:${value.resourceId}:${value.capability}`,structuredClone(value));}
  reserveCommercialAggregate(input:{reservation:CommercialAggregateReservation;limitMinor:number}){const existing=this.#aggregateReservations.get(input.reservation.id);const bucketKey=`${input.reservation.ownerId}:${input.reservation.companyId}:${input.reservation.provider}:${input.reservation.actionClass}:${input.reservation.currency}:${input.reservation.dayKey}`;const consumed=this.#aggregateBuckets.get(bucketKey)??0n;if(existing){if(existing.amountMinor!==input.reservation.amountMinor||existing.idempotencyKey!==input.reservation.idempotencyKey)throw new Error("Aggregate reservation identity conflict.");return {accepted:true,consumedMinor:Number(consumed)};}const next=consumed+BigInt(input.reservation.amountMinor);if(next>BigInt(input.limitMinor))return {accepted:false,consumedMinor:Number(consumed)};this.#aggregateReservations.set(input.reservation.id,structuredClone(input.reservation));this.#aggregateBuckets.set(bucketKey,next);return {accepted:true,consumedMinor:Number(next)};}
  settleCommercialAggregate(id:string,status:"COMMITTED"|"RELEASED"){const current=this.#aggregateReservations.get(id);if(!current||current.status!=="RESERVED")return false;if(status==="RELEASED"){const key=`${current.ownerId}:${current.companyId}:${current.provider}:${current.actionClass}:${current.currency}:${current.dayKey}`;this.#aggregateBuckets.set(key,(this.#aggregateBuckets.get(key)??0n)-BigInt(current.amountMinor));}this.#aggregateReservations.set(id,{...current,status,updatedAt:new Date().toISOString()});return true;}
  saveCommercialWorkflow(value:CommercialWorkflowRecord){const key=`${value.ownerId}:${value.companyId}:${value.template}:${value.triggerKey}`,existing=this.#commercialWorkflows.get(key);if(existing&&existing.id!==value.id)return structuredClone(existing);this.#commercialWorkflows.set(key,structuredClone(value));return structuredClone(value);}
  findCommercialWorkflow(ownerId:string,companyId:string,template:CommercialWorkflowRecord["template"],triggerKey:string){const value=this.#commercialWorkflows.get(`${ownerId}:${companyId}:${template}:${triggerKey}`);return value?structuredClone(value):undefined;}
  transitionCommercialWorkflow(value:CommercialWorkflowRecord,expectedStep:number,expectedStatus:CommercialWorkflowRecord["status"]){const key=`${value.ownerId}:${value.companyId}:${value.template}:${value.triggerKey}`,current=this.#commercialWorkflows.get(key);if(!current||current.id!==value.id||current.step!==expectedStep||current.status!==expectedStatus)return false;this.#commercialWorkflows.set(key,structuredClone(value));return true;}
}

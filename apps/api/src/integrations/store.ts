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
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

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
  saveHealth(health: IntegrationHealth): Awaitable<void>;
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

  upsertIntegration(integration: IntegrationRecord) {
    const parsed = IntegrationRecordSchema.parse(integration);
    this.#integrations.set(`${parsed.ownerId}:${parsed.id}`, structuredClone(parsed));
  }

  findIntegration(ownerId: string, integrationId: string) {
    const integration = this.#integrations.get(`${ownerId}:${integrationId}`);
    return integration ? structuredClone(integration) : undefined;
  }

  listIntegrations(ownerId: string) {
    return [...this.#integrations.values()]
      .filter((integration) => integration.ownerId === ownerId)
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .map((integration) => structuredClone(integration));
  }

  savePermission(permission: IntegrationPermission) {
    const parsed = IntegrationPermissionSchema.parse(permission);
    this.#permissions.set(
      `${parsed.ownerId}:${parsed.integrationId}:${parsed.capabilityId}`,
      structuredClone(parsed),
    );
  }

  listPermissions(ownerId: string) {
    return [...this.#permissions.values()]
      .filter((permission) => permission.ownerId === ownerId)
      .map((permission) => structuredClone(permission));
  }

  findPermission(ownerId: string, integrationId: string, capabilityId: string) {
    const permission = this.#permissions.get(
      `${ownerId}:${integrationId}:${capabilityId}`,
    );
    return permission ? structuredClone(permission) : undefined;
  }

  saveHealth(health: IntegrationHealth) {
    const parsed = IntegrationHealthSchema.parse(health);
    this.#health.set(parsed.integrationId, structuredClone(parsed));
  }

  listHealth(ownerId: string) {
    const integrationIds = new Set(
      [...this.#integrations.values()]
        .filter((integration) => integration.ownerId === ownerId)
        .map((integration) => integration.id),
    );
    return [...this.#health.values()]
      .filter((health) => integrationIds.has(health.integrationId))
      .map((health) => structuredClone(health));
  }

  saveOperation(operation: IntegrationOperationRecord) {
    const parsed = IntegrationOperationRecordSchema.parse(operation);
    this.#operations.set(parsed.id, structuredClone(parsed));
  }

  listOperations(ownerId: string, limit: number) {
    return [...this.#operations.values()]
      .filter((operation) => operation.ownerId === ownerId)
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
    const key = `${input.ownerId}:${input.integrationId}`;
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
    return [...this.#usage.values()]
      .filter((usage) => usage.ownerId === ownerId)
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
    this.#businessExecutions.set(`${parsed.ownerId}:${parsed.integrationId}:${parsed.idempotencyKey}`, structuredClone(parsed));
  }
  findBusinessExecution(ownerId: string, integrationId: string, idempotencyKey: string) {
    const value = this.#businessExecutions.get(`${ownerId}:${integrationId}:${idempotencyKey}`);
    return value ? structuredClone(value) : undefined;
  }
  listBusinessExecutions(ownerId: string, limit: number) {
    return [...this.#businessExecutions.values()].filter((item) => item.ownerId === ownerId).sort((a,b) => b.requestedAt.localeCompare(a.requestedAt)).slice(0,limit).map((item) => structuredClone(item));
  }
  saveExternalEvent(event: BusinessExternalEvent) {
    const parsed = BusinessExternalEventSchema.parse(event); const key=`${parsed.ownerId}:${parsed.integrationId}:${parsed.externalEventId}`;
    if(this.#externalEvents.has(key)) return false; this.#externalEvents.set(key,structuredClone(parsed)); return true;
  }
  updateExternalEvent(event:BusinessExternalEvent){const parsed=BusinessExternalEventSchema.parse(event);this.#externalEvents.set(`${parsed.ownerId}:${parsed.integrationId}:${parsed.externalEventId}`,structuredClone(parsed));}
  listExternalEvents(ownerId: string, limit: number) { return [...this.#externalEvents.values()].filter((item)=>item.ownerId===ownerId).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,limit).map((item)=>structuredClone(item)); }
  saveExternalMetric(value: ExternalMetricObservation) { const parsed=ExternalMetricObservationSchema.parse(value);this.#externalMetrics.set(parsed.id,structuredClone(parsed)); }
  listExternalMetrics(ownerId:string,limit:number){return [...this.#externalMetrics.values()].filter((item)=>item.ownerId===ownerId).sort((a,b)=>b.observedAt.localeCompare(a.observedAt)).slice(0,limit).map((item)=>structuredClone(item));}
  saveAttribution(value:OutcomeAttribution){const parsed=OutcomeAttributionSchema.parse(value);this.#attributions.set(parsed.id,structuredClone(parsed));}
  listAttributions(ownerId:string,limit:number){return [...this.#attributions.values()].filter((item)=>item.ownerId===ownerId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,limit).map((item)=>structuredClone(item));}
  saveEntityMapping(value:BusinessEntityMapping){const parsed=BusinessEntityMappingSchema.parse(value);this.#mappings.set(`${parsed.ownerId}:${parsed.integrationId}:${parsed.entityType}:${parsed.externalId}`,structuredClone(parsed));}
  listEntityMappings(ownerId:string){return [...this.#mappings.values()].filter((item)=>item.ownerId===ownerId).map((item)=>structuredClone(item));}
  saveSyncCheckpoint(value:IntegrationSyncCheckpoint){const parsed=IntegrationSyncCheckpointSchema.parse(value);this.#checkpoints.set(`${parsed.ownerId}:${parsed.integrationId}:${parsed.stream}`,structuredClone(parsed));}
  listSyncCheckpoints(ownerId:string){return [...this.#checkpoints.values()].filter((item)=>item.ownerId===ownerId).map((item)=>structuredClone(item));}
}

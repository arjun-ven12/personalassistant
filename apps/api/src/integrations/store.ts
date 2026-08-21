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
  type IntegrationUsage,
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
}

export class InMemoryIntegrationStore implements IntegrationStore {
  readonly #integrations = new Map<string, IntegrationRecord>();
  readonly #permissions = new Map<string, IntegrationPermission>();
  readonly #health = new Map<string, IntegrationHealth>();
  readonly #operations = new Map<string, IntegrationOperationRecord>();
  readonly #usage = new Map<string, IntegrationUsage & { ownerId: string }>();

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
}

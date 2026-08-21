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

import type { Awaitable } from "../identity/store.js";

export interface CoreAdapterStore {
  saveSession(record: ApplicationSessionRecord18E): Awaitable<void>;
  listSessions(ownerId: string, limit: number): Awaitable<ApplicationSessionRecord18E[]>;
  saveContextSnapshot(record: ApplicationContextSnapshotRecord): Awaitable<void>;
  listContextSnapshots(
    ownerId: string,
    limit: number,
  ): Awaitable<ApplicationContextSnapshotRecord[]>;
  saveActionHistory(record: AdapterActionHistoryRecord): Awaitable<void>;
  listActionHistory(
    ownerId: string,
    limit: number,
  ): Awaitable<AdapterActionHistoryRecord[]>;
  saveHealthMetric(record: AdapterHealthMetricRecord): Awaitable<void>;
  listHealthMetrics(
    ownerId: string,
    limit: number,
  ): Awaitable<AdapterHealthMetricRecord[]>;
  savePermissionStatus(record: AdapterPermissionStatusRecord): Awaitable<void>;
  listPermissionStatus(
    ownerId: string,
    limit: number,
  ): Awaitable<AdapterPermissionStatusRecord[]>;
  saveSemanticAction(record: SemanticActionHistoryRecord): Awaitable<void>;
  listSemanticActions(
    ownerId: string,
    limit: number,
  ): Awaitable<SemanticActionHistoryRecord[]>;
  saveUsage(record: ApplicationUsageRecord18E): Awaitable<void>;
  listUsage(ownerId: string, limit: number): Awaitable<ApplicationUsageRecord18E[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryCoreAdapterStore implements CoreAdapterStore {
  readonly #sessions = new Map<string, ApplicationSessionRecord18E>();
  readonly #contextSnapshots = new Map<string, ApplicationContextSnapshotRecord>();
  readonly #actions = new Map<string, AdapterActionHistoryRecord>();
  readonly #health = new Map<string, AdapterHealthMetricRecord>();
  readonly #permissions = new Map<string, AdapterPermissionStatusRecord>();
  readonly #semanticActions = new Map<string, SemanticActionHistoryRecord>();
  readonly #usage = new Map<string, ApplicationUsageRecord18E>();

  saveSession(record: ApplicationSessionRecord18E) {
    this.#sessions.set(record.id, clone(ApplicationSessionRecord18ESchema.parse(record)));
  }
  listSessions(ownerId: string, limit: number) {
    return ordered(
      [...this.#sessions.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveContextSnapshot(record: ApplicationContextSnapshotRecord) {
    this.#contextSnapshots.set(
      record.id,
      clone(ApplicationContextSnapshotRecordSchema.parse(record)),
    );
  }
  listContextSnapshots(ownerId: string, limit: number) {
    return ordered(
      [...this.#contextSnapshots.values()].filter((item) => item.ownerId === ownerId),
      "capturedAt",
      limit,
    );
  }
  saveActionHistory(record: AdapterActionHistoryRecord) {
    this.#actions.set(record.id, clone(AdapterActionHistoryRecordSchema.parse(record)));
  }
  listActionHistory(ownerId: string, limit: number) {
    return ordered(
      [...this.#actions.values()].filter((item) => item.ownerId === ownerId),
      "requestedAt",
      limit,
    );
  }
  saveHealthMetric(record: AdapterHealthMetricRecord) {
    this.#health.set(record.id, clone(AdapterHealthMetricRecordSchema.parse(record)));
  }
  listHealthMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#health.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  savePermissionStatus(record: AdapterPermissionStatusRecord) {
    this.#permissions.set(
      `${record.ownerId}:${record.adapterId}:${record.permission}`,
      clone(AdapterPermissionStatusRecordSchema.parse(record)),
    );
  }
  listPermissionStatus(ownerId: string, limit: number) {
    return ordered(
      [...this.#permissions.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveSemanticAction(record: SemanticActionHistoryRecord) {
    this.#semanticActions.set(
      record.id,
      clone(SemanticActionHistoryRecordSchema.parse(record)),
    );
  }
  listSemanticActions(ownerId: string, limit: number) {
    return ordered(
      [...this.#semanticActions.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveUsage(record: ApplicationUsageRecord18E) {
    this.#usage.set(record.id, clone(ApplicationUsageRecord18ESchema.parse(record)));
  }
  listUsage(ownerId: string, limit: number) {
    return ordered(
      [...this.#usage.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
}

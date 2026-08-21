import {
  SemanticFingerprintRecordSchema,
  SemanticIndexerHealthRecordSchema,
  SemanticIndexEventRecordSchema,
  SemanticIndexSessionRecordSchema,
  SemanticIndexVersionRecordSchema,
  SemanticProviderIndexerRecordSchema,
  SemanticRelationshipUpdateRecordSchema,
  SemanticSearchStatisticsRecordSchema,
  type SemanticFingerprintRecord,
  type SemanticIndexerHealthRecord,
  type SemanticIndexEventRecord,
  type SemanticIndexSessionRecord,
  type SemanticIndexVersionRecord,
  type SemanticProviderIndexerRecord,
  type SemanticRelationshipUpdateRecord,
  type SemanticSearchStatisticsRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface DeepIndexerStore {
  saveIndexer(record: SemanticProviderIndexerRecord): Awaitable<void>;
  listIndexers(ownerId: string, limit: number): Awaitable<SemanticProviderIndexerRecord[]>;
  getIndexer(
    ownerId: string,
    indexerId: string,
  ): Awaitable<SemanticProviderIndexerRecord | null>;
  saveSession(record: SemanticIndexSessionRecord): Awaitable<void>;
  listSessions(ownerId: string, limit: number): Awaitable<SemanticIndexSessionRecord[]>;
  saveEvent(record: SemanticIndexEventRecord): Awaitable<void>;
  listEvents(ownerId: string, limit: number): Awaitable<SemanticIndexEventRecord[]>;
  saveVersion(record: SemanticIndexVersionRecord): Awaitable<void>;
  listVersions(ownerId: string, limit: number): Awaitable<SemanticIndexVersionRecord[]>;
  saveFingerprint(record: SemanticFingerprintRecord): Awaitable<void>;
  listFingerprints(ownerId: string, limit: number): Awaitable<SemanticFingerprintRecord[]>;
  saveRelationshipUpdate(record: SemanticRelationshipUpdateRecord): Awaitable<void>;
  listRelationshipUpdates(
    ownerId: string,
    limit: number,
  ): Awaitable<SemanticRelationshipUpdateRecord[]>;
  saveHealth(record: SemanticIndexerHealthRecord): Awaitable<void>;
  listHealth(ownerId: string, limit: number): Awaitable<SemanticIndexerHealthRecord[]>;
  saveSearchStatistics(record: SemanticSearchStatisticsRecord): Awaitable<void>;
  getSearchStatistics(ownerId: string): Awaitable<SemanticSearchStatisticsRecord | null>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryDeepIndexerStore implements DeepIndexerStore {
  readonly #indexers = new Map<string, SemanticProviderIndexerRecord>();
  readonly #sessions = new Map<string, SemanticIndexSessionRecord>();
  readonly #events = new Map<string, SemanticIndexEventRecord>();
  readonly #versions = new Map<string, SemanticIndexVersionRecord>();
  readonly #fingerprints = new Map<string, SemanticFingerprintRecord>();
  readonly #relationshipUpdates = new Map<string, SemanticRelationshipUpdateRecord>();
  readonly #health = new Map<string, SemanticIndexerHealthRecord>();
  readonly #searchStatistics = new Map<string, SemanticSearchStatisticsRecord>();

  saveIndexer(record: SemanticProviderIndexerRecord) {
    this.#indexers.set(
      `${record.ownerId}:${record.id}`,
      clone(SemanticProviderIndexerRecordSchema.parse(record)),
    );
  }
  listIndexers(ownerId: string, limit: number) {
    return ordered(
      [...this.#indexers.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getIndexer(ownerId: string, indexerId: string) {
    return clone(this.#indexers.get(`${ownerId}:${indexerId}`) ?? null);
  }
  saveSession(record: SemanticIndexSessionRecord) {
    this.#sessions.set(record.id, clone(SemanticIndexSessionRecordSchema.parse(record)));
  }
  listSessions(ownerId: string, limit: number) {
    return ordered(
      [...this.#sessions.values()].filter((item) => item.ownerId === ownerId),
      "startedAt",
      limit,
    );
  }
  saveEvent(record: SemanticIndexEventRecord) {
    this.#events.set(record.id, clone(SemanticIndexEventRecordSchema.parse(record)));
  }
  listEvents(ownerId: string, limit: number) {
    return ordered(
      [...this.#events.values()].filter((item) => item.ownerId === ownerId),
      "occurredAt",
      limit,
    );
  }
  saveVersion(record: SemanticIndexVersionRecord) {
    this.#versions.set(record.id, clone(SemanticIndexVersionRecordSchema.parse(record)));
  }
  listVersions(ownerId: string, limit: number) {
    return ordered(
      [...this.#versions.values()].filter((item) => item.ownerId === ownerId),
      "indexedAt",
      limit,
    );
  }
  saveFingerprint(record: SemanticFingerprintRecord) {
    this.#fingerprints.set(
      record.id,
      clone(SemanticFingerprintRecordSchema.parse(record)),
    );
  }
  listFingerprints(ownerId: string, limit: number) {
    return ordered(
      [...this.#fingerprints.values()].filter((item) => item.ownerId === ownerId),
      "calculatedAt",
      limit,
    );
  }
  saveRelationshipUpdate(record: SemanticRelationshipUpdateRecord) {
    this.#relationshipUpdates.set(
      record.id,
      clone(SemanticRelationshipUpdateRecordSchema.parse(record)),
    );
  }
  listRelationshipUpdates(ownerId: string, limit: number) {
    return ordered(
      [...this.#relationshipUpdates.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "occurredAt",
      limit,
    );
  }
  saveHealth(record: SemanticIndexerHealthRecord) {
    this.#health.set(record.id, clone(SemanticIndexerHealthRecordSchema.parse(record)));
  }
  listHealth(ownerId: string, limit: number) {
    return ordered(
      [...this.#health.values()].filter((item) => item.ownerId === ownerId),
      "checkedAt",
      limit,
    );
  }
  saveSearchStatistics(record: SemanticSearchStatisticsRecord) {
    this.#searchStatistics.set(
      record.ownerId,
      clone(SemanticSearchStatisticsRecordSchema.parse(record)),
    );
  }
  getSearchStatistics(ownerId: string) {
    return clone(this.#searchStatistics.get(ownerId) ?? null);
  }
}

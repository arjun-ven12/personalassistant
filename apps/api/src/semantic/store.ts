import {
  ContextRankingRecordSchema,
  EmbeddingVersionRecordSchema,
  RetrievalHistoryRecordSchema,
  RetrievalMetricRecordSchema,
  SemanticAliasRecordSchema,
  SemanticEmbeddingRecordSchema,
  SemanticPermissionRecordSchema,
  SemanticRegistryObjectSchema,
  SemanticUsageRecordSchema,
  SynonymRecordSchema,
  type ContextRankingRecord,
  type EmbeddingVersionRecord,
  type RetrievalHistoryRecord,
  type RetrievalMetricRecord,
  type SemanticAliasRecord,
  type SemanticEmbeddingRecord,
  type SemanticPermissionRecord,
  type SemanticRegistryObject,
  type SemanticUsageRecord,
  type SynonymRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface SemanticRetrievalStore {
  saveObject(record: SemanticRegistryObject): Awaitable<void>;
  listObjects(ownerId: string, limit: number): Awaitable<SemanticRegistryObject[]>;
  getObject(ownerId: string, objectId: string): Awaitable<SemanticRegistryObject | null>;
  getObjectByKey(
    ownerId: string,
    objectKey: string,
  ): Awaitable<SemanticRegistryObject | null>;
  saveAlias(record: SemanticAliasRecord): Awaitable<void>;
  listAliases(ownerId: string, limit: number): Awaitable<SemanticAliasRecord[]>;
  saveEmbedding(record: SemanticEmbeddingRecord): Awaitable<void>;
  listEmbeddings(ownerId: string, limit: number): Awaitable<SemanticEmbeddingRecord[]>;
  saveEmbeddingVersion(record: EmbeddingVersionRecord): Awaitable<void>;
  listEmbeddingVersions(
    ownerId: string,
    limit: number,
  ): Awaitable<EmbeddingVersionRecord[]>;
  saveSynonym(record: SynonymRecord): Awaitable<void>;
  listSynonyms(ownerId: string, limit: number): Awaitable<SynonymRecord[]>;
  saveHistory(record: RetrievalHistoryRecord): Awaitable<void>;
  listHistory(ownerId: string, limit: number): Awaitable<RetrievalHistoryRecord[]>;
  saveMetric(record: RetrievalMetricRecord): Awaitable<void>;
  listMetrics(ownerId: string, limit: number): Awaitable<RetrievalMetricRecord[]>;
  saveUsage(record: SemanticUsageRecord): Awaitable<void>;
  listUsage(ownerId: string, limit: number): Awaitable<SemanticUsageRecord[]>;
  saveContextRanking(record: ContextRankingRecord): Awaitable<void>;
  listContextRankings(ownerId: string, limit: number): Awaitable<ContextRankingRecord[]>;
  savePermission(record: SemanticPermissionRecord): Awaitable<void>;
  listPermissions(ownerId: string, limit: number): Awaitable<SemanticPermissionRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemorySemanticRetrievalStore implements SemanticRetrievalStore {
  readonly #objects = new Map<string, SemanticRegistryObject>();
  readonly #aliases = new Map<string, SemanticAliasRecord>();
  readonly #embeddings = new Map<string, SemanticEmbeddingRecord>();
  readonly #embeddingVersions = new Map<string, EmbeddingVersionRecord>();
  readonly #synonyms = new Map<string, SynonymRecord>();
  readonly #history = new Map<string, RetrievalHistoryRecord>();
  readonly #metrics = new Map<string, RetrievalMetricRecord>();
  readonly #usage = new Map<string, SemanticUsageRecord>();
  readonly #contextRankings = new Map<string, ContextRankingRecord>();
  readonly #permissions = new Map<string, SemanticPermissionRecord>();

  saveObject(record: SemanticRegistryObject) {
    this.#objects.set(record.id, clone(SemanticRegistryObjectSchema.parse(record)));
  }
  listObjects(ownerId: string, limit: number) {
    return ordered(
      [...this.#objects.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getObject(ownerId: string, objectId: string) {
    const object = this.#objects.get(objectId);
    return object?.ownerId === ownerId ? clone(object) : null;
  }
  getObjectByKey(ownerId: string, objectKey: string) {
    const object = [...this.#objects.values()].find(
      (item) => item.ownerId === ownerId && item.objectKey === objectKey,
    );
    return object ? clone(object) : null;
  }
  saveAlias(record: SemanticAliasRecord) {
    this.#aliases.set(record.id, clone(SemanticAliasRecordSchema.parse(record)));
  }
  listAliases(ownerId: string, limit: number) {
    return ordered(
      [...this.#aliases.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveEmbedding(record: SemanticEmbeddingRecord) {
    this.#embeddings.set(record.id, clone(SemanticEmbeddingRecordSchema.parse(record)));
  }
  listEmbeddings(ownerId: string, limit: number) {
    return ordered(
      [...this.#embeddings.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveEmbeddingVersion(record: EmbeddingVersionRecord) {
    this.#embeddingVersions.set(
      record.id,
      clone(EmbeddingVersionRecordSchema.parse(record)),
    );
  }
  listEmbeddingVersions(ownerId: string, limit: number) {
    return ordered(
      [...this.#embeddingVersions.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveSynonym(record: SynonymRecord) {
    this.#synonyms.set(record.id, clone(SynonymRecordSchema.parse(record)));
  }
  listSynonyms(ownerId: string, limit: number) {
    return ordered(
      [...this.#synonyms.values()].filter(
        (item) => item.ownerId === null || item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
  saveHistory(record: RetrievalHistoryRecord) {
    this.#history.set(record.id, clone(RetrievalHistoryRecordSchema.parse(record)));
  }
  listHistory(ownerId: string, limit: number) {
    return ordered(
      [...this.#history.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveMetric(record: RetrievalMetricRecord) {
    this.#metrics.set(record.id, clone(RetrievalMetricRecordSchema.parse(record)));
  }
  listMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#metrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveUsage(record: SemanticUsageRecord) {
    this.#usage.set(record.id, clone(SemanticUsageRecordSchema.parse(record)));
  }
  listUsage(ownerId: string, limit: number) {
    return ordered(
      [...this.#usage.values()].filter((item) => item.ownerId === ownerId),
      "usedAt",
      limit,
    );
  }
  saveContextRanking(record: ContextRankingRecord) {
    this.#contextRankings.set(record.id, clone(ContextRankingRecordSchema.parse(record)));
  }
  listContextRankings(ownerId: string, limit: number) {
    return ordered(
      [...this.#contextRankings.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  savePermission(record: SemanticPermissionRecord) {
    this.#permissions.set(record.id, clone(SemanticPermissionRecordSchema.parse(record)));
  }
  listPermissions(ownerId: string, limit: number) {
    return ordered(
      [...this.#permissions.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
}

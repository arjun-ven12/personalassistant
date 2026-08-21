import {
  AdapterCompatibilityRecordSchema,
  AdapterDependencyRecordSchema,
  AdapterLifecycleRecordSchema,
  AdapterSandboxRecordSchema,
  AdapterSdkContractRecordSchema,
  AdapterUsageRecordSchema,
  type AdapterCompatibilityRecord,
  type AdapterDependencyRecord,
  type AdapterLifecycleRecord,
  type AdapterSandboxRecord,
  type AdapterSdkContractRecord,
  type AdapterUsageRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface AdapterSdkStore {
  saveContract(record: AdapterSdkContractRecord): Awaitable<void>;
  listContracts(ownerId: string, limit: number): Awaitable<AdapterSdkContractRecord[]>;
  getContractByAdapterInstance(
    ownerId: string,
    adapterInstanceId: string,
  ): Awaitable<AdapterSdkContractRecord | null>;
  saveLifecycle(record: AdapterLifecycleRecord): Awaitable<void>;
  listLifecycle(ownerId: string, limit: number): Awaitable<AdapterLifecycleRecord[]>;
  saveSandbox(record: AdapterSandboxRecord): Awaitable<void>;
  listSandboxes(ownerId: string, limit: number): Awaitable<AdapterSandboxRecord[]>;
  saveDependency(record: AdapterDependencyRecord): Awaitable<void>;
  listDependencies(ownerId: string, limit: number): Awaitable<AdapterDependencyRecord[]>;
  saveUsage(record: AdapterUsageRecord): Awaitable<void>;
  listUsage(ownerId: string, limit: number): Awaitable<AdapterUsageRecord[]>;
  saveCompatibility(record: AdapterCompatibilityRecord): Awaitable<void>;
  listCompatibility(
    ownerId: string,
    limit: number,
  ): Awaitable<AdapterCompatibilityRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryAdapterSdkStore implements AdapterSdkStore {
  readonly #contracts = new Map<string, AdapterSdkContractRecord>();
  readonly #lifecycle = new Map<string, AdapterLifecycleRecord>();
  readonly #sandboxes = new Map<string, AdapterSandboxRecord>();
  readonly #dependencies = new Map<string, AdapterDependencyRecord>();
  readonly #usage = new Map<string, AdapterUsageRecord>();
  readonly #compatibility = new Map<string, AdapterCompatibilityRecord>();

  saveContract(record: AdapterSdkContractRecord) {
    this.#contracts.set(
      record.id,
      clone(AdapterSdkContractRecordSchema.parse(record)),
    );
  }
  listContracts(ownerId: string, limit: number) {
    return ordered(
      [...this.#contracts.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getContractByAdapterInstance(ownerId: string, adapterInstanceId: string) {
    return clone(
      [...this.#contracts.values()].find(
        (item) =>
          item.ownerId === ownerId && item.adapterInstanceId === adapterInstanceId,
      ) ?? null,
    );
  }
  saveLifecycle(record: AdapterLifecycleRecord) {
    this.#lifecycle.set(record.id, clone(AdapterLifecycleRecordSchema.parse(record)));
  }
  listLifecycle(ownerId: string, limit: number) {
    return ordered(
      [...this.#lifecycle.values()].filter((item) => item.ownerId === ownerId),
      "occurredAt",
      limit,
    );
  }
  saveSandbox(record: AdapterSandboxRecord) {
    this.#sandboxes.set(record.id, clone(AdapterSandboxRecordSchema.parse(record)));
  }
  listSandboxes(ownerId: string, limit: number) {
    return ordered(
      [...this.#sandboxes.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveDependency(record: AdapterDependencyRecord) {
    this.#dependencies.set(
      record.id,
      clone(AdapterDependencyRecordSchema.parse(record)),
    );
  }
  listDependencies(ownerId: string, limit: number) {
    return ordered(
      [...this.#dependencies.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveUsage(record: AdapterUsageRecord) {
    this.#usage.set(record.id, clone(AdapterUsageRecordSchema.parse(record)));
  }
  listUsage(ownerId: string, limit: number) {
    return ordered(
      [...this.#usage.values()].filter((item) => item.ownerId === ownerId),
      "recordedAt",
      limit,
    );
  }
  saveCompatibility(record: AdapterCompatibilityRecord) {
    this.#compatibility.set(
      record.id,
      clone(AdapterCompatibilityRecordSchema.parse(record)),
    );
  }
  listCompatibility(ownerId: string, limit: number) {
    return ordered(
      [...this.#compatibility.values()].filter((item) => item.ownerId === ownerId),
      "checkedAt",
      limit,
    );
  }
}

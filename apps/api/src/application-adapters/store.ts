import {
  AdapterInstanceRecordSchema,
  AdapterMetricRecordSchema,
  AdapterPluginRecordSchema,
  AdapterVersionRecordSchema,
  ApplicationCapabilityRecordSchema,
  ApplicationContextRecordSchema,
  ApplicationEventRecordSchema,
  ApplicationHealthRecordSchema,
  ApplicationPermissionRecordSchema,
  ApplicationProfileRecordSchema,
  TrustedApplicationRecordSchema,
  type AdapterInstanceRecord,
  type AdapterMetricRecord,
  type AdapterPluginRecord,
  type AdapterVersionRecord,
  type ApplicationCapabilityRecord,
  type ApplicationContextRecord,
  type ApplicationEventRecord,
  type ApplicationHealthRecord,
  type ApplicationPermissionRecord,
  type ApplicationProfileRecord,
  type TrustedApplicationRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface ApplicationAdapterStore {
  saveTrustedApplication(record: TrustedApplicationRecord): Awaitable<void>;
  listTrustedApplications(
    ownerId: string,
    limit: number,
  ): Awaitable<TrustedApplicationRecord[]>;
  getTrustedApplication(
    ownerId: string,
    applicationId: string,
  ): Awaitable<TrustedApplicationRecord | null>;
  saveApplicationProfile(record: ApplicationProfileRecord): Awaitable<void>;
  listApplicationProfiles(
    ownerId: string,
    limit: number,
  ): Awaitable<ApplicationProfileRecord[]>;
  saveApplicationCapability(record: ApplicationCapabilityRecord): Awaitable<void>;
  listApplicationCapabilities(
    ownerId: string,
    limit: number,
  ): Awaitable<ApplicationCapabilityRecord[]>;
  saveAdapterInstance(record: AdapterInstanceRecord): Awaitable<void>;
  listAdapterInstances(
    ownerId: string,
    limit: number,
  ): Awaitable<AdapterInstanceRecord[]>;
  saveAdapterPlugin(record: AdapterPluginRecord): Awaitable<void>;
  listAdapterPlugins(ownerId: string, limit: number): Awaitable<AdapterPluginRecord[]>;
  saveApplicationPermission(record: ApplicationPermissionRecord): Awaitable<void>;
  listApplicationPermissions(
    ownerId: string,
    limit: number,
  ): Awaitable<ApplicationPermissionRecord[]>;
  saveApplicationContext(record: ApplicationContextRecord): Awaitable<void>;
  listApplicationContext(
    ownerId: string,
    limit: number,
  ): Awaitable<ApplicationContextRecord[]>;
  saveApplicationEvent(record: ApplicationEventRecord): Awaitable<void>;
  listApplicationEvents(
    ownerId: string,
    limit: number,
  ): Awaitable<ApplicationEventRecord[]>;
  saveAdapterMetric(record: AdapterMetricRecord): Awaitable<void>;
  listAdapterMetrics(ownerId: string, limit: number): Awaitable<AdapterMetricRecord[]>;
  saveAdapterVersion(record: AdapterVersionRecord): Awaitable<void>;
  listAdapterVersions(
    ownerId: string,
    limit: number,
  ): Awaitable<AdapterVersionRecord[]>;
  saveApplicationHealth(record: ApplicationHealthRecord): Awaitable<void>;
  listApplicationHealth(
    ownerId: string,
    limit: number,
  ): Awaitable<ApplicationHealthRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryApplicationAdapterStore implements ApplicationAdapterStore {
  readonly #applications = new Map<string, TrustedApplicationRecord>();
  readonly #profiles = new Map<string, ApplicationProfileRecord>();
  readonly #capabilities = new Map<string, ApplicationCapabilityRecord>();
  readonly #instances = new Map<string, AdapterInstanceRecord>();
  readonly #plugins = new Map<string, AdapterPluginRecord>();
  readonly #permissions = new Map<string, ApplicationPermissionRecord>();
  readonly #contexts = new Map<string, ApplicationContextRecord>();
  readonly #events = new Map<string, ApplicationEventRecord>();
  readonly #metrics = new Map<string, AdapterMetricRecord>();
  readonly #versions = new Map<string, AdapterVersionRecord>();
  readonly #health = new Map<string, ApplicationHealthRecord>();

  saveTrustedApplication(record: TrustedApplicationRecord) {
    this.#applications.set(
      `${record.ownerId}:${record.id}`,
      clone(TrustedApplicationRecordSchema.parse(record)),
    );
  }
  listTrustedApplications(ownerId: string, limit: number) {
    return ordered(
      [...this.#applications.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getTrustedApplication(ownerId: string, applicationId: string) {
    return clone(this.#applications.get(`${ownerId}:${applicationId}`) ?? null);
  }
  saveApplicationProfile(record: ApplicationProfileRecord) {
    this.#profiles.set(
      `${record.ownerId}:${record.id}`,
      clone(ApplicationProfileRecordSchema.parse(record)),
    );
  }
  listApplicationProfiles(ownerId: string, limit: number) {
    return ordered(
      [...this.#profiles.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveApplicationCapability(record: ApplicationCapabilityRecord) {
    this.#capabilities.set(
      record.id,
      clone(ApplicationCapabilityRecordSchema.parse(record)),
    );
  }
  listApplicationCapabilities(ownerId: string, limit: number) {
    return ordered(
      [...this.#capabilities.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveAdapterInstance(record: AdapterInstanceRecord) {
    this.#instances.set(record.id, clone(AdapterInstanceRecordSchema.parse(record)));
  }
  listAdapterInstances(ownerId: string, limit: number) {
    return ordered(
      [...this.#instances.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveAdapterPlugin(record: AdapterPluginRecord) {
    this.#plugins.set(
      `${record.ownerId}:${record.id}`,
      clone(AdapterPluginRecordSchema.parse(record)),
    );
  }
  listAdapterPlugins(ownerId: string, limit: number) {
    return ordered(
      [...this.#plugins.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveApplicationPermission(record: ApplicationPermissionRecord) {
    this.#permissions.set(
      `${record.ownerId}:${record.applicationId}:${record.permission}`,
      clone(ApplicationPermissionRecordSchema.parse(record)),
    );
  }
  listApplicationPermissions(ownerId: string, limit: number) {
    return ordered(
      [...this.#permissions.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveApplicationContext(record: ApplicationContextRecord) {
    this.#contexts.set(record.id, clone(ApplicationContextRecordSchema.parse(record)));
  }
  listApplicationContext(ownerId: string, limit: number) {
    return ordered(
      [...this.#contexts.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveApplicationEvent(record: ApplicationEventRecord) {
    this.#events.set(record.id, clone(ApplicationEventRecordSchema.parse(record)));
  }
  listApplicationEvents(ownerId: string, limit: number) {
    return ordered(
      [...this.#events.values()].filter((item) => item.ownerId === ownerId),
      "occurredAt",
      limit,
    );
  }
  saveAdapterMetric(record: AdapterMetricRecord) {
    this.#metrics.set(record.id, clone(AdapterMetricRecordSchema.parse(record)));
  }
  listAdapterMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#metrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveAdapterVersion(record: AdapterVersionRecord) {
    this.#versions.set(record.id, clone(AdapterVersionRecordSchema.parse(record)));
  }
  listAdapterVersions(ownerId: string, limit: number) {
    return ordered(
      [...this.#versions.values()].filter((item) => item.ownerId === ownerId),
      "recordedAt",
      limit,
    );
  }
  saveApplicationHealth(record: ApplicationHealthRecord) {
    this.#health.set(record.id, clone(ApplicationHealthRecordSchema.parse(record)));
  }
  listApplicationHealth(ownerId: string, limit: number) {
    return ordered(
      [...this.#health.values()].filter((item) => item.ownerId === ownerId),
      "checkedAt",
      limit,
    );
  }
}

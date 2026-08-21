import {
  AgentConfigurationRecordSchema,
  AgentManifestRecordSchema,
  AgentOsHealthRecordSchema,
  AgentOsMetricsRecordSchema,
  AgentPackageRecordSchema,
  AgentSessionRecordSchema,
  AgentVersionRecordSchema,
  ContextPackageRecordSchema,
  KnowledgeSourceRecordSchema,
  PermissionProfileRecordSchema,
  RuntimeEventRecordSchema,
  ToolRegistryRecordSchema,
  type AgentConfigurationRecord,
  type AgentManifestRecord,
  type AgentOsHealthRecord,
  type AgentOsMetricsRecord,
  type AgentPackageRecord,
  type AgentSessionRecord,
  type AgentVersionRecord,
  type ContextPackageRecord,
  type KnowledgeSourceRecord,
  type PermissionProfileRecord,
  type RuntimeEventRecord,
  type ToolRegistryRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface AgentOsStore {
  saveManifest(manifest: AgentManifestRecord): Awaitable<void>;
  findManifest(
    ownerId: string,
    agentId: string,
  ): Awaitable<AgentManifestRecord | undefined>;
  listManifests(ownerId: string): Awaitable<AgentManifestRecord[]>;
  savePackage(pkg: AgentPackageRecord): Awaitable<void>;
  listPackages(ownerId: string, limit: number): Awaitable<AgentPackageRecord[]>;
  saveSession(session: AgentSessionRecord): Awaitable<void>;
  listSessions(ownerId: string, limit: number): Awaitable<AgentSessionRecord[]>;
  saveEvent(event: RuntimeEventRecord): Awaitable<void>;
  listEvents(ownerId: string, limit: number): Awaitable<RuntimeEventRecord[]>;
  saveConfiguration(configuration: AgentConfigurationRecord): Awaitable<void>;
  listConfigurations(
    ownerId: string,
    limit: number,
  ): Awaitable<AgentConfigurationRecord[]>;
  saveTool(tool: ToolRegistryRecord): Awaitable<void>;
  listTools(ownerId: string): Awaitable<ToolRegistryRecord[]>;
  savePermissionProfile(profile: PermissionProfileRecord): Awaitable<void>;
  listPermissionProfiles(ownerId: string): Awaitable<PermissionProfileRecord[]>;
  saveKnowledgeSource(source: KnowledgeSourceRecord): Awaitable<void>;
  listKnowledgeSources(ownerId: string): Awaitable<KnowledgeSourceRecord[]>;
  saveVersion(version: AgentVersionRecord): Awaitable<void>;
  listVersions(ownerId: string, limit: number): Awaitable<AgentVersionRecord[]>;
  saveHealth(health: AgentOsHealthRecord): Awaitable<void>;
  listHealth(ownerId: string): Awaitable<AgentOsHealthRecord[]>;
  saveMetrics(metrics: AgentOsMetricsRecord): Awaitable<void>;
  listMetrics(ownerId: string): Awaitable<AgentOsMetricsRecord[]>;
  saveContextPackage(context: ContextPackageRecord): Awaitable<void>;
  listContextPackages(
    ownerId: string,
    limit: number,
  ): Awaitable<ContextPackageRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);

const ordered = <T>(items: T[], field: keyof T, limit?: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit ?? items.length)
    .map((item) => clone(item));

export class InMemoryAgentOsStore implements AgentOsStore {
  readonly #manifests = new Map<string, AgentManifestRecord>();
  readonly #packages = new Map<string, AgentPackageRecord>();
  readonly #sessions = new Map<string, AgentSessionRecord>();
  readonly #events = new Map<string, RuntimeEventRecord>();
  readonly #configurations = new Map<string, AgentConfigurationRecord>();
  readonly #tools = new Map<string, ToolRegistryRecord>();
  readonly #permissionProfiles = new Map<string, PermissionProfileRecord>();
  readonly #knowledgeSources = new Map<string, KnowledgeSourceRecord>();
  readonly #versions = new Map<string, AgentVersionRecord>();
  readonly #health = new Map<string, AgentOsHealthRecord>();
  readonly #metrics = new Map<string, AgentOsMetricsRecord>();
  readonly #contextPackages = new Map<string, ContextPackageRecord>();

  saveManifest(manifest: AgentManifestRecord) {
    const parsed = AgentManifestRecordSchema.parse(manifest);
    this.#manifests.set(`${parsed.ownerId}:${parsed.id}`, clone(parsed));
  }

  findManifest(ownerId: string, agentId: string) {
    const manifest = this.#manifests.get(`${ownerId}:${agentId}`);
    return manifest ? clone(manifest) : undefined;
  }

  listManifests(ownerId: string) {
    return ordered(
      [...this.#manifests.values()].filter((manifest) => manifest.ownerId === ownerId),
      "updatedAt",
    );
  }

  savePackage(pkg: AgentPackageRecord) {
    const parsed = AgentPackageRecordSchema.parse(pkg);
    this.#packages.set(parsed.id, clone(parsed));
  }

  listPackages(ownerId: string, limit: number) {
    return ordered(
      [...this.#packages.values()].filter((pkg) => pkg.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }

  saveSession(session: AgentSessionRecord) {
    const parsed = AgentSessionRecordSchema.parse(session);
    this.#sessions.set(parsed.id, clone(parsed));
  }

  listSessions(ownerId: string, limit: number) {
    return ordered(
      [...this.#sessions.values()].filter((session) => session.ownerId === ownerId),
      "startedAt",
      limit,
    );
  }

  saveEvent(event: RuntimeEventRecord) {
    const parsed = RuntimeEventRecordSchema.parse(event);
    this.#events.set(parsed.id, clone(parsed));
  }

  listEvents(ownerId: string, limit: number) {
    return ordered(
      [...this.#events.values()].filter((event) => event.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }

  saveConfiguration(configuration: AgentConfigurationRecord) {
    const parsed = AgentConfigurationRecordSchema.parse(configuration);
    this.#configurations.set(parsed.id, clone(parsed));
  }

  listConfigurations(ownerId: string, limit: number) {
    return ordered(
      [...this.#configurations.values()].filter(
        (configuration) => configuration.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }

  saveTool(tool: ToolRegistryRecord) {
    const parsed = ToolRegistryRecordSchema.parse(tool);
    this.#tools.set(`${parsed.ownerId}:${parsed.id}`, clone(parsed));
  }

  listTools(ownerId: string) {
    return [...this.#tools.values()]
      .filter((tool) => tool.ownerId === ownerId)
      .map((tool) => clone(tool));
  }

  savePermissionProfile(profile: PermissionProfileRecord) {
    const parsed = PermissionProfileRecordSchema.parse(profile);
    this.#permissionProfiles.set(`${parsed.ownerId}:${parsed.id}`, clone(parsed));
  }

  listPermissionProfiles(ownerId: string) {
    return [...this.#permissionProfiles.values()]
      .filter((profile) => profile.ownerId === ownerId)
      .map((profile) => clone(profile));
  }

  saveKnowledgeSource(source: KnowledgeSourceRecord) {
    const parsed = KnowledgeSourceRecordSchema.parse(source);
    this.#knowledgeSources.set(`${parsed.ownerId}:${parsed.id}`, clone(parsed));
  }

  listKnowledgeSources(ownerId: string) {
    return [...this.#knowledgeSources.values()]
      .filter((source) => source.ownerId === ownerId)
      .map((source) => clone(source));
  }

  saveVersion(version: AgentVersionRecord) {
    const parsed = AgentVersionRecordSchema.parse(version);
    this.#versions.set(parsed.id, clone(parsed));
  }

  listVersions(ownerId: string, limit: number) {
    return ordered(
      [...this.#versions.values()].filter((version) => version.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }

  saveHealth(health: AgentOsHealthRecord) {
    const parsed = AgentOsHealthRecordSchema.parse(health);
    this.#health.set(`${parsed.ownerId}:${parsed.agentId}`, clone(parsed));
  }

  listHealth(ownerId: string) {
    return [...this.#health.values()]
      .filter((health) => health.ownerId === ownerId)
      .map((health) => clone(health));
  }

  saveMetrics(metrics: AgentOsMetricsRecord) {
    const parsed = AgentOsMetricsRecordSchema.parse(metrics);
    this.#metrics.set(`${parsed.ownerId}:${parsed.agentId}`, clone(parsed));
  }

  listMetrics(ownerId: string) {
    return [...this.#metrics.values()]
      .filter((metrics) => metrics.ownerId === ownerId)
      .map((metrics) => clone(metrics));
  }

  saveContextPackage(context: ContextPackageRecord) {
    const parsed = ContextPackageRecordSchema.parse(context);
    this.#contextPackages.set(parsed.id, clone(parsed));
  }

  listContextPackages(ownerId: string, limit: number) {
    return ordered(
      [...this.#contextPackages.values()].filter(
        (context) => context.ownerId === ownerId,
      ),
      "createdAt",
      limit,
    );
  }
}

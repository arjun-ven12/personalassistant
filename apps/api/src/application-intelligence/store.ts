import {
  ApplicationDomainRecordSchema,
  ApplicationMemoryRecordSchema,
  ApplicationProviderCapabilityRecordSchema,
  ApplicationSessionRecordSchema,
  CrossApplicationWorkflowRecordSchema,
  ProviderSelectionRecordSchema,
  SemanticApplicationCapabilityRecordSchema,
  SemanticObjectRecordSchema,
  type ApplicationDomainRecord,
  type ApplicationMemoryRecord,
  type ApplicationProviderCapabilityRecord,
  type ApplicationSessionRecord,
  type CrossApplicationWorkflowRecord,
  type ProviderSelectionRecord,
  type SemanticApplicationCapabilityRecord,
  type SemanticObjectRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface ApplicationIntelligenceStore {
  saveDomain(record: ApplicationDomainRecord): Awaitable<void>;
  listDomains(ownerId: string, limit: number): Awaitable<ApplicationDomainRecord[]>;
  saveCapability(record: SemanticApplicationCapabilityRecord): Awaitable<void>;
  listCapabilities(
    ownerId: string,
    limit: number,
  ): Awaitable<SemanticApplicationCapabilityRecord[]>;
  saveProviderCapability(record: ApplicationProviderCapabilityRecord): Awaitable<void>;
  listProviderCapabilities(
    ownerId: string,
    limit: number,
  ): Awaitable<ApplicationProviderCapabilityRecord[]>;
  saveSession(record: ApplicationSessionRecord): Awaitable<void>;
  listSessions(ownerId: string, limit: number): Awaitable<ApplicationSessionRecord[]>;
  saveMemory(record: ApplicationMemoryRecord): Awaitable<void>;
  listMemory(ownerId: string, limit: number): Awaitable<ApplicationMemoryRecord[]>;
  saveSelection(record: ProviderSelectionRecord): Awaitable<void>;
  listSelections(ownerId: string, limit: number): Awaitable<ProviderSelectionRecord[]>;
  saveWorkflow(record: CrossApplicationWorkflowRecord): Awaitable<void>;
  listWorkflows(
    ownerId: string,
    limit: number,
  ): Awaitable<CrossApplicationWorkflowRecord[]>;
  saveSemanticObject(record: SemanticObjectRecord): Awaitable<void>;
  listSemanticObjects(ownerId: string, limit: number): Awaitable<SemanticObjectRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryApplicationIntelligenceStore
  implements ApplicationIntelligenceStore
{
  readonly #domains = new Map<string, ApplicationDomainRecord>();
  readonly #capabilities = new Map<string, SemanticApplicationCapabilityRecord>();
  readonly #providerCapabilities = new Map<string, ApplicationProviderCapabilityRecord>();
  readonly #sessions = new Map<string, ApplicationSessionRecord>();
  readonly #memory = new Map<string, ApplicationMemoryRecord>();
  readonly #selections = new Map<string, ProviderSelectionRecord>();
  readonly #workflows = new Map<string, CrossApplicationWorkflowRecord>();
  readonly #objects = new Map<string, SemanticObjectRecord>();

  saveDomain(record: ApplicationDomainRecord) {
    this.#domains.set(
      `${record.ownerId}:${record.id}`,
      clone(ApplicationDomainRecordSchema.parse(record)),
    );
  }
  listDomains(ownerId: string, limit: number) {
    return ordered(
      [...this.#domains.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveCapability(record: SemanticApplicationCapabilityRecord) {
    this.#capabilities.set(
      `${record.ownerId}:${record.capabilityId}`,
      clone(SemanticApplicationCapabilityRecordSchema.parse(record)),
    );
  }
  listCapabilities(ownerId: string, limit: number) {
    return ordered(
      [...this.#capabilities.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveProviderCapability(record: ApplicationProviderCapabilityRecord) {
    this.#providerCapabilities.set(
      `${record.ownerId}:${record.applicationId}:${record.providerId}:${record.capabilityId}`,
      clone(ApplicationProviderCapabilityRecordSchema.parse(record)),
    );
  }
  listProviderCapabilities(ownerId: string, limit: number) {
    return ordered(
      [...this.#providerCapabilities.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
  saveSession(record: ApplicationSessionRecord) {
    this.#sessions.set(record.id, clone(ApplicationSessionRecordSchema.parse(record)));
  }
  listSessions(ownerId: string, limit: number) {
    return ordered(
      [...this.#sessions.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveMemory(record: ApplicationMemoryRecord) {
    this.#memory.set(record.id, clone(ApplicationMemoryRecordSchema.parse(record)));
  }
  listMemory(ownerId: string, limit: number) {
    return ordered(
      [...this.#memory.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveSelection(record: ProviderSelectionRecord) {
    this.#selections.set(record.id, clone(ProviderSelectionRecordSchema.parse(record)));
  }
  listSelections(ownerId: string, limit: number) {
    return ordered(
      [...this.#selections.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveWorkflow(record: CrossApplicationWorkflowRecord) {
    this.#workflows.set(
      record.id,
      clone(CrossApplicationWorkflowRecordSchema.parse(record)),
    );
  }
  listWorkflows(ownerId: string, limit: number) {
    return ordered(
      [...this.#workflows.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveSemanticObject(record: SemanticObjectRecord) {
    this.#objects.set(record.id, clone(SemanticObjectRecordSchema.parse(record)));
  }
  listSemanticObjects(ownerId: string, limit: number) {
    return ordered(
      [...this.#objects.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
}

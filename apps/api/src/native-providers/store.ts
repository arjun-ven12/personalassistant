import {
  ApprovedTerminalCommandRecordSchema,
  NativeProviderRecordSchema,
  ProviderCapabilityRecordSchema,
  ProviderDiagnosticRecordSchema,
  ProviderExecutionRecordSchema,
  ProviderHealthRecordSchema,
  ProviderMetricRecordSchema,
  ProviderValidationRecordSchema,
  type ApprovedTerminalCommandRecord,
  type NativeProviderRecord,
  type ProviderCapabilityRecord,
  type ProviderDiagnosticRecord,
  type ProviderExecutionRecord,
  type ProviderHealthRecord,
  type ProviderMetricRecord,
  type ProviderValidationRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface NativeProviderStore {
  saveProvider(record: NativeProviderRecord): Awaitable<void>;
  listProviders(ownerId: string, limit: number): Awaitable<NativeProviderRecord[]>;
  getProvider(
    ownerId: string,
    providerId: string,
  ): Awaitable<NativeProviderRecord | null>;
  saveCapability(record: ProviderCapabilityRecord): Awaitable<void>;
  listCapabilities(
    ownerId: string,
    limit: number,
  ): Awaitable<ProviderCapabilityRecord[]>;
  saveHealth(record: ProviderHealthRecord): Awaitable<void>;
  listHealth(ownerId: string, limit: number): Awaitable<ProviderHealthRecord[]>;
  saveValidation(record: ProviderValidationRecord): Awaitable<void>;
  listValidation(ownerId: string, limit: number): Awaitable<ProviderValidationRecord[]>;
  saveExecution(record: ProviderExecutionRecord): Awaitable<void>;
  listExecution(ownerId: string, limit: number): Awaitable<ProviderExecutionRecord[]>;
  saveMetric(record: ProviderMetricRecord): Awaitable<void>;
  listMetrics(ownerId: string, limit: number): Awaitable<ProviderMetricRecord[]>;
  saveDiagnostic(record: ProviderDiagnosticRecord): Awaitable<void>;
  listDiagnostics(
    ownerId: string,
    limit: number,
  ): Awaitable<ProviderDiagnosticRecord[]>;
  saveApprovedCommand(record: ApprovedTerminalCommandRecord): Awaitable<void>;
  listApprovedCommands(
    ownerId: string,
    limit: number,
  ): Awaitable<ApprovedTerminalCommandRecord[]>;
  getApprovedCommand(
    ownerId: string,
    commandId: string,
  ): Awaitable<ApprovedTerminalCommandRecord | null>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryNativeProviderStore implements NativeProviderStore {
  readonly #providers = new Map<string, NativeProviderRecord>();
  readonly #capabilities = new Map<string, ProviderCapabilityRecord>();
  readonly #health = new Map<string, ProviderHealthRecord>();
  readonly #validation = new Map<string, ProviderValidationRecord>();
  readonly #execution = new Map<string, ProviderExecutionRecord>();
  readonly #metrics = new Map<string, ProviderMetricRecord>();
  readonly #diagnostics = new Map<string, ProviderDiagnosticRecord>();
  readonly #commands = new Map<string, ApprovedTerminalCommandRecord>();

  saveProvider(record: NativeProviderRecord) {
    this.#providers.set(
      `${record.ownerId}:${record.id}`,
      clone(NativeProviderRecordSchema.parse(record)),
    );
  }
  listProviders(ownerId: string, limit: number) {
    return ordered(
      [...this.#providers.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getProvider(ownerId: string, providerId: string) {
    return clone(this.#providers.get(`${ownerId}:${providerId}`) ?? null);
  }
  saveCapability(record: ProviderCapabilityRecord) {
    this.#capabilities.set(
      record.id,
      clone(ProviderCapabilityRecordSchema.parse(record)),
    );
  }
  listCapabilities(ownerId: string, limit: number) {
    return ordered(
      [...this.#capabilities.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveHealth(record: ProviderHealthRecord) {
    this.#health.set(record.id, clone(ProviderHealthRecordSchema.parse(record)));
  }
  listHealth(ownerId: string, limit: number) {
    return ordered(
      [...this.#health.values()].filter((item) => item.ownerId === ownerId),
      "checkedAt",
      limit,
    );
  }
  saveValidation(record: ProviderValidationRecord) {
    this.#validation.set(
      record.id,
      clone(ProviderValidationRecordSchema.parse(record)),
    );
  }
  listValidation(ownerId: string, limit: number) {
    return ordered(
      [...this.#validation.values()].filter((item) => item.ownerId === ownerId),
      "validatedAt",
      limit,
    );
  }
  saveExecution(record: ProviderExecutionRecord) {
    this.#execution.set(record.id, clone(ProviderExecutionRecordSchema.parse(record)));
  }
  listExecution(ownerId: string, limit: number) {
    return ordered(
      [...this.#execution.values()].filter((item) => item.ownerId === ownerId),
      "requestedAt",
      limit,
    );
  }
  saveMetric(record: ProviderMetricRecord) {
    this.#metrics.set(record.id, clone(ProviderMetricRecordSchema.parse(record)));
  }
  listMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#metrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveDiagnostic(record: ProviderDiagnosticRecord) {
    this.#diagnostics.set(
      record.id,
      clone(ProviderDiagnosticRecordSchema.parse(record)),
    );
  }
  listDiagnostics(ownerId: string, limit: number) {
    return ordered(
      [...this.#diagnostics.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveApprovedCommand(record: ApprovedTerminalCommandRecord) {
    this.#commands.set(
      record.id,
      clone(ApprovedTerminalCommandRecordSchema.parse(record)),
    );
  }
  listApprovedCommands(ownerId: string, limit: number) {
    return ordered(
      [...this.#commands.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getApprovedCommand(ownerId: string, commandId: string) {
    const command = this.#commands.get(commandId);
    return command?.ownerId === ownerId ? clone(command) : null;
  }
}

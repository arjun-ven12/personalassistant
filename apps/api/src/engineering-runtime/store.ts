import {
  EngineeringCommandProfileSchema,
  EngineeringExecutionRecordSchema,
  EngineeringRepositorySchema,
  EngineeringValidationReportSchema,
  EngineeringWorkspaceSchema,
  type EngineeringCommandProfile,
  type EngineeringExecutionRecord,
  type EngineeringRepository,
  type EngineeringValidationReport,
  type EngineeringWorkspace,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface EngineeringRuntimeStore {
  saveRepository(value: EngineeringRepository): Awaitable<void>;
  findRepository(
    ownerId: string,
    companyId: string,
    id: string,
  ): Awaitable<EngineeringRepository | undefined>;
  listRepositories(
    ownerId: string,
    companyId: string,
  ): Awaitable<EngineeringRepository[]>;
  saveCommandProfile(value: EngineeringCommandProfile): Awaitable<void>;
  findCommandProfile(
    ownerId: string,
    companyId: string,
    id: string,
  ): Awaitable<EngineeringCommandProfile | undefined>;
  createWorkspace(value: EngineeringWorkspace): Awaitable<EngineeringWorkspace>;
  findWorkspace(
    ownerId: string,
    companyId: string,
    id: string,
  ): Awaitable<EngineeringWorkspace | undefined>;
  findWorkspaceByIdempotencyKey(
    ownerId: string,
    companyId: string,
    repositoryId: string,
    idempotencyKey: string,
  ): Awaitable<EngineeringWorkspace | undefined>;
  listWorkspaces(
    ownerId: string,
    companyId: string,
    repositoryId?: string,
  ): Awaitable<EngineeringWorkspace[]>;
  saveWorkspace(value: EngineeringWorkspace): Awaitable<void>;
  saveWorkspaceWithLease(input: {
    value: EngineeringWorkspace;
    workerId: string;
    generation: number;
    now: string;
  }): Awaitable<boolean>;
  acquireWorkspaceLease(input: {
    ownerId: string;
    companyId: string;
    workspaceId: string;
    workerId: string;
    now: string;
    expiresAt: string;
  }): Awaitable<EngineeringWorkspace | undefined>;
  renewWorkspaceLease(input: {
    ownerId: string;
    companyId: string;
    workspaceId: string;
    workerId: string;
    generation: number;
    now: string;
    expiresAt: string;
  }): Awaitable<EngineeringWorkspace | undefined>;
  releaseWorkspaceLease(input: {
    ownerId: string;
    companyId: string;
    workspaceId: string;
    workerId: string;
    generation: number;
    now: string;
  }): Awaitable<boolean>;
  saveExecution(value: EngineeringExecutionRecord): Awaitable<void>;
  saveValidation(
    value: EngineeringValidationReport,
    ownerId: string,
    companyId: string,
  ): Awaitable<void>;
  findValidation(
    ownerId: string,
    companyId: string,
    id: string,
  ): Awaitable<EngineeringValidationReport | undefined>;
}

const clone = <T>(value: T): T => structuredClone(value);
const scopedKey = (ownerId: string, companyId: string, id: string) =>
  `${ownerId}:${companyId}:${id}`;

export class InMemoryEngineeringRuntimeStore implements EngineeringRuntimeStore {
  readonly #repositories = new Map<string, EngineeringRepository>();
  readonly #profiles = new Map<string, EngineeringCommandProfile>();
  readonly #workspaces = new Map<string, EngineeringWorkspace>();
  readonly #executions = new Map<string, EngineeringExecutionRecord>();
  readonly #validations = new Map<string, EngineeringValidationReport>();

  saveRepository(value: EngineeringRepository) {
    const parsed = EngineeringRepositorySchema.parse(value);
    this.#repositories.set(
      scopedKey(parsed.ownerId, parsed.companyId, parsed.id),
      clone(parsed),
    );
  }

  findRepository(ownerId: string, companyId: string, id: string) {
    const value = this.#repositories.get(scopedKey(ownerId, companyId, id));
    return value ? clone(value) : undefined;
  }

  listRepositories(ownerId: string, companyId: string) {
    return [...this.#repositories.values()]
      .filter((value) => value.ownerId === ownerId && value.companyId === companyId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(clone);
  }

  saveCommandProfile(value: EngineeringCommandProfile) {
    const parsed = EngineeringCommandProfileSchema.parse(value);
    this.#profiles.set(
      scopedKey(parsed.ownerId, parsed.companyId, parsed.id),
      clone(parsed),
    );
  }

  findCommandProfile(ownerId: string, companyId: string, id: string) {
    const value = this.#profiles.get(scopedKey(ownerId, companyId, id));
    return value ? clone(value) : undefined;
  }

  createWorkspace(value: EngineeringWorkspace) {
    const parsed = EngineeringWorkspaceSchema.parse(value);
    const duplicate = [...this.#workspaces.values()].find(
      (item) =>
        item.ownerId === parsed.ownerId &&
        item.companyId === parsed.companyId &&
        item.repositoryId === parsed.repositoryId &&
        item.idempotencyKey === parsed.idempotencyKey,
    );
    if (duplicate) return clone(duplicate);
    this.#workspaces.set(
      scopedKey(parsed.ownerId, parsed.companyId, parsed.id),
      clone(parsed),
    );
    return clone(parsed);
  }

  findWorkspace(ownerId: string, companyId: string, id: string) {
    const value = this.#workspaces.get(scopedKey(ownerId, companyId, id));
    return value ? clone(value) : undefined;
  }

  findWorkspaceByIdempotencyKey(
    ownerId: string,
    companyId: string,
    repositoryId: string,
    idempotencyKey: string,
  ) {
    const value = [...this.#workspaces.values()].find(
      (item) =>
        item.ownerId === ownerId &&
        item.companyId === companyId &&
        item.repositoryId === repositoryId &&
        item.idempotencyKey === idempotencyKey,
    );
    return value ? clone(value) : undefined;
  }

  listWorkspaces(ownerId: string, companyId: string, repositoryId?: string) {
    return [...this.#workspaces.values()]
      .filter((value) => value.ownerId === ownerId && value.companyId === companyId)
      .filter((value) => !repositoryId || value.repositoryId === repositoryId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(clone);
  }

  saveWorkspace(value: EngineeringWorkspace) {
    const parsed = EngineeringWorkspaceSchema.parse(value);
    this.#workspaces.set(
      scopedKey(parsed.ownerId, parsed.companyId, parsed.id),
      clone(parsed),
    );
  }

  saveWorkspaceWithLease(input: {
    value: EngineeringWorkspace;
    workerId: string;
    generation: number;
    now: string;
  }) {
    const parsed = EngineeringWorkspaceSchema.parse(input.value);
    const key = scopedKey(parsed.ownerId, parsed.companyId, parsed.id);
    const current = this.#workspaces.get(key);
    if (
      !current ||
      current.leaseOwner !== input.workerId ||
      current.leaseGeneration !== input.generation ||
      !current.leaseExpiresAt ||
      current.leaseExpiresAt <= input.now
    )
      return false;
    this.#workspaces.set(
      key,
      clone(
        EngineeringWorkspaceSchema.parse({
          ...parsed,
          leaseOwner: current.leaseOwner,
          leaseExpiresAt: current.leaseExpiresAt,
          leaseGeneration: current.leaseGeneration,
        }),
      ),
    );
    return true;
  }

  acquireWorkspaceLease(input: {
    ownerId: string;
    companyId: string;
    workspaceId: string;
    workerId: string;
    now: string;
    expiresAt: string;
  }) {
    const key = scopedKey(input.ownerId, input.companyId, input.workspaceId);
    const current = this.#workspaces.get(key);
    if (!current || (current.leaseExpiresAt && current.leaseExpiresAt > input.now))
      return undefined;
    const updated = EngineeringWorkspaceSchema.parse({
      ...current,
      leaseOwner: input.workerId,
      leaseExpiresAt: input.expiresAt,
      leaseGeneration: current.leaseGeneration + 1,
      updatedAt: input.now,
    });
    this.#workspaces.set(key, clone(updated));
    return clone(updated);
  }

  renewWorkspaceLease(input: {
    ownerId: string;
    companyId: string;
    workspaceId: string;
    workerId: string;
    generation: number;
    now: string;
    expiresAt: string;
  }) {
    const key = scopedKey(input.ownerId, input.companyId, input.workspaceId);
    const current = this.#workspaces.get(key);
    if (
      !current ||
      current.leaseOwner !== input.workerId ||
      current.leaseGeneration !== input.generation ||
      !current.leaseExpiresAt ||
      current.leaseExpiresAt <= input.now
    )
      return undefined;
    const updated = EngineeringWorkspaceSchema.parse({
      ...current,
      leaseExpiresAt: input.expiresAt,
      updatedAt: input.now,
    });
    this.#workspaces.set(key, clone(updated));
    return clone(updated);
  }

  releaseWorkspaceLease(input: {
    ownerId: string;
    companyId: string;
    workspaceId: string;
    workerId: string;
    generation: number;
    now: string;
  }) {
    const key = scopedKey(input.ownerId, input.companyId, input.workspaceId);
    const current = this.#workspaces.get(key);
    if (
      !current ||
      current.leaseOwner !== input.workerId ||
      current.leaseGeneration !== input.generation
    )
      return false;
    this.#workspaces.set(
      key,
      EngineeringWorkspaceSchema.parse({
        ...current,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: input.now,
      }),
    );
    return true;
  }

  saveExecution(value: EngineeringExecutionRecord) {
    const parsed = EngineeringExecutionRecordSchema.parse(value);
    this.#executions.set(
      scopedKey(parsed.ownerId, parsed.companyId, parsed.id),
      clone(parsed),
    );
  }

  saveValidation(
    value: EngineeringValidationReport,
    ownerId: string,
    companyId: string,
  ) {
    const parsed = EngineeringValidationReportSchema.parse(value);
    this.#validations.set(scopedKey(ownerId, companyId, parsed.id), clone(parsed));
  }
  findValidation(ownerId: string, companyId: string, id: string) {
    const value = this.#validations.get(scopedKey(ownerId, companyId, id));
    return value ? clone(value) : undefined;
  }
}

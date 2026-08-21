import {
  SemanticIndexRecordSchema,
  SemanticNavigationRecordSchema,
  SemanticWorkspaceRecordSchema,
  WorkspaceMemoryRecordSchema,
  WorkspaceSemanticContextSchema,
  WorkspaceSemanticObjectSchema,
  WorkspaceSemanticRelationshipSchema,
  type SemanticIndexRecord,
  type SemanticNavigationRecord,
  type SemanticWorkspaceRecord,
  type WorkspaceMemoryRecord,
  type WorkspaceSemanticContext,
  type WorkspaceSemanticObject,
  type WorkspaceSemanticRelationship,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface WorkspaceIntelligenceStore {
  saveWorkspace(record: SemanticWorkspaceRecord): Awaitable<void>;
  listWorkspaces(ownerId: string, limit: number): Awaitable<SemanticWorkspaceRecord[]>;
  saveObject(record: WorkspaceSemanticObject): Awaitable<void>;
  listObjects(ownerId: string, limit: number): Awaitable<WorkspaceSemanticObject[]>;
  getObject(ownerId: string, objectId: string): Awaitable<WorkspaceSemanticObject | null>;
  saveRelationship(record: WorkspaceSemanticRelationship): Awaitable<void>;
  listRelationships(
    ownerId: string,
    limit: number,
  ): Awaitable<WorkspaceSemanticRelationship[]>;
  saveContext(record: WorkspaceSemanticContext): Awaitable<void>;
  listContexts(ownerId: string, limit: number): Awaitable<WorkspaceSemanticContext[]>;
  saveIndex(record: SemanticIndexRecord): Awaitable<void>;
  listIndexes(ownerId: string, limit: number): Awaitable<SemanticIndexRecord[]>;
  saveNavigation(record: SemanticNavigationRecord): Awaitable<void>;
  listNavigation(ownerId: string, limit: number): Awaitable<SemanticNavigationRecord[]>;
  saveMemory(record: WorkspaceMemoryRecord): Awaitable<void>;
  listMemory(ownerId: string, limit: number): Awaitable<WorkspaceMemoryRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryWorkspaceIntelligenceStore implements WorkspaceIntelligenceStore {
  readonly #workspaces = new Map<string, SemanticWorkspaceRecord>();
  readonly #objects = new Map<string, WorkspaceSemanticObject>();
  readonly #relationships = new Map<string, WorkspaceSemanticRelationship>();
  readonly #contexts = new Map<string, WorkspaceSemanticContext>();
  readonly #indexes = new Map<string, SemanticIndexRecord>();
  readonly #navigation = new Map<string, SemanticNavigationRecord>();
  readonly #memory = new Map<string, WorkspaceMemoryRecord>();

  saveWorkspace(record: SemanticWorkspaceRecord) {
    this.#workspaces.set(record.id, clone(SemanticWorkspaceRecordSchema.parse(record)));
  }
  listWorkspaces(ownerId: string, limit: number) {
    return ordered(
      [...this.#workspaces.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveObject(record: WorkspaceSemanticObject) {
    this.#objects.set(record.id, clone(WorkspaceSemanticObjectSchema.parse(record)));
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
  saveRelationship(record: WorkspaceSemanticRelationship) {
    this.#relationships.set(
      record.id,
      clone(WorkspaceSemanticRelationshipSchema.parse(record)),
    );
  }
  listRelationships(ownerId: string, limit: number) {
    return ordered(
      [...this.#relationships.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveContext(record: WorkspaceSemanticContext) {
    this.#contexts.set(record.id, clone(WorkspaceSemanticContextSchema.parse(record)));
  }
  listContexts(ownerId: string, limit: number) {
    return ordered(
      [...this.#contexts.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveIndex(record: SemanticIndexRecord) {
    this.#indexes.set(record.id, clone(SemanticIndexRecordSchema.parse(record)));
  }
  listIndexes(ownerId: string, limit: number) {
    return ordered(
      [...this.#indexes.values()].filter((item) => item.ownerId === ownerId),
      "indexedAt",
      limit,
    );
  }
  saveNavigation(record: SemanticNavigationRecord) {
    this.#navigation.set(record.id, clone(SemanticNavigationRecordSchema.parse(record)));
  }
  listNavigation(ownerId: string, limit: number) {
    return ordered(
      [...this.#navigation.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveMemory(record: WorkspaceMemoryRecord) {
    this.#memory.set(record.id, clone(WorkspaceMemoryRecordSchema.parse(record)));
  }
  listMemory(ownerId: string, limit: number) {
    return ordered(
      [...this.#memory.values()].filter((item) => item.ownerId === ownerId),
      "lastUsedAt",
      limit,
    );
  }
}

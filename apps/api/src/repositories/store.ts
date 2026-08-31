import {
  DirectoryNodeSchema,
  FileInventoryRecordSchema,
  ApiRouteRecordSchema,
  ArchitectureEdgeSchema,
  ArchitectureNodeSchema,
  DatabaseModelRecordSchema,
  RepositoryInsightSchema,
  RepositoryGenerationSchema,
  RepositoryIndexJobSchema,
  RepositorySchema,
  SemanticDependencyRecordSchema,
  SemanticReferenceRecordSchema,
  SemanticSymbolRecordSchema,
  type ApiRouteRecord,
  type ArchitectureEdge,
  type ArchitectureNode,
  type DatabaseModelRecord,
  type DirectoryNode,
  type FileInventoryRecord,
  type Repository,
  type RepositoryGeneration,
  type RepositoryIndexJob,
  type RepositoryInsight,
  type SemanticDependencyRecord,
  type SemanticImportRecord,
  type SemanticExportRecord,
  type SemanticReferenceRecord,
  type SemanticRelationRecord,
  type SemanticSymbolRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";
import { companyScope } from "../companies/scope.js";

export interface RepositoryStore {
  upsertRepository(repository: Repository): Awaitable<Repository>;
  findRepository(id: string): Awaitable<Repository | undefined>;
  findRepositoryByWorkspace(
    ownerId: string,
    workspaceId: string,
  ): Awaitable<Repository | undefined>;
  listRepositories(ownerId: string): Awaitable<Repository[]>;
  updateRepository(repository: Repository): Awaitable<void>;
  createJob(job: RepositoryIndexJob): Awaitable<RepositoryIndexJob>;
  findActiveJob(repositoryId: string): Awaitable<RepositoryIndexJob | undefined>;
  findJobByExecutionRequestId(
    executionRequestId: string,
  ): Awaitable<RepositoryIndexJob | undefined>;
  latestJob(repositoryId: string): Awaitable<RepositoryIndexJob | undefined>;
  updateJob(job: RepositoryIndexJob): Awaitable<void>;
  publishGeneration(input: {
    repository: Repository;
    generation: RepositoryGeneration;
    files: FileInventoryRecord[];
    directories: DirectoryNode[];
    semanticIndex: RepositorySemanticStoreRecords;
  }): Awaitable<void>;
  activeGeneration(repositoryId: string): Awaitable<RepositoryGeneration | undefined>;
  listFiles(input: {
    repositoryId: string;
    generation: number;
    limit: number;
    offset: number;
    extension?: string;
    language?: string;
    classification?: string;
    directory?: string;
  }): Awaitable<{ files: FileInventoryRecord[]; total: number }>;
  listDirectories(
    repositoryId: string,
    generation: number,
    limit: number,
  ): Awaitable<DirectoryNode[]>;
  listSymbols(input: {
    repositoryId: string;
    generation: number;
    query?: string;
    kind?: SemanticSymbolRecord["kind"];
    limit: number;
  }): Awaitable<SemanticSymbolRecord[]>;
  findSymbol(input: {
    repositoryId: string;
    generation: number;
    symbolId?: string;
    name?: string;
  }): Awaitable<SemanticSymbolRecord | undefined>;
  listReferences(input: {
    repositoryId: string;
    generation: number;
    symbolId?: string;
    name?: string;
    limit: number;
  }): Awaitable<SemanticReferenceRecord[]>;
  listDependencies(
    repositoryId: string,
    generation: number,
  ): Awaitable<SemanticDependencyRecord[]>;
  listArchitectureNodes(
    repositoryId: string,
    generation: number,
  ): Awaitable<ArchitectureNode[]>;
  listArchitectureEdges(
    repositoryId: string,
    generation: number,
  ): Awaitable<ArchitectureEdge[]>;
  listApiRoutes(repositoryId: string, generation: number): Awaitable<ApiRouteRecord[]>;
  listDatabaseModels(
    repositoryId: string,
    generation: number,
  ): Awaitable<DatabaseModelRecord[]>;
  listInsights(
    repositoryId: string,
    generation: number,
  ): Awaitable<RepositoryInsight[]>;
}

export type RepositorySemanticStoreRecords = {
  symbols: SemanticSymbolRecord[];
  imports: SemanticImportRecord[];
  exports: SemanticExportRecord[];
  dependencies: SemanticDependencyRecord[];
  references: SemanticReferenceRecord[];
  relations: SemanticRelationRecord[];
  apiRoutes: ApiRouteRecord[];
  databaseModels: DatabaseModelRecord[];
  architectureNodes: ArchitectureNode[];
  architectureEdges: ArchitectureEdge[];
  insights: RepositoryInsight[];
};

export class InMemoryRepositoryStore implements RepositoryStore {
  readonly #repositories = new Map<string, Repository>();
  readonly #repositoryCompanies = new Map<string, string | null>();
  readonly #jobs = new Map<string, RepositoryIndexJob>();
  readonly #generations = new Map<string, RepositoryGeneration>();
  readonly #files = new Map<string, FileInventoryRecord[]>();
  readonly #directories = new Map<string, DirectoryNode[]>();
  readonly #symbols = new Map<string, SemanticSymbolRecord[]>();
  readonly #references = new Map<string, SemanticReferenceRecord[]>();
  readonly #dependencies = new Map<string, SemanticDependencyRecord[]>();
  readonly #architectureNodes = new Map<string, ArchitectureNode[]>();
  readonly #architectureEdges = new Map<string, ArchitectureEdge[]>();
  readonly #apiRoutes = new Map<string, ApiRouteRecord[]>();
  readonly #databaseModels = new Map<string, DatabaseModelRecord[]>();
  readonly #insights = new Map<string, RepositoryInsight[]>();

  upsertRepository(repository: Repository) {
    const parsed = RepositorySchema.parse(repository);
    this.#repositories.set(parsed.id, structuredClone(parsed));
    this.#repositoryCompanies.set(parsed.id, companyScope.companyId(parsed.ownerId) ?? null);
    return structuredClone(parsed);
  }

  findRepository(id: string) {
    const repository = this.#repositories.get(id);
    const companyId = repository ? companyScope.companyId(repository.ownerId) : undefined;
    return this.clone(repository && (!companyId || this.#repositoryCompanies.get(id) === companyId) ? repository : undefined);
  }

  findRepositoryByWorkspace(ownerId: string, workspaceId: string) {
    return this.clone(
      [...this.#repositories.values()].find(
        (repository) =>
          repository.ownerId === ownerId &&
          repository.workspaceId === workspaceId &&
          (!companyScope.companyId(ownerId) ||
            this.#repositoryCompanies.get(repository.id) === companyScope.companyId(ownerId)),
      ),
    );
  }

  listRepositories(ownerId: string) {
    return [...this.#repositories.values()]
      .filter((repository) => repository.ownerId === ownerId && (!companyScope.companyId(ownerId) || this.#repositoryCompanies.get(repository.id) === companyScope.companyId(ownerId)))
      .sort((left, right) => left.workspaceId.localeCompare(right.workspaceId))
      .map((repository) => structuredClone(repository));
  }

  updateRepository(repository: Repository) {
    if (!this.findRepository(repository.id)) throw new Error("Repository missing.");
    this.#repositories.set(
      repository.id,
      structuredClone(RepositorySchema.parse(repository)),
    );
  }

  createJob(job: RepositoryIndexJob) {
    const active = this.findActiveJob(job.repositoryId);
    if (active) return active;
    const parsed = RepositoryIndexJobSchema.parse(job);
    this.#jobs.set(parsed.id, structuredClone(parsed));
    return structuredClone(parsed);
  }

  findActiveJob(repositoryId: string) {
    return this.clone(
      [...this.#jobs.values()].find(
        (job) =>
          job.repositoryId === repositoryId &&
          ["QUEUED", "RUNNING"].includes(job.status),
      ),
    );
  }

  findJobByExecutionRequestId(executionRequestId: string) {
    return this.clone(
      [...this.#jobs.values()].find(
        (job) => job.executionRequestId === executionRequestId,
      ),
    );
  }

  latestJob(repositoryId: string) {
    return this.clone(
      [...this.#jobs.values()]
        .filter((job) => job.repositoryId === repositoryId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0],
    );
  }

  updateJob(job: RepositoryIndexJob) {
    if (!this.#jobs.has(job.id)) throw new Error("Index job missing.");
    this.#jobs.set(job.id, structuredClone(RepositoryIndexJobSchema.parse(job)));
  }

  publishGeneration(input: {
    repository: Repository;
    generation: RepositoryGeneration;
    files: FileInventoryRecord[];
    directories: DirectoryNode[];
    semanticIndex: RepositorySemanticStoreRecords;
  }) {
    const generation = RepositoryGenerationSchema.parse(input.generation);
    const key = `${generation.repositoryId}:${generation.generation}`;
    this.#generations.set(key, structuredClone(generation));
    this.#files.set(
      key,
      input.files.map((file) => structuredClone(FileInventoryRecordSchema.parse(file))),
    );
    this.#directories.set(
      key,
      input.directories.map((node) => structuredClone(DirectoryNodeSchema.parse(node))),
    );
    this.#symbols.set(
      key,
      input.semanticIndex.symbols.map((symbol) =>
        structuredClone(SemanticSymbolRecordSchema.parse(symbol)),
      ),
    );
    this.#references.set(
      key,
      input.semanticIndex.references.map((reference) =>
        structuredClone(SemanticReferenceRecordSchema.parse(reference)),
      ),
    );
    this.#dependencies.set(
      key,
      input.semanticIndex.dependencies.map((dependency) =>
        structuredClone(SemanticDependencyRecordSchema.parse(dependency)),
      ),
    );
    this.#architectureNodes.set(
      key,
      input.semanticIndex.architectureNodes.map((node) =>
        structuredClone(ArchitectureNodeSchema.parse(node)),
      ),
    );
    this.#architectureEdges.set(
      key,
      input.semanticIndex.architectureEdges.map((edge) =>
        structuredClone(ArchitectureEdgeSchema.parse(edge)),
      ),
    );
    this.#apiRoutes.set(
      key,
      input.semanticIndex.apiRoutes.map((route) =>
        structuredClone(ApiRouteRecordSchema.parse(route)),
      ),
    );
    this.#databaseModels.set(
      key,
      input.semanticIndex.databaseModels.map((model) =>
        structuredClone(DatabaseModelRecordSchema.parse(model)),
      ),
    );
    this.#insights.set(
      key,
      input.semanticIndex.insights.map((insight) =>
        structuredClone(RepositoryInsightSchema.parse(insight)),
      ),
    );
    this.updateRepository(input.repository);
  }

  activeGeneration(repositoryId: string) {
    const repository = this.#repositories.get(repositoryId);
    if (!repository?.activeGeneration) return undefined;
    return this.clone(
      this.#generations.get(`${repositoryId}:${repository.activeGeneration}`),
    );
  }

  listFiles(input: {
    repositoryId: string;
    generation: number;
    limit: number;
    offset: number;
    extension?: string;
    language?: string;
    classification?: string;
    directory?: string;
  }) {
    const files = (this.#files.get(`${input.repositoryId}:${input.generation}`) ?? [])
      .filter(
        (file) =>
          (!input.extension || file.extension === input.extension) &&
          (!input.language || file.language === input.language) &&
          (!input.classification || file.classification === input.classification) &&
          (!input.directory || file.parentDirectory === input.directory),
      )
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return {
      files: files
        .slice(input.offset, input.offset + input.limit)
        .map((file) => structuredClone(file)),
      total: files.length,
    };
  }

  listDirectories(repositoryId: string, generation: number, limit: number) {
    return (this.#directories.get(`${repositoryId}:${generation}`) ?? [])
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
      .slice(0, limit)
      .map((node) => structuredClone(node));
  }

  listSymbols(input: {
    repositoryId: string;
    generation: number;
    query?: string;
    kind?: SemanticSymbolRecord["kind"];
    limit: number;
  }) {
    const needle = input.query?.toLowerCase();
    return (this.#symbols.get(`${input.repositoryId}:${input.generation}`) ?? [])
      .filter(
        (symbol) =>
          (!input.kind || symbol.kind === input.kind) &&
          (!needle ||
            symbol.name.toLowerCase().includes(needle) ||
            symbol.relativePath.toLowerCase().includes(needle)),
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, input.limit)
      .map((symbol) => structuredClone(symbol));
  }

  findSymbol(input: {
    repositoryId: string;
    generation: number;
    symbolId?: string;
    name?: string;
  }) {
    return this.clone(
      (this.#symbols.get(`${input.repositoryId}:${input.generation}`) ?? []).find(
        (symbol) =>
          (input.symbolId && symbol.symbolId === input.symbolId) ||
          (input.name && symbol.name === input.name),
      ),
    );
  }

  listReferences(input: {
    repositoryId: string;
    generation: number;
    symbolId?: string;
    name?: string;
    limit: number;
  }) {
    return (this.#references.get(`${input.repositoryId}:${input.generation}`) ?? [])
      .filter(
        (reference) =>
          (input.symbolId && reference.targetSymbolId === input.symbolId) ||
          (input.name && reference.name === input.name),
      )
      .sort(
        (left, right) =>
          left.location.relativePath.localeCompare(right.location.relativePath) ||
          left.location.line - right.location.line,
      )
      .slice(0, input.limit)
      .map((reference) => structuredClone(reference));
  }

  listDependencies(repositoryId: string, generation: number) {
    return (this.#dependencies.get(`${repositoryId}:${generation}`) ?? []).map(
      (dependency) => structuredClone(dependency),
    );
  }

  listArchitectureNodes(repositoryId: string, generation: number) {
    return (this.#architectureNodes.get(`${repositoryId}:${generation}`) ?? []).map(
      (node) => structuredClone(node),
    );
  }

  listArchitectureEdges(repositoryId: string, generation: number) {
    return (this.#architectureEdges.get(`${repositoryId}:${generation}`) ?? []).map(
      (edge) => structuredClone(edge),
    );
  }

  listApiRoutes(repositoryId: string, generation: number) {
    return (this.#apiRoutes.get(`${repositoryId}:${generation}`) ?? []).map((route) =>
      structuredClone(route),
    );
  }

  listDatabaseModels(repositoryId: string, generation: number) {
    return (this.#databaseModels.get(`${repositoryId}:${generation}`) ?? []).map(
      (model) => structuredClone(model),
    );
  }

  listInsights(repositoryId: string, generation: number) {
    return (this.#insights.get(`${repositoryId}:${generation}`) ?? []).map((insight) =>
      structuredClone(insight),
    );
  }

  private clone<T>(value: T | undefined): T | undefined {
    return value === undefined ? undefined : structuredClone(value);
  }
}

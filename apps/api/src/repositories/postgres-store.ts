import type {
  ApiRouteRecord,
  ArchitectureEdge,
  ArchitectureNode,
  DatabaseModelRecord,
  DirectoryNode,
  FileInventoryRecord,
  Repository,
  RepositoryGeneration,
  RepositoryIndexJob,
  RepositoryInsight,
  SemanticDependencyRecord,
  SemanticReferenceRecord,
  SemanticSymbolRecord,
} from "@alexa-control/shared";
import {
  ApiRouteRecordSchema,
  ArchitectureEdgeSchema,
  ArchitectureNodeSchema,
  DatabaseModelRecordSchema,
  DirectoryNodeSchema,
  FileInventoryRecordSchema,
  RepositoryInsightSchema,
  RepositoryGenerationSchema,
  RepositoryIndexJobSchema,
  RepositorySchema,
  SemanticDependencyRecordSchema,
  SemanticImportRecordSchema,
  SemanticExportRecordSchema,
  SemanticReferenceRecordSchema,
  SemanticRelationRecordSchema,
  SemanticSymbolRecordSchema,
} from "@alexa-control/shared";
import type pg from "pg";

import type { RepositorySemanticStoreRecords, RepositoryStore } from "./store.js";

const one = <T>(row: { record: T } | undefined) =>
  row ? structuredClone(row.record) : undefined;

export class PostgresRepositoryStore implements RepositoryStore {
  constructor(private readonly pool: pg.Pool) {}

  async upsertRepository(repository: Repository) {
    const parsed = RepositorySchema.parse(repository);
    const result = await this.pool.query<{ record: Repository }>(
      `INSERT INTO repositories(
        id,owner_id,workspace_id,index_status,active_generation,
        active_fingerprint,created_at,updated_at,record
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(owner_id, workspace_id) DO UPDATE
      SET updated_at=excluded.updated_at
      RETURNING record`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.workspaceId,
        parsed.indexStatus,
        parsed.activeGeneration,
        parsed.activeFingerprint,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
    return structuredClone(result.rows[0]!.record);
  }

  async findRepository(id: string) {
    const result = await this.pool.query<{ record: Repository }>(
      "SELECT record FROM repositories WHERE id=$1",
      [id],
    );
    return one(result.rows[0]);
  }

  async findRepositoryByWorkspace(ownerId: string, workspaceId: string) {
    const result = await this.pool.query<{ record: Repository }>(
      "SELECT record FROM repositories WHERE owner_id=$1 AND workspace_id=$2",
      [ownerId, workspaceId],
    );
    return one(result.rows[0]);
  }

  async listRepositories(ownerId: string) {
    const result = await this.pool.query<{ record: Repository }>(
      "SELECT record FROM repositories WHERE owner_id=$1 ORDER BY workspace_id",
      [ownerId],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async updateRepository(repository: Repository) {
    const parsed = RepositorySchema.parse(repository);
    await this.pool.query(
      `UPDATE repositories SET index_status=$2,active_generation=$3,
       active_fingerprint=$4,updated_at=$5,record=$6
       WHERE id=$1 AND owner_id=$7`,
      [
        parsed.id,
        parsed.indexStatus,
        parsed.activeGeneration,
        parsed.activeFingerprint,
        parsed.updatedAt,
        parsed,
        parsed.ownerId,
      ],
    );
  }

  async createJob(job: RepositoryIndexJob) {
    const parsed = RepositoryIndexJobSchema.parse(job);
    const result = await this.pool.query<{ record: RepositoryIndexJob }>(
      `INSERT INTO repository_index_jobs(
        id,repository_id,owner_id,workspace_id,status,execution_request_id,
        created_at,completed_at,record
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(repository_id) WHERE status IN ('QUEUED','RUNNING')
      DO UPDATE SET repository_id=excluded.repository_id
      RETURNING record`,
      [
        parsed.id,
        parsed.repositoryId,
        parsed.ownerId,
        parsed.workspaceId,
        parsed.status,
        parsed.executionRequestId,
        parsed.createdAt,
        parsed.completedAt,
        parsed,
      ],
    );
    return structuredClone(result.rows[0]!.record);
  }

  async findActiveJob(repositoryId: string) {
    const result = await this.pool.query<{ record: RepositoryIndexJob }>(
      `SELECT record FROM repository_index_jobs
       WHERE repository_id=$1 AND status IN ('QUEUED','RUNNING')
       ORDER BY created_at DESC LIMIT 1`,
      [repositoryId],
    );
    return one(result.rows[0]);
  }

  async findJobByExecutionRequestId(executionRequestId: string) {
    const result = await this.pool.query<{ record: RepositoryIndexJob }>(
      "SELECT record FROM repository_index_jobs WHERE execution_request_id=$1",
      [executionRequestId],
    );
    return one(result.rows[0]);
  }

  async latestJob(repositoryId: string) {
    const result = await this.pool.query<{ record: RepositoryIndexJob }>(
      `SELECT record FROM repository_index_jobs
       WHERE repository_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [repositoryId],
    );
    return one(result.rows[0]);
  }

  async updateJob(job: RepositoryIndexJob) {
    const parsed = RepositoryIndexJobSchema.parse(job);
    await this.pool.query(
      `UPDATE repository_index_jobs SET status=$2,execution_request_id=$3,
       completed_at=$4,record=$5 WHERE id=$1 AND owner_id=$6`,
      [
        parsed.id,
        parsed.status,
        parsed.executionRequestId,
        parsed.completedAt,
        parsed,
        parsed.ownerId,
      ],
    );
  }

  async publishGeneration(input: {
    repository: Repository;
    generation: RepositoryGeneration;
    files: FileInventoryRecord[];
    directories: DirectoryNode[];
    semanticIndex: RepositorySemanticStoreRecords;
  }) {
    const repository = RepositorySchema.parse(input.repository);
    const generation = RepositoryGenerationSchema.parse(input.generation);
    const files = input.files.map((file) => FileInventoryRecordSchema.parse(file));
    const directories = input.directories.map((node) =>
      DirectoryNodeSchema.parse(node),
    );
    const semanticIndex = {
      symbols: input.semanticIndex.symbols.map((symbol) =>
        SemanticSymbolRecordSchema.parse(symbol),
      ),
      imports: input.semanticIndex.imports.map((record) =>
        SemanticImportRecordSchema.parse(record),
      ),
      exports: input.semanticIndex.exports.map((record) =>
        SemanticExportRecordSchema.parse(record),
      ),
      dependencies: input.semanticIndex.dependencies.map((record) =>
        SemanticDependencyRecordSchema.parse(record),
      ),
      references: input.semanticIndex.references.map((record) =>
        SemanticReferenceRecordSchema.parse(record),
      ),
      relations: input.semanticIndex.relations.map((record) =>
        SemanticRelationRecordSchema.parse(record),
      ),
      apiRoutes: input.semanticIndex.apiRoutes.map((record) =>
        ApiRouteRecordSchema.parse(record),
      ),
      databaseModels: input.semanticIndex.databaseModels.map((record) =>
        DatabaseModelRecordSchema.parse(record),
      ),
      architectureNodes: input.semanticIndex.architectureNodes.map((record) =>
        ArchitectureNodeSchema.parse(record),
      ),
      architectureEdges: input.semanticIndex.architectureEdges.map((record) =>
        ArchitectureEdgeSchema.parse(record),
      ),
      insights: input.semanticIndex.insights.map((record) =>
        RepositoryInsightSchema.parse(record),
      ),
    };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO repository_generations(
          id,repository_id,owner_id,workspace_id,generation,fingerprint,
          execution_request_id,indexed_at,record
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          generation.id,
          generation.repositoryId,
          generation.ownerId,
          generation.workspaceId,
          generation.generation,
          generation.fingerprint,
          generation.executionRequestId,
          generation.indexedAt,
          generation,
        ],
      );
      for (const file of files) {
        await client.query(
          `INSERT INTO file_inventory(
            repository_id,generation,owner_id,workspace_id,relative_path,
            parent_directory,extension,language,classification,size_bytes,
            modified_at,record
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            file.repositoryId,
            file.generation,
            repository.ownerId,
            file.workspaceId,
            file.relativePath,
            file.parentDirectory,
            file.extension,
            file.language,
            file.classification,
            file.sizeBytes,
            file.modifiedAt,
            file,
          ],
        );
      }
      for (const node of directories) {
        await client.query(
          `INSERT INTO directory_nodes(
            repository_id,generation,owner_id,workspace_id,relative_path,
            parent_directory,record
          ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            node.repositoryId,
            node.generation,
            repository.ownerId,
            node.workspaceId,
            node.relativePath,
            node.parentDirectory,
            node,
          ],
        );
      }
      for (const symbol of semanticIndex.symbols) {
        await client.query(
          `INSERT INTO semantic_symbols(
            repository_id,generation,owner_id,workspace_id,symbol_id,name,kind,
            relative_path,line,record
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            symbol.repositoryId,
            symbol.generation,
            repository.ownerId,
            symbol.workspaceId,
            symbol.symbolId,
            symbol.name,
            symbol.kind,
            symbol.relativePath,
            symbol.line,
            symbol,
          ],
        );
      }
      for (const record of semanticIndex.imports) {
        await client.query(
          `INSERT INTO semantic_imports(
            repository_id,generation,owner_id,workspace_id,source_file,
            imported_module,record
          ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            record.repositoryId,
            record.generation,
            repository.ownerId,
            record.workspaceId,
            record.sourceFile,
            record.importedModule,
            record,
          ],
        );
      }
      for (const record of semanticIndex.exports) {
        await client.query(
          `INSERT INTO semantic_exports(
            repository_id,generation,owner_id,workspace_id,source_file,
            exported_name,record
          ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            record.repositoryId,
            record.generation,
            repository.ownerId,
            record.workspaceId,
            record.sourceFile,
            record.exportedName,
            record,
          ],
        );
      }
      for (const dependency of semanticIndex.dependencies) {
        await client.query(
          `INSERT INTO semantic_dependencies(
            repository_id,generation,owner_id,workspace_id,source_file,
            target_module,target_file,record
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            dependency.repositoryId,
            dependency.generation,
            repository.ownerId,
            dependency.workspaceId,
            dependency.sourceFile,
            dependency.targetModule,
            dependency.targetFile,
            dependency,
          ],
        );
      }
      for (const reference of semanticIndex.references) {
        await client.query(
          `INSERT INTO semantic_references(
            repository_id,generation,owner_id,workspace_id,reference_id,name,kind,
            target_symbol_id,record
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            reference.repositoryId,
            reference.generation,
            repository.ownerId,
            reference.workspaceId,
            reference.referenceId,
            reference.name,
            reference.kind,
            reference.targetSymbolId,
            reference,
          ],
        );
      }
      for (const relation of semanticIndex.relations) {
        await client.query(
          `INSERT INTO semantic_relations(
            repository_id,generation,owner_id,workspace_id,source_symbol_id,
            relation_kind,target_name,target_symbol_id,record
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            relation.repositoryId,
            relation.generation,
            repository.ownerId,
            relation.workspaceId,
            relation.sourceSymbolId,
            relation.relationKind,
            relation.targetName,
            relation.targetSymbolId,
            relation,
          ],
        );
      }
      for (const route of semanticIndex.apiRoutes) {
        await client.query(
          `INSERT INTO api_routes(
            repository_id,generation,owner_id,workspace_id,relative_path,
            http_method,route_path,record
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            route.repositoryId,
            route.generation,
            repository.ownerId,
            route.workspaceId,
            route.relativePath,
            route.httpMethod,
            route.routePath,
            route,
          ],
        );
      }
      for (const model of semanticIndex.databaseModels) {
        await client.query(
          `INSERT INTO database_models(
            repository_id,generation,owner_id,workspace_id,model_name,
            model_kind,relative_path,record
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            model.repositoryId,
            model.generation,
            repository.ownerId,
            model.workspaceId,
            model.modelName,
            model.modelKind,
            model.relativePath,
            model,
          ],
        );
      }
      for (const node of semanticIndex.architectureNodes) {
        await client.query(
          `INSERT INTO architecture_nodes(
            repository_id,generation,owner_id,workspace_id,node_id,kind,label,
            relative_path,record
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            node.repositoryId,
            node.generation,
            repository.ownerId,
            node.workspaceId,
            node.nodeId,
            node.kind,
            node.label,
            node.relativePath,
            node,
          ],
        );
      }
      for (const edge of semanticIndex.architectureEdges) {
        await client.query(
          `INSERT INTO architecture_edges(
            repository_id,generation,owner_id,workspace_id,source_node_id,
            target_node_id,relation,record
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            edge.repositoryId,
            edge.generation,
            repository.ownerId,
            edge.workspaceId,
            edge.sourceNodeId,
            edge.targetNodeId,
            edge.relation,
            edge,
          ],
        );
      }
      for (const insight of semanticIndex.insights) {
        await client.query(
          `INSERT INTO repository_insights(
            repository_id,generation,owner_id,workspace_id,insight_type,severity,record
          ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            insight.repositoryId,
            insight.generation,
            repository.ownerId,
            insight.workspaceId,
            insight.insightType,
            insight.severity,
            insight,
          ],
        );
      }
      await client.query(
        `UPDATE repositories SET index_status=$2,active_generation=$3,
         active_fingerprint=$4,updated_at=$5,record=$6 WHERE id=$1`,
        [
          repository.id,
          repository.indexStatus,
          repository.activeGeneration,
          repository.activeFingerprint,
          repository.updatedAt,
          repository,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async activeGeneration(repositoryId: string) {
    const repository = await this.findRepository(repositoryId);
    if (!repository?.activeGeneration) return undefined;
    const result = await this.pool.query<{ record: RepositoryGeneration }>(
      "SELECT record FROM repository_generations WHERE repository_id=$1 AND generation=$2",
      [repositoryId, repository.activeGeneration],
    );
    return one(result.rows[0]);
  }

  async listFiles(input: {
    repositoryId: string;
    generation: number;
    limit: number;
    offset: number;
    extension?: string;
    language?: string;
    classification?: string;
    directory?: string;
  }) {
    const result = await this.pool.query<{
      record: FileInventoryRecord;
      total: string;
    }>(
      `SELECT record, count(*) OVER() AS total FROM file_inventory
       WHERE repository_id=$1 AND generation=$2
         AND ($5::varchar IS NULL OR extension=$5)
         AND ($6::varchar IS NULL OR language=$6)
         AND ($7::varchar IS NULL OR classification=$7)
         AND ($8::varchar IS NULL OR parent_directory=$8)
       ORDER BY relative_path LIMIT $3 OFFSET $4`,
      [
        input.repositoryId,
        input.generation,
        input.limit,
        input.offset,
        input.extension ?? null,
        input.language ?? null,
        input.classification ?? null,
        input.directory ?? null,
      ],
    );
    return {
      files: result.rows.map((row) => structuredClone(row.record)),
      total: Number(result.rows[0]?.total ?? 0),
    };
  }

  async listDirectories(repositoryId: string, generation: number, limit: number) {
    const result = await this.pool.query<{ record: DirectoryNode }>(
      `SELECT record FROM directory_nodes
       WHERE repository_id=$1 AND generation=$2 ORDER BY relative_path LIMIT $3`,
      [repositoryId, generation, limit],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async listSymbols(input: {
    repositoryId: string;
    generation: number;
    query?: string;
    kind?: SemanticSymbolRecord["kind"];
    limit: number;
  }) {
    const result = await this.pool.query<{ record: SemanticSymbolRecord }>(
      `SELECT record FROM semantic_symbols
       WHERE repository_id=$1 AND generation=$2
         AND ($3::varchar IS NULL OR name ILIKE '%' || $3 || '%' OR relative_path ILIKE '%' || $3 || '%')
         AND ($4::varchar IS NULL OR kind=$4)
       ORDER BY name LIMIT $5`,
      [
        input.repositoryId,
        input.generation,
        input.query ?? null,
        input.kind ?? null,
        input.limit,
      ],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async findSymbol(input: {
    repositoryId: string;
    generation: number;
    symbolId?: string;
    name?: string;
  }) {
    const result = await this.pool.query<{ record: SemanticSymbolRecord }>(
      `SELECT record FROM semantic_symbols
       WHERE repository_id=$1 AND generation=$2
         AND (($3::char(64) IS NOT NULL AND symbol_id=$3) OR ($4::varchar IS NOT NULL AND name=$4))
       ORDER BY line LIMIT 1`,
      [
        input.repositoryId,
        input.generation,
        input.symbolId ?? null,
        input.name ?? null,
      ],
    );
    return one(result.rows[0]);
  }

  async listReferences(input: {
    repositoryId: string;
    generation: number;
    symbolId?: string;
    name?: string;
    limit: number;
  }) {
    const result = await this.pool.query<{ record: SemanticReferenceRecord }>(
      `SELECT record FROM semantic_references
       WHERE repository_id=$1 AND generation=$2
         AND (($3::char(64) IS NOT NULL AND target_symbol_id=$3) OR ($4::varchar IS NOT NULL AND name=$4))
       ORDER BY record #>> '{location,relativePath}', (record #>> '{location,line}')::integer
       LIMIT $5`,
      [
        input.repositoryId,
        input.generation,
        input.symbolId ?? null,
        input.name ?? null,
        input.limit,
      ],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async listDependencies(repositoryId: string, generation: number) {
    const result = await this.pool.query<{ record: SemanticDependencyRecord }>(
      `SELECT record FROM semantic_dependencies
       WHERE repository_id=$1 AND generation=$2
       ORDER BY source_file,target_module`,
      [repositoryId, generation],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async listArchitectureNodes(repositoryId: string, generation: number) {
    const result = await this.pool.query<{ record: ArchitectureNode }>(
      `SELECT record FROM architecture_nodes
       WHERE repository_id=$1 AND generation=$2
       ORDER BY kind,label`,
      [repositoryId, generation],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async listArchitectureEdges(repositoryId: string, generation: number) {
    const result = await this.pool.query<{ record: ArchitectureEdge }>(
      `SELECT record FROM architecture_edges
       WHERE repository_id=$1 AND generation=$2
       ORDER BY source_node_id,target_node_id`,
      [repositoryId, generation],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async listApiRoutes(repositoryId: string, generation: number) {
    const result = await this.pool.query<{ record: ApiRouteRecord }>(
      `SELECT record FROM api_routes
       WHERE repository_id=$1 AND generation=$2
       ORDER BY relative_path,http_method,route_path`,
      [repositoryId, generation],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async listDatabaseModels(repositoryId: string, generation: number) {
    const result = await this.pool.query<{ record: DatabaseModelRecord }>(
      `SELECT record FROM database_models
       WHERE repository_id=$1 AND generation=$2
       ORDER BY model_name`,
      [repositoryId, generation],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async listInsights(repositoryId: string, generation: number) {
    const result = await this.pool.query<{ record: RepositoryInsight }>(
      `SELECT record FROM repository_insights
       WHERE repository_id=$1 AND generation=$2
       ORDER BY insight_type`,
      [repositoryId, generation],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }
}

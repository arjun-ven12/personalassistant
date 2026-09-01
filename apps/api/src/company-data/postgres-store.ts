import {
  CompanyCredentialReferenceSchema,
  CompanyDataPipelineSchema,
  CompanyDataPolicySchema,
  CompanyDataSourceSchema,
  CompanyDatasetSchema,
  CompanyGlossaryTermSchema,
  CompanyIntegrationBindingSchema,
  CompanyPipelineRunSchema,
  CompanySemanticDocumentSchema,
  MetadataEntitySchema,
  MetadataLineageEdgeSchema,
  SemanticMetricObservationSchema,
  SemanticMetricSchema,
  type CompanyCredentialReference,
  type CompanyDataPipeline,
  type CompanyDataPolicy,
  type CompanyDataSource,
  type CompanyDataset,
  type CompanyGlossaryTerm,
  type CompanyIntegrationBinding,
  type CompanyPipelineRun,
  type CompanySemanticDocument,
  type MetadataEntity,
  type MetadataLineageEdge,
  type SemanticMetric,
  type SemanticMetricObservation,
} from "@alexa-control/shared";
import type { Pool, PoolClient } from "pg";

import {
  CompanyDatasetRecordSchema,
  type CompanyDataStore,
  type CompanyDatasetRecord,
} from "./store.js";

type RecordRow = { record: unknown };
const vectorLiteral = (value: number[]) =>
  `[${value.map((item) => Number(item).toString()).join(",")}]`;
const lexicalScore = (query: string, document: CompanySemanticDocument) => {
  const terms = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  const content = new Set(
    `${document.title} ${document.summary}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  const overlap = [...terms].filter((term) => content.has(term)).length;
  return terms.size ? overlap / terms.size : 0;
};

export class PostgresCompanyDataStore implements CompanyDataStore {
  constructor(readonly pool: Pool) {}

  async saveSource(value: CompanyDataSource) {
    const item = CompanyDataSourceSchema.parse(value);
    await this.pool.query(
      `INSERT INTO company_data_sources(id,owner_id,company_id,provider,source_type,status,record,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(owner_id,company_id,id) DO UPDATE SET status=$6,record=$7,updated_at=$9`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.provider,
        item.sourceType,
        item.status,
        item,
        item.createdAt,
        item.updatedAt,
      ],
    );
  }
  async findSource(ownerId: string, companyId: string, id: string) {
    return this.one(
      "company_data_sources",
      CompanyDataSourceSchema,
      ownerId,
      companyId,
      id,
    );
  }
  async listSources(ownerId: string, companyId: string) {
    return this.many(
      "SELECT record FROM company_data_sources WHERE owner_id=$1 AND company_id=$2 ORDER BY provider",
      CompanyDataSourceSchema,
      [ownerId, companyId],
    );
  }
  async saveDataset(value: CompanyDataset) {
    await this.upsertDataset(this.pool, value);
  }
  async findDataset(ownerId: string, companyId: string, id: string) {
    return this.one("company_datasets", CompanyDatasetSchema, ownerId, companyId, id);
  }
  async listDatasets(ownerId: string, companyId: string) {
    return this.many(
      "SELECT record FROM company_datasets WHERE owner_id=$1 AND company_id=$2 ORDER BY canonical_name",
      CompanyDatasetSchema,
      [ownerId, companyId],
    );
  }
  async savePipeline(value: CompanyDataPipeline) {
    await this.upsertPipeline(this.pool, value);
  }
  async findPipeline(ownerId: string, companyId: string, id: string) {
    return this.one(
      "company_data_pipelines",
      CompanyDataPipelineSchema,
      ownerId,
      companyId,
      id,
    );
  }
  async listPipelines(ownerId: string, companyId: string) {
    return this.many(
      "SELECT record FROM company_data_pipelines WHERE owner_id=$1 AND company_id=$2 ORDER BY updated_at DESC",
      CompanyDataPipelineSchema,
      [ownerId, companyId],
    );
  }
  async saveRun(value: CompanyPipelineRun) {
    await this.upsertRun(this.pool, value);
  }
  async listRuns(ownerId: string, companyId: string, limit: number) {
    return this.many(
      "SELECT record FROM company_pipeline_runs WHERE owner_id=$1 AND company_id=$2 ORDER BY started_at DESC LIMIT $3",
      CompanyPipelineRunSchema,
      [ownerId, companyId, limit],
    );
  }

  async commitLoad(input: {
    dataset: CompanyDataset;
    pipeline: CompanyDataPipeline;
    run: CompanyPipelineRun;
    records: CompanyDatasetRecord[];
    metadataEntities: MetadataEntity[];
    lineageEdges: MetadataLineageEdge[];
  }) {
    const dataset = CompanyDatasetSchema.parse(input.dataset);
    const pipeline = CompanyDataPipelineSchema.parse(input.pipeline);
    const run = CompanyPipelineRunSchema.parse(input.run);
    const records = input.records.map((item) => CompanyDatasetRecordSchema.parse(item));
    if (
      records.some(
        (item) =>
          item.ownerId !== dataset.ownerId ||
          item.companyId !== dataset.companyId ||
          item.datasetId !== dataset.id ||
          item.sourceId !== dataset.sourceId ||
          item.pipelineId !== pipeline.id,
      )
    )
      throw Object.assign(new Error("Destination scope mismatch."), {
        code: "DATA_DESTINATION_SCOPE_MISMATCH",
      });
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const scope = await client.query(
        `SELECT d.id FROM company_datasets d JOIN company_data_pipelines p ON p.owner_id=d.owner_id AND p.company_id=d.company_id AND p.dataset_id=d.id WHERE d.owner_id=$1 AND d.company_id=$2 AND d.id=$3 AND d.source_id=$4 AND p.id=$5 AND p.source_id=$4 FOR UPDATE`,
        [dataset.ownerId, dataset.companyId, dataset.id, dataset.sourceId, pipeline.id],
      );
      if (scope.rowCount !== 1)
        throw Object.assign(new Error("Destination scope mismatch."), {
          code: "DATA_DESTINATION_SCOPE_MISMATCH",
        });
      await this.upsertDataset(client, dataset);
      await this.upsertPipeline(client, pipeline);
      await this.upsertRun(client, run);
      for (const raw of input.metadataEntities) {
        const item = MetadataEntitySchema.parse(raw);
        await this.upsertMetadata(client, item);
      }
      for (const raw of input.lineageEdges) {
        const item = MetadataLineageEdgeSchema.parse(raw);
        await this.upsertLineage(client, item);
      }
      let written = 0;
      for (const item of records) {
        const result = await client.query(
          `INSERT INTO company_dataset_records(owner_id,company_id,source_id,pipeline_id,dataset_id,record_key,payload,ingested_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(owner_id,company_id,dataset_id,record_key) ${pipeline.writeDisposition === "MERGE" ? "DO UPDATE SET payload=EXCLUDED.payload,ingested_at=EXCLUDED.ingested_at" : "DO NOTHING"}`,
          [
            item.ownerId,
            item.companyId,
            item.sourceId,
            item.pipelineId,
            item.datasetId,
            item.recordKey,
            item.payload,
            item.ingestedAt,
          ],
        );
        written += result.rowCount ?? 0;
      }
      await client.query("COMMIT");
      return written;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async countDatasetRecords(ownerId: string, companyId: string, datasetId: string) {
    const result = await this.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM company_dataset_records WHERE owner_id=$1 AND company_id=$2 AND dataset_id=$3",
      [ownerId, companyId, datasetId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
  async saveMetadataEntity(value: MetadataEntity) {
    await this.upsertMetadata(this.pool, MetadataEntitySchema.parse(value));
  }
  async findMetadataEntity(ownerId: string, companyId: string, id: string) {
    return this.one(
      "company_metadata_entities",
      MetadataEntitySchema,
      ownerId,
      companyId,
      id,
    );
  }
  async listMetadataEntities(ownerId: string, companyId: string) {
    return this.many(
      "SELECT record FROM company_metadata_entities WHERE owner_id=$1 AND company_id=$2 ORDER BY entity_type,canonical_name",
      MetadataEntitySchema,
      [ownerId, companyId],
    );
  }
  async saveLineageEdge(value: MetadataLineageEdge) {
    await this.upsertLineage(this.pool, MetadataLineageEdgeSchema.parse(value));
  }
  async listLineageEdges(ownerId: string, companyId: string) {
    return this.many(
      "SELECT record FROM company_metadata_lineage WHERE owner_id=$1 AND company_id=$2 ORDER BY created_at",
      MetadataLineageEdgeSchema,
      [ownerId, companyId],
    );
  }
  async saveGlossaryTerm(value: CompanyGlossaryTerm) {
    const item = CompanyGlossaryTermSchema.parse(value);
    await this.pool.query(
      `INSERT INTO company_glossary_terms(id,owner_id,company_id,canonical_key,status,version,record,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(owner_id,company_id,id) DO UPDATE SET status=$5,version=$6,record=$7,updated_at=$9`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.canonicalKey,
        item.status,
        item.version,
        item,
        item.createdAt,
        item.updatedAt,
      ],
    );
  }
  async listGlossaryTerms(ownerId: string, companyId: string) {
    return this.many(
      "SELECT record FROM company_glossary_terms WHERE owner_id=$1 AND company_id=$2 ORDER BY canonical_key,version DESC",
      CompanyGlossaryTermSchema,
      [ownerId, companyId],
    );
  }
  async saveMetric(value: SemanticMetric) {
    const item = SemanticMetricSchema.parse(value);
    await this.pool.query(
      `INSERT INTO company_semantic_metrics(id,owner_id,company_id,canonical_key,version,status,owner_department_id,record,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(owner_id,company_id,id) DO UPDATE SET status=$6,record=$8,updated_at=$10`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.canonicalKey,
        item.version,
        item.status,
        item.ownerDepartmentId,
        item,
        item.createdAt,
        item.updatedAt,
      ],
    );
  }
  async listMetrics(ownerId: string, companyId: string) {
    return this.many(
      "SELECT record FROM company_semantic_metrics WHERE owner_id=$1 AND company_id=$2 ORDER BY canonical_key,version DESC",
      SemanticMetricSchema,
      [ownerId, companyId],
    );
  }
  async findMetric(
    ownerId: string,
    companyId: string,
    canonicalKey: string,
    version?: number,
  ) {
    const result = await this.pool.query<RecordRow>(
      `SELECT record FROM company_semantic_metrics WHERE owner_id=$1 AND company_id=$2 AND canonical_key=$3 AND ($4::int IS NULL OR version=$4) ORDER BY version DESC LIMIT 1`,
      [ownerId, companyId, canonicalKey, version ?? null],
    );
    return result.rows[0]
      ? SemanticMetricSchema.parse(result.rows[0].record)
      : undefined;
  }
  async saveMetricObservation(value: SemanticMetricObservation) {
    const item = SemanticMetricObservationSchema.parse(value);
    await this.pool.query(
      `INSERT INTO company_metric_observations(id,owner_id,company_id,metric_id,metric_version,observed_at,expires_at,quality_state,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(owner_id,company_id,id) DO UPDATE SET observed_at=$6,expires_at=$7,quality_state=$8,record=$9`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.metricId,
        item.metricVersion,
        item.observedAt,
        item.expiresAt,
        item.qualityState,
        item,
      ],
    );
  }
  async listMetricObservations(ownerId: string, companyId: string, metricId: string) {
    return this.many(
      "SELECT record FROM company_metric_observations WHERE owner_id=$1 AND company_id=$2 AND metric_id=$3 ORDER BY observed_at DESC",
      SemanticMetricObservationSchema,
      [ownerId, companyId, metricId],
    );
  }
  async saveCredentialReference(value: CompanyCredentialReference) {
    const item = CompanyCredentialReferenceSchema.parse(value);
    await this.pool.query(
      `INSERT INTO company_credential_references(id,owner_id,company_id,provider,status,record,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(owner_id,company_id,id) DO UPDATE SET status=$5,record=$6,updated_at=$8`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.provider,
        item.status,
        item,
        item.createdAt,
        item.updatedAt,
      ],
    );
  }
  async findCredentialReference(ownerId: string, companyId: string, id: string) {
    return this.one(
      "company_credential_references",
      CompanyCredentialReferenceSchema,
      ownerId,
      companyId,
      id,
    );
  }
  async listCredentialReferences(ownerId: string, companyId: string) {
    return this.many(
      "SELECT record FROM company_credential_references WHERE owner_id=$1 AND company_id=$2 ORDER BY provider",
      CompanyCredentialReferenceSchema,
      [ownerId, companyId],
    );
  }
  async saveIntegrationBinding(value: CompanyIntegrationBinding) {
    const item = CompanyIntegrationBindingSchema.parse(value);
    await this.pool.query(
      `INSERT INTO company_integration_bindings(id,owner_id,company_id,provider,integration_id,credential_ref,status,record,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(owner_id,company_id,id) DO UPDATE SET credential_ref=$6,status=$7,record=$8,updated_at=$10`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.provider,
        item.integrationId,
        item.credentialRef,
        item.status,
        item,
        item.createdAt,
        item.updatedAt,
      ],
    );
  }
  async listIntegrationBindings(ownerId: string, companyId: string) {
    return this.many(
      "SELECT record FROM company_integration_bindings WHERE owner_id=$1 AND company_id=$2 ORDER BY provider",
      CompanyIntegrationBindingSchema,
      [ownerId, companyId],
    );
  }
  async savePolicy(value: CompanyDataPolicy) {
    const item = CompanyDataPolicySchema.parse(value);
    await this.pool.query(
      `INSERT INTO company_data_policies(id,owner_id,company_id,version,status,record,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(owner_id,company_id,id,version) DO UPDATE SET status=$5,record=$6,updated_at=$8`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.version,
        item.status,
        item,
        item.createdAt,
        item.updatedAt,
      ],
    );
  }
  async findActivePolicy(ownerId: string, companyId: string) {
    const result = await this.pool.query<RecordRow>(
      "SELECT record FROM company_data_policies WHERE owner_id=$1 AND company_id=$2 AND status='ACTIVE' ORDER BY version DESC LIMIT 1",
      [ownerId, companyId],
    );
    return result.rows[0]
      ? CompanyDataPolicySchema.parse(result.rows[0].record)
      : undefined;
  }
  async saveSemanticDocument(value: CompanySemanticDocument, embedding?: number[]) {
    const item = CompanySemanticDocumentSchema.parse(value);
    await this.pool.query(
      `INSERT INTO company_semantic_documents(id,owner_id,company_id,entity_type,scope_type,scope_id,sensitivity,embedding,record,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::vector,$9,$10,$11) ON CONFLICT(owner_id,company_id,id) DO UPDATE SET entity_type=$4,scope_type=$5,scope_id=$6,sensitivity=$7,embedding=$8::vector,record=$9,updated_at=$11`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.entityType,
        item.scopeType,
        item.scopeId,
        item.sensitivity,
        embedding ? vectorLiteral(embedding) : null,
        item,
        item.createdAt,
        item.updatedAt,
      ],
    );
  }
  async searchSemanticDocuments(input: {
    ownerId: string;
    companyId: string;
    scopeIds: string[];
    entityTypes: CompanySemanticDocument["entityType"][];
    query: string;
    queryEmbedding?: number[];
    limit: number;
  }) {
    if (input.scopeIds.length === 0) return [];
    if (input.queryEmbedding) {
      const result = await this.pool.query<RecordRow & { score: number }>(
        `WITH authorized AS MATERIALIZED (SELECT record,embedding FROM company_semantic_documents WHERE owner_id=$1 AND company_id=$2 AND scope_id=ANY($3::text[]) AND (cardinality($4::text[])=0 OR entity_type=ANY($4::text[])) AND embedding IS NOT NULL) SELECT record,1-(embedding <=> $5::vector) AS score FROM authorized ORDER BY embedding <=> $5::vector LIMIT $6`,
        [
          input.ownerId,
          input.companyId,
          input.scopeIds,
          input.entityTypes,
          vectorLiteral(input.queryEmbedding),
          input.limit,
        ],
      );
      return result.rows.map((row) => ({
        document: CompanySemanticDocumentSchema.parse(row.record),
        score: Number(row.score),
      }));
    }
    const rows = await this.pool.query<RecordRow>(
      `SELECT record FROM company_semantic_documents WHERE owner_id=$1 AND company_id=$2 AND scope_id=ANY($3::text[]) AND (cardinality($4::text[])=0 OR entity_type=ANY($4::text[])) ORDER BY updated_at DESC LIMIT $5`,
      [
        input.ownerId,
        input.companyId,
        input.scopeIds,
        input.entityTypes,
        Math.min(500, input.limit * 20),
      ],
    );
    return rows.rows
      .map((row) => CompanySemanticDocumentSchema.parse(row.record))
      .map((document) => ({ document, score: lexicalScore(input.query, document) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit);
  }
  async listSemanticDocuments(ownerId: string, companyId: string) {
    return this.many(
      "SELECT record FROM company_semantic_documents WHERE owner_id=$1 AND company_id=$2 ORDER BY updated_at DESC",
      CompanySemanticDocumentSchema,
      [ownerId, companyId],
    );
  }

  private async one<T>(
    table: string,
    schema: { parse(value: unknown): T },
    ownerId: string,
    companyId: string,
    id: string,
  ) {
    const result = await this.pool.query<RecordRow>(
      `SELECT record FROM ${table} WHERE owner_id=$1 AND company_id=$2 AND id=$3`,
      [ownerId, companyId, id],
    );
    return result.rows[0] ? schema.parse(result.rows[0].record) : undefined;
  }
  private async many<T>(
    sql: string,
    schema: { parse(value: unknown): T },
    params: unknown[],
  ) {
    const result = await this.pool.query<RecordRow>(sql, params);
    return result.rows.map((row) => schema.parse(row.record));
  }
  private async upsertDataset(client: Pool | PoolClient, value: CompanyDataset) {
    const item = CompanyDatasetSchema.parse(value);
    await client.query(
      `INSERT INTO company_datasets(id,owner_id,company_id,source_id,canonical_name,logical_contract,sensitivity,status,owner_department_id,record,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(owner_id,company_id,id) DO UPDATE SET sensitivity=$7,status=$8,owner_department_id=$9,record=$10,updated_at=$12`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.sourceId,
        item.canonicalName,
        item.logicalContract,
        item.sensitivity,
        item.status,
        item.ownerDepartmentId,
        item,
        item.createdAt,
        item.updatedAt,
      ],
    );
  }
  private async upsertPipeline(client: Pool | PoolClient, value: CompanyDataPipeline) {
    const item = CompanyDataPipelineSchema.parse(value);
    await client.query(
      `INSERT INTO company_data_pipelines(id,owner_id,company_id,source_id,dataset_id,connector_key,trigger_mode,status,record,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(owner_id,company_id,id) DO UPDATE SET status=$8,record=$9,updated_at=$11`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.sourceId,
        item.datasetId,
        item.connectorKey,
        item.triggerMode,
        item.status,
        item,
        item.createdAt,
        item.updatedAt,
      ],
    );
  }
  private async upsertRun(client: Pool | PoolClient, value: CompanyPipelineRun) {
    const item = CompanyPipelineRunSchema.parse(value);
    await client.query(
      `INSERT INTO company_pipeline_runs(id,owner_id,company_id,source_id,pipeline_id,dataset_id,load_package_id,status,started_at,completed_at,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(owner_id,company_id,id) DO UPDATE SET status=$8,completed_at=$10,record=$11`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.sourceId,
        item.pipelineId,
        item.datasetId,
        item.loadPackageId,
        item.status,
        item.startedAt,
        item.completedAt,
        item,
      ],
    );
  }
  private async upsertMetadata(client: Pool | PoolClient, item: MetadataEntity) {
    await client.query(
      `INSERT INTO company_metadata_entities(id,owner_id,company_id,entity_type,canonical_name,domain,owner_department_id,sensitivity,status,record,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(owner_id,company_id,id) DO UPDATE SET domain=$6,owner_department_id=$7,sensitivity=$8,status=$9,record=$10,updated_at=$12`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.entityType,
        item.canonicalName,
        item.domain,
        item.ownerDepartmentId,
        item.sensitivity,
        item.status,
        item,
        item.createdAt,
        item.updatedAt,
      ],
    );
  }
  private async upsertLineage(client: Pool | PoolClient, item: MetadataLineageEdge) {
    await client.query(
      `INSERT INTO company_metadata_lineage(id,owner_id,company_id,from_entity_id,to_entity_id,relation,record,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(owner_id,company_id,id) DO UPDATE SET record=$7`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.fromEntityId,
        item.toEntityId,
        item.relation,
        item,
        item.createdAt,
      ],
    );
  }
}

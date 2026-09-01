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
import { z } from "zod";

import type { Awaitable } from "../identity/store.js";

export const CompanyDatasetRecordSchema = z
  .object({
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    sourceId: z.string().uuid(),
    pipelineId: z.string().uuid(),
    datasetId: z.string().uuid(),
    recordKey: z.string().min(1).max(500),
    payload: z.record(z.string().min(1).max(160), z.json()),
    ingestedAt: z.iso.datetime(),
  })
  .strict();
export type CompanyDatasetRecord = z.infer<typeof CompanyDatasetRecordSchema>;

export interface CompanyDataStore {
  saveSource(value: CompanyDataSource): Awaitable<void>;
  findSource(
    ownerId: string,
    companyId: string,
    id: string,
  ): Awaitable<CompanyDataSource | undefined>;
  listSources(ownerId: string, companyId: string): Awaitable<CompanyDataSource[]>;
  saveDataset(value: CompanyDataset): Awaitable<void>;
  findDataset(
    ownerId: string,
    companyId: string,
    id: string,
  ): Awaitable<CompanyDataset | undefined>;
  listDatasets(ownerId: string, companyId: string): Awaitable<CompanyDataset[]>;
  savePipeline(value: CompanyDataPipeline): Awaitable<void>;
  findPipeline(
    ownerId: string,
    companyId: string,
    id: string,
  ): Awaitable<CompanyDataPipeline | undefined>;
  listPipelines(ownerId: string, companyId: string): Awaitable<CompanyDataPipeline[]>;
  saveRun(value: CompanyPipelineRun): Awaitable<void>;
  listRuns(
    ownerId: string,
    companyId: string,
    limit: number,
  ): Awaitable<CompanyPipelineRun[]>;
  commitLoad(input: {
    dataset: CompanyDataset;
    pipeline: CompanyDataPipeline;
    run: CompanyPipelineRun;
    records: CompanyDatasetRecord[];
    metadataEntities: MetadataEntity[];
    lineageEdges: MetadataLineageEdge[];
  }): Awaitable<number>;
  countDatasetRecords(
    ownerId: string,
    companyId: string,
    datasetId: string,
  ): Awaitable<number>;
  saveMetadataEntity(value: MetadataEntity): Awaitable<void>;
  findMetadataEntity(
    ownerId: string,
    companyId: string,
    id: string,
  ): Awaitable<MetadataEntity | undefined>;
  listMetadataEntities(ownerId: string, companyId: string): Awaitable<MetadataEntity[]>;
  saveLineageEdge(value: MetadataLineageEdge): Awaitable<void>;
  listLineageEdges(
    ownerId: string,
    companyId: string,
  ): Awaitable<MetadataLineageEdge[]>;
  saveGlossaryTerm(value: CompanyGlossaryTerm): Awaitable<void>;
  listGlossaryTerms(
    ownerId: string,
    companyId: string,
  ): Awaitable<CompanyGlossaryTerm[]>;
  saveMetric(value: SemanticMetric): Awaitable<void>;
  listMetrics(ownerId: string, companyId: string): Awaitable<SemanticMetric[]>;
  findMetric(
    ownerId: string,
    companyId: string,
    canonicalKey: string,
    version?: number,
  ): Awaitable<SemanticMetric | undefined>;
  saveMetricObservation(value: SemanticMetricObservation): Awaitable<void>;
  listMetricObservations(
    ownerId: string,
    companyId: string,
    metricId: string,
  ): Awaitable<SemanticMetricObservation[]>;
  saveCredentialReference(value: CompanyCredentialReference): Awaitable<void>;
  findCredentialReference(
    ownerId: string,
    companyId: string,
    id: string,
  ): Awaitable<CompanyCredentialReference | undefined>;
  listCredentialReferences(
    ownerId: string,
    companyId: string,
  ): Awaitable<CompanyCredentialReference[]>;
  saveIntegrationBinding(value: CompanyIntegrationBinding): Awaitable<void>;
  listIntegrationBindings(
    ownerId: string,
    companyId: string,
  ): Awaitable<CompanyIntegrationBinding[]>;
  savePolicy(value: CompanyDataPolicy): Awaitable<void>;
  findActivePolicy(
    ownerId: string,
    companyId: string,
  ): Awaitable<CompanyDataPolicy | undefined>;
  saveSemanticDocument(
    value: CompanySemanticDocument,
    embedding?: number[],
  ): Awaitable<void>;
  searchSemanticDocuments(input: {
    ownerId: string;
    companyId: string;
    scopeIds: string[];
    entityTypes: CompanySemanticDocument["entityType"][];
    query: string;
    queryEmbedding?: number[];
    limit: number;
  }): Awaitable<Array<{ document: CompanySemanticDocument; score: number }>>;
  listSemanticDocuments(
    ownerId: string,
    companyId: string,
  ): Awaitable<CompanySemanticDocument[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const prefix = (ownerId: string, companyId: string) => `${ownerId}:${companyId}:`;
const key = (ownerId: string, companyId: string, id: string) =>
  `${prefix(ownerId, companyId)}${id}`;

export class InMemoryCompanyDataStore implements CompanyDataStore {
  readonly #sources = new Map<string, CompanyDataSource>();
  readonly #datasets = new Map<string, CompanyDataset>();
  readonly #pipelines = new Map<string, CompanyDataPipeline>();
  readonly #runs = new Map<string, CompanyPipelineRun>();
  readonly #records = new Map<string, CompanyDatasetRecord>();
  readonly #entities = new Map<string, MetadataEntity>();
  readonly #edges = new Map<string, MetadataLineageEdge>();
  readonly #terms = new Map<string, CompanyGlossaryTerm>();
  readonly #metrics = new Map<string, SemanticMetric>();
  readonly #observations = new Map<string, SemanticMetricObservation>();
  readonly #credentials = new Map<string, CompanyCredentialReference>();
  readonly #bindings = new Map<string, CompanyIntegrationBinding>();
  readonly #policies = new Map<string, CompanyDataPolicy>();
  readonly #documents = new Map<
    string,
    { document: CompanySemanticDocument; embedding?: number[] }
  >();

  saveSource(value: CompanyDataSource) {
    const item = CompanyDataSourceSchema.parse(value);
    this.#sources.set(key(item.ownerId, item.companyId, item.id), clone(item));
  }
  findSource(ownerId: string, companyId: string, id: string) {
    const item = this.#sources.get(key(ownerId, companyId, id));
    return item ? clone(item) : undefined;
  }
  listSources(ownerId: string, companyId: string) {
    return this.values(this.#sources, ownerId, companyId).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }
  saveDataset(value: CompanyDataset) {
    const item = CompanyDatasetSchema.parse(value);
    this.#datasets.set(key(item.ownerId, item.companyId, item.id), clone(item));
  }
  findDataset(ownerId: string, companyId: string, id: string) {
    const item = this.#datasets.get(key(ownerId, companyId, id));
    return item ? clone(item) : undefined;
  }
  listDatasets(ownerId: string, companyId: string) {
    return this.values(this.#datasets, ownerId, companyId).sort((a, b) =>
      a.canonicalName.localeCompare(b.canonicalName),
    );
  }
  savePipeline(value: CompanyDataPipeline) {
    const item = CompanyDataPipelineSchema.parse(value);
    this.#pipelines.set(key(item.ownerId, item.companyId, item.id), clone(item));
  }
  findPipeline(ownerId: string, companyId: string, id: string) {
    const item = this.#pipelines.get(key(ownerId, companyId, id));
    return item ? clone(item) : undefined;
  }
  listPipelines(ownerId: string, companyId: string) {
    return this.values(this.#pipelines, ownerId, companyId);
  }
  saveRun(value: CompanyPipelineRun) {
    const item = CompanyPipelineRunSchema.parse(value);
    this.#runs.set(key(item.ownerId, item.companyId, item.id), clone(item));
  }
  listRuns(ownerId: string, companyId: string, limit: number) {
    return this.values(this.#runs, ownerId, companyId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  }
  commitLoad(input: {
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
    const records = input.records.map((value) =>
      CompanyDatasetRecordSchema.parse(value),
    );
    for (const record of records) this.assertSameScope(dataset, record);
    this.saveDataset(dataset);
    this.savePipeline(pipeline);
    this.saveRun(run);
    for (const entity of input.metadataEntities) this.saveMetadataEntity(entity);
    for (const edge of input.lineageEdges) this.saveLineageEdge(edge);
    let written = 0;
    for (const record of records) {
      const recordKey = key(
        record.ownerId,
        record.companyId,
        `${record.datasetId}:${record.recordKey}`,
      );
      if (!this.#records.has(recordKey) || pipeline.writeDisposition === "MERGE") {
        this.#records.set(recordKey, clone(record));
        written += 1;
      }
    }
    return written;
  }
  countDatasetRecords(ownerId: string, companyId: string, datasetId: string) {
    return [...this.#records.values()].filter(
      (item) =>
        item.ownerId === ownerId &&
        item.companyId === companyId &&
        item.datasetId === datasetId,
    ).length;
  }
  saveMetadataEntity(value: MetadataEntity) {
    const item = MetadataEntitySchema.parse(value);
    this.#entities.set(key(item.ownerId, item.companyId, item.id), clone(item));
  }
  findMetadataEntity(ownerId: string, companyId: string, id: string) {
    const item = this.#entities.get(key(ownerId, companyId, id));
    return item ? clone(item) : undefined;
  }
  listMetadataEntities(ownerId: string, companyId: string) {
    return this.values(this.#entities, ownerId, companyId);
  }
  saveLineageEdge(value: MetadataLineageEdge) {
    const item = MetadataLineageEdgeSchema.parse(value);
    this.#edges.set(key(item.ownerId, item.companyId, item.id), clone(item));
  }
  listLineageEdges(ownerId: string, companyId: string) {
    return this.values(this.#edges, ownerId, companyId);
  }
  saveGlossaryTerm(value: CompanyGlossaryTerm) {
    const item = CompanyGlossaryTermSchema.parse(value);
    this.#terms.set(key(item.ownerId, item.companyId, item.id), clone(item));
  }
  listGlossaryTerms(ownerId: string, companyId: string) {
    return this.values(this.#terms, ownerId, companyId);
  }
  saveMetric(value: SemanticMetric) {
    const item = SemanticMetricSchema.parse(value);
    this.#metrics.set(
      key(item.ownerId, item.companyId, `${item.canonicalKey}:${item.version}`),
      clone(item),
    );
  }
  listMetrics(ownerId: string, companyId: string) {
    return this.values(this.#metrics, ownerId, companyId).sort(
      (a, b) => a.canonicalKey.localeCompare(b.canonicalKey) || b.version - a.version,
    );
  }
  findMetric(
    ownerId: string,
    companyId: string,
    canonicalKey: string,
    version?: number,
  ) {
    return this.listMetrics(ownerId, companyId)
      .filter(
        (item) =>
          item.canonicalKey === canonicalKey &&
          (version === undefined || item.version === version),
      )
      .sort((a, b) => b.version - a.version)[0];
  }
  saveMetricObservation(value: SemanticMetricObservation) {
    const item = SemanticMetricObservationSchema.parse(value);
    this.#observations.set(key(item.ownerId, item.companyId, item.id), clone(item));
  }
  listMetricObservations(ownerId: string, companyId: string, metricId: string) {
    return this.values(this.#observations, ownerId, companyId)
      .filter((item) => item.metricId === metricId)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  }
  saveCredentialReference(value: CompanyCredentialReference) {
    const item = CompanyCredentialReferenceSchema.parse(value);
    this.#credentials.set(key(item.ownerId, item.companyId, item.id), clone(item));
  }
  findCredentialReference(ownerId: string, companyId: string, id: string) {
    const item = this.#credentials.get(key(ownerId, companyId, id));
    return item ? clone(item) : undefined;
  }
  listCredentialReferences(ownerId: string, companyId: string) {
    return this.values(this.#credentials, ownerId, companyId);
  }
  saveIntegrationBinding(value: CompanyIntegrationBinding) {
    const item = CompanyIntegrationBindingSchema.parse(value);
    this.#bindings.set(key(item.ownerId, item.companyId, item.id), clone(item));
  }
  listIntegrationBindings(ownerId: string, companyId: string) {
    return this.values(this.#bindings, ownerId, companyId);
  }
  savePolicy(value: CompanyDataPolicy) {
    const item = CompanyDataPolicySchema.parse(value);
    this.#policies.set(
      key(item.ownerId, item.companyId, `${item.id}:${item.version}`),
      clone(item),
    );
  }
  findActivePolicy(ownerId: string, companyId: string) {
    return this.values(this.#policies, ownerId, companyId)
      .filter((item) => item.status === "ACTIVE")
      .sort((a, b) => b.version - a.version)[0];
  }
  saveSemanticDocument(value: CompanySemanticDocument, embedding?: number[]) {
    const item = CompanySemanticDocumentSchema.parse(value);
    this.#documents.set(key(item.ownerId, item.companyId, item.id), {
      document: clone(item),
      ...(embedding ? { embedding: [...embedding] } : {}),
    });
  }
  searchSemanticDocuments(input: {
    ownerId: string;
    companyId: string;
    scopeIds: string[];
    entityTypes: CompanySemanticDocument["entityType"][];
    query: string;
    queryEmbedding?: number[];
    limit: number;
  }) {
    const scopes = new Set(input.scopeIds);
    const types = new Set(input.entityTypes);
    const queryTokens = tokens(input.query);
    return [...this.#documents.values()]
      .filter(
        ({ document }) =>
          document.ownerId === input.ownerId &&
          document.companyId === input.companyId &&
          scopes.has(document.scopeId) &&
          (types.size === 0 || types.has(document.entityType)),
      )
      .map(({ document, embedding }) => ({
        document: clone(document),
        score:
          input.queryEmbedding && embedding
            ? cosine(input.queryEmbedding, embedding)
            : jaccard(queryTokens, tokens(`${document.title} ${document.summary}`)),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit);
  }
  listSemanticDocuments(ownerId: string, companyId: string) {
    return [...this.#documents.values()]
      .filter(
        ({ document }) =>
          document.ownerId === ownerId && document.companyId === companyId,
      )
      .map(({ document }) => clone(document));
  }

  private values<T extends { ownerId: string; companyId: string }>(
    map: Map<string, T>,
    ownerId: string,
    companyId: string,
  ) {
    return [...map.entries()]
      .filter(
        ([itemKey, item]) =>
          itemKey.startsWith(prefix(ownerId, companyId)) &&
          item.ownerId === ownerId &&
          item.companyId === companyId,
      )
      .map(([, item]) => clone(item));
  }
  private assertSameScope(dataset: CompanyDataset, record: CompanyDatasetRecord) {
    if (
      dataset.ownerId !== record.ownerId ||
      dataset.companyId !== record.companyId ||
      dataset.id !== record.datasetId ||
      dataset.sourceId !== record.sourceId
    )
      throw Object.assign(new Error("Destination scope mismatch."), {
        code: "DATA_DESTINATION_SCOPE_MISMATCH",
      });
  }
}

const tokens = (value: string) =>
  new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
const jaccard = (left: Set<string>, right: Set<string>) => {
  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
};
const cosine = (left: number[], right: number[]) => {
  const length = Math.min(left.length, right.length);
  let dot = 0,
    leftNorm = 0,
    rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    dot += (left[index] ?? 0) * (right[index] ?? 0);
    leftNorm += (left[index] ?? 0) ** 2;
    rightNorm += (right[index] ?? 0) ** 2;
  }
  return leftNorm && rightNorm ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : 0;
};

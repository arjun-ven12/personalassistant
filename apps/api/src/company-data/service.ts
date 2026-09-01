import { createHash } from "node:crypto";

import {
  CompanyDataDashboardSchema,
  CompanyDataPipelineSchema,
  CompanyDataPolicySchema,
  CompanyDataSourceSchema,
  CompanyDatasetSchema,
  CompanyGlossaryTermSchema,
  CompanyIntegrationBindingSchema,
  CompanyPipelineRunSchema,
  CompanySemanticSearchRequestSchema,
  CreateCompanyDataPipelineRequestSchema,
  CreateCompanyDataSourceRequestSchema,
  CreateCompanyDatasetRequestSchema,
  CreateGlossaryTermRequestSchema,
  CreateLineageEdgeRequestSchema,
  CreateMetadataEntityRequestSchema,
  CreateSemanticMetricRequestSchema,
  MetadataEntitySchema,
  MetadataLineageEdgeSchema,
  RecordSemanticMetricObservationRequestSchema,
  ResolvedCompanyAgentContextSchema,
  ResolvedCompanyDataContextSchema,
  SemanticMetricObservationSchema,
  SemanticMetricQueryResultSchema,
  SemanticMetricSchema,
  UpdateCompanyDataPolicyRequestSchema,
  UpsertCompanyCredentialReferenceRequestSchema,
  UpsertCompanyIntegrationBindingRequestSchema,
  IndexCompanySemanticDocumentRequestSchema,
  CompanyCredentialReferenceSchema,
  CompanySemanticDocumentSchema,
  type CompanyDataPipeline,
  type CompanyDataPolicy,
  type CompanyDataSensitivity,
  type CompanyDataset,
  type CompanySchemaFieldSchema,
  type MetadataEntity,
  type MetadataLineageEdge,
  type SemanticMetricQueryResult,
} from "@alexa-control/shared";
import { z } from "zod";

import type { AgentStore } from "../agents/store.js";
import type { CompanyStore } from "../companies/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { CompanyDatasetRecordSchema, type CompanyDataStore } from "./store.js";

const ConnectorBatchSchema = z
  .object({
    records: z.array(z.record(z.string().trim().min(1).max(160), z.json())).max(10_000),
    nextState: z.record(z.string().max(80), z.json()),
  })
  .strict();
type ConnectorBatch = z.infer<typeof ConnectorBatchSchema>;

export interface CompanyDataConnector {
  readonly key: string;
  read(input: {
    ownerId: string;
    companyId: string;
    sourceId: string;
    pipelineId: string;
    previousState: Record<string, unknown>;
  }): Promise<unknown>;
}

export class CompanyDataConnectorRegistry {
  readonly #connectors = new Map<string, CompanyDataConnector>();
  register(connector: CompanyDataConnector) {
    const key = z
      .string()
      .min(2)
      .max(160)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/)
      .parse(connector.key);
    if (this.#connectors.has(key))
      throw new Error(`Company data connector ${key} is already registered.`);
    this.#connectors.set(key, connector);
  }
  require(key: string) {
    const connector = this.#connectors.get(key);
    if (!connector)
      throw dataError(
        "DATA_CONNECTOR_NOT_REGISTERED",
        "The pipeline connector is not registered.",
      );
    return connector;
  }
  has(key: string) {
    return this.#connectors.has(key);
  }
}

type MutationContext = {
  ownerId: string;
  companyId: string;
  requestId: string;
  ipAddress: string;
};
type Actor = { assignmentId?: string; taskId?: string; reason?: string };
const sensitivityRank: Record<CompanyDataSensitivity, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};

export class CompanyDataService {
  constructor(
    readonly store: CompanyDataStore,
    readonly companies: CompanyStore,
    readonly agents: AgentStore,
    readonly connectors = new CompanyDataConnectorRegistry(),
    readonly audit?: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string, companyId: string) {
    await this.requireCompany(ownerId, companyId, "READ");
    const [
      sources,
      datasets,
      pipelines,
      recentRuns,
      metadataEntities,
      glossary,
      definitions,
      integrations,
      documents,
    ] = await Promise.all([
      this.store.listSources(ownerId, companyId),
      this.store.listDatasets(ownerId, companyId),
      this.store.listPipelines(ownerId, companyId),
      this.store.listRuns(ownerId, companyId, 100),
      this.store.listMetadataEntities(ownerId, companyId),
      this.store.listGlossaryTerms(ownerId, companyId),
      this.store.listMetrics(ownerId, companyId),
      this.store.listIntegrationBindings(ownerId, companyId),
      this.store.listSemanticDocuments(ownerId, companyId),
    ]);
    const metrics = await Promise.all(
      definitions
        .filter((item) => item.status === "ACTIVE")
        .map((item) => this.metricResult(ownerId, companyId, item)),
    );
    const refreshedDatasets = datasets.map((item) => this.refreshFreshness(item));
    const byType = Object.fromEntries(
      [
        "MEMORY",
        "DOCUMENT",
        "AGENT_EXPERIENCE",
        "METADATA_ENTITY",
        "GLOSSARY_TERM",
        "WORKFLOW_KNOWLEDGE",
      ].map((type) => [
        type,
        documents.filter((item) => item.entityType === type).length,
      ]),
    );
    return CompanyDataDashboardSchema.parse({
      sources,
      datasets: refreshedDatasets,
      pipelines,
      recentRuns,
      metadataEntities,
      glossary,
      metrics,
      integrations,
      memory: { byType, total: documents.length },
    });
  }

  async createSource(context: MutationContext, input: unknown) {
    await this.requireCompany(context.ownerId, context.companyId, "OPERATE");
    const body = CreateCompanyDataSourceRequestSchema.parse(input);
    const at = this.now().toISOString();
    const source = CompanyDataSourceSchema.parse({
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      ...body,
      status: "ACTIVE",
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveSource(source);
    const entity = await this.createMetadataEntity(context, {
      entityType: "DATA_SOURCE",
      canonicalName: `source:${source.id}`,
      displayName: source.displayName,
      description: `Registered ${source.sourceType} source.`,
      domain: null,
      ownerDepartmentId: null,
      humanOwnerId: null,
      agentAssignmentId: null,
      sourceSystem: source.provider,
      classification: [],
      sensitivity: "INTERNAL",
      provenance: {
        sourceType: "OWNER",
        sourceRef: `source:${source.id}`,
        observedAt: at,
      },
      metadata: { provider: source.provider },
    });
    await this.writeAudit(
      context,
      "DATA_SOURCE_CREATED",
      "SUCCESS",
      "COMPANY_DATA_SOURCE_CREATED",
      {
        sourceId: source.id,
        metadataEntityId: entity.id,
        sourceType: source.sourceType,
      },
    );
    return source;
  }

  async createDataset(context: MutationContext, input: unknown) {
    await this.requireCompany(context.ownerId, context.companyId, "OPERATE");
    const body = CreateCompanyDatasetRequestSchema.parse(input);
    const source = await this.store.findSource(
      context.ownerId,
      context.companyId,
      body.sourceId,
    );
    if (!source)
      throw dataError(
        "DATA_SOURCE_NOT_FOUND",
        "The source is not in the active company.",
      );
    const at = this.now().toISOString();
    const { staleAfterSeconds, ...datasetInput } = body;
    const dataset = CompanyDatasetSchema.parse({
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      ...datasetInput,
      schemaMetadata: { version: 1, fields: [], lastChangedAt: at },
      status: "ACTIVE",
      freshness: { lastUpdatedAt: null, staleAfterSeconds, state: "UNKNOWN" },
      quality: {
        completeness: null,
        schemaValid: true,
        missingValueRate: null,
        duplicateRate: null,
        sourceHealth: "UNKNOWN",
      },
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveDataset(dataset);
    await this.createMetadataEntity(context, {
      entityType: "DATASET",
      canonicalName: `dataset:${dataset.id}`,
      displayName: dataset.canonicalName,
      description: `Canonical company dataset ${dataset.canonicalName}.`,
      domain: null,
      ownerDepartmentId: dataset.ownerDepartmentId,
      humanOwnerId: null,
      agentAssignmentId: null,
      sourceSystem: source.provider,
      classification: [],
      sensitivity: dataset.sensitivity,
      provenance: {
        sourceType: "OWNER",
        sourceRef: `dataset:${dataset.id}`,
        observedAt: at,
      },
      metadata: { logicalContract: dataset.logicalContract },
    });
    await this.writeAudit(
      context,
      "DATASET_CREATED",
      "SUCCESS",
      "COMPANY_DATASET_CREATED",
      { datasetId: dataset.id, sourceId: source.id, sensitivity: dataset.sensitivity },
    );
    return dataset;
  }

  async createPipeline(context: MutationContext, input: unknown) {
    await this.requireCompany(context.ownerId, context.companyId, "OPERATE");
    const body = CreateCompanyDataPipelineRequestSchema.parse(input);
    if (!this.connectors.has(body.connectorKey))
      throw dataError(
        "DATA_CONNECTOR_NOT_REGISTERED",
        "The connector must be registered server-side before a pipeline can use it.",
      );
    const [source, dataset] = await Promise.all([
      this.store.findSource(context.ownerId, context.companyId, body.sourceId),
      this.store.findDataset(context.ownerId, context.companyId, body.datasetId),
    ]);
    if (!source || !dataset || dataset.sourceId !== body.sourceId)
      throw dataError(
        "PIPELINE_SCOPE_MISMATCH",
        "The source and dataset must belong to the active company and each other.",
      );
    const at = this.now().toISOString();
    const pipeline = CompanyDataPipelineSchema.parse({
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      ...body,
      destination: "SHARED_POSTGRES",
      incrementalState: {},
      status: "ACTIVE",
      lastSuccessfulRun: null,
      lastFailureCode: null,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.savePipeline(pipeline);
    await this.createMetadataEntity(context, {
      entityType: "PIPELINE",
      canonicalName: `pipeline:${pipeline.id}`,
      displayName: `${dataset.canonicalName} ingestion`,
      description: "Registered source-to-destination company pipeline.",
      domain: null,
      ownerDepartmentId: dataset.ownerDepartmentId,
      humanOwnerId: null,
      agentAssignmentId: null,
      sourceSystem: source.provider,
      classification: [],
      sensitivity: dataset.sensitivity,
      provenance: {
        sourceType: "SYSTEM",
        sourceRef: `pipeline:${pipeline.id}`,
        observedAt: at,
      },
      metadata: {
        connectorKey: pipeline.connectorKey,
        schemaContract: pipeline.schemaContract,
      },
    });
    await this.ensureCoreLineage(context, pipeline, dataset);
    await this.writeAudit(
      context,
      "DATA_PIPELINE_CREATED",
      "SUCCESS",
      "COMPANY_DATA_PIPELINE_CREATED",
      { pipelineId: pipeline.id, sourceId: source.id, datasetId: dataset.id },
    );
    return pipeline;
  }

  async runPipeline(context: MutationContext, pipelineId: string, retryCount = 0) {
    const company = await this.requireCompany(
      context.ownerId,
      context.companyId,
      "OPERATE",
    );
    if (company.status !== "ACTIVE")
      throw dataError(
        "COMPANY_DATA_PAUSED",
        "Pipelines run only for active companies.",
      );
    const pipeline = await this.store.findPipeline(
      context.ownerId,
      context.companyId,
      pipelineId,
    );
    if (
      !pipeline ||
      !(["ACTIVE", "DEGRADED"] as const).includes(
        pipeline.status as "ACTIVE" | "DEGRADED",
      )
    )
      throw dataError(
        "PIPELINE_NOT_ACTIVE",
        "The pipeline is not active in this company.",
      );
    const [source, dataset] = await Promise.all([
      this.store.findSource(context.ownerId, context.companyId, pipeline.sourceId),
      this.store.findDataset(context.ownerId, context.companyId, pipeline.datasetId),
    ]);
    if (
      !source ||
      !dataset ||
      source.companyId !== context.companyId ||
      dataset.companyId !== context.companyId
    )
      throw dataError(
        "PIPELINE_SCOPE_MISMATCH",
        "Pipeline destination scope is inconsistent.",
      );
    const started = this.now();
    const runBase = {
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      sourceId: source.id,
      pipelineId: pipeline.id,
      datasetId: dataset.id,
      loadPackageId: crypto.randomUUID(),
      recordsRead: 0,
      recordsWritten: 0,
      schemaChanges: [],
      durationMs: 0,
      retryCount,
      errorCode: null,
      startedAt: started.toISOString(),
      completedAt: null,
    };
    await this.store.saveRun(
      CompanyPipelineRunSchema.parse({ ...runBase, status: "RUNNING" }),
    );
    try {
      const batch = ConnectorBatchSchema.parse(
        await this.connectors.require(pipeline.connectorKey).read({
          ownerId: context.ownerId,
          companyId: context.companyId,
          sourceId: source.id,
          pipelineId: pipeline.id,
          previousState: pipeline.incrementalState,
        }),
      );
      const inferred = this.inferSchema(batch.records, dataset.sensitivity);
      const existing = new Map(
        dataset.schemaMetadata.fields.map((field) => [field.name, field]),
      );
      const schemaChanges = inferred
        .filter((field) => !existing.has(field.name))
        .map((field) => field.name);
      if (schemaChanges.length && pipeline.schemaContract === "FREEZE")
        throw dataError(
          "PIPELINE_SCHEMA_CONTRACT_VIOLATION",
          "Unexpected fields violate the frozen dataset schema.",
        );
      const fields = [
        ...dataset.schemaMetadata.fields,
        ...inferred.filter((field) => !existing.has(field.name)),
      ];
      const completedAt = this.now().toISOString();
      const updatedDataset = CompanyDatasetSchema.parse({
        ...dataset,
        schemaMetadata: {
          version: schemaChanges.length
            ? dataset.schemaMetadata.version + 1
            : dataset.schemaMetadata.version,
          fields,
          lastChangedAt: schemaChanges.length
            ? completedAt
            : dataset.schemaMetadata.lastChangedAt,
        },
        status: "ACTIVE",
        freshness: { ...dataset.freshness, lastUpdatedAt: completedAt, state: "FRESH" },
        quality: { ...dataset.quality, schemaValid: true, sourceHealth: "HEALTHY" },
        updatedAt: completedAt,
      });
      const updatedPipeline = CompanyDataPipelineSchema.parse({
        ...pipeline,
        status: "ACTIVE",
        incrementalState: batch.nextState,
        lastSuccessfulRun: completedAt,
        lastFailureCode: null,
        updatedAt: completedAt,
      });
      const records = batch.records.map((payload, index) =>
        CompanyDatasetRecordSchema.parse({
          ownerId: context.ownerId,
          companyId: context.companyId,
          sourceId: source.id,
          pipelineId: pipeline.id,
          datasetId: dataset.id,
          recordKey: this.recordKey(pipeline, payload, index),
          payload,
          ingestedAt: completedAt,
        }),
      );
      const metadataEntities = await this.coreEntities(
        context.ownerId,
        context.companyId,
        pipeline,
        dataset,
      );
      const lineageEdges = await this.coreEdges(
        context.ownerId,
        context.companyId,
        metadataEntities,
      );
      const finalRun = CompanyPipelineRunSchema.parse({
        ...runBase,
        status: "SUCCEEDED",
        recordsRead: records.length,
        recordsWritten: records.length,
        schemaChanges,
        durationMs: Math.max(0, this.now().getTime() - started.getTime()),
        completedAt,
      });
      const written = await this.store.commitLoad({
        dataset: updatedDataset,
        pipeline: updatedPipeline,
        run: finalRun,
        records,
        metadataEntities,
        lineageEdges,
      });
      const corrected = CompanyPipelineRunSchema.parse({
        ...finalRun,
        recordsWritten: written,
      });
      await this.store.saveRun(corrected);
      if (schemaChanges.length)
        await this.writeAudit(
          context,
          "DATASET_SCHEMA_CHANGED",
          "SUCCESS",
          "COMPANY_DATASET_SCHEMA_EVOLVED",
          {
            pipelineId: pipeline.id,
            datasetId: dataset.id,
            schemaVersion: updatedDataset.schemaMetadata.version,
            fieldCount: schemaChanges.length,
          },
        );
      await this.writeAudit(
        context,
        "DATA_PIPELINE_RUN",
        "SUCCESS",
        "COMPANY_DATA_PIPELINE_SUCCEEDED",
        {
          pipelineId: pipeline.id,
          datasetId: dataset.id,
          runId: corrected.id,
          recordsRead: corrected.recordsRead,
          recordsWritten: corrected.recordsWritten,
          schemaChangeCount: schemaChanges.length,
        },
      );
      return corrected;
    } catch (error) {
      const completedAt = this.now().toISOString();
      const code = errorCode(error);
      const failed = CompanyPipelineRunSchema.parse({
        ...runBase,
        status: "FAILED",
        durationMs: Math.max(0, this.now().getTime() - started.getTime()),
        retryCount,
        errorCode: code,
        completedAt,
      });
      await this.store.saveRun(failed);
      await this.store.savePipeline(
        CompanyDataPipelineSchema.parse({
          ...pipeline,
          status: "DEGRADED",
          lastFailureCode: code,
          updatedAt: completedAt,
        }),
      );
      await this.store.saveDataset(
        CompanyDatasetSchema.parse({
          ...dataset,
          status: "DEGRADED",
          freshness: { ...dataset.freshness, state: "DEGRADED" },
          quality: { ...dataset.quality, sourceHealth: "DEGRADED" },
          updatedAt: completedAt,
        }),
      );
      await this.writeAudit(context, "DATA_PIPELINE_FAILED", "DENIED", code, {
        pipelineId: pipeline.id,
        datasetId: dataset.id,
        runId: failed.id,
      });
      throw error;
    }
  }

  async createMetadataEntity(context: MutationContext, input: unknown) {
    await this.requireCompany(context.ownerId, context.companyId, "OPERATE");
    const body = CreateMetadataEntityRequestSchema.parse(input);
    if (body.agentAssignmentId) {
      const assignments = await this.agents.listAssignments(
        context.ownerId,
        context.companyId,
      );
      if (!assignments.some((item) => item.id === body.agentAssignmentId))
        throw dataError(
          "METADATA_OWNER_SCOPE_MISMATCH",
          "Metadata ownership cannot reference another company assignment.",
        );
    }
    const at = this.now().toISOString();
    const entity = MetadataEntitySchema.parse({
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      ...body,
      status: "ACTIVE",
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveMetadataEntity(entity);
    return entity;
  }
  async createLineageEdge(context: MutationContext, input: unknown) {
    await this.requireCompany(context.ownerId, context.companyId, "OPERATE");
    const body = CreateLineageEdgeRequestSchema.parse(input);
    const [from, to] = await Promise.all([
      this.store.findMetadataEntity(
        context.ownerId,
        context.companyId,
        body.fromEntityId,
      ),
      this.store.findMetadataEntity(
        context.ownerId,
        context.companyId,
        body.toEntityId,
      ),
    ]);
    if (!from || !to)
      throw dataError(
        "LINEAGE_SCOPE_MISMATCH",
        "Lineage endpoints must exist in the active company.",
      );
    const edge = MetadataLineageEdgeSchema.parse({
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      ...body,
      createdAt: this.now().toISOString(),
    });
    await this.store.saveLineageEdge(edge);
    return edge;
  }
  async lineage(ownerId: string, companyId: string, entityId: string) {
    await this.requireCompany(ownerId, companyId, "READ");
    if (!(await this.store.findMetadataEntity(ownerId, companyId, entityId)))
      throw dataError(
        "METADATA_ENTITY_NOT_FOUND",
        "Metadata entity not found in this company.",
      );
    const edges = await this.store.listLineageEdges(ownerId, companyId);
    const visited = new Set([entityId]);
    const result: MetadataLineageEdge[] = [];
    let frontier = [entityId];
    while (frontier.length && result.length < 500) {
      const next: string[] = [];
      for (const edge of edges) {
        if (
          frontier.includes(edge.fromEntityId) ||
          frontier.includes(edge.toEntityId)
        ) {
          if (!result.some((item) => item.id === edge.id)) result.push(edge);
          for (const id of [edge.fromEntityId, edge.toEntityId])
            if (!visited.has(id)) {
              visited.add(id);
              next.push(id);
            }
        }
      }
      frontier = next;
    }
    return result;
  }

  async createGlossaryTerm(context: MutationContext, input: unknown) {
    await this.requireCompany(context.ownerId, context.companyId, "OPERATE");
    const body = CreateGlossaryTermRequestSchema.parse(input);
    const terms = await this.store.listGlossaryTerms(
      context.ownerId,
      context.companyId,
    );
    const version =
      Math.max(
        0,
        ...terms
          .filter((item) => item.canonicalKey === body.canonicalKey)
          .map((item) => item.version),
      ) + 1;
    const at = this.now().toISOString();
    const term = CompanyGlossaryTermSchema.parse({
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      ...body,
      version,
      status: "ACTIVE",
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveGlossaryTerm(term);
    await this.writeAudit(
      context,
      "GLOSSARY_CHANGED",
      "SUCCESS",
      "COMPANY_GLOSSARY_TERM_VERSIONED",
      { termId: term.id, canonicalKey: term.canonicalKey, version },
    );
    return term;
  }
  async resolveGlossary(ownerId: string, companyId: string, query: string) {
    await this.requireCompany(ownerId, companyId, "READ");
    const normalized = normalize(query);
    return (
      (await this.store.listGlossaryTerms(ownerId, companyId))
        .filter((item) => item.status === "ACTIVE")
        .filter((item) =>
          [item.name, item.canonicalKey, ...item.aliases].some(
            (value) => normalize(value) === normalized,
          ),
        )
        .sort((a, b) => b.version - a.version)[0] ?? null
    );
  }

  async createMetric(context: MutationContext, input: unknown) {
    await this.requireCompany(context.ownerId, context.companyId, "OPERATE");
    const body = CreateSemanticMetricRequestSchema.parse(input);
    for (const id of body.sourceEntityIds)
      if (
        !(await this.store.findMetadataEntity(context.ownerId, context.companyId, id))
      )
        throw dataError(
          "METRIC_SOURCE_SCOPE_MISMATCH",
          "Metric sources must belong to the active company.",
        );
    const definitions = await this.store.listMetrics(
      context.ownerId,
      context.companyId,
    );
    const previous = definitions
      .filter((item) => item.canonicalKey === body.canonicalKey)
      .sort((a, b) => b.version - a.version)[0];
    const at = this.now().toISOString();
    if (previous?.status === "ACTIVE")
      await this.store.saveMetric(
        SemanticMetricSchema.parse({
          ...previous,
          status: "SUPERSEDED",
          updatedAt: at,
        }),
      );
    const metric = SemanticMetricSchema.parse({
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      ...body,
      version: (previous?.version ?? 0) + 1,
      status: "ACTIVE",
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveMetric(metric);
    const metricEntity = await this.createMetadataEntity(context, {
      entityType: "METRIC",
      canonicalName: `metric:${metric.id}`,
      displayName: metric.name,
      description: metric.description,
      domain: null,
      ownerDepartmentId: metric.ownerDepartmentId,
      humanOwnerId: null,
      agentAssignmentId: null,
      sourceSystem: null,
      classification: [],
      sensitivity: "INTERNAL",
      provenance: {
        sourceType: "OWNER",
        sourceRef: `metric:${metric.id}`,
        observedAt: at,
      },
      metadata: { canonicalKey: metric.canonicalKey, version: metric.version },
    });
    for (const sourceId of metric.sourceEntityIds)
      await this.createLineageEdge(context, {
        fromEntityId: sourceId,
        toEntityId: metricEntity.id,
        relation: "FEEDS",
        provenance: "METRIC_DEFINITION",
        description: `Feeds ${metric.canonicalKey} v${metric.version}.`,
      });
    await this.writeAudit(
      context,
      "METRIC_DEFINITION_CHANGED",
      "SUCCESS",
      "SEMANTIC_METRIC_VERSION_CREATED",
      {
        metricId: metric.id,
        canonicalKey: metric.canonicalKey,
        version: metric.version,
      },
    );
    return metric;
  }
  async recordMetric(context: MutationContext, canonicalKey: string, input: unknown) {
    await this.requireCompany(context.ownerId, context.companyId, "OPERATE");
    const body = RecordSemanticMetricObservationRequestSchema.parse(input);
    const metric = await this.store.findMetric(
      context.ownerId,
      context.companyId,
      canonicalKey,
    );
    if (!metric || metric.status !== "ACTIVE")
      throw dataError(
        "METRIC_NOT_FOUND",
        "The canonical metric is not active in this company.",
      );
    for (const id of body.provenanceEntityIds)
      if (
        !(await this.store.findMetadataEntity(context.ownerId, context.companyId, id))
      )
        throw dataError(
          "METRIC_PROVENANCE_SCOPE_MISMATCH",
          "Metric provenance cannot cross companies.",
        );
    const observation = SemanticMetricObservationSchema.parse({
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      metricId: metric.id,
      metricVersion: metric.version,
      ...body,
    });
    await this.store.saveMetricObservation(observation);
    return observation;
  }
  async queryMetric(
    ownerId: string,
    companyId: string,
    canonicalKey: string,
    actor: Actor = {},
  ) {
    await this.requireCompany(ownerId, companyId, "READ");
    const metric = await this.store.findMetric(ownerId, companyId, canonicalKey);
    if (!metric || metric.status !== "ACTIVE")
      throw dataError(
        "METRIC_NOT_FOUND",
        "The canonical metric is not active in this company.",
      );
    if (
      actor.assignmentId &&
      !(await this.canAccessMetric(
        ownerId,
        companyId,
        actor.assignmentId,
        metric.ownerDepartmentId,
      ))
    )
      throw dataError(
        "DATA_ACCESS_DENIED",
        "The assignment cannot access this company metric.",
      );
    return this.metricResult(ownerId, companyId, metric);
  }

  async upsertCredentialReference(context: MutationContext, input: unknown) {
    await this.requireCompany(context.ownerId, context.companyId, "OPERATE");
    const body = UpsertCompanyCredentialReferenceRequestSchema.parse(input);
    const existing = body.id
      ? await this.store.findCredentialReference(
          context.ownerId,
          context.companyId,
          body.id,
        )
      : undefined;
    const at = this.now().toISOString();
    const credential = CompanyCredentialReferenceSchema.parse({
      ...body,
      id: body.id ?? crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    });
    await this.store.saveCredentialReference(credential);
    await this.writeAudit(
      context,
      "COMPANY_CREDENTIAL_CHANGED",
      "SUCCESS",
      "COMPANY_CREDENTIAL_REFERENCE_UPDATED",
      {
        credentialRef: credential.id,
        provider: credential.provider,
        status: credential.status,
      },
    );
    const { secretLocator, ...safe } = credential;
    void secretLocator;
    return CompanyCredentialReferenceSchema.omit({ secretLocator: true }).parse(safe);
  }
  async upsertIntegrationBinding(context: MutationContext, input: unknown) {
    await this.requireCompany(context.ownerId, context.companyId, "OPERATE");
    const body = UpsertCompanyIntegrationBindingRequestSchema.parse(input);
    const credential = await this.store.findCredentialReference(
      context.ownerId,
      context.companyId,
      body.credentialRef,
    );
    if (!credential || credential.provider !== body.provider)
      throw dataError(
        "CREDENTIAL_SCOPE_MISMATCH",
        "The binding credential must belong to this company and provider.",
      );
    const existing = (
      await this.store.listIntegrationBindings(context.ownerId, context.companyId)
    ).find((item) => item.id === body.id);
    const at = this.now().toISOString();
    const binding = CompanyIntegrationBindingSchema.parse({
      ...body,
      id: body.id ?? crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    });
    await this.store.saveIntegrationBinding(binding);
    await this.writeAudit(
      context,
      "COMPANY_INTEGRATION_CONNECTED",
      "SUCCESS",
      "COMPANY_INTEGRATION_BINDING_UPDATED",
      {
        bindingId: binding.id,
        integrationId: binding.integrationId,
        status: binding.status,
      },
    );
    return binding;
  }
  async updatePolicy(context: MutationContext, input: unknown) {
    await this.requireCompany(context.ownerId, context.companyId, "OPERATE");
    const body = UpdateCompanyDataPolicyRequestSchema.parse(input);
    const previous = await this.store.findActivePolicy(
      context.ownerId,
      context.companyId,
    );
    const at = this.now().toISOString();
    if (previous)
      await this.store.savePolicy(
        CompanyDataPolicySchema.parse({
          ...previous,
          status: "ARCHIVED",
          updatedAt: at,
        }),
      );
    const policy = CompanyDataPolicySchema.parse({
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      ...body,
      status: "ACTIVE",
      version: (previous?.version ?? 0) + 1,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.savePolicy(policy);
    await this.writeAudit(
      context,
      "DATA_ACCESS_CHANGED",
      "SUCCESS",
      "COMPANY_DATA_POLICY_VERSIONED",
      { policyId: policy.id, version: policy.version, ruleCount: policy.rules.length },
    );
    return policy;
  }
  async indexSemanticDocument(
    context: MutationContext,
    input: unknown,
    embedding?: number[],
  ) {
    await this.requireCompany(context.ownerId, context.companyId, "OPERATE");
    const body = IndexCompanySemanticDocumentRequestSchema.parse(input);
    if (body.scopeType === "COMPANY" && body.scopeId !== `company:${context.companyId}`)
      throw dataError(
        "MEMORY_SCOPE_MISMATCH",
        "Company memory must use the active company scope.",
      );
    const allowedScopeIds = new Set<string>([`company:${context.companyId}`]);
    for (const assignment of await this.agents.listAssignments(
      context.ownerId,
      context.companyId,
    )) {
      allowedScopeIds.add(assignment.memoryScopeId);
      allowedScopeIds.add(assignment.organizationMemoryScopeId);
      if (assignment.departmentMemoryScopeId)
        allowedScopeIds.add(assignment.departmentMemoryScopeId);
    }
    if (
      !allowedScopeIds.has(body.scopeId) &&
      !["TASK", "CONVERSATION"].includes(body.scopeType)
    )
      throw dataError(
        "MEMORY_SCOPE_MISMATCH",
        "Semantic memory scope is not registered in this company.",
      );
    const at = this.now().toISOString();
    const document = CompanySemanticDocumentSchema.parse({
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      ...body,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveSemanticDocument(document, embedding);
    return document;
  }

  async resolveCompanyContext(ownerId: string, companyId: string, actor: Actor = {}) {
    await this.requireCompany(ownerId, companyId, "READ");
    const [datasets, metrics, entities, glossary, policy, integrations, documents] =
      await Promise.all([
        this.store.listDatasets(ownerId, companyId),
        this.store.listMetrics(ownerId, companyId),
        this.store.listMetadataEntities(ownerId, companyId),
        this.store.listGlossaryTerms(ownerId, companyId),
        this.store.findActivePolicy(ownerId, companyId),
        this.store.listIntegrationBindings(ownerId, companyId),
        this.store.listSemanticDocuments(ownerId, companyId),
      ]);
    const assignment = actor.assignmentId
      ? await this.assignmentById(ownerId, companyId, actor.assignmentId)
      : undefined;
    const authorizedDatasets = assignment
      ? datasets
          .map((item) =>
            this.datasetAccess(policy, assignment.id, assignment.departmentId, item) !==
            "NONE"
              ? this.refreshFreshness(item)
              : null,
          )
          .filter((item): item is CompanyDataset => Boolean(item))
      : datasets.map((item) => this.refreshFreshness(item));
    const availableMetrics = await Promise.all(
      metrics
        .filter((item) => item.status === "ACTIVE")
        .filter(
          (item) =>
            !assignment ||
            assignment.isGovernor ||
            item.ownerDepartmentId === null ||
            item.ownerDepartmentId === assignment.departmentId,
        )
        .map((item) => this.metricResult(ownerId, companyId, item)),
    );
    const scopes = assignment
      ? this.assignmentScopes(assignment, actor.taskId)
      : [{ type: "COMPANY" as const, scopeId: `company:${companyId}` }];
    const freshness =
      authorizedDatasets.length === 0
        ? "EMPTY"
        : authorizedDatasets.some((item) => item.freshness.state === "DEGRADED")
          ? "DEGRADED"
          : authorizedDatasets.some((item) => item.freshness.state === "STALE")
            ? "STALE"
            : "CURRENT";
    void documents;
    return ResolvedCompanyDataContextSchema.parse({
      ownerId,
      companyId,
      authorizedDatasets,
      authorizedMemoryScopes: scopes,
      availableMetrics,
      metadataDomains: [
        ...new Set(
          entities
            .map((item) => item.domain)
            .filter((item): item is string => Boolean(item)),
        ),
      ],
      glossary: glossary.filter((item) => item.status === "ACTIVE"),
      dataSensitivityPolicy: policy ?? null,
      integrationBindings: integrations,
      freshness,
    });
  }
  async resolveAgentContext(ownerId: string, companyId: string, assignmentId: string) {
    const company = await this.requireCompany(ownerId, companyId, "READ");
    const assignment = await this.assignmentById(ownerId, companyId, assignmentId);
    if (!assignment)
      throw dataError("ASSIGNMENT_NOT_FOUND", "The assignment is not in this company.");
    const definition = await this.agents.findDefinition(
      ownerId,
      assignment.agentDefinitionId,
    );
    if (!definition)
      throw dataError(
        "AGENT_DEFINITION_NOT_FOUND",
        "The reusable definition is unavailable.",
      );
    const resolved = await this.resolveCompanyContext(ownerId, companyId, {
      assignmentId,
    });
    const credentials = await this.store.listCredentialReferences(ownerId, companyId);
    const effectiveCapabilities = definition.capabilityRequirements.map(
      (capabilityId) => {
        if (company.status !== "ACTIVE")
          return {
            capabilityId,
            state: "COMPANY_PAUSED" as const,
            integrationBindingId: null,
            reasonCode: "COMPANY_NOT_ACTIVE",
          };
        const binding = resolved.integrationBindings.find(
          (item) =>
            item.capabilitiesExposed.includes(capabilityId) && item.status === "READY",
        );
        if (!binding)
          return {
            capabilityId,
            state: "INTEGRATION_MISSING" as const,
            integrationBindingId: null,
            reasonCode: "NO_READY_INTEGRATION_BINDING",
          };
        const credential = credentials.find(
          (item) => item.id === binding.credentialRef,
        );
        if (!credential || credential.status !== "READY")
          return {
            capabilityId,
            state: "CREDENTIAL_EXPIRED" as const,
            integrationBindingId: binding.id,
            reasonCode: credential?.status ?? "CREDENTIAL_MISSING",
          };
        return {
          capabilityId,
          state: "AVAILABLE" as const,
          integrationBindingId: binding.id,
          reasonCode: "READY",
        };
      },
    );
    const accessLevels = resolved.authorizedDatasets.map((item) =>
      this.datasetAccess(
        resolved.dataSensitivityPolicy ?? undefined,
        assignment.id,
        assignment.departmentId,
        item,
      ),
    );
    const metadataAccess = accessLevels.includes("RAW")
      ? "RAW"
      : accessLevels.includes("AGGREGATE")
        ? "AGGREGATE"
        : accessLevels.includes("METADATA")
          ? "METADATA"
          : "NONE";
    return ResolvedCompanyAgentContextSchema.parse({
      ownerId,
      companyId,
      agentDefinitionId: definition.id,
      companyAgentAssignmentId: assignment.id,
      departmentId: assignment.departmentId,
      memoryScopes: resolved.authorizedMemoryScopes,
      datasets: resolved.authorizedDatasets,
      metrics: resolved.availableMetrics,
      glossary: resolved.glossary,
      metadataAccess,
      effectiveCapabilities,
      integrationBindings: resolved.integrationBindings,
      credentialReferences: credentials.map((credential) => {
        const { secretLocator, ...item } = credential;
        void secretLocator;
        return item;
      }),
      restrictions: [
        "Vector similarity is not authorization.",
        "Raw data requires explicit policy.",
        "Sensitive context follows company model-routing policy.",
      ],
    });
  }
  async semanticSearch(ownerId: string, companyId: string, input: unknown) {
    const body = CompanySemanticSearchRequestSchema.parse(input);
    const context = await this.resolveCompanyContext(
      ownerId,
      companyId,
      body.assignmentId ? { assignmentId: body.assignmentId } : {},
    );
    return this.store.searchSemanticDocuments({
      ownerId,
      companyId,
      scopeIds: context.authorizedMemoryScopes.map((item) => item.scopeId),
      entityTypes: body.entityTypes,
      query: body.query,
      limit: body.limit,
    });
  }
  async resolveModelDataPolicy(
    ownerId: string,
    companyId: string,
    sensitivity: CompanyDataSensitivity,
  ) {
    await this.requireCompany(ownerId, companyId, "READ");
    const policy = await this.store.findActivePolicy(ownerId, companyId);
    const routing =
      policy?.modelRouting[sensitivity] ??
      (sensitivity === "RESTRICTED"
        ? "LOCAL_ONLY"
        : sensitivity === "CONFIDENTIAL"
          ? "APPROVED_CLOUD"
          : "ANY_APPROVED");
    return {
      sensitivity,
      routing,
      privacy:
        routing === "LOCAL_ONLY" ? ("LOCAL_ONLY" as const) : ("STANDARD" as const),
      locality:
        routing === "LOCAL_ONLY" ? ("LOCAL_ONLY" as const) : ("PREFER_LOCAL" as const),
      allowCloud: routing !== "LOCAL_ONLY",
      approvedCloudProviderIds:
        routing === "APPROVED_CLOUD"
          ? (policy?.modelRouting.approvedCloudProviderIds ?? [])
          : [],
    };
  }

  private async metricResult(
    ownerId: string,
    companyId: string,
    definition: Awaited<ReturnType<CompanyDataStore["findMetric"]>> extends infer T
      ? NonNullable<T>
      : never,
  ): Promise<SemanticMetricQueryResult> {
    const observations = await this.store.listMetricObservations(
      ownerId,
      companyId,
      definition.id,
    );
    const observation = observations[0] ?? null;
    const freshness = !observation
      ? "UNAVAILABLE"
      : observation.qualityState === "CONFLICT"
        ? "CONFLICT"
        : Date.parse(observation.expiresAt) <= this.now().getTime()
          ? "STALE"
          : "CURRENT";
    const lineage = await this.store.listLineageEdges(ownerId, companyId);
    const entities = await this.store.listMetadataEntities(ownerId, companyId);
    const metricEntity = entities.find(
      (item) =>
        item.entityType === "METRIC" &&
        item.metadata.canonicalKey === definition.canonicalKey &&
        item.metadata.version === definition.version,
    );
    return SemanticMetricQueryResultSchema.parse({
      definition,
      observation,
      freshness,
      lineage: metricEntity
        ? lineage.filter(
            (item) =>
              item.toEntityId === metricEntity.id ||
              item.fromEntityId === metricEntity.id,
          )
        : [],
    });
  }
  private async requireCompany(
    ownerId: string,
    companyId: string,
    mode: "READ" | "OPERATE",
  ) {
    const company = await this.companies.findCompany(ownerId, companyId);
    if (!company)
      throw dataError(
        "COMPANY_SCOPE_MISMATCH",
        "Company data is unavailable outside the authenticated owner and company scope.",
      );
    if (mode === "OPERATE" && company.status !== "ACTIVE")
      throw dataError(
        "COMPANY_DATA_NOT_ACTIVE",
        "Company data mutations require an active company.",
      );
    return company;
  }
  private refreshFreshness(dataset: CompanyDataset) {
    if (!dataset.freshness.lastUpdatedAt) return dataset;
    const stale =
      Date.parse(dataset.freshness.lastUpdatedAt) +
        dataset.freshness.staleAfterSeconds * 1000 <=
      this.now().getTime();
    return stale && dataset.freshness.state !== "DEGRADED"
      ? CompanyDatasetSchema.parse({
          ...dataset,
          freshness: { ...dataset.freshness, state: "STALE" },
        })
      : dataset;
  }
  private inferSchema(
    records: ConnectorBatch["records"],
    sensitivity: CompanyDataSensitivity,
  ) {
    const fields = new Map<string, z.infer<typeof CompanySchemaFieldSchema>>();
    for (const record of records)
      for (const [name, value] of Object.entries(record)) {
        const dataType =
          value === null
            ? "JSON"
            : typeof value === "string"
              ? /^\d{4}-\d{2}-\d{2}T/.test(value)
                ? "TIMESTAMP"
                : "STRING"
              : typeof value === "number"
                ? "NUMBER"
                : typeof value === "boolean"
                  ? "BOOLEAN"
                  : "JSON";
        const current = fields.get(name);
        if (current && current.dataType !== dataType)
          fields.set(name, { ...current, dataType: "JSON" });
        else if (!current)
          fields.set(name, { name, dataType, nullable: value === null, sensitivity });
      }
    return [...fields.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  private recordKey(
    pipeline: CompanyDataPipeline,
    payload: Record<string, unknown>,
    index: number,
  ) {
    if (pipeline.primaryKey) {
      const value = payload[pipeline.primaryKey];
      if (typeof value !== "string" && typeof value !== "number")
        throw dataError(
          "PIPELINE_PRIMARY_KEY_MISSING",
          "A merge record is missing its registered primary key.",
        );
      return String(value);
    }
    return createHash("sha256")
      .update(JSON.stringify(payload))
      .update(`:${index}`)
      .digest("hex");
  }
  private async assignmentById(
    ownerId: string,
    companyId: string,
    assignmentId: string,
  ) {
    return (await this.agents.listAssignments(ownerId, companyId)).find(
      (item) => item.id === assignmentId && item.status !== "REVOKED",
    );
  }
  private assignmentScopes(
    assignment: NonNullable<Awaited<ReturnType<CompanyDataService["assignmentById"]>>>,
    taskId?: string,
  ) {
    return [
      { type: "AGENT_ASSIGNMENT" as const, scopeId: assignment.memoryScopeId },
      ...(assignment.departmentMemoryScopeId
        ? [{ type: "DEPARTMENT" as const, scopeId: assignment.departmentMemoryScopeId }]
        : []),
      { type: "COMPANY" as const, scopeId: assignment.organizationMemoryScopeId },
      ...(taskId ? [{ type: "TASK" as const, scopeId: `task:${taskId}` }] : []),
    ];
  }
  private datasetAccess(
    policy: CompanyDataPolicy | undefined,
    assignmentId: string,
    departmentId: string | null,
    dataset: CompanyDataset,
  ) {
    const rules =
      policy?.rules.filter(
        (rule) =>
          (rule.assignmentId === assignmentId ||
            Boolean(departmentId && rule.departmentId === departmentId)) &&
          (rule.entityId === null || rule.entityId === dataset.id) &&
          (rule.logicalContract === null ||
            rule.logicalContract === dataset.logicalContract),
      ) ?? [];
    if (rules.some((rule) => rule.effect === "DENY")) return "NONE" as const;
    const allowed = rules.filter(
      (rule) =>
        rule.effect === "ALLOW" &&
        sensitivityRank[dataset.sensitivity] <=
          sensitivityRank[rule.maximumSensitivity],
    );
    if (!allowed.length) return "NONE" as const;
    return allowed.sort(
      (a, b) =>
        ["METADATA", "AGGREGATE", "RAW"].indexOf(b.access) -
        ["METADATA", "AGGREGATE", "RAW"].indexOf(a.access),
    )[0]!.access;
  }
  private async canAccessMetric(
    ownerId: string,
    companyId: string,
    assignmentId: string,
    ownerDepartmentId: string | null,
  ) {
    const assignment = await this.assignmentById(ownerId, companyId, assignmentId);
    return Boolean(
      assignment &&
      (assignment.isGovernor ||
        ownerDepartmentId === null ||
        assignment.departmentId === ownerDepartmentId),
    );
  }
  private async ensureCoreLineage(
    context: MutationContext,
    pipeline: CompanyDataPipeline,
    dataset: CompanyDataset,
  ) {
    const entities = await this.coreEntities(
      context.ownerId,
      context.companyId,
      pipeline,
      dataset,
    );
    for (const edge of await this.coreEdges(
      context.ownerId,
      context.companyId,
      entities,
    ))
      await this.store.saveLineageEdge(edge);
  }
  private async coreEntities(
    ownerId: string,
    companyId: string,
    pipeline: CompanyDataPipeline,
    dataset: CompanyDataset,
  ) {
    const entities = await this.store.listMetadataEntities(ownerId, companyId);
    const required = [
      entities.find((item) => item.canonicalName === `source:${pipeline.sourceId}`),
      entities.find((item) => item.canonicalName === `pipeline:${pipeline.id}`),
      entities.find((item) => item.canonicalName === `dataset:${dataset.id}`),
    ];
    if (required.some((item) => !item))
      throw dataError(
        "PIPELINE_METADATA_INCOMPLETE",
        "Source, pipeline, and dataset metadata must exist before ingestion.",
      );
    return required as MetadataEntity[];
  }
  private async coreEdges(
    ownerId: string,
    companyId: string,
    entities: MetadataEntity[],
  ) {
    const existing = await this.store.listLineageEdges(ownerId, companyId);
    const at = this.now().toISOString();
    const pairs: Array<{
      from: MetadataEntity;
      to: MetadataEntity;
      relation: "PRODUCES" | "LOADS";
    }> = [
      { from: entities[0]!, to: entities[1]!, relation: "PRODUCES" },
      { from: entities[1]!, to: entities[2]!, relation: "LOADS" },
    ];
    return pairs.map(
      ({ from, to, relation }) =>
        existing.find(
          (item) =>
            item.fromEntityId === from.id &&
            item.toEntityId === to.id &&
            item.relation === relation,
        ) ??
        MetadataLineageEdgeSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          companyId,
          fromEntityId: from.id,
          toEntityId: to.id,
          relation,
          provenance: "PIPELINE",
          description: "Registered company ingestion lineage.",
          createdAt: at,
        }),
    );
  }
  private async writeAudit(
    context: MutationContext,
    eventType: Parameters<GovernanceAuditWriter>[0]["eventType"],
    outcome: "SUCCESS" | "DENIED" | "FAILURE",
    reason: string,
    metadata: Record<string, string | number>,
  ) {
    await this.audit?.({
      eventType,
      ownerId: context.ownerId,
      companyId: context.companyId,
      ipAddress: context.ipAddress,
      outcome,
      reason,
      requestId: context.requestId,
      metadata,
    });
  }
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const errorCode = (error: unknown) =>
  error &&
  typeof error === "object" &&
  "code" in error &&
  typeof error.code === "string"
    ? error.code
    : "PIPELINE_RUN_FAILED";
const dataError = (code: string, message: string) =>
  Object.assign(new Error(message), {
    code,
    statusCode: code.endsWith("NOT_FOUND")
      ? 404
      : code.includes("SCOPE") || code.includes("ACCESS")
        ? 403
        : 409,
  });

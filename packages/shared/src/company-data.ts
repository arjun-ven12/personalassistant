import { z } from "zod";

const uuid = z.string().uuid();
const boundedKey = z
  .string()
  .trim()
  .min(2)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const metadata = z.record(z.string().trim().min(1).max(80), z.json()).default({});

export const CompanyDataSensitivitySchema = z.enum([
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
]);
export const CompanyDataSourceTypeSchema = z.enum([
  "CRM",
  "ACCOUNTING",
  "ADS",
  "ANALYTICS",
  "COMMERCE",
  "FILES",
  "SUPPORT",
  "MARKET_DATA",
  "INTERNAL_API",
  "PAYMENTS",
  "SYNTHETIC",
]);
export const CompanyDataStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "DEGRADED",
  "FAILED",
  "ARCHIVED",
]);
export const CompanyDataSourceSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    sourceType: CompanyDataSourceTypeSchema,
    provider: boundedKey,
    displayName: z.string().trim().min(1).max(160),
    status: CompanyDataStatusSchema,
    connectionRef: boundedKey.nullable(),
    ingestionMode: z.enum(["MANUAL", "SCHEDULED", "EVENT_DRIVEN"]),
    metadata,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CompanySchemaFieldSchema = z
  .object({
    name: boundedKey,
    dataType: z.enum(["STRING", "NUMBER", "BOOLEAN", "TIMESTAMP", "JSON"]),
    nullable: z.boolean(),
    sensitivity: CompanyDataSensitivitySchema,
  })
  .strict();
export const CompanyDatasetSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    sourceId: uuid,
    canonicalName: boundedKey,
    logicalContract: boundedKey.nullable(),
    physicalLocation: boundedKey,
    schemaMetadata: z
      .object({
        version: z.number().int().positive(),
        fields: z.array(CompanySchemaFieldSchema).max(500),
        lastChangedAt: z.iso.datetime(),
      })
      .strict(),
    sensitivity: CompanyDataSensitivitySchema,
    ownerDepartmentId: uuid.nullable(),
    status: CompanyDataStatusSchema,
    freshness: z
      .object({
        lastUpdatedAt: z.iso.datetime().nullable(),
        staleAfterSeconds: z.number().int().positive().max(31_536_000),
        state: z.enum(["UNKNOWN", "FRESH", "STALE", "DEGRADED"]),
      })
      .strict(),
    quality: z
      .object({
        completeness: z.number().min(0).max(1).nullable(),
        schemaValid: z.boolean(),
        missingValueRate: z.number().min(0).max(1).nullable(),
        duplicateRate: z.number().min(0).max(1).nullable(),
        sourceHealth: z.enum(["UNKNOWN", "HEALTHY", "DEGRADED", "UNHEALTHY"]),
      })
      .strict(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CompanyDataPipelineSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    sourceId: uuid,
    datasetId: uuid,
    connectorKey: boundedKey,
    destination: z.literal("SHARED_POSTGRES"),
    triggerMode: z.enum(["MANUAL", "SCHEDULED", "EVENT_DRIVEN"]),
    schedule: z.string().trim().min(1).max(160).nullable(),
    schemaContract: z.enum(["EVOLVE", "FREEZE"]),
    writeDisposition: z.enum(["APPEND", "MERGE"]),
    primaryKey: boundedKey.nullable(),
    incrementalCursor: boundedKey.nullable(),
    incrementalState: z.record(z.string().max(80), z.json()),
    status: CompanyDataStatusSchema,
    lastSuccessfulRun: z.iso.datetime().nullable(),
    lastFailureCode: z.string().max(120).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const CompanyPipelineRunSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    sourceId: uuid,
    pipelineId: uuid,
    datasetId: uuid,
    loadPackageId: uuid,
    status: z.enum(["RUNNING", "SUCCEEDED", "FAILED"]),
    recordsRead: z.number().int().nonnegative(),
    recordsWritten: z.number().int().nonnegative(),
    schemaChanges: z.array(boundedKey).max(500),
    durationMs: z.number().nonnegative(),
    retryCount: z.number().int().nonnegative().max(20),
    errorCode: z.string().max(120).nullable(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const MetadataEntityTypeSchema = z.enum([
  "DATASET",
  "TABLE",
  "FIELD",
  "METRIC",
  "REPORT",
  "DOCUMENT",
  "MEMORY_SCOPE",
  "WORKFLOW_OUTPUT",
  "OBJECTIVE_OUTPUT",
  "INTEGRATION",
  "DATA_SOURCE",
  "PIPELINE",
]);
export const MetadataEntitySchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    entityType: MetadataEntityTypeSchema,
    canonicalName: boundedKey,
    displayName: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2_000),
    domain: z.string().trim().min(1).max(120).nullable(),
    ownerDepartmentId: uuid.nullable(),
    humanOwnerId: uuid.nullable(),
    agentAssignmentId: uuid.nullable(),
    sourceSystem: boundedKey.nullable(),
    classification: z.array(boundedKey).max(40),
    sensitivity: CompanyDataSensitivitySchema,
    provenance: z
      .object({
        sourceType: z.enum(["OWNER", "INGESTION", "SYSTEM", "INTEGRATION", "WORKFLOW"]),
        sourceRef: boundedKey,
        observedAt: z.iso.datetime(),
      })
      .strict(),
    status: CompanyDataStatusSchema,
    metadata,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const MetadataLineageEdgeSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    fromEntityId: uuid,
    toEntityId: uuid,
    relation: z.enum([
      "PRODUCES",
      "LOADS",
      "FEEDS",
      "DERIVES",
      "MEASURES",
      "INFORMS",
      "USES",
      "OWNS",
    ]),
    provenance: z.enum(["MANUAL", "PIPELINE", "METRIC_DEFINITION", "SYSTEM"]),
    description: z.string().trim().max(500),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const CompanyGlossaryTermSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    canonicalKey: boundedKey,
    name: z.string().trim().min(1).max(160),
    definition: z.string().trim().min(1).max(2_000),
    aliases: z.array(z.string().trim().min(1).max(160)).max(40),
    domain: z.string().trim().min(1).max(120).nullable(),
    ownerDepartmentId: uuid.nullable(),
    linkedEntityIds: z.array(uuid).max(100),
    linkedMetricIds: z.array(uuid).max(100),
    sensitivity: CompanyDataSensitivitySchema,
    version: z.number().int().positive(),
    status: z.enum(["ACTIVE", "DEPRECATED"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

const formula = z
  .string()
  .trim()
  .min(1)
  .max(1_000)
  .refine(
    (value) => !/[;]|--|\/\*/.test(value),
    "Metric formulas are inert semantic expressions and cannot contain SQL statement syntax.",
  );
export const SemanticMetricSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    canonicalKey: boundedKey,
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(2_000),
    formula,
    sourceEntityIds: z.array(uuid).min(1).max(100),
    dimensions: z.array(boundedKey).max(40),
    timeField: boundedKey.nullable(),
    unit: z.string().trim().min(1).max(40),
    ownerDepartmentId: uuid.nullable(),
    definitionSource: z.enum(["OWNER", "SYSTEM", "IMPORTED"]),
    version: z.number().int().positive(),
    status: z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "ARCHIVED"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const SemanticMetricObservationSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    metricId: uuid,
    metricVersion: z.number().int().positive(),
    value: z.string().regex(/^-?\d+(\.\d{1,12})?$/),
    dimensions: z.record(boundedKey, z.string().max(160)),
    observedAt: z.iso.datetime(),
    sourceUpdatedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    provenanceEntityIds: z.array(uuid).min(1).max(100),
    qualityState: z.enum(["VERIFIED", "DEGRADED", "CONFLICT"]),
  })
  .strict();
export const SemanticMetricQueryResultSchema = z
  .object({
    definition: SemanticMetricSchema,
    observation: SemanticMetricObservationSchema.nullable(),
    freshness: z.enum(["CURRENT", "STALE", "UNAVAILABLE", "CONFLICT"]),
    lineage: z.array(MetadataLineageEdgeSchema).max(500),
  })
  .strict();

export const CompanyCredentialReferenceSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    provider: boundedKey,
    secretLocator: boundedKey,
    status: z.enum(["READY", "MISSING", "EXPIRED", "REVOKED"]),
    lastVerifiedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const CompanyIntegrationBindingSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    provider: boundedKey,
    integrationType: boundedKey,
    integrationId: boundedKey,
    credentialRef: uuid,
    status: z.enum(["READY", "DEGRADED", "DISABLED"]),
    capabilitiesExposed: z.array(boundedKey).max(100),
    metadata,
    lastSyncAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CompanyDataAccessRuleSchema = z
  .object({
    id: uuid,
    departmentId: uuid.nullable(),
    assignmentId: uuid.nullable(),
    entityId: uuid.nullable(),
    logicalContract: boundedKey.nullable(),
    access: z.enum(["METADATA", "AGGREGATE", "RAW"]),
    maximumSensitivity: CompanyDataSensitivitySchema,
    effect: z.enum(["ALLOW", "DENY"]),
  })
  .strict()
  .refine(
    (value) => value.departmentId || value.assignmentId,
    "A data access rule must target a department or assignment.",
  );
export const CompanyDataPolicySchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    rules: z.array(CompanyDataAccessRuleSchema).max(500),
    modelRouting: z
      .object({
        PUBLIC: z.enum(["ANY_APPROVED", "APPROVED_CLOUD", "LOCAL_ONLY"]),
        INTERNAL: z.enum(["ANY_APPROVED", "APPROVED_CLOUD", "LOCAL_ONLY"]),
        CONFIDENTIAL: z.enum(["APPROVED_CLOUD", "LOCAL_ONLY"]),
        RESTRICTED: z.literal("LOCAL_ONLY"),
        approvedCloudProviderIds: z.array(boundedKey).max(20),
      })
      .strict(),
    externalTransferAllowed: z.boolean(),
    status: z.enum(["ACTIVE", "ARCHIVED"]),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CompanyMemoryScopeTypeSchema = z.enum([
  "OWNER",
  "COMPANY",
  "DEPARTMENT",
  "AGENT_ASSIGNMENT",
  "TASK",
  "CONVERSATION",
]);
export const CompanySemanticDocumentTypeSchema = z.enum([
  "MEMORY",
  "DOCUMENT",
  "AGENT_EXPERIENCE",
  "METADATA_ENTITY",
  "GLOSSARY_TERM",
  "WORKFLOW_KNOWLEDGE",
]);
export const CompanySemanticDocumentSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    entityType: CompanySemanticDocumentTypeSchema,
    scopeType: CompanyMemoryScopeTypeSchema,
    scopeId: boundedKey,
    sourceEntityId: z.string().min(1).max(160),
    title: z.string().trim().min(1).max(255),
    summary: z.string().trim().min(1).max(2_000),
    sensitivity: CompanyDataSensitivitySchema,
    embeddingVersion: z.string().min(1).max(80).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const EffectiveCapabilityStateSchema = z.enum([
  "AVAILABLE",
  "APPROVAL_REQUIRED",
  "INTEGRATION_MISSING",
  "CREDENTIAL_EXPIRED",
  "POLICY_DENIED",
  "DEVICE_OFFLINE",
  "BUDGET_BLOCKED",
  "COMPANY_PAUSED",
]);
export const EffectiveCapabilitySchema = z
  .object({
    capabilityId: boundedKey,
    state: EffectiveCapabilityStateSchema,
    integrationBindingId: uuid.nullable(),
    reasonCode: z.string().min(1).max(120),
  })
  .strict();
export const ResolvedCompanyDataContextSchema = z
  .object({
    ownerId: uuid,
    companyId: uuid,
    authorizedDatasets: z.array(CompanyDatasetSchema).max(2_000),
    authorizedMemoryScopes: z
      .array(
        z.object({ type: CompanyMemoryScopeTypeSchema, scopeId: boundedKey }).strict(),
      )
      .max(500),
    availableMetrics: z.array(SemanticMetricQueryResultSchema).max(2_000),
    metadataDomains: z.array(z.string().min(1).max(120)).max(200),
    glossary: z.array(CompanyGlossaryTermSchema).max(2_000),
    dataSensitivityPolicy: CompanyDataPolicySchema.nullable(),
    integrationBindings: z.array(CompanyIntegrationBindingSchema).max(500),
    freshness: z.enum(["CURRENT", "STALE", "DEGRADED", "EMPTY"]),
  })
  .strict();
export const ResolvedCompanyAgentContextSchema = z
  .object({
    ownerId: uuid,
    companyId: uuid,
    agentDefinitionId: boundedKey,
    companyAgentAssignmentId: uuid,
    departmentId: uuid.nullable(),
    memoryScopes: ResolvedCompanyDataContextSchema.shape.authorizedMemoryScopes,
    datasets: z.array(CompanyDatasetSchema).max(2_000),
    metrics: z.array(SemanticMetricQueryResultSchema).max(2_000),
    glossary: z.array(CompanyGlossaryTermSchema).max(2_000),
    metadataAccess: z.enum(["NONE", "METADATA", "AGGREGATE", "RAW"]),
    effectiveCapabilities: z.array(EffectiveCapabilitySchema).max(200),
    integrationBindings: z.array(CompanyIntegrationBindingSchema).max(500),
    credentialReferences: z
      .array(CompanyCredentialReferenceSchema.omit({ secretLocator: true }))
      .max(500),
    restrictions: z.array(z.string().min(1).max(240)).max(100),
  })
  .strict();

export const CompanyDataDashboardSchema = z
  .object({
    sources: z.array(CompanyDataSourceSchema).max(500),
    datasets: z.array(CompanyDatasetSchema).max(2_000),
    pipelines: z.array(CompanyDataPipelineSchema).max(2_000),
    recentRuns: z.array(CompanyPipelineRunSchema).max(200),
    metadataEntities: z.array(MetadataEntitySchema).max(2_000),
    glossary: z.array(CompanyGlossaryTermSchema).max(2_000),
    metrics: z.array(SemanticMetricQueryResultSchema).max(2_000),
    integrations: z.array(CompanyIntegrationBindingSchema).max(500),
    memory: z
      .object({
        byType: z.record(
          CompanySemanticDocumentTypeSchema,
          z.number().int().nonnegative(),
        ),
        total: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const CreateCompanyDataSourceRequestSchema = CompanyDataSourceSchema.pick({
  sourceType: true,
  provider: true,
  displayName: true,
  connectionRef: true,
  ingestionMode: true,
  metadata: true,
});
export const CreateCompanyDatasetRequestSchema = CompanyDatasetSchema.pick({
  sourceId: true,
  canonicalName: true,
  logicalContract: true,
  physicalLocation: true,
  sensitivity: true,
  ownerDepartmentId: true,
})
  .extend({
    staleAfterSeconds: z.number().int().positive().max(31_536_000).default(86_400),
  })
  .strict();
export const CreateCompanyDataPipelineRequestSchema = CompanyDataPipelineSchema.pick({
  sourceId: true,
  datasetId: true,
  connectorKey: true,
  triggerMode: true,
  schedule: true,
  schemaContract: true,
  writeDisposition: true,
  primaryKey: true,
  incrementalCursor: true,
});
export const CreateMetadataEntityRequestSchema = MetadataEntitySchema.pick({
  entityType: true,
  canonicalName: true,
  displayName: true,
  description: true,
  domain: true,
  ownerDepartmentId: true,
  humanOwnerId: true,
  agentAssignmentId: true,
  sourceSystem: true,
  classification: true,
  sensitivity: true,
  provenance: true,
  metadata: true,
});
export const CreateLineageEdgeRequestSchema = MetadataLineageEdgeSchema.pick({
  fromEntityId: true,
  toEntityId: true,
  relation: true,
  provenance: true,
  description: true,
});
export const CreateGlossaryTermRequestSchema = CompanyGlossaryTermSchema.pick({
  canonicalKey: true,
  name: true,
  definition: true,
  aliases: true,
  domain: true,
  ownerDepartmentId: true,
  linkedEntityIds: true,
  linkedMetricIds: true,
  sensitivity: true,
});
export const CreateSemanticMetricRequestSchema = SemanticMetricSchema.pick({
  canonicalKey: true,
  name: true,
  description: true,
  formula: true,
  sourceEntityIds: true,
  dimensions: true,
  timeField: true,
  unit: true,
  ownerDepartmentId: true,
  definitionSource: true,
});
export const RecordSemanticMetricObservationRequestSchema =
  SemanticMetricObservationSchema.pick({
    value: true,
    dimensions: true,
    observedAt: true,
    sourceUpdatedAt: true,
    expiresAt: true,
    provenanceEntityIds: true,
    qualityState: true,
  });
export const UpsertCompanyCredentialReferenceRequestSchema =
  CompanyCredentialReferenceSchema.pick({
    provider: true,
    secretLocator: true,
    status: true,
    lastVerifiedAt: true,
  })
    .extend({ id: uuid.optional() })
    .strict();
export const UpsertCompanyIntegrationBindingRequestSchema =
  CompanyIntegrationBindingSchema.pick({
    provider: true,
    integrationType: true,
    integrationId: true,
    credentialRef: true,
    status: true,
    capabilitiesExposed: true,
    metadata: true,
    lastSyncAt: true,
  })
    .extend({ id: uuid.optional() })
    .strict();
export const UpdateCompanyDataPolicyRequestSchema = CompanyDataPolicySchema.pick({
  rules: true,
  modelRouting: true,
  externalTransferAllowed: true,
});
export const IndexCompanySemanticDocumentRequestSchema =
  CompanySemanticDocumentSchema.pick({
    entityType: true,
    scopeType: true,
    scopeId: true,
    sourceEntityId: true,
    title: true,
    summary: true,
    sensitivity: true,
    embeddingVersion: true,
  });
export const CompanySemanticSearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    entityTypes: z.array(CompanySemanticDocumentTypeSchema).max(6).default([]),
    limit: z.number().int().min(1).max(50).default(10),
    assignmentId: uuid.optional(),
  })
  .strict();

export type CompanyDataSensitivity = z.infer<typeof CompanyDataSensitivitySchema>;
export type CompanyDataSource = z.infer<typeof CompanyDataSourceSchema>;
export type CompanyDataset = z.infer<typeof CompanyDatasetSchema>;
export type CompanyDataPipeline = z.infer<typeof CompanyDataPipelineSchema>;
export type CompanyPipelineRun = z.infer<typeof CompanyPipelineRunSchema>;
export type MetadataEntity = z.infer<typeof MetadataEntitySchema>;
export type MetadataLineageEdge = z.infer<typeof MetadataLineageEdgeSchema>;
export type CompanyGlossaryTerm = z.infer<typeof CompanyGlossaryTermSchema>;
export type SemanticMetric = z.infer<typeof SemanticMetricSchema>;
export type SemanticMetricObservation = z.infer<typeof SemanticMetricObservationSchema>;
export type SemanticMetricQueryResult = z.infer<typeof SemanticMetricQueryResultSchema>;
export type CompanyCredentialReference = z.infer<
  typeof CompanyCredentialReferenceSchema
>;
export type CompanyIntegrationBinding = z.infer<typeof CompanyIntegrationBindingSchema>;
export type CompanyDataPolicy = z.infer<typeof CompanyDataPolicySchema>;
export type CompanySemanticDocument = z.infer<typeof CompanySemanticDocumentSchema>;
export type ResolvedCompanyDataContext = z.infer<
  typeof ResolvedCompanyDataContextSchema
>;
export type ResolvedCompanyAgentContext = z.infer<
  typeof ResolvedCompanyAgentContextSchema
>;

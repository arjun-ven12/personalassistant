import { z } from "zod";

import { RegistryIdSchema } from "./applications.js";

export const RepositoryIndexStatusSchema = z.enum([
  "UNINDEXED",
  "INDEXING",
  "INDEXED",
  "STALE",
  "FAILED",
  "REINDEX_REQUIRED",
]);

export const RepositoryIndexJobStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

export const RepositoryFileClassificationSchema = z.enum([
  "source",
  "test",
  "configuration",
  "documentation",
  "asset",
  "generated",
  "build_output",
  "unknown",
]);

const RelativeRepositoryPathSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((value) => !value.startsWith("/") && !/^[A-Za-z]:/.test(value))
  .refine((value) => !value.includes("\0"))
  .refine((value) =>
    value
      .split("/")
      .every((segment) => segment !== "" && segment !== "." && segment !== ".."),
  );

export const RepositoryTechnologySummarySchema = z
  .object({
    detected: z.array(z.string().min(1).max(80)).max(100),
    packageManagers: z.array(z.string().min(1).max(80)).max(20),
    frameworks: z.array(z.string().min(1).max(80)).max(50),
    databases: z.array(z.string().min(1).max(80)).max(50),
    languages: z.array(z.string().min(1).max(80)).max(100),
  })
  .strict();

export const RepositoryStatisticsSchema = z
  .object({
    fileCount: z.number().int().nonnegative().max(200_000),
    directoryCount: z.number().int().nonnegative().max(200_000),
    totalBytes: z.number().int().nonnegative(),
    largestFiles: z
      .array(
        z
          .object({
            relativePath: RelativeRepositoryPathSchema,
            sizeBytes: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(25),
    extensionStats: z.record(z.string().max(32), z.number().int().nonnegative()),
    languageSummary: z.record(z.string().max(80), z.number().int().nonnegative()),
    classificationSummary: z.record(
      RepositoryFileClassificationSchema,
      z.number().int().nonnegative(),
    ),
  })
  .strict();

export const FileInventoryRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    repositoryId: z.string().uuid(),
    generation: z.number().int().positive(),
    workspaceId: RegistryIdSchema,
    relativePath: RelativeRepositoryPathSchema,
    parentDirectory: z.string().max(1_024),
    fileName: z.string().min(1).max(255),
    extension: z.string().max(32),
    language: z.string().min(1).max(80),
    sizeBytes: z.number().int().nonnegative(),
    modifiedAt: z.iso.datetime(),
    classification: RepositoryFileClassificationSchema,
    metadataFingerprint: z.string().length(64),
  })
  .strict();

export const DirectoryNodeSchema = z
  .object({
    schemaVersion: z.literal("1"),
    repositoryId: z.string().uuid(),
    generation: z.number().int().positive(),
    workspaceId: RegistryIdSchema,
    relativePath: z.string().max(1_024),
    parentDirectory: z.string().max(1_024).nullable(),
    name: z.string().min(1).max(255),
    fileCount: z.number().int().nonnegative(),
    directoryCount: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative(),
    languageSummary: z.record(z.string().max(80), z.number().int().nonnegative()),
  })
  .strict();

export const RepositorySchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    workspaceId: RegistryIdSchema,
    indexStatus: RepositoryIndexStatusSchema,
    activeGeneration: z.number().int().positive().nullable(),
    activeFingerprint: z.string().length(64).nullable(),
    lastIndexedAt: z.iso.datetime().nullable(),
    lastFailureCode: z.string().max(100).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const RepositoryGenerationSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    repositoryId: z.string().uuid(),
    ownerId: z.string().uuid(),
    workspaceId: RegistryIdSchema,
    generation: z.number().int().positive(),
    fingerprint: z.string().length(64),
    executionRequestId: z.string().uuid(),
    indexedAt: z.iso.datetime(),
    scannedAt: z.iso.datetime(),
    ignoreVersion: z.literal("phase-4.1-default-v1"),
    statistics: RepositoryStatisticsSchema,
    technologySummary: RepositoryTechnologySummarySchema,
  })
  .strict();

export const RepositoryIndexJobSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    repositoryId: z.string().uuid(),
    ownerId: z.string().uuid(),
    workspaceId: RegistryIdSchema,
    status: RepositoryIndexJobStatusSchema,
    reason: z.enum(["initial", "manual", "stale", "failure_retry"]),
    executionRequestId: z.string().uuid().nullable(),
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    failureCode: z.string().max(100).nullable(),
  })
  .strict();

export const RepositoryListResponseSchema = z.array(RepositorySchema).max(200);
export const RepositoryDetailResponseSchema = z
  .object({
    repository: RepositorySchema,
    activeGeneration: RepositoryGenerationSchema.nullable(),
    latestJob: RepositoryIndexJobSchema.nullable(),
  })
  .strict();
export const RepositoryReindexRequestSchema = z
  .object({ reason: z.enum(["manual", "stale", "failure_retry"]).default("manual") })
  .strict();
export const RepositoryReindexResponseSchema = z
  .object({ repository: RepositorySchema, job: RepositoryIndexJobSchema })
  .strict();
export const RepositoryFilesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
    extension: z.string().max(32).optional(),
    language: z.string().max(80).optional(),
    classification: RepositoryFileClassificationSchema.optional(),
    directory: z.string().max(1_024).optional(),
  })
  .strict();
export const RepositoryFilesResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    files: z.array(FileInventoryRecordSchema).max(500),
    total: z.number().int().nonnegative(),
  })
  .strict();
export const RepositoryTreeResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    nodes: z.array(DirectoryNodeSchema).max(1_000),
  })
  .strict();
export const RepositorySearchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export const RepositorySearchResultSchema = z
  .object({
    type: z.enum(["file", "directory", "technology"]),
    relativePath: z.string().max(1_024).optional(),
    label: z.string().min(1).max(255),
    score: z.number().int().nonnegative().max(1_000),
    metadata: z.record(z.string().max(80), z.json()).optional(),
  })
  .strict();
export const RepositorySearchResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    query: z.string().max(200),
    results: z.array(RepositorySearchResultSchema).max(100),
  })
  .strict();

export const SemanticSymbolKindSchema = z.enum([
  "class",
  "interface",
  "enum",
  "type",
  "method",
  "function",
  "variable",
  "constant",
  "property",
  "component",
  "hook",
]);

export const SemanticReferenceKindSchema = z.enum([
  "call",
  "property_access",
  "type_reference",
  "jsx_usage",
]);

export const ArchitectureNodeKindSchema = z.enum([
  "frontend",
  "backend",
  "shared",
  "database",
  "configuration",
  "infrastructure",
  "api_layer",
  "service",
  "controller",
  "route",
  "model",
  "component",
  "hook",
  "utility",
  "middleware",
  "test",
  "script",
  "module",
]);

const SemanticLocationSchema = z
  .object({
    relativePath: RelativeRepositoryPathSchema,
    line: z.number().int().positive().max(1_000_000),
    column: z.number().int().positive().max(1_000),
  })
  .strict();

export const SemanticSymbolRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    repositoryId: z.string().uuid(),
    generation: z.number().int().positive(),
    workspaceId: RegistryIdSchema,
    symbolId: z.string().length(64),
    name: z.string().min(1).max(255),
    kind: SemanticSymbolKindSchema,
    parentSymbolId: z.string().length(64).nullable(),
    language: z.enum(["TypeScript", "JavaScript"]),
    relativePath: RelativeRepositoryPathSchema,
    line: z.number().int().positive().max(1_000_000),
    column: z.number().int().positive().max(1_000),
    visibility: z.enum(["public", "private", "protected", "internal", "unknown"]),
    exported: z.boolean(),
    metadata: z.record(z.string().max(80), z.json()).optional(),
  })
  .strict();

export const SemanticImportRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    repositoryId: z.string().uuid(),
    generation: z.number().int().positive(),
    workspaceId: RegistryIdSchema,
    sourceFile: RelativeRepositoryPathSchema,
    importedModule: z.string().min(1).max(512),
    importedNames: z.array(z.string().min(1).max(255)).max(200),
    isTypeOnly: z.boolean(),
    line: z.number().int().positive().max(1_000_000),
    column: z.number().int().positive().max(1_000),
  })
  .strict();

export const SemanticExportRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    repositoryId: z.string().uuid(),
    generation: z.number().int().positive(),
    workspaceId: RegistryIdSchema,
    sourceFile: RelativeRepositoryPathSchema,
    exportedName: z.string().min(1).max(255),
    localName: z.string().min(1).max(255).nullable(),
    line: z.number().int().positive().max(1_000_000),
    column: z.number().int().positive().max(1_000),
  })
  .strict();

export const SemanticDependencyRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    repositoryId: z.string().uuid(),
    generation: z.number().int().positive(),
    workspaceId: RegistryIdSchema,
    sourceFile: RelativeRepositoryPathSchema,
    targetModule: z.string().min(1).max(512),
    targetFile: RelativeRepositoryPathSchema.nullable(),
    dependencyKind: z.enum(["internal", "external", "unknown"]),
  })
  .strict();

export const SemanticReferenceRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    repositoryId: z.string().uuid(),
    generation: z.number().int().positive(),
    workspaceId: RegistryIdSchema,
    referenceId: z.string().length(64),
    name: z.string().min(1).max(255),
    kind: SemanticReferenceKindSchema,
    sourceSymbolId: z.string().length(64).nullable(),
    targetSymbolId: z.string().length(64).nullable(),
    location: SemanticLocationSchema,
  })
  .strict();

export const SemanticRelationRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    repositoryId: z.string().uuid(),
    generation: z.number().int().positive(),
    workspaceId: RegistryIdSchema,
    sourceSymbolId: z.string().length(64),
    targetName: z.string().min(1).max(255),
    targetSymbolId: z.string().length(64).nullable(),
    relationKind: z.enum(["extends", "implements", "calls", "owns", "overrides"]),
  })
  .strict();

export const ApiRouteRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    repositoryId: z.string().uuid(),
    generation: z.number().int().positive(),
    workspaceId: RegistryIdSchema,
    relativePath: RelativeRepositoryPathSchema,
    httpMethod: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]),
    routePath: z.string().min(1).max(512),
    handlerName: z.string().max(255).nullable(),
    authRequired: z.boolean(),
    line: z.number().int().positive().max(1_000_000),
    column: z.number().int().positive().max(1_000),
  })
  .strict();

export const DatabaseModelRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    repositoryId: z.string().uuid(),
    generation: z.number().int().positive(),
    workspaceId: RegistryIdSchema,
    relativePath: RelativeRepositoryPathSchema,
    modelName: z.string().min(1).max(255),
    modelKind: z.enum([
      "sql_table",
      "prisma_model",
      "drizzle_table",
      "mongoose_model",
      "unknown",
    ]),
    fields: z.array(z.string().min(1).max(255)).max(500),
    relationships: z.array(z.string().min(1).max(255)).max(500),
    line: z.number().int().positive().max(1_000_000),
    column: z.number().int().positive().max(1_000),
  })
  .strict();

export const ArchitectureNodeSchema = z
  .object({
    schemaVersion: z.literal("1"),
    repositoryId: z.string().uuid(),
    generation: z.number().int().positive(),
    workspaceId: RegistryIdSchema,
    nodeId: z.string().length(64),
    kind: ArchitectureNodeKindSchema,
    label: z.string().min(1).max(255),
    relativePath: z.string().max(1_024).nullable(),
    metadata: z.record(z.string().max(80), z.json()).optional(),
  })
  .strict();

export const ArchitectureEdgeSchema = z
  .object({
    schemaVersion: z.literal("1"),
    repositoryId: z.string().uuid(),
    generation: z.number().int().positive(),
    workspaceId: RegistryIdSchema,
    sourceNodeId: z.string().length(64),
    targetNodeId: z.string().length(64),
    relation: z.enum(["contains", "depends_on", "calls", "renders", "exposes"]),
  })
  .strict();

export const RepositoryInsightSchema = z
  .object({
    schemaVersion: z.literal("1"),
    repositoryId: z.string().uuid(),
    generation: z.number().int().positive(),
    workspaceId: RegistryIdSchema,
    insightType: z.enum([
      "most_imported_modules",
      "circular_dependencies",
      "architecture_hotspots",
      "large_components",
      "dead_code_candidates",
      "shared_utilities",
    ]),
    title: z.string().min(1).max(255),
    severity: z.enum(["info", "warning"]),
    data: z.record(z.string().max(80), z.json()),
  })
  .strict();

export const RepositorySemanticIndexSchema = z
  .object({
    symbols: z
      .array(SemanticSymbolRecordSchema.omit({ repositoryId: true, generation: true }))
      .max(50_000),
    imports: z
      .array(SemanticImportRecordSchema.omit({ repositoryId: true, generation: true }))
      .max(50_000),
    exports: z
      .array(SemanticExportRecordSchema.omit({ repositoryId: true, generation: true }))
      .max(50_000),
    dependencies: z
      .array(
        SemanticDependencyRecordSchema.omit({ repositoryId: true, generation: true }),
      )
      .max(50_000),
    references: z
      .array(
        SemanticReferenceRecordSchema.omit({ repositoryId: true, generation: true }),
      )
      .max(100_000),
    relations: z
      .array(
        SemanticRelationRecordSchema.omit({ repositoryId: true, generation: true }),
      )
      .max(100_000),
    apiRoutes: z
      .array(ApiRouteRecordSchema.omit({ repositoryId: true, generation: true }))
      .max(10_000),
    databaseModels: z
      .array(DatabaseModelRecordSchema.omit({ repositoryId: true, generation: true }))
      .max(10_000),
    architectureNodes: z
      .array(ArchitectureNodeSchema.omit({ repositoryId: true, generation: true }))
      .max(50_000),
    architectureEdges: z
      .array(ArchitectureEdgeSchema.omit({ repositoryId: true, generation: true }))
      .max(100_000),
    insights: z
      .array(RepositoryInsightSchema.omit({ repositoryId: true, generation: true }))
      .max(1_000),
  })
  .strict();

export const RepositoryScanResultSchema = z
  .object({
    schemaVersion: z.literal("1"),
    workspaceId: RegistryIdSchema,
    rootFingerprint: z.string().length(64),
    scannedAt: z.iso.datetime(),
    ignoreVersion: z.literal("phase-4.1-default-v1"),
    files: z
      .array(FileInventoryRecordSchema.omit({ repositoryId: true, generation: true }))
      .max(20_000),
    directories: z
      .array(DirectoryNodeSchema.omit({ repositoryId: true, generation: true }))
      .max(20_000),
    statistics: RepositoryStatisticsSchema,
    technologySummary: RepositoryTechnologySummarySchema,
    semanticIndex: RepositorySemanticIndexSchema,
    truncated: z.boolean(),
  })
  .strict();

export const SemanticSearchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200),
    kind: SemanticSymbolKindSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const SemanticSearchResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    query: z.string().max(200),
    symbols: z.array(SemanticSymbolRecordSchema).max(100),
  })
  .strict();

export const SemanticSymbolQuerySchema = z
  .object({
    symbolId: z.string().length(64).optional(),
    name: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.symbolId || value.name), {
    message: "A symbol ID or name is required.",
  });

export const SemanticDefinitionResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    symbol: SemanticSymbolRecordSchema.nullable(),
  })
  .strict();

export const SemanticReferencesResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    symbol: SemanticSymbolRecordSchema.nullable(),
    references: z.array(SemanticReferenceRecordSchema).max(500),
  })
  .strict();

export const DependencyGraphResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    dependencies: z.array(SemanticDependencyRecordSchema).max(5_000),
    cycles: z.array(z.array(RelativeRepositoryPathSchema).max(50)).max(100),
    entryPoints: z.array(RelativeRepositoryPathSchema).max(500),
    leafNodes: z.array(RelativeRepositoryPathSchema).max(1_000),
  })
  .strict();

export const ArchitectureGraphResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    nodes: z.array(ArchitectureNodeSchema).max(5_000),
    edges: z.array(ArchitectureEdgeSchema).max(10_000),
  })
  .strict();

export const ApiDiscoveryResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    routes: z.array(ApiRouteRecordSchema).max(2_000),
  })
  .strict();

export const DatabaseDiscoveryResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    models: z.array(DatabaseModelRecordSchema).max(2_000),
  })
  .strict();

export const RepositoryInsightsResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    insights: z.array(RepositoryInsightSchema).max(1_000),
  })
  .strict();

export const RepositoryEngineeringQuestionSchema = z
  .object({
    question: z.string().trim().min(1).max(1_000),
    scope: z
      .enum([
        "repository",
        "architecture",
        "module",
        "file",
        "symbol",
        "api",
        "database",
        "component",
        "workflow",
        "bug",
      ])
      .default("repository"),
    target: z.string().trim().min(1).max(255).optional(),
    remember: z.coerce.boolean().default(true),
  })
  .strict();

export const RepositoryImplementationPlanRequestSchema = z
  .object({
    goal: z.string().trim().min(1).max(1_000),
    target: z.string().trim().min(1).max(255).optional(),
    remember: z.coerce.boolean().default(true),
  })
  .strict();

export const RepositoryImpactAnalysisRequestSchema = z
  .object({
    change: z.string().trim().min(1).max(1_000),
    target: z.string().trim().min(1).max(255).optional(),
    remember: z.coerce.boolean().default(true),
  })
  .strict();

export const RepositoryCodeReviewRequestSchema = z
  .object({
    focus: z
      .enum(["architecture", "security", "performance", "maintainability", "all"])
      .default("all"),
    target: z.string().trim().min(1).max(255).optional(),
    remember: z.coerce.boolean().default(true),
  })
  .strict();

export const RepositoryDocumentationRequestSchema = z
  .object({
    docType: z
      .enum([
        "architecture_overview",
        "module_documentation",
        "api_documentation",
        "dependency_summary",
        "component_summary",
        "database_summary",
        "service_summary",
      ])
      .default("architecture_overview"),
    target: z.string().trim().min(1).max(255).optional(),
    remember: z.coerce.boolean().default(true),
  })
  .strict();

export const RepositoryEvidenceSchema = z
  .object({
    kind: z.enum([
      "file",
      "symbol",
      "reference",
      "dependency",
      "architecture_node",
      "api_route",
      "database_model",
      "insight",
      "generation",
    ]),
    label: z.string().min(1).max(255),
    relativePath: z.string().max(1_024).nullable(),
    line: z.number().int().positive().max(1_000_000).nullable(),
    detail: z.string().max(500),
  })
  .strict();

export const RepositoryReasoningMemorySchema = z
  .object({
    currentRepositoryId: z.string().uuid().nullable(),
    currentModule: z.string().max(255).nullable(),
    activeSymbols: z.array(z.string().max(255)).max(20),
    currentInvestigation: z.string().max(1_000).nullable(),
    openQuestions: z.array(z.string().max(255)).max(20),
    recentlyViewedFiles: z.array(z.string().max(1_024)).max(20),
    currentArchitectureContext: z.string().max(1_000).nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const RepositoryContextBundleSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    query: z.string().max(1_000),
    symbols: z.array(SemanticSymbolRecordSchema).max(50),
    files: z.array(FileInventoryRecordSchema).max(50),
    dependencies: z.array(SemanticDependencyRecordSchema).max(200),
    references: z.array(SemanticReferenceRecordSchema).max(200),
    architectureNodes: z.array(ArchitectureNodeSchema).max(100),
    apiRoutes: z.array(ApiRouteRecordSchema).max(100),
    databaseModels: z.array(DatabaseModelRecordSchema).max(100),
    insights: z.array(RepositoryInsightSchema).max(100),
    evidence: z.array(RepositoryEvidenceSchema).max(200),
    truncated: z.boolean(),
  })
  .strict();

export const RepositoryReasoningResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    question: z.string().max(1_000),
    answer: z.string().max(8_000),
    findings: z.array(z.string().max(1_000)).max(50),
    evidence: z.array(RepositoryEvidenceSchema).max(200),
    confidence: z.number().min(0).max(1),
    insufficientEvidence: z.boolean(),
    memory: RepositoryReasoningMemorySchema,
  })
  .strict();

export const RepositoryImpactAnalysisResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    change: z.string().max(1_000),
    riskLevel: z.enum(["low", "medium", "high", "unknown"]),
    affectedFiles: z.array(RelativeRepositoryPathSchema).max(200),
    affectedSymbols: z.array(SemanticSymbolRecordSchema).max(100),
    apiImpact: z.array(ApiRouteRecordSchema).max(100),
    databaseImpact: z.array(DatabaseModelRecordSchema).max(100),
    frontendImpact: z.array(ArchitectureNodeSchema).max(100),
    testingImpact: z.array(RelativeRepositoryPathSchema).max(200),
    migrationRequirements: z.array(z.string().max(1_000)).max(20),
    evidence: z.array(RepositoryEvidenceSchema).max(200),
    confidence: z.number().min(0).max(1),
    memory: RepositoryReasoningMemorySchema,
  })
  .strict();

export const RepositoryImplementationPlanResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    goal: z.string().max(1_000),
    affectedFiles: z.array(RelativeRepositoryPathSchema).max(200),
    implementationOrder: z.array(z.string().max(1_000)).max(30),
    riskAssessment: z.string().max(2_000),
    migrationStrategy: z.string().max(2_000),
    testingStrategy: z.string().max(2_000),
    rollbackStrategy: z.string().max(2_000),
    evidence: z.array(RepositoryEvidenceSchema).max(200),
    confidence: z.number().min(0).max(1),
    memory: RepositoryReasoningMemorySchema,
  })
  .strict();

export const RepositoryCodeReviewFindingSchema = z
  .object({
    category: z.enum([
      "duplicated_logic",
      "large_function",
      "unused_symbol",
      "dead_code",
      "circular_dependency",
      "naming",
      "layer_violation",
      "architecture_smell",
      "security",
      "performance",
    ]),
    severity: z.enum(["info", "warning", "high"]),
    title: z.string().min(1).max(255),
    detail: z.string().max(1_000),
    relativePath: z.string().max(1_024).nullable(),
    evidence: z.array(RepositoryEvidenceSchema).max(20),
  })
  .strict();

export const RepositoryCodeReviewResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    findings: z.array(RepositoryCodeReviewFindingSchema).max(100),
    summary: z.string().max(4_000),
    confidence: z.number().min(0).max(1),
    memory: RepositoryReasoningMemorySchema,
  })
  .strict();

export const RepositoryDocumentationResponseSchema = z
  .object({
    repository: RepositorySchema,
    generation: z.number().int().positive().nullable(),
    title: z.string().min(1).max(255),
    body: z.string().max(10_000),
    evidence: z.array(RepositoryEvidenceSchema).max(200),
    confidence: z.number().min(0).max(1),
    memory: RepositoryReasoningMemorySchema,
  })
  .strict();

export type Repository = z.infer<typeof RepositorySchema>;
export type RepositoryGeneration = z.infer<typeof RepositoryGenerationSchema>;
export type RepositoryIndexJob = z.infer<typeof RepositoryIndexJobSchema>;
export type RepositoryScanResult = z.infer<typeof RepositoryScanResultSchema>;
export type FileInventoryRecord = z.infer<typeof FileInventoryRecordSchema>;
export type DirectoryNode = z.infer<typeof DirectoryNodeSchema>;
export type SemanticSymbolRecord = z.infer<typeof SemanticSymbolRecordSchema>;
export type SemanticImportRecord = z.infer<typeof SemanticImportRecordSchema>;
export type SemanticExportRecord = z.infer<typeof SemanticExportRecordSchema>;
export type SemanticDependencyRecord = z.infer<typeof SemanticDependencyRecordSchema>;
export type SemanticReferenceRecord = z.infer<typeof SemanticReferenceRecordSchema>;
export type SemanticRelationRecord = z.infer<typeof SemanticRelationRecordSchema>;
export type ApiRouteRecord = z.infer<typeof ApiRouteRecordSchema>;
export type DatabaseModelRecord = z.infer<typeof DatabaseModelRecordSchema>;
export type ArchitectureNode = z.infer<typeof ArchitectureNodeSchema>;
export type ArchitectureEdge = z.infer<typeof ArchitectureEdgeSchema>;
export type RepositoryInsight = z.infer<typeof RepositoryInsightSchema>;
export type RepositoryEvidence = z.infer<typeof RepositoryEvidenceSchema>;
export type RepositoryReasoningMemory = z.infer<typeof RepositoryReasoningMemorySchema>;
export type RepositoryContextBundle = z.infer<typeof RepositoryContextBundleSchema>;

import {
  ApiDiscoveryResponseSchema,
  ArchitectureGraphResponseSchema,
  DatabaseDiscoveryResponseSchema,
  DependencyGraphResponseSchema,
  RepositoryDetailResponseSchema,
  RepositoryFilesQuerySchema,
  RepositoryFilesResponseSchema,
  RepositoryInsightsResponseSchema,
  RepositoryCodeReviewRequestSchema,
  RepositoryCodeReviewResponseSchema,
  RepositoryContextBundleSchema,
  RepositoryDocumentationRequestSchema,
  RepositoryDocumentationResponseSchema,
  RepositoryEngineeringQuestionSchema,
  RepositoryImpactAnalysisRequestSchema,
  RepositoryImpactAnalysisResponseSchema,
  RepositoryImplementationPlanRequestSchema,
  RepositoryImplementationPlanResponseSchema,
  RepositoryReasoningMemorySchema,
  RepositoryReasoningResponseSchema,
  RepositoryReindexResponseSchema,
  RepositoryScanResultSchema,
  RepositorySchema,
  RepositorySearchQuerySchema,
  RepositorySearchResponseSchema,
  RepositoryTreeResponseSchema,
  SemanticDefinitionResponseSchema,
  SemanticReferencesResponseSchema,
  SemanticSearchQuerySchema,
  SemanticSearchResponseSchema,
  SemanticSymbolQuerySchema,
  type NetworkVerificationState,
  type Repository,
  type RepositoryContextBundle,
  type RepositoryEvidence,
  type RepositoryIndexJob,
  type RepositoryReasoningMemory,
  type SemanticSymbolRecord,
  type SemanticDependencyRecord,
} from "@alexa-control/shared";
import { createHash } from "node:crypto";

import { ExecutionError } from "../execution/errors.js";
import type { ExecutionService } from "../execution/service.js";
import type { RegistryService } from "../governance/registry-service.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { RepositoryStore } from "./store.js";

const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const dependencyCycles = (dependencies: SemanticDependencyRecord[]) => {
  const graph = new Map<string, Set<string>>();
  for (const dependency of dependencies) {
    if (!dependency.targetFile) continue;
    if (!graph.has(dependency.sourceFile)) graph.set(dependency.sourceFile, new Set());
    graph.get(dependency.sourceFile)!.add(dependency.targetFile);
  }
  const cycles: string[][] = [];
  const keys = new Set<string>();
  const visit = (node: string, stack: string[]) => {
    if (cycles.length >= 100) return;
    const existing = stack.indexOf(node);
    if (existing >= 0) {
      const cycle = stack.slice(existing);
      const key = [...cycle].sort().join("\u0000");
      if (!keys.has(key)) {
        keys.add(key);
        cycles.push(cycle.slice(0, 50));
      }
      return;
    }
    if (stack.length > 50) return;
    for (const target of graph.get(node) ?? []) visit(target, [...stack, node]);
  };
  for (const source of graph.keys()) visit(source, []);
  return cycles;
};

const tokenize = (value: string) =>
  [...new Set(value.toLowerCase().match(/[a-z0-9_.$/-]+/g) ?? [])].filter(
    (token) => token.length > 1,
  );

const evidenceKey = (evidence: RepositoryEvidence) =>
  [
    evidence.kind,
    evidence.label,
    evidence.relativePath ?? "",
    evidence.line ?? "",
    evidence.detail,
  ].join("\u0000");

const uniqueEvidence = (evidence: RepositoryEvidence[]) => {
  const seen = new Set<string>();
  return evidence.filter((entry) => {
    const key = evidenceKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const fileEvidence = (relativePath: string, detail: string): RepositoryEvidence => ({
  kind: "file",
  label: relativePath,
  relativePath,
  line: null,
  detail,
});

const symbolEvidence = (symbol: SemanticSymbolRecord): RepositoryEvidence => ({
  kind: "symbol",
  label: `${symbol.kind} ${symbol.name}`,
  relativePath: symbol.relativePath,
  line: symbol.line,
  detail: `${symbol.name} is a ${symbol.kind} in ${symbol.relativePath}:${symbol.line}.`,
});

const boundedList = (values: string[], limit = 12) =>
  values.length <= limit
    ? values.join(", ")
    : `${values.slice(0, limit).join(", ")} and ${values.length - limit} more`;

export class RepositoryService {
  readonly #reasoningMemory = new Map<string, RepositoryReasoningMemory>();

  constructor(
    readonly store: RepositoryStore,
    readonly registry: RegistryService,
    readonly executions: ExecutionService,
    readonly audit: GovernanceAuditWriter,
    readonly now = () => new Date(),
  ) {}

  async ensureRepository(ownerId: string, workspaceId: string) {
    const existing = await this.store.findRepositoryByWorkspace(ownerId, workspaceId);
    if (existing) return existing;
    const at = this.now().toISOString();
    return this.store.upsertRepository(
      RepositorySchema.parse({
        schemaVersion: "1",
        id: crypto.randomUUID(),
        ownerId,
        workspaceId,
        indexStatus: "UNINDEXED",
        activeGeneration: null,
        activeFingerprint: null,
        lastIndexedAt: null,
        lastFailureCode: null,
        createdAt: at,
        updatedAt: at,
      }),
    );
  }

  async list(ownerId: string) {
    const workspaces = await this.registry.listWorkspaces(ownerId);
    for (const workspace of workspaces) {
      await this.ensureRepository(ownerId, workspace.id);
    }
    return this.store.listRepositories(ownerId);
  }

  async get(ownerId: string, repositoryId: string) {
    const repository = await this.authorize(ownerId, repositoryId);
    return RepositoryDetailResponseSchema.parse({
      repository,
      activeGeneration: (await this.store.activeGeneration(repository.id)) ?? null,
      latestJob: (await this.store.latestJob(repository.id)) ?? null,
    });
  }

  async reindex(input: {
    ownerId: string;
    sessionId: string;
    repositoryId: string;
    reason: RepositoryIndexJob["reason"];
    networkState: NetworkVerificationState;
    ipAddress: string;
    requestId: string;
  }) {
    const repository = await this.authorize(input.ownerId, input.repositoryId);
    const active = await this.store.findActiveJob(repository.id);
    if (active)
      throw new ExecutionError(
        409,
        "REPOSITORY_INDEX_ALREADY_RUNNING",
        "A repository index job is already active.",
      );
    const at = this.now().toISOString();
    const job = await this.store.createJob({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      repositoryId: repository.id,
      ownerId: input.ownerId,
      workspaceId: repository.workspaceId,
      status: "QUEUED",
      reason: input.reason,
      executionRequestId: null,
      createdAt: at,
      startedAt: null,
      completedAt: null,
      failureCode: null,
    });
    const execution = await this.executions.create({
      ownerId: input.ownerId,
      sessionId: input.sessionId,
      request: {
        toolName: "repository.scan_metadata",
        arguments: { workspaceId: repository.workspaceId },
      },
      networkState: input.networkState,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
    });
    const runningJob = {
      ...job,
      status: "RUNNING" as const,
      executionRequestId: execution.id,
      startedAt: at,
    };
    await this.store.updateJob(runningJob);
    const nextRepository = {
      ...repository,
      indexStatus: "INDEXING" as const,
      updatedAt: at,
    };
    await this.store.updateRepository(nextRepository);
    await this.audit({
      eventType: "REPOSITORY_INDEX_REQUESTED",
      ownerId: input.ownerId,
      deviceId: execution.deviceId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Repository metadata indexing requested through read-only execution.",
      requestId: input.requestId,
      metadata: {
        repositoryId: repository.id,
        workspaceId: repository.workspaceId,
        executionRequestId: execution.id,
      },
    });
    return RepositoryReindexResponseSchema.parse({
      repository: nextRepository,
      job: runningJob,
    });
  }

  async publishExecutionResult(input: {
    ownerId: string;
    executionRequestId: string;
    result: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const job = await this.store.findJobByExecutionRequestId(input.executionRequestId);
    if (!job || job.ownerId !== input.ownerId) return;
    const repository = await this.store.findRepository(job.repositoryId);
    if (!repository) return;
    const scan = RepositoryScanResultSchema.parse(input.result);
    const at = this.now().toISOString();
    const activeGeneration = await this.store.activeGeneration(repository.id);
    const nextGeneration = (activeGeneration?.generation ?? 0) + 1;
    const generationFingerprint = fingerprint({
      repositoryId: repository.id,
      workspaceId: repository.workspaceId,
      generation: nextGeneration,
      rootFingerprint: scan.rootFingerprint,
      ignoreVersion: scan.ignoreVersion,
    });
    const files = scan.files.map((file) => ({
      ...file,
      repositoryId: repository.id,
      generation: nextGeneration,
    }));
    const directories = scan.directories.map((node) => ({
      ...node,
      repositoryId: repository.id,
      generation: nextGeneration,
    }));
    const addSemanticScope = <T extends object>(record: T) => ({
      ...record,
      repositoryId: repository.id,
      generation: nextGeneration,
    });
    const semanticIndex = {
      symbols: scan.semanticIndex.symbols.map(addSemanticScope),
      imports: scan.semanticIndex.imports.map(addSemanticScope),
      exports: scan.semanticIndex.exports.map(addSemanticScope),
      dependencies: scan.semanticIndex.dependencies.map(addSemanticScope),
      references: scan.semanticIndex.references.map(addSemanticScope),
      relations: scan.semanticIndex.relations.map(addSemanticScope),
      apiRoutes: scan.semanticIndex.apiRoutes.map(addSemanticScope),
      databaseModels: scan.semanticIndex.databaseModels.map(addSemanticScope),
      architectureNodes: scan.semanticIndex.architectureNodes.map(addSemanticScope),
      architectureEdges: scan.semanticIndex.architectureEdges.map(addSemanticScope),
      insights: scan.semanticIndex.insights.map(addSemanticScope),
    };
    const nextRepository: Repository = {
      ...repository,
      indexStatus: scan.truncated ? "REINDEX_REQUIRED" : "INDEXED",
      activeGeneration: nextGeneration,
      activeFingerprint: generationFingerprint,
      lastIndexedAt: at,
      lastFailureCode: scan.truncated ? "REPOSITORY_SCAN_TRUNCATED" : null,
      updatedAt: at,
    };
    await this.store.publishGeneration({
      repository: nextRepository,
      generation: {
        schemaVersion: "1",
        id: crypto.randomUUID(),
        repositoryId: repository.id,
        ownerId: input.ownerId,
        workspaceId: repository.workspaceId,
        generation: nextGeneration,
        fingerprint: generationFingerprint,
        executionRequestId: input.executionRequestId,
        indexedAt: at,
        scannedAt: scan.scannedAt,
        ignoreVersion: scan.ignoreVersion,
        statistics: scan.statistics,
        technologySummary: scan.technologySummary,
      },
      files,
      directories,
      semanticIndex,
    });
    await this.store.updateJob({
      ...job,
      status: scan.truncated ? "FAILED" : "SUCCEEDED",
      completedAt: at,
      failureCode: scan.truncated ? "REPOSITORY_SCAN_TRUNCATED" : null,
    });
    await this.audit({
      eventType: scan.truncated ? "REPOSITORY_INDEX_FAILED" : "REPOSITORY_INDEXED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: scan.truncated ? "FAILURE" : "SUCCESS",
      reason: scan.truncated
        ? "Repository scan was truncated and requires re-indexing."
        : "Repository metadata index published.",
      requestId: input.requestId,
      metadata: {
        repositoryId: repository.id,
        workspaceId: repository.workspaceId,
        generation: nextGeneration,
        fileCount: scan.statistics.fileCount,
      },
    });
  }

  async failExecutionResult(input: {
    ownerId: string;
    executionRequestId: string;
    failureCode: string;
    requestId: string;
    ipAddress: string;
  }) {
    const job = await this.store.findJobByExecutionRequestId(input.executionRequestId);
    if (!job || job.ownerId !== input.ownerId) return;
    const repository = await this.store.findRepository(job.repositoryId);
    if (!repository) return;
    const at = this.now().toISOString();
    await this.store.updateJob({
      ...job,
      status: "FAILED",
      completedAt: at,
      failureCode: input.failureCode,
    });
    await this.store.updateRepository({
      ...repository,
      indexStatus: repository.activeGeneration ? "REINDEX_REQUIRED" : "FAILED",
      lastFailureCode: input.failureCode,
      updatedAt: at,
    });
    await this.audit({
      eventType: "REPOSITORY_INDEX_FAILED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "FAILURE",
      reason: "Repository metadata indexing failed.",
      requestId: input.requestId,
      metadata: {
        repositoryId: repository.id,
        workspaceId: repository.workspaceId,
        executionRequestId: input.executionRequestId,
        failureCode: input.failureCode,
      },
    });
  }

  async files(ownerId: string, repositoryId: string, query: unknown) {
    const repository = await this.authorize(ownerId, repositoryId);
    const parsed = RepositoryFilesQuerySchema.parse(query);
    const generation = repository.activeGeneration;
    const result = generation
      ? await this.store.listFiles({
          repositoryId,
          generation,
          limit: parsed.limit,
          offset: parsed.offset,
          ...(parsed.extension ? { extension: parsed.extension } : {}),
          ...(parsed.language ? { language: parsed.language } : {}),
          ...(parsed.classification ? { classification: parsed.classification } : {}),
          ...(parsed.directory ? { directory: parsed.directory } : {}),
        })
      : { files: [], total: 0 };
    return RepositoryFilesResponseSchema.parse({
      repository,
      generation,
      files: result.files,
      total: result.total,
    });
  }

  async tree(ownerId: string, repositoryId: string) {
    const repository = await this.authorize(ownerId, repositoryId);
    const generation = repository.activeGeneration;
    return RepositoryTreeResponseSchema.parse({
      repository,
      generation,
      nodes: generation
        ? await this.store.listDirectories(repositoryId, generation, 1_000)
        : [],
    });
  }

  async search(ownerId: string, repositoryId: string, query: unknown) {
    const repository = await this.authorize(ownerId, repositoryId);
    const parsed = RepositorySearchQuerySchema.parse(query);
    const generation = repository.activeGeneration;
    const files = generation
      ? (
          await this.store.listFiles({
            repositoryId,
            generation,
            limit: 500,
            offset: 0,
          })
        ).files
      : [];
    const needle = parsed.q.toLowerCase();
    const results = files
      .map((file) => {
        const path = file.relativePath.toLowerCase();
        const label = file.fileName.toLowerCase();
        const score =
          label === needle
            ? 1000
            : path.startsWith(needle)
              ? 800
              : path.includes(needle)
                ? 400
                : 0;
        return { file, score };
      })
      .filter((entry) => entry.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.file.relativePath.localeCompare(right.file.relativePath),
      )
      .slice(0, parsed.limit)
      .map((entry) => ({
        type: "file" as const,
        relativePath: entry.file.relativePath,
        label: entry.file.fileName,
        score: entry.score,
        metadata: {
          language: entry.file.language,
          classification: entry.file.classification,
          sizeBytes: entry.file.sizeBytes,
        },
      }));
    return RepositorySearchResponseSchema.parse({
      repository,
      generation,
      query: parsed.q,
      results,
    });
  }

  async statistics(ownerId: string, repositoryId: string) {
    const detail = await this.get(ownerId, repositoryId);
    return detail.activeGeneration?.statistics ?? null;
  }

  async semanticSearch(ownerId: string, repositoryId: string, query: unknown) {
    const repository = await this.authorize(ownerId, repositoryId);
    const parsed = SemanticSearchQuerySchema.parse(query);
    const generation = repository.activeGeneration;
    const symbols = generation
      ? await this.store.listSymbols({
          repositoryId,
          generation,
          query: parsed.q,
          ...(parsed.kind ? { kind: parsed.kind } : {}),
          limit: parsed.limit,
        })
      : [];
    const needle = parsed.q.toLowerCase();
    const ranked = symbols
      .map((symbol) => ({
        symbol,
        score:
          symbol.name.toLowerCase() === needle
            ? 1000
            : symbol.name.toLowerCase().startsWith(needle)
              ? 800
              : symbol.name.toLowerCase().includes(needle)
                ? 500
                : 100,
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.symbol.relativePath.localeCompare(right.symbol.relativePath),
      )
      .map((entry) => entry.symbol);
    return SemanticSearchResponseSchema.parse({
      repository,
      generation,
      query: parsed.q,
      symbols: ranked,
    });
  }

  async definition(ownerId: string, repositoryId: string, query: unknown) {
    const repository = await this.authorize(ownerId, repositoryId);
    const parsed = SemanticSymbolQuerySchema.parse(query);
    const generation = repository.activeGeneration;
    const symbol = generation
      ? await this.store.findSymbol({
          repositoryId,
          generation,
          ...(parsed.symbolId ? { symbolId: parsed.symbolId } : {}),
          ...(parsed.name ? { name: parsed.name } : {}),
        })
      : undefined;
    return SemanticDefinitionResponseSchema.parse({
      repository,
      generation,
      symbol: symbol ?? null,
    });
  }

  async references(ownerId: string, repositoryId: string, query: unknown) {
    const repository = await this.authorize(ownerId, repositoryId);
    const parsed = SemanticSymbolQuerySchema.parse(query);
    const generation = repository.activeGeneration;
    const symbol = generation
      ? await this.store.findSymbol({
          repositoryId,
          generation,
          ...(parsed.symbolId ? { symbolId: parsed.symbolId } : {}),
          ...(parsed.name ? { name: parsed.name } : {}),
        })
      : undefined;
    const references = generation
      ? await this.store.listReferences({
          repositoryId,
          generation,
          ...(symbol?.symbolId ? { symbolId: symbol.symbolId } : {}),
          ...(parsed.name
            ? { name: parsed.name }
            : symbol
              ? { name: symbol.name }
              : {}),
          limit: 500,
        })
      : [];
    return SemanticReferencesResponseSchema.parse({
      repository,
      generation,
      symbol: symbol ?? null,
      references,
    });
  }

  async dependencyGraph(ownerId: string, repositoryId: string) {
    const repository = await this.authorize(ownerId, repositoryId);
    const generation = repository.activeGeneration;
    const dependencies = generation
      ? await this.store.listDependencies(repositoryId, generation)
      : [];
    const sources = new Set(dependencies.map((dependency) => dependency.sourceFile));
    const targets = new Set(
      dependencies
        .map((dependency) => dependency.targetFile)
        .filter((targetFile): targetFile is string => Boolean(targetFile)),
    );
    return DependencyGraphResponseSchema.parse({
      repository,
      generation,
      dependencies: dependencies.slice(0, 5_000),
      cycles: dependencyCycles(dependencies),
      entryPoints: [...sources].filter((source) => !targets.has(source)).slice(0, 500),
      leafNodes: [...targets].filter((target) => !sources.has(target)).slice(0, 1_000),
    });
  }

  async architectureGraph(ownerId: string, repositoryId: string) {
    const repository = await this.authorize(ownerId, repositoryId);
    const generation = repository.activeGeneration;
    return ArchitectureGraphResponseSchema.parse({
      repository,
      generation,
      nodes: generation
        ? await this.store.listArchitectureNodes(repositoryId, generation)
        : [],
      edges: generation
        ? await this.store.listArchitectureEdges(repositoryId, generation)
        : [],
    });
  }

  async apiDiscovery(ownerId: string, repositoryId: string) {
    const repository = await this.authorize(ownerId, repositoryId);
    const generation = repository.activeGeneration;
    return ApiDiscoveryResponseSchema.parse({
      repository,
      generation,
      routes: generation
        ? await this.store.listApiRoutes(repositoryId, generation)
        : [],
    });
  }

  async databaseDiscovery(ownerId: string, repositoryId: string) {
    const repository = await this.authorize(ownerId, repositoryId);
    const generation = repository.activeGeneration;
    return DatabaseDiscoveryResponseSchema.parse({
      repository,
      generation,
      models: generation
        ? await this.store.listDatabaseModels(repositoryId, generation)
        : [],
    });
  }

  async insights(ownerId: string, repositoryId: string) {
    const repository = await this.authorize(ownerId, repositoryId);
    const generation = repository.activeGeneration;
    return RepositoryInsightsResponseSchema.parse({
      repository,
      generation,
      insights: generation
        ? await this.store.listInsights(repositoryId, generation)
        : [],
    });
  }

  async engineeringQuestion(input: {
    ownerId: string;
    sessionId: string;
    repositoryId: string;
    body: unknown;
  }) {
    const parsed = RepositoryEngineeringQuestionSchema.parse(input.body);
    const context = await this.buildContext(
      input.ownerId,
      input.repositoryId,
      parsed.target ?? parsed.question,
    );
    const findings = this.reasonFromContext(parsed.question, context);
    const answer =
      findings.length > 0
        ? [
            `Based on repository generation ${context.generation ?? "none"}, here is the evidence-backed explanation.`,
            ...findings.map((finding) => `- ${finding}`),
            context.truncated
              ? "Context was bounded, so this answer may omit lower-ranked repository evidence."
              : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "I do not have enough indexed repository evidence to answer that confidently. Re-index the repository or ask about a specific file, symbol, API route, or module.";
    const memory = this.updateReasoningMemory(input.sessionId, context, {
      currentInvestigation: parsed.remember ? parsed.question : null,
    });
    return RepositoryReasoningResponseSchema.parse({
      repository: context.repository,
      generation: context.generation,
      question: parsed.question,
      answer,
      findings,
      evidence: context.evidence,
      confidence: this.confidenceFor(context),
      insufficientEvidence: findings.length === 0,
      memory,
    });
  }

  async impactAnalysis(input: {
    ownerId: string;
    sessionId: string;
    repositoryId: string;
    body: unknown;
  }) {
    const parsed = RepositoryImpactAnalysisRequestSchema.parse(input.body);
    const context = await this.buildContext(
      input.ownerId,
      input.repositoryId,
      parsed.target ?? parsed.change,
    );
    const affectedFiles = [
      ...new Set([
        ...context.files.map((file) => file.relativePath),
        ...context.symbols.map((symbol) => symbol.relativePath),
        ...context.dependencies
          .flatMap((dependency) => [dependency.sourceFile, dependency.targetFile])
          .filter((value): value is string => Boolean(value)),
      ]),
    ].slice(0, 200);
    const testingImpact = context.files
      .filter((file) => file.classification === "test")
      .map((file) => file.relativePath)
      .slice(0, 200);
    const frontendImpact = context.architectureNodes
      .filter((node) => ["frontend", "component", "hook"].includes(node.kind))
      .slice(0, 100);
    const migrationRequirements =
      context.databaseModels.length > 0
        ? [
            "Database metadata is implicated; review migrations and backward compatibility.",
          ]
        : [];
    const riskLevel =
      context.apiRoutes.length > 0 && context.databaseModels.length > 0
        ? "high"
        : context.apiRoutes.length > 0 ||
            context.databaseModels.length > 0 ||
            affectedFiles.length > 10
          ? "medium"
          : affectedFiles.length > 0
            ? "low"
            : "unknown";
    const memory = this.updateReasoningMemory(input.sessionId, context, {
      currentInvestigation: parsed.remember ? parsed.change : null,
    });
    return RepositoryImpactAnalysisResponseSchema.parse({
      repository: context.repository,
      generation: context.generation,
      change: parsed.change,
      riskLevel,
      affectedFiles,
      affectedSymbols: context.symbols.slice(0, 100),
      apiImpact: context.apiRoutes.slice(0, 100),
      databaseImpact: context.databaseModels.slice(0, 100),
      frontendImpact,
      testingImpact,
      migrationRequirements,
      evidence: context.evidence,
      confidence: this.confidenceFor(context),
      memory,
    });
  }

  async implementationPlan(input: {
    ownerId: string;
    sessionId: string;
    repositoryId: string;
    body: unknown;
  }) {
    const parsed = RepositoryImplementationPlanRequestSchema.parse(input.body);
    const context = await this.buildContext(
      input.ownerId,
      input.repositoryId,
      parsed.target ?? parsed.goal,
    );
    const affectedFiles = [
      ...new Set([
        ...context.symbols.map((symbol) => symbol.relativePath),
        ...context.files.map((file) => file.relativePath),
        ...context.apiRoutes.map((route) => route.relativePath),
        ...context.databaseModels.map((model) => model.relativePath),
      ]),
    ].slice(0, 200);
    const order = [
      "Confirm the indexed generation is current and review the cited evidence.",
      context.apiRoutes.length
        ? `Map API behavior first: ${boundedList(context.apiRoutes.map((route) => `${route.httpMethod} ${route.routePath}`))}.`
        : "Identify the public API or UI entry point that owns the behavior.",
      context.symbols.length
        ? `Inspect owner symbols conceptually: ${boundedList(context.symbols.map((symbol) => symbol.name))}.`
        : "Identify owner symbols before designing changes.",
      context.databaseModels.length
        ? `Plan schema compatibility around models: ${boundedList(context.databaseModels.map((model) => model.modelName))}.`
        : "Verify whether persistent data or migrations are needed.",
      "Design tests around affected services, API routes, UI components, and regression risks.",
      "Keep implementation behind existing policy, audit, CSRF, session, and emergency-stop boundaries.",
    ];
    const memory = this.updateReasoningMemory(input.sessionId, context, {
      currentInvestigation: parsed.remember ? parsed.goal : null,
    });
    return RepositoryImplementationPlanResponseSchema.parse({
      repository: context.repository,
      generation: context.generation,
      goal: parsed.goal,
      affectedFiles,
      implementationOrder: order,
      riskAssessment: `Estimated risk is ${this.confidenceFor(context) < 0.4 ? "unknown because evidence is sparse" : affectedFiles.length > 10 || context.apiRoutes.length || context.databaseModels.length ? "medium/high due to cross-layer impact" : "low/medium based on current indexed evidence"}. No code should be changed by Phase 4.3.`,
      migrationStrategy: context.databaseModels.length
        ? "Create reviewed migrations, preserve backward compatibility, and validate rollback before deployment."
        : "No database model impact was found in the bounded context; still verify before implementation.",
      testingStrategy:
        "Add unit tests for changed services, route/API tests for boundaries, UI tests for affected components, and security regression tests for policy/auth/emergency-stop invariants.",
      rollbackStrategy:
        "Keep changes small and reversible, preserve old behavior behind explicit flags when needed, and verify deployment rollback plus database rollback separately.",
      evidence: context.evidence,
      confidence: this.confidenceFor(context),
      memory,
    });
  }

  async codeReview(input: {
    ownerId: string;
    sessionId: string;
    repositoryId: string;
    body: unknown;
  }) {
    const parsed = RepositoryCodeReviewRequestSchema.parse(input.body);
    const context = await this.buildContext(
      input.ownerId,
      input.repositoryId,
      parsed.target ?? parsed.focus,
    );
    const findings = [];
    for (const insight of context.insights) {
      if (insight.insightType === "circular_dependencies") {
        findings.push({
          category: "circular_dependency",
          severity: insight.severity === "warning" ? "warning" : "info",
          title: insight.title,
          detail: "Repository insight reports circular dependency candidates.",
          relativePath: null,
          evidence: [
            {
              kind: "insight",
              label: insight.title,
              relativePath: null,
              line: null,
              detail: insight.insightType,
            },
          ],
        });
      }
      if (insight.insightType === "dead_code_candidates") {
        findings.push({
          category: "dead_code",
          severity: insight.severity === "warning" ? "warning" : "info",
          title: insight.title,
          detail: "Exported symbols may have no indexed references.",
          relativePath: null,
          evidence: [
            {
              kind: "insight",
              label: insight.title,
              relativePath: null,
              line: null,
              detail: insight.insightType,
            },
          ],
        });
      }
    }
    for (const file of context.files
      .filter((file) => file.sizeBytes > 50_000)
      .slice(0, 10)) {
      findings.push({
        category: "architecture_smell",
        severity: "info",
        title: "Large file candidate",
        detail: `${file.relativePath} is ${file.sizeBytes} bytes in indexed metadata.`,
        relativePath: file.relativePath,
        evidence: [fileEvidence(file.relativePath, `${file.sizeBytes} bytes`)],
      });
    }
    const memory = this.updateReasoningMemory(input.sessionId, context, {
      currentInvestigation: parsed.remember ? `Code review: ${parsed.focus}` : null,
    });
    return RepositoryCodeReviewResponseSchema.parse({
      repository: context.repository,
      generation: context.generation,
      findings,
      summary:
        findings.length > 0
          ? `Found ${findings.length} review finding(s) from indexed metadata. No source contents were inspected or modified.`
          : "No review findings were found in the bounded metadata context. This is not proof the repository has no issues.",
      confidence: this.confidenceFor(context),
      memory,
    });
  }

  async documentation(input: {
    ownerId: string;
    sessionId: string;
    repositoryId: string;
    body: unknown;
  }) {
    const parsed = RepositoryDocumentationRequestSchema.parse(input.body);
    const context = await this.buildContext(
      input.ownerId,
      input.repositoryId,
      parsed.target ?? parsed.docType,
    );
    const body = [
      `# ${parsed.docType.replaceAll("_", " ")}`,
      "",
      `Repository generation: ${context.generation ?? "none"}`,
      "",
      `Technologies: ${boundedList(context.repository.activeGeneration ? [] : []) || "see generation metadata"}`,
      "",
      context.architectureNodes.length
        ? `Architecture nodes include ${boundedList(
            context.architectureNodes.map((node) => `${node.kind}:${node.label}`),
            20,
          )}.`
        : "No architecture nodes were found in the bounded context.",
      context.apiRoutes.length
        ? `API routes include ${boundedList(
            context.apiRoutes.map((route) => `${route.httpMethod} ${route.routePath}`),
            20,
          )}.`
        : "No API routes were found in the bounded context.",
      context.databaseModels.length
        ? `Database models include ${boundedList(
            context.databaseModels.map((model) => model.modelName),
            20,
          )}.`
        : "No database models were found in the bounded context.",
      context.symbols.length
        ? `Important symbols include ${boundedList(
            context.symbols.map((symbol) => `${symbol.kind} ${symbol.name}`),
            25,
          )}.`
        : "No symbols were found in the bounded context.",
      "",
      "This documentation is generated from indexed metadata only and does not include source-code snippets.",
    ].join("\n");
    const memory = this.updateReasoningMemory(input.sessionId, context, {
      currentInvestigation: parsed.remember ? parsed.docType : null,
    });
    return RepositoryDocumentationResponseSchema.parse({
      repository: context.repository,
      generation: context.generation,
      title: parsed.docType.replaceAll("_", " "),
      body,
      evidence: context.evidence,
      confidence: this.confidenceFor(context),
      memory,
    });
  }

  reasoningMemory(sessionId: string) {
    return (
      this.#reasoningMemory.get(sessionId) ??
      RepositoryReasoningMemorySchema.parse({
        currentRepositoryId: null,
        currentModule: null,
        activeSymbols: [],
        currentInvestigation: null,
        openQuestions: [],
        recentlyViewedFiles: [],
        currentArchitectureContext: null,
        updatedAt: this.now().toISOString(),
      })
    );
  }

  private async buildContext(
    ownerId: string,
    repositoryId: string,
    query: string,
  ): Promise<RepositoryContextBundle> {
    const repository = await this.authorize(ownerId, repositoryId);
    const generation = repository.activeGeneration;
    if (!generation) {
      return RepositoryContextBundleSchema.parse({
        repository,
        generation,
        query,
        symbols: [],
        files: [],
        dependencies: [],
        references: [],
        architectureNodes: [],
        apiRoutes: [],
        databaseModels: [],
        insights: [],
        evidence: [],
        truncated: false,
      });
    }
    const tokens = tokenize(query);
    const symbolMatches = (
      await Promise.all(
        tokens.slice(0, 8).map((token) =>
          Promise.resolve(
            this.store.listSymbols({
              repositoryId,
              generation,
              query: token,
              limit: 20,
            }),
          ),
        ),
      )
    ).flat();
    const symbolIds = new Set<string>();
    const symbols = symbolMatches
      .filter((symbol) => {
        if (symbolIds.has(symbol.symbolId)) return false;
        symbolIds.add(symbol.symbolId);
        return true;
      })
      .slice(0, 50);
    const allFiles = (
      await this.store.listFiles({ repositoryId, generation, limit: 500, offset: 0 })
    ).files;
    const files = allFiles
      .filter((file) =>
        tokens.some(
          (token) =>
            file.relativePath.toLowerCase().includes(token) ||
            file.fileName.toLowerCase().includes(token) ||
            file.classification.toLowerCase().includes(token) ||
            file.language.toLowerCase().includes(token),
        ),
      )
      .slice(0, 50);
    const dependencies = await this.store.listDependencies(repositoryId, generation);
    const relevantPaths = new Set([
      ...files.map((file) => file.relativePath),
      ...symbols.map((symbol) => symbol.relativePath),
    ]);
    const relevantDependencies = dependencies
      .filter(
        (dependency) =>
          relevantPaths.has(dependency.sourceFile) ||
          (dependency.targetFile ? relevantPaths.has(dependency.targetFile) : false) ||
          tokens.some((token) => dependency.targetModule.toLowerCase().includes(token)),
      )
      .slice(0, 200);
    const references = (
      await Promise.all(
        symbols.slice(0, 10).map((symbol) =>
          Promise.resolve(
            this.store.listReferences({
              repositoryId,
              generation,
              symbolId: symbol.symbolId,
              name: symbol.name,
              limit: 50,
            }),
          ),
        ),
      )
    )
      .flat()
      .slice(0, 200);
    const architectureNodes = (
      await this.store.listArchitectureNodes(repositoryId, generation)
    )
      .filter(
        (node) =>
          tokens.some(
            (token) =>
              node.label.toLowerCase().includes(token) ||
              node.kind.toLowerCase().includes(token) ||
              (node.relativePath?.toLowerCase().includes(token) ?? false),
          ) || (node.relativePath ? relevantPaths.has(node.relativePath) : false),
      )
      .slice(0, 100);
    const apiRoutes = (await this.store.listApiRoutes(repositoryId, generation))
      .filter(
        (route) =>
          tokens.some(
            (token) =>
              route.routePath.toLowerCase().includes(token) ||
              route.relativePath.toLowerCase().includes(token) ||
              route.httpMethod.toLowerCase() === token,
          ) || relevantPaths.has(route.relativePath),
      )
      .slice(0, 100);
    const databaseModels = (
      await this.store.listDatabaseModels(repositoryId, generation)
    )
      .filter(
        (model) =>
          tokens.some(
            (token) =>
              model.modelName.toLowerCase().includes(token) ||
              model.relativePath.toLowerCase().includes(token),
          ) || relevantPaths.has(model.relativePath),
      )
      .slice(0, 100);
    const insights = (await this.store.listInsights(repositoryId, generation)).slice(
      0,
      100,
    );
    const evidence = uniqueEvidence([
      {
        kind: "generation",
        label: `generation ${generation}`,
        relativePath: null,
        line: null,
        detail: repository.activeFingerprint ?? "active generation",
      },
      ...files.map((file) =>
        fileEvidence(file.relativePath, `${file.language} ${file.classification}`),
      ),
      ...symbols.map(symbolEvidence),
      ...relevantDependencies.map((dependency) => ({
        kind: "dependency" as const,
        label: `${dependency.sourceFile} -> ${dependency.targetFile ?? dependency.targetModule}`,
        relativePath: dependency.sourceFile,
        line: null,
        detail: dependency.dependencyKind,
      })),
      ...references.map((reference) => ({
        kind: "reference" as const,
        label: reference.name,
        relativePath: reference.location.relativePath,
        line: reference.location.line,
        detail: reference.kind,
      })),
      ...apiRoutes.map((route) => ({
        kind: "api_route" as const,
        label: `${route.httpMethod} ${route.routePath}`,
        relativePath: route.relativePath,
        line: route.line,
        detail: route.authRequired ? "auth required" : "auth requirement unknown",
      })),
      ...databaseModels.map((model) => ({
        kind: "database_model" as const,
        label: model.modelName,
        relativePath: model.relativePath,
        line: model.line,
        detail: model.modelKind,
      })),
      ...insights.map((insight) => ({
        kind: "insight" as const,
        label: insight.title,
        relativePath: null,
        line: null,
        detail: insight.insightType,
      })),
    ]).slice(0, 200);
    return RepositoryContextBundleSchema.parse({
      repository,
      generation,
      query,
      symbols,
      files,
      dependencies: relevantDependencies,
      references,
      architectureNodes,
      apiRoutes,
      databaseModels,
      insights,
      evidence,
      truncated:
        symbolMatches.length > symbols.length ||
        dependencies.length > relevantDependencies.length ||
        allFiles.length > files.length,
    });
  }

  private reasonFromContext(question: string, context: RepositoryContextBundle) {
    const lower = question.toLowerCase();
    const findings: string[] = [];
    if (context.files.length > 0) {
      findings.push(
        `Relevant files include ${boundedList(context.files.map((file) => file.relativePath))}.`,
      );
    }
    if (context.symbols.length > 0) {
      findings.push(
        `Relevant symbols include ${boundedList(
          context.symbols.map(
            (symbol) =>
              `${symbol.kind} ${symbol.name} (${symbol.relativePath}:${symbol.line})`,
          ),
          10,
        )}.`,
      );
    }
    if (context.apiRoutes.length > 0) {
      findings.push(
        `Relevant API routes include ${boundedList(
          context.apiRoutes.map(
            (route) =>
              `${route.httpMethod} ${route.routePath} (${route.relativePath}:${route.line})`,
          ),
          10,
        )}.`,
      );
    }
    if (context.databaseModels.length > 0) {
      findings.push(
        `Relevant database models include ${boundedList(
          context.databaseModels.map(
            (model) => `${model.modelName} (${model.relativePath}:${model.line})`,
          ),
          10,
        )}.`,
      );
    }
    if (context.dependencies.length > 0) {
      findings.push(
        `Dependency evidence includes ${boundedList(
          context.dependencies.map(
            (dependency) =>
              `${dependency.sourceFile} -> ${dependency.targetFile ?? dependency.targetModule}`,
          ),
          10,
        )}.`,
      );
    }
    if (context.references.length > 0) {
      findings.push(
        `Reference evidence includes ${context.references.length} indexed reference(s), led by ${boundedList(
          context.references
            .slice(0, 10)
            .map(
              (reference) =>
                `${reference.name} in ${reference.location.relativePath}:${reference.location.line}`,
            ),
          10,
        )}.`,
      );
    }
    if (lower.includes("auth") || lower.includes("login")) {
      findings.push(
        "For authentication/login questions, trust symbols/routes/files with auth, session, security, identity, or login names first; the cited evidence is metadata-only and should be treated as the trace starting point.",
      );
    }
    if (
      lower.includes("break") ||
      lower.includes("impact") ||
      lower.includes("change")
    ) {
      findings.push(
        "Impact should be evaluated through reverse dependencies, callers/references, API routes, database models, and frontend/component architecture nodes cited above.",
      );
    }
    return findings.slice(0, 50);
  }

  private confidenceFor(context: RepositoryContextBundle) {
    if (!context.generation) return 0;
    const score =
      context.evidence.length * 0.015 +
      context.symbols.length * 0.01 +
      context.apiRoutes.length * 0.02 +
      context.databaseModels.length * 0.02;
    return Math.max(0.15, Math.min(0.9, Number(score.toFixed(2))));
  }

  private updateReasoningMemory(
    sessionId: string,
    context: RepositoryContextBundle,
    update: { currentInvestigation: string | null },
  ) {
    const previous = this.#reasoningMemory.get(sessionId);
    const next = RepositoryReasoningMemorySchema.parse({
      currentRepositoryId: context.repository.id,
      currentModule:
        context.architectureNodes[0]?.label ?? previous?.currentModule ?? null,
      activeSymbols: [
        ...new Set([
          ...context.symbols.map((symbol) => symbol.name),
          ...(previous?.activeSymbols ?? []),
        ]),
      ].slice(0, 20),
      currentInvestigation:
        update.currentInvestigation ?? previous?.currentInvestigation ?? null,
      openQuestions: previous?.openQuestions ?? [],
      recentlyViewedFiles: [
        ...new Set([
          ...context.files.map((file) => file.relativePath),
          ...context.symbols.map((symbol) => symbol.relativePath),
          ...(previous?.recentlyViewedFiles ?? []),
        ]),
      ].slice(0, 20),
      currentArchitectureContext:
        context.architectureNodes.length > 0
          ? boundedList(
              context.architectureNodes.map((node) => `${node.kind}:${node.label}`),
              10,
            )
          : (previous?.currentArchitectureContext ?? null),
      updatedAt: this.now().toISOString(),
    });
    this.#reasoningMemory.set(sessionId, next);
    return next;
  }

  private async authorize(ownerId: string, repositoryId: string) {
    const repository = await this.store.findRepository(repositoryId);
    if (!repository || repository.ownerId !== ownerId)
      throw new ExecutionError(
        404,
        "REPOSITORY_NOT_FOUND",
        "Repository metadata was not found.",
      );
    return repository;
  }
}

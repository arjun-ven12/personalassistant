import {
  RegisterSemanticObjectRequestSchema,
  SemanticIntelligenceDashboardResponseSchema,
  SemanticRegistryObjectSchema,
  SemanticRetrievalSearchRequestSchema,
  SemanticRetrievalSearchResponseSchema,
  UpsertSemanticAliasRequestSchema,
  UpsertSynonymRequestSchema,
  type RetrievalCandidate,
  type SemanticRegistryObject,
  type SemanticRetrievalSearchResponse,
} from "@alexa-control/shared";
import { createHash } from "node:crypto";
import type { z } from "zod";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { CacheService } from "../intelligence/cache-service.js";
import type { EmbeddingService } from "../intelligence/embedding-service.js";
import type { SemanticRetrievalStore } from "./store.js";

export class SemanticRetrievalService {
  constructor(
    readonly store: SemanticRetrievalStore,
    readonly cache: CacheService,
    readonly embeddings: EmbeddingService,
    readonly governanceAudit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    await this.ensureBaseline(ownerId);
    const [registry, aliases, synonyms, embeddings, retrievalHistory, metrics, usage] =
      await Promise.all([
        this.store.listObjects(ownerId, 1_000),
        this.store.listAliases(ownerId, 1_000),
        this.store.listSynonyms(ownerId, 1_000),
        this.store.listEmbeddings(ownerId, 1_000),
        this.store.listHistory(ownerId, 250),
        this.store.listMetrics(ownerId, 250),
        this.store.listUsage(ownerId, 250),
      ]);
    return SemanticIntelligenceDashboardResponseSchema.parse({
      registry,
      aliases,
      synonyms,
      embeddings,
      retrievalHistory,
      metrics,
      usage,
      stats: {
        registryCount: registry.length,
        aliasCount: aliases.length,
        synonymCount: synonyms.length,
        embeddingCount: embeddings.length,
        aiEscalationCount: retrievalHistory.filter(
          (item) => item.resolution === "ai_fallback_required",
        ).length,
        deterministicResolutionCount: retrievalHistory.filter(
          (item) => item.resolution === "resolved",
        ).length,
      },
    });
  }

  async registerObject(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId);
    const request = RegisterSemanticObjectRequestSchema.parse(input.body);
    const existing = await this.store.getObjectByKey(input.ownerId, request.objectKey);
    const at = this.now().toISOString();
    const object = SemanticRegistryObjectSchema.parse({
      id: existing?.id ?? crypto.randomUUID(),
      ownerId: input.ownerId,
      objectKey: request.objectKey,
      displayName: request.displayName,
      aliases: request.aliases,
      description: request.description,
      category: request.category,
      semanticTags: request.semanticTags,
      permissions: request.permissions,
      visibility: request.visibility,
      supportedActions: request.supportedActions,
      creationSource: request.creationSource,
      version: request.version,
      embeddingVersion: stableEmbeddingVersion(request),
      routePath: request.routePath,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    });
    await this.store.saveObject(object);
    await this.recordEmbeddingMetadata(object, "semantic object registered");
    await this.governanceAudit({
      eventType: "SEMANTIC_OBJECT_REGISTERED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Semantic object registered.",
      requestId: input.requestId,
      metadata: {
        objectId: object.id,
        objectKey: object.objectKey,
        category: object.category,
      },
    });
    return this.dashboard(input.ownerId);
  }

  async upsertAlias(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId);
    const request = UpsertSemanticAliasRequestSchema.parse(input.body);
    const object = await this.store.getObject(input.ownerId, request.objectId);
    if (!object) throw new Error("SEMANTIC_OBJECT_NOT_FOUND");
    const at = this.now().toISOString();
    await this.store.saveAlias({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      objectId: object.id,
      alias: request.alias,
      normalizedAlias: normalizeText(request.alias),
      source: request.source,
      status: request.status,
      language: request.language,
      workspaceId: request.workspaceId,
      createdAt: at,
      updatedAt: at,
    });
    await this.governanceAudit({
      eventType: "SEMANTIC_ALIAS_UPDATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Semantic alias updated.",
      requestId: input.requestId,
      metadata: { objectId: object.id, status: request.status },
    });
    return this.dashboard(input.ownerId);
  }

  async upsertSynonym(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId);
    const request = UpsertSynonymRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    await this.store.saveSynonym({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      term: normalizeText(request.term),
      synonyms: request.synonyms.map(normalizeText),
      language: request.language,
      source: "manual",
      status: request.status,
      createdAt: at,
      updatedAt: at,
    });
    await this.governanceAudit({
      eventType: "SEMANTIC_SYNONYM_UPDATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Semantic synonym updated.",
      requestId: input.requestId,
      metadata: { term: normalizeText(request.term), status: request.status },
    });
    return this.dashboard(input.ownerId);
  }

  async search(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }): Promise<SemanticRetrievalSearchResponse> {
    const started = performance.now();
    await this.ensureBaseline(input.ownerId);
    const request = SemanticRetrievalSearchRequestSchema.parse(input.body);
    const normalizedQuery = normalizeText(request.query);
    const cacheKey = semanticCacheKey(input.ownerId, request, normalizedQuery);
    const cached = await this.cache.getJson(cacheKey, SemanticRetrievalSearchResponseSchema);
    if (cached) {
      await this.storeMetric(input.ownerId, request.source, cached, true, started);
      return cached;
    }

    const [objects, aliases, synonyms, usage] = await Promise.all([
      this.store.listObjects(input.ownerId, 2_000),
      this.store.listAliases(input.ownerId, 2_000),
      this.store.listSynonyms(input.ownerId, 2_000),
      this.store.listUsage(input.ownerId, 500),
    ]);
    const visible = objects.filter((object) => object.visibility === "visible");
    const filtered = request.categories.length
      ? visible.filter((object) => request.categories.includes(object.category))
      : visible;
    const expandedQueries = expandWithSynonyms(normalizedQuery, synonyms);
    const candidates = filtered
      .map((object) =>
        rankObject({
          object,
          aliases: aliases.filter(
            (alias) => alias.objectId === object.id && alias.status === "active",
          ),
          expandedQueries,
          normalizedQuery,
          currentPage: request.currentPage,
          usageCount: usage.filter((item) => item.objectId === object.id).length,
        }),
      )
      .filter((candidate): candidate is RetrievalCandidate => candidate !== null)
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, request.limit);

    const selected = selectCandidate(candidates, request.confidenceThreshold);
    const resolution = resolveOutcome(candidates, selected, request.confidenceThreshold);
    const response = SemanticRetrievalSearchResponseSchema.parse({
      query: request.query,
      normalizedQuery,
      resolution,
      selected,
      candidates,
      aiEscalationReason:
        resolution === "ai_fallback_required"
          ? "Deterministic semantic retrieval confidence was below threshold."
          : resolution === "ambiguous"
            ? "Multiple semantic candidates remained too close to auto-select."
            : null,
      cacheHit: false,
      latencyMs: elapsed(started),
    });
    await this.cache.setJson(cacheKey, response, 120);
    await this.recordRetrieval(input, response);
    await this.storeMetric(input.ownerId, request.source, response, false, started);
    return response;
  }

  async ensureBaseline(ownerId: string) {
    const at = this.now().toISOString();
    for (const object of BUILT_IN_OBJECTS) {
      const existing = await this.store.getObjectByKey(ownerId, object.objectKey);
      if (existing) continue;
      const record = SemanticRegistryObjectSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        ...object,
        embeddingVersion: stableEmbeddingVersion(object),
        createdAt: at,
        updatedAt: at,
      });
      await this.store.saveObject(record);
      await this.recordEmbeddingMetadata(record, "baseline semantic object");
    }
    const existingSynonyms = await this.store.listSynonyms(ownerId, 1_000);
    const existingTerms = new Set(existingSynonyms.map((item) => item.term));
    for (const [term, synonyms] of Object.entries(SYSTEM_SYNONYMS)) {
      if (existingTerms.has(term)) continue;
      await this.store.saveSynonym({
        id: crypto.randomUUID(),
        ownerId,
        term,
        synonyms,
        language: "en",
        source: "system",
        status: "active",
        createdAt: at,
        updatedAt: at,
      });
    }
  }

  async recordEmbeddingMetadata(object: SemanticRegistryObject, reason: string) {
    const at = this.now().toISOString();
    const contentHash = stableHash(semanticContent(object));
    const embeddingVersion = object.embeddingVersion ?? `sem-${contentHash.slice(0, 12)}`;
    await this.store.saveEmbedding({
      id: crypto.randomUUID(),
      ownerId: object.ownerId,
      objectId: object.id,
      provider: this.embeddings.options.provider,
      model: this.embeddings.options.model,
      dimensions: this.embeddings.options.dimensions,
      embeddingVersion,
      status: this.embeddings.status().enabled ? "pending" : "failed",
      contentHash,
      lastErrorCode: this.embeddings.status().enabled
        ? null
        : "EMBEDDING_PROVIDER_DISABLED",
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveEmbeddingVersion({
      id: crypto.randomUUID(),
      ownerId: object.ownerId,
      objectId: object.id,
      version: embeddingVersion,
      reason,
      createdAt: at,
    });
  }

  async recordRetrieval(
    input: { ownerId: string; body: unknown; requestId: string; ipAddress: string },
    response: SemanticRetrievalSearchResponse,
  ) {
    const request = SemanticRetrievalSearchRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    await this.store.saveHistory({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      query: request.query,
      normalizedQuery: response.normalizedQuery,
      source: request.source,
      resolution: response.resolution,
      selectedObjectId: response.selected?.objectId ?? null,
      selectedConfidence: response.selected?.confidence ?? 0,
      candidateCount: response.candidates.length,
      aiEscalationReason: response.aiEscalationReason,
      createdAt: at,
    });
    if (response.selected) {
      await this.store.saveUsage({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        objectId: response.selected.objectId,
        query: request.query,
        source: request.source,
        success: response.resolution === "resolved",
        confidence: response.selected.confidence,
        usedAt: at,
      });
    }
    await this.governanceAudit({
      eventType:
        response.resolution === "resolved"
          ? "SEMANTIC_RETRIEVAL_RESOLVED"
          : "SEMANTIC_RETRIEVAL_ESCALATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: response.resolution === "resolved" ? "SUCCESS" : "DENIED",
      reason:
        response.resolution === "resolved"
          ? "Semantic retrieval resolved deterministically."
          : "Semantic retrieval requires AI or clarification fallback.",
      requestId: input.requestId,
      metadata: {
        source: request.source,
        resolution: response.resolution,
        selectedObjectId: response.selected?.objectId ?? null,
        confidence: response.selected?.confidence ?? 0,
      },
    });
  }

  async storeMetric(
    ownerId: string,
    source: "voice" | "gesture" | "planner" | "agent" | "dashboard" | "api",
    response: SemanticRetrievalSearchResponse,
    cacheHit: boolean,
    started: number,
  ) {
    await this.store.saveMetric({
      id: crypto.randomUUID(),
      ownerId,
      source,
      latencyMs: cacheHit ? response.latencyMs : elapsed(started),
      cacheHit,
      candidateCount: response.candidates.length,
      resolution: response.resolution,
      measuredAt: this.now().toISOString(),
    });
  }
}

const BUILT_IN_OBJECTS: Array<
  Omit<SemanticRegistryObject, "id" | "ownerId" | "embeddingVersion" | "createdAt" | "updatedAt">
> = [
  page("page:dashboard", "Dashboard", "/", ["home", "command center", "main"]),
  page("page:commands", "Commands", "/commands", ["command center", "command history"]),
  page("page:command-studio", "Command Studio", "/command-studio", [
    "create command",
    "record command",
    "intent recording",
  ]),
  page("page:memory", "Memory", "/memory", ["knowledge", "notes", "cognitive memory"]),
  page("page:agents", "Agents", "/agents", ["agent center", "agent dashboard"]),
  page("page:workflows", "Workflows", "/workflows", ["workflow queue", "plans"]),
  page("page:repositories", "Repositories", "/repositories", ["repos", "projects"]),
  page("page:tasks", "Tasks", "/tasks", ["task center", "scheduler"]),
  page("page:semantic", "Semantic Intelligence", "/semantic", [
    "semantic search",
    "retrieval",
    "aliases",
    "synonyms",
  ]),
  page("page:voice", "Voice", "/voice", ["voice settings", "voice center"]),
  page("page:gesture-lab", "Gesture Lab", "/gestures", ["spatial", "hands", "gestures"]),
  page("page:settings", "Settings", "/settings", ["preferences", "configuration"]),
];

function page(
  objectKey: string,
  displayName: string,
  routePath: string,
  aliases: string[],
): Omit<
  SemanticRegistryObject,
  "id" | "ownerId" | "embeddingVersion" | "createdAt" | "updatedAt"
> {
  return {
    objectKey,
    displayName,
    aliases,
    description: `Navigate to ${displayName}.`,
    category: "page",
    semanticTags: ["navigation", "dashboard"],
    permissions: ["owner_authenticated_read"],
    visibility: "visible",
    supportedActions: ["open", "navigate"],
    creationSource: "system",
    version: "1.0.0",
    routePath,
  };
}

const SYSTEM_SYNONYMS: Record<string, string[]> = {
  open: ["launch", "show", "display", "reveal", "navigate", "go"],
  memory: ["knowledge", "notes"],
  repository: ["repo", "project", "workspace"],
  commands: ["command", "actions", "shortcuts"],
  settings: ["preferences", "configuration"],
};

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const expandWithSynonyms = (query: string, synonyms: Awaited<ReturnType<SemanticRetrievalStore["listSynonyms"]>>) => {
  const expanded = new Set([query, stripCommandWords(query)].filter(Boolean));
  for (const synonym of synonyms.filter((item) => item.status === "active")) {
    const terms = [synonym.term, ...synonym.synonyms.map(normalizeText)];
    for (const term of terms) {
      if (!query.includes(term)) continue;
      for (const replacement of terms) {
        const replaced = query.replace(term, replacement);
        expanded.add(replaced);
        expanded.add(stripCommandWords(replaced));
      }
    }
  }
  return [...expanded];
};

const rankObject = (input: {
  object: SemanticRegistryObject;
  aliases: Array<{ normalizedAlias: string; alias: string }>;
  expandedQueries: string[];
  normalizedQuery: string;
  currentPage: string | null;
  usageCount: number;
}): RetrievalCandidate | null => {
  const label = normalizeText(input.object.displayName);
  const objectKey = normalizeText(input.object.objectKey.replace(/[:_-]/g, " "));
  const aliases = [
    ...input.object.aliases.map(normalizeText),
    ...input.aliases.map((alias) => alias.normalizedAlias),
  ];
  const haystack = [
    label,
    objectKey,
    input.object.description,
    input.object.semanticTags.join(" "),
    aliases.join(" "),
  ]
    .map(normalizeText)
    .join(" ");

  let matchKind: RetrievalCandidate["matchKind"] = "lexical";
  let lexicalScore = 0;
  let semanticScore = 0;
  const reasons: string[] = [];
  if (input.normalizedQuery === label || input.normalizedQuery === objectKey) {
    matchKind = "exact";
    lexicalScore = 1;
    semanticScore = 1;
    reasons.push("exact object label match");
  } else if (aliases.includes(input.normalizedQuery)) {
    matchKind = "alias";
    lexicalScore = 0.95;
    semanticScore = 0.9;
    reasons.push("active alias match");
  } else if (input.expandedQueries.some((query) => query === label || aliases.includes(query))) {
    matchKind = "synonym";
    lexicalScore = 0.86;
    semanticScore = 0.8;
    reasons.push("synonym-expanded match");
  } else {
    lexicalScore = tokenScore(input.normalizedQuery, haystack);
    semanticScore = trigramScore(input.normalizedQuery, haystack);
    if (lexicalScore === 0 && semanticScore < 0.18) return null;
    reasons.push("lexical semantic registry match");
  }
  const contextScore =
    input.currentPage && input.object.routePath === input.currentPage
      ? 0.15
      : input.usageCount > 0
        ? Math.min(0.12, input.usageCount / 100)
        : 0;
  const base =
    matchKind === "exact"
      ? 0.98
      : matchKind === "alias"
        ? 0.92
        : matchKind === "synonym"
          ? 0.82
          : lexicalScore * 0.55 + semanticScore * 0.35;
  const confidence = Math.max(0, Math.min(1, base + contextScore));
  return {
    objectId: input.object.id,
    objectKey: input.object.objectKey,
    displayName: input.object.displayName,
    category: input.object.category,
    routePath: input.object.routePath,
    matchKind,
    confidence,
    lexicalScore,
    semanticScore,
    contextScore,
    reasons,
    supportedActions: input.object.supportedActions,
  };
};

const tokenScore = (query: string, text: string) => {
  const queryTokens = query.split(/\s+/).filter((token) => !STOP_WORDS.has(token));
  const textTokens = new Set(text.split(/\s+/).filter(Boolean));
  if (queryTokens.length === 0) return 0;
  return queryTokens.filter((token) => textTokens.has(token)).length / queryTokens.length;
};

const trigramScore = (query: string, text: string) => {
  const queryTrigrams = trigrams(query);
  const textTrigrams = trigrams(text);
  if (queryTrigrams.size === 0 || textTrigrams.size === 0) return 0;
  const overlap = [...queryTrigrams].filter((item) => textTrigrams.has(item)).length;
  return overlap / Math.sqrt(queryTrigrams.size * textTrigrams.size);
};

const trigrams = (value: string) => {
  const padded = `  ${value}  `;
  const out = new Set<string>();
  for (let index = 0; index < padded.length - 2; index += 1) {
    out.add(padded.slice(index, index + 3));
  }
  return out;
};

const selectCandidate = (
  candidates: RetrievalCandidate[],
  threshold: number,
): RetrievalCandidate | null => {
  const [first, second] = candidates;
  if (!first || first.confidence < threshold) return null;
  if (second && first.confidence - second.confidence < 0.05) return null;
  return first;
};

const resolveOutcome = (
  candidates: RetrievalCandidate[],
  selected: RetrievalCandidate | null,
  threshold: number,
): SemanticRetrievalSearchResponse["resolution"] => {
  if (selected) return "resolved";
  if (candidates.length > 1 && candidates[0]!.confidence >= threshold) return "ambiguous";
  return "ai_fallback_required";
};

const semanticCacheKey = (
  ownerId: string,
  request: z.infer<typeof SemanticRetrievalSearchRequestSchema>,
  normalizedQuery: string,
) =>
  `semantic:${ownerId}:${stableHash(
    JSON.stringify({
      q: normalizedQuery,
      s: request.source,
      p: request.currentPage,
      c: request.categories,
      l: request.limit,
      t: request.confidenceThreshold,
    }),
  )}`;

const stableEmbeddingVersion = (value: unknown) =>
  `sem-${stableHash(JSON.stringify(value)).slice(0, 12)}`;
const stableHash = (value: string) => createHash("sha256").update(value).digest("hex");
const semanticContent = (object: SemanticRegistryObject) =>
  [
    object.displayName,
    object.aliases.join(" "),
    object.description,
    object.category,
    object.semanticTags.join(" "),
    object.supportedActions.join(" "),
    object.version,
  ].join("\n");
const elapsed = (started: number) =>
  Math.max(0, Math.round((performance.now() - started) * 100) / 100);
const STOP_WORDS = new Set(["open", "go", "to", "the", "a", "an", "show", "display"]);
const stripCommandWords = (value: string) =>
  value
    .split(/\s+/)
    .filter((token) => !STOP_WORDS.has(token))
    .join(" ");

import {
  CognitiveActionImpactSchema,
  CognitiveContextPreviewRequestSchema,
  CognitiveContextPreviewSchema,
  CognitiveExportResponseSchema,
  CognitiveExplanationSchema,
  CognitiveHealthMetricSchema,
  CognitiveItemSchema,
  MemoryStudioSearchQuerySchema,
  MemoryStudioSearchResponseSchema,
  EmbeddingInspectionSchema,
  MemoryStudioDashboardSchema,
  UpdateCognitiveItemRequestSchema,
  type CognitiveItem,
  type CognitiveItemType,
  type CognitiveProvenance,
  type RetentionClass,
} from "@alexa-control/shared";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { HumanUnderstandingStore } from "../human-understanding/store.js";
import type { KnowledgeGraphStore } from "../knowledge-graph/store.js";
import type { LearningEngineStore } from "../learning-engine/store.js";
import type { MemoryStore } from "../memory/store.js";
import type { MemoryStudioStore } from "./store.js";
import { CognitiveItemControlRecordSchema } from "./store.js";

const itemId = (type: CognitiveItemType, sourceId: string) => `${type}:${sourceId}`;
const sourceIdFromItemId = (id: string) => id.slice(id.indexOf(":") + 1);

const nowMinusDays = (date: Date, days: number) =>
  new Date(date.getTime() - days * 86_400_000).toISOString();

const previewText = (value: unknown) => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value).slice(0, 240);
  } catch {
    return "[unserializable]";
  }
};

const searchTokens = (input: string) => [
  ...new Set(input.toLowerCase().match(/[a-z0-9_-]{3,}/g) ?? []),
];

const itemMatchesTokens = (item: CognitiveItem, tokens: string[]) => {
  if (tokens.length === 0) return true;
  const haystack = [item.title, item.summary, item.source, item.tags.join(" ")]
    .join(" ")
    .toLowerCase();
  return tokens.some((token) => haystack.includes(token));
};

const safePreview = (value: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => {
      const lowered = key.toLowerCase();
      return !["password", "token", "secret", "cookie", "privatekey", "recovery"].some(
        (blocked) => lowered.includes(blocked),
      );
    }),
  );

export class CognitiveQueryService {
  constructor(
    readonly studioStore: MemoryStudioStore,
    readonly memoryStore: MemoryStore,
    readonly knowledgeGraphStore: KnowledgeGraphStore,
    readonly learningStore: LearningEngineStore,
    readonly humanUnderstandingStore: HumanUnderstandingStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    const items = await this.items(ownerId);
    return MemoryStudioDashboardSchema.parse({
      overview: this.overview(items),
      items: this.rank(items).slice(0, 100),
      lowConfidence: items.filter((item) => item.lowConfidence).slice(0, 100),
      stale: items.filter((item) => item.stale).slice(0, 100),
      conflicts: items.filter((item) => item.conflict).slice(0, 100),
      embeddings: this.embeddings(items).slice(0, 100),
      health: this.health(items),
      privateModeAvailable: true,
      llmRequired: false,
      deletionPolicy: "impact_preview_required",
    });
  }

  async search(ownerId: string, rawQuery: unknown) {
    const startedAt = performance.now();
    const query = MemoryStudioSearchQuerySchema.parse(rawQuery);
    let items = await this.items(ownerId);
    const needle = query.q.toLowerCase();
    if (needle) {
      items = items.filter((item) =>
        [item.title, item.summary, item.source, item.tags.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }
    items = items
      .filter((item) => !query.itemType || item.itemType === query.itemType)
      .filter((item) => !query.source || item.source === query.source)
      .filter((item) => query.status === undefined || item.status === query.status)
      .filter((item) => query.pinned === undefined || item.pinned === query.pinned)
      .filter(
        (item) => query.archived === undefined || item.archived === query.archived,
      )
      .filter(
        (item) =>
          query.lowConfidence === undefined ||
          item.lowConfidence === query.lowConfidence,
      )
      .filter((item) => query.stale === undefined || item.stale === query.stale)
      .filter(
        (item) => query.conflict === undefined || item.conflict === query.conflict,
      )
      .filter(
        (item) =>
          query.embeddingAvailable === undefined ||
          item.embeddingAvailable === query.embeddingAvailable,
      )
      .filter(
        (item) =>
          query.confidenceMin === undefined || item.confidence >= query.confidenceMin,
      )
      .filter(
        (item) =>
          query.confidenceMax === undefined || item.confidence <= query.confidenceMax,
      )
      .filter(
        (item) =>
          !query.projectId ||
          previewText(item.rawPreview.projectId ?? item.rawPreview.repositoryId) ===
            query.projectId,
      )
      .filter(
        (item) =>
          !query.agentId || previewText(item.rawPreview.agentId) === query.agentId,
      )
      .filter(
        (item) =>
          !query.workflowId ||
          previewText(item.rawPreview.workflowId) === query.workflowId,
      )
      .filter(
        (item) =>
          !query.applicationId ||
          previewText(item.rawPreview.applicationId) === query.applicationId,
      );
    const ranked = this.rank(items);
    const page = ranked.slice(query.cursor, query.cursor + query.limit);
    await Promise.all(
      page.map((item) =>
        this.recordUsage(ownerId, item.id, "studio_search_result", "memory_studio"),
      ),
    );
    return MemoryStudioSearchResponseSchema.parse({
      query,
      items: page,
      total: ranked.length,
      nextCursor:
        query.cursor + query.limit < ranked.length ? query.cursor + query.limit : null,
      latencyMs: Math.max(0, performance.now() - startedAt),
    });
  }

  async getItem(ownerId: string, id: string) {
    const item = (await this.items(ownerId)).find((candidate) => candidate.id === id);
    if (!item) throw new Error("Cognitive item was not found for this owner.");
    await this.recordUsage(ownerId, id, "studio_inspection", "memory_studio");
    return item;
  }

  async explain(ownerId: string, id: string) {
    const item = await this.getItem(ownerId, id);
    const usage = await this.studioStore.listUsage(ownerId, id, 50);
    const related = (await this.related(ownerId, id)).map(
      (relatedItem) => relatedItem.id,
    );
    return CognitiveExplanationSchema.parse({
      item,
      whyRemembered: whyRemembered(item),
      howUsed: howUsed(item),
      usageTrace: usage.map(
        (record) => `${record.usedAt}: ${record.useType} from ${record.source}`,
      ),
      confidenceSignals: confidenceSignals(item),
      relatedItemIds: related,
      provenance: item.provenance,
      hiddenReasoningExposed: false,
    });
  }

  async provenance(ownerId: string, id: string) {
    return (await this.explain(ownerId, id)).provenance;
  }

  async usage(ownerId: string, id: string) {
    await this.getItem(ownerId, id);
    return this.studioStore.listUsage(ownerId, id, 100);
  }

  async history(ownerId: string, id: string) {
    await this.getItem(ownerId, id);
    return this.studioStore.listVersions(ownerId, id, 100);
  }

  async related(ownerId: string, id: string) {
    const item = await this.getItem(ownerId, id);
    const sourceId = sourceIdFromItemId(id);
    const items = await this.items(ownerId);
    const sourceProject = item.rawPreview.projectId ?? item.rawPreview.repositoryId;
    const sourceAgent = item.rawPreview.agentId;
    return this.rank(
      items.filter((candidate) => {
        if (candidate.id === id) return false;
        if (
          sourceProject &&
          (candidate.rawPreview.projectId === sourceProject ||
            candidate.rawPreview.repositoryId === sourceProject)
        )
          return true;
        if (sourceAgent && candidate.rawPreview.agentId === sourceAgent) return true;
        if (candidate.provenance.some((provenance) => provenance.sourceId === sourceId))
          return true;
        return candidate.tags.some((tag) => item.tags.includes(tag));
      }),
    ).slice(0, 50);
  }

  async update(ownerId: string, id: string, rawBody: unknown) {
    const item = await this.getItem(ownerId, id);
    const body = UpdateCognitiveItemRequestSchema.parse(rawBody);
    if (!item.editable) {
      return CognitiveActionImpactSchema.parse({
        item,
        action: "archive",
        allowed: false,
        requiresApproval: false,
        destructive: false,
        affectedItemIds: [],
        explanation:
          "This cognitive item is a read-only projection from a protected subsystem.",
      });
    }
    const current = await this.ensureControl(ownerId, id);
    const at = this.now().toISOString();
    const updated = CognitiveItemControlRecordSchema.parse({
      ...current,
      tags: body.tags ?? current.tags,
      retentionClass: body.retentionClass ?? current.retentionClass,
      note: body.reason ?? current.note,
      pinned: body.retentionClass === "PINNED" ? true : current.pinned,
      updatedAt: at,
      version: current.version + 1,
    });
    await this.studioStore.saveControl(updated);
    await this.recordVersion(
      ownerId,
      id,
      "metadata_updated",
      body.reason ?? null,
      current,
      updated,
    );
    await this.recordAuditLink(
      ownerId,
      id,
      "COGNITIVE_ITEM_UPDATED",
      "Owner updated Memory Studio metadata.",
    );
    return this.getItem(ownerId, id);
  }

  async setArchived(ownerId: string, id: string, archived: boolean) {
    const item = await this.getItem(ownerId, id);
    const control = await this.ensureControl(ownerId, id);
    const updated = CognitiveItemControlRecordSchema.parse({
      ...control,
      archived,
      retentionClass: archived ? "HISTORICAL" : control.retentionClass,
      updatedAt: this.now().toISOString(),
      version: control.version + 1,
    });
    await this.studioStore.saveControl(updated);
    await this.recordVersion(
      ownerId,
      id,
      archived ? "archived" : "restored",
      null,
      control,
      updated,
    );
    await this.recordAuditLink(
      ownerId,
      id,
      archived ? "COGNITIVE_ITEM_ARCHIVED" : "COGNITIVE_ITEM_RESTORED",
      archived
        ? "Item archived from active cognitive context."
        : "Item restored to active Studio visibility.",
    );
    return CognitiveActionImpactSchema.parse({
      item: await this.getItem(ownerId, id),
      action: archived ? "archive" : "restore",
      allowed: true,
      requiresApproval: false,
      destructive: false,
      affectedItemIds: relatedIdsForImpact(item),
      explanation: archived
        ? "Archived items remain queryable in history but are excluded from active context by default."
        : "Restored items return to normal Memory Studio visibility; subsystem policy still controls use.",
    });
  }

  async setPinned(ownerId: string, id: string, pinned: boolean) {
    await this.getItem(ownerId, id);
    const control = await this.ensureControl(ownerId, id);
    const updated = CognitiveItemControlRecordSchema.parse({
      ...control,
      pinned,
      retentionClass: pinned
        ? "PINNED"
        : control.retentionClass === "PINNED"
          ? null
          : control.retentionClass,
      updatedAt: this.now().toISOString(),
      version: control.version + 1,
    });
    await this.studioStore.saveControl(updated);
    await this.recordVersion(
      ownerId,
      id,
      pinned ? "pinned" : "unpinned",
      null,
      control,
      updated,
    );
    return this.getItem(ownerId, id);
  }

  async deleteImpact(ownerId: string, id: string) {
    const item = await this.getItem(ownerId, id);
    return CognitiveActionImpactSchema.parse({
      item,
      action: "delete",
      allowed: false,
      requiresApproval: true,
      destructive: true,
      affectedItemIds: relatedIdsForImpact(item),
      explanation:
        "Permanent deletion is prohibited in this repository. Use archive, supersede, or reviewed later-phase deletion tooling with impact preview.",
    });
  }

  async merge(ownerId: string, rawBody: unknown) {
    const body = await import("@alexa-control/shared").then((shared) =>
      shared.CognitiveMergeRequestSchema.parse(rawBody),
    );
    const primary = await this.getItem(ownerId, body.primaryItemId);
    const duplicates = await Promise.all(
      body.duplicateItemIds.map((duplicateId) => this.getItem(ownerId, duplicateId)),
    );
    return CognitiveActionImpactSchema.parse({
      item: primary,
      action: "merge",
      allowed: body.previewOnly,
      requiresApproval: true,
      destructive: false,
      affectedItemIds: duplicates.map((item) => item.id),
      explanation:
        "Merge is preview-only in Phase 19D. Provenance-preserving redirect execution remains review-gated.",
    });
  }

  async reindex(ownerId: string, id: string) {
    const item = await this.getItem(ownerId, id);
    return CognitiveActionImpactSchema.parse({
      item,
      action: "reindex",
      allowed: true,
      requiresApproval: false,
      destructive: false,
      affectedItemIds: [id],
      explanation:
        "Reindex request is recorded as non-destructive metadata. Existing embedding stores remain authoritative.",
    });
  }

  async contextPreview(ownerId: string, rawBody: unknown) {
    const body = CognitiveContextPreviewRequestSchema.parse(rawBody);
    const tokens = searchTokens(body.input);
    const eligibleItems = this.rank(await this.items(ownerId))
      .filter((item) => !item.archived)
      .filter((item) => item.confidence >= body.confidenceThreshold);
    const resolvedItems = eligibleItems.filter((item) =>
      itemMatchesTokens(item, tokens),
    );
    const included = resolvedItems.slice(0, body.limit);
    await Promise.all(
      included.map((item) =>
        this.recordUsage(ownerId, item.id, "context_preview", "memory_studio"),
      ),
    );
    return CognitiveContextPreviewSchema.parse({
      input: body.input,
      resolvedItems,
      included,
      excludedCount: Math.max(0, eligibleItems.length - included.length),
      confidenceThreshold: body.confidenceThreshold,
      graphDepth: body.graphDepth,
      explanation:
        "Context preview uses bounded deterministic search, confidence thresholds, type quotas, and existing graph/memory/learning records. It does not dump all memory into a prompt.",
      llmRequired: false,
    });
  }

  async export(ownerId: string, scope = "owner_cognitive_data") {
    const items = this.rank(await this.items(ownerId)).slice(0, 1_000);
    return CognitiveExportResponseSchema.parse({
      exportedAt: this.now().toISOString(),
      scope,
      itemCount: items.length,
      items,
      rawSecretsExported: false,
      rawVectorsExported: false,
    });
  }

  async items(ownerId: string) {
    const [
      memories,
      decisions,
      memoryLearning,
      memorySuggestions,
      memoryTimeline,
      nodes,
      edges,
      graphEntities,
      graphRelationships,
      graphFacts,
      graphConflicts,
      learningEvents,
      learningCandidates,
      learnedPreferences,
      habits,
      sequences,
      learningSuggestions,
      learningConflicts,
      traits,
      behaviours,
      communicationRules,
      decisionPreferences,
      workingStyles,
      aliases,
      vocabulary,
      patterns,
      responseTemplates,
      controls,
    ] = await Promise.all([
      this.memoryStore.listMemories(ownerId, 1_000),
      this.memoryStore.listDecisions(ownerId, 1_000),
      this.memoryStore.listLearningEvents(ownerId, 1_000),
      this.memoryStore.listSuggestions(ownerId, 1_000),
      this.memoryStore.listTimeline(ownerId, 1_000),
      this.memoryStore.listKnowledgeNodes(ownerId, 1_000),
      this.memoryStore.listKnowledgeEdges(ownerId, 1_000),
      this.knowledgeGraphStore.listEntities(ownerId, 1_000),
      this.knowledgeGraphStore.listRelationships(ownerId, 1_000),
      this.knowledgeGraphStore.listFacts(ownerId),
      this.knowledgeGraphStore.listConflicts(ownerId, "open"),
      this.learningStore.listEvents(ownerId, 1_000),
      this.learningStore.listCandidates(ownerId, 1_000),
      this.learningStore.listPreferences(ownerId, 1_000),
      this.learningStore.listHabits(ownerId, 1_000),
      this.learningStore.listSequences(ownerId, 1_000),
      this.learningStore.listSuggestions(ownerId, 1_000),
      this.learningStore.listConflicts(ownerId, 1_000),
      this.humanUnderstandingStore.listTraits(ownerId, 1_000),
      this.humanUnderstandingStore.listPersonalityBehaviours(ownerId, 1_000),
      this.humanUnderstandingStore.listCommunicationRules(ownerId, 1_000),
      this.humanUnderstandingStore.listDecisionPreferences(ownerId, 1_000),
      this.humanUnderstandingStore.listWorkingStyles(ownerId, 1_000),
      this.humanUnderstandingStore.listAliases(ownerId, 1_000),
      this.humanUnderstandingStore.listVocabulary(ownerId, 1_000),
      this.humanUnderstandingStore.listPatterns(ownerId, 1_000),
      this.humanUnderstandingStore.listResponseTemplates(ownerId, 1_000),
      this.studioStore.listControls(ownerId, 5_000),
    ]);
    const controlsByItem = new Map(
      controls.map((control) => [control.itemId, control]),
    );
    const make = (base: CognitiveItem) => {
      const control = controlsByItem.get(base.id);
      return CognitiveItemSchema.parse({
        ...base,
        archived: control?.archived ?? base.archived,
        pinned: control?.pinned ?? base.pinned,
        tags: [...new Set([...base.tags, ...(control?.tags ?? [])])].slice(0, 50),
        retentionClass: control?.retentionClass ?? base.retentionClass,
      });
    };
    return [
      ...memories.map((memory) =>
        make({
          id: itemId("MEMORY", memory.id),
          sourceId: memory.id,
          itemType:
            memory.memoryType === "repository"
              ? "PROJECT_MEMORY"
              : memory.memoryType === "agent"
                ? "AGENT_MEMORY"
                : memory.workflowId
                  ? "WORKFLOW_MEMORY"
                  : "MEMORY",
          title: memory.title,
          summary: memory.summary,
          ownerId,
          confidence: memory.confidence,
          status:
            memory.expiresAt && memory.expiresAt < this.now().toISOString()
              ? "expired"
              : "active",
          source: memory.source,
          provenance: memory.evidence.map(memoryEvidenceToProvenance),
          createdAt: memory.createdAt,
          updatedAt: memory.updatedAt,
          lastUsedAt: memory.lastAccessedAt,
          lastObservedAt: memory.updatedAt,
          usageCount: memory.lastAccessedAt ? 1 : 0,
          version: memory.version,
          tags: memory.tags,
          archived: false,
          pinned: memory.importance >= 95,
          editable: memory.source === "owner",
          deletable: false,
          mergeable: true,
          retentionClass: memory.importance >= 90 ? "DURABLE" : "WORKING",
          sensitivityClass: memory.source === "conversation" ? "PRIVATE" : "NORMAL",
          embeddingAvailable: true,
          ownerConfirmed: memory.source === "owner",
          automaticallyLearned: memory.source !== "owner",
          manual: memory.source === "owner",
          lowConfidence: memory.confidence < 0.6,
          stale: isStale(memory.updatedAt, this.now()),
          conflict: false,
          rawPreview: safePreview({
            memoryType: memory.memoryType,
            repositoryId: memory.repositoryId,
            agentId: memory.agentId,
            workflowId: memory.workflowId,
            importance: memory.importance,
            expiresAt: memory.expiresAt,
          }),
        }),
      ),
      ...decisions.map((decision) =>
        make({
          id: itemId("DECISION", decision.id),
          sourceId: decision.id,
          itemType: "DECISION",
          title: decision.decision,
          summary: decision.reason,
          ownerId,
          confidence: 1,
          status: decision.status,
          source: "memory_decision",
          provenance: decision.evidence.map(memoryEvidenceToProvenance),
          createdAt: decision.createdAt,
          updatedAt: decision.updatedAt,
          lastUsedAt: null,
          lastObservedAt: decision.updatedAt,
          usageCount: 0,
          version: 1,
          tags: ["decision"],
          archived: decision.status === "superseded",
          pinned: true,
          editable: true,
          deletable: false,
          mergeable: false,
          retentionClass: decision.status === "superseded" ? "HISTORICAL" : "DURABLE",
          sensitivityClass: "NORMAL",
          embeddingAvailable: false,
          ownerConfirmed: true,
          automaticallyLearned: false,
          manual: true,
          lowConfidence: false,
          stale: decision.status === "superseded",
          conflict: false,
          rawPreview: safePreview({
            repositoryId: decision.repositoryId,
            workflowId: decision.workflowId,
            alternatives: decision.alternatives,
          }),
        }),
      ),
      ...memoryLearning.map((event) =>
        make({
          id: itemId("CORRECTION", event.id),
          sourceId: event.id,
          itemType: "CORRECTION",
          title: event.kind,
          summary: event.summary,
          ownerId,
          confidence: Math.min(1, Math.abs(event.confidenceDelta)),
          status: "active",
          source: "memory_learning",
          provenance: event.evidence.map(memoryEvidenceToProvenance),
          createdAt: event.createdAt,
          updatedAt: event.createdAt,
          lastUsedAt: null,
          lastObservedAt: event.createdAt,
          usageCount: 0,
          version: 1,
          tags: ["learning", event.kind],
          archived: false,
          pinned: false,
          editable: false,
          deletable: false,
          mergeable: false,
          retentionClass: "HISTORICAL",
          sensitivityClass: "NORMAL",
          embeddingAvailable: false,
          ownerConfirmed: false,
          automaticallyLearned: true,
          manual: false,
          lowConfidence: Math.abs(event.confidenceDelta) < 0.4,
          stale: false,
          conflict: false,
          rawPreview: safePreview({
            repositoryId: event.repositoryId,
            agentId: event.agentId,
            workflowId: event.workflowId,
          }),
        }),
      ),
      ...memorySuggestions.map((suggestion) =>
        make({
          id: itemId("MEMORY", suggestion.id),
          sourceId: suggestion.id,
          itemType: "MEMORY",
          title: suggestion.title,
          summary: suggestion.rationale,
          ownerId,
          confidence: suggestion.confidence,
          status: suggestion.status === "open" ? "suggested" : suggestion.status,
          source: "memory_suggestion",
          provenance: suggestion.evidence.map(memoryEvidenceToProvenance),
          createdAt: suggestion.createdAt,
          updatedAt: suggestion.updatedAt,
          lastUsedAt: null,
          lastObservedAt: suggestion.updatedAt,
          usageCount: 0,
          version: 1,
          tags: ["suggestion"],
          archived: suggestion.status !== "open",
          pinned: false,
          editable: false,
          deletable: false,
          mergeable: false,
          retentionClass: "SHORT_TERM",
          sensitivityClass: "NORMAL",
          embeddingAvailable: false,
          ownerConfirmed: false,
          automaticallyLearned: true,
          manual: false,
          lowConfidence: suggestion.confidence < 0.6,
          stale: isStale(suggestion.updatedAt, this.now()),
          conflict: false,
          rawPreview: safePreview({
            repositoryId: suggestion.repositoryId,
            riskLevel: suggestion.riskLevel,
            suggestedAction: suggestion.suggestedAction,
          }),
        }),
      ),
      ...nodes.map((node) =>
        make(
          simpleItem(
            ownerId,
            "SEMANTIC_EXAMPLE",
            node.id,
            node.label,
            node.summary,
            node.confidence,
            node.createdAt,
            node.updatedAt,
            "memory_graph_node",
            node.evidence.map(memoryEvidenceToProvenance),
            ["semantic", node.kind],
            safePreview({ refId: node.refId, kind: node.kind }),
          ),
        ),
      ),
      ...edges.map((edge) =>
        make(
          simpleItem(
            ownerId,
            "KNOWLEDGE_RELATIONSHIP",
            edge.id,
            edge.relation,
            `${edge.sourceNodeId} -> ${edge.targetNodeId}`,
            edge.confidence,
            edge.createdAt,
            edge.createdAt,
            "memory_graph_edge",
            edge.evidence.map(memoryEvidenceToProvenance),
            ["relationship"],
            safePreview({
              sourceNodeId: edge.sourceNodeId,
              targetNodeId: edge.targetNodeId,
            }),
          ),
        ),
      ),
      ...graphEntities.map((entity) =>
        make({
          ...simpleItem(
            ownerId,
            "KNOWLEDGE_ENTITY",
            entity.id,
            entity.displayName,
            entity.description ?? entity.canonicalName,
            entity.confidence,
            entity.createdAt,
            entity.updatedAt,
            entity.sourceType,
            entity.provenance.map(knowledgeProvenanceToProvenance),
            entity.tags,
            safePreview({
              entityType: entity.entityType,
              aliases: entity.aliases,
              sourceId: entity.sourceId,
            }),
          ),
          status: entity.status,
          archived: entity.isArchived,
          pinned: entity.isPinned,
          ownerConfirmed: entity.provenance.some(
            (provenance) => provenance.ownerConfirmed,
          ),
          embeddingAvailable: Boolean(entity.embeddingReference),
        }),
      ),
      ...graphRelationships.map((relationship) =>
        make({
          ...simpleItem(
            ownerId,
            "KNOWLEDGE_RELATIONSHIP",
            relationship.id,
            relationship.relationshipType,
            `${relationship.sourceEntityId} -> ${relationship.targetEntityId}`,
            relationship.confidence,
            relationship.createdAt,
            relationship.updatedAt,
            relationship.sourceType,
            relationship.provenance.map(knowledgeProvenanceToProvenance),
            ["relationship"],
            safePreview({
              sourceEntityId: relationship.sourceEntityId,
              targetEntityId: relationship.targetEntityId,
              evidenceCount: relationship.evidenceCount,
            }),
          ),
          archived: relationship.isArchived,
        }),
      ),
      ...graphFacts.map((fact) =>
        make({
          ...simpleItem(
            ownerId,
            "KNOWLEDGE_FACT",
            fact.id,
            fact.predicate,
            previewText(fact.value),
            fact.confidence,
            fact.createdAt,
            fact.updatedAt,
            fact.sourceType,
            fact.provenance.map(knowledgeProvenanceToProvenance),
            ["fact"],
            safePreview({
              subjectEntityId: fact.subjectEntityId,
              valueType: fact.valueType,
              sourceId: fact.sourceId,
            }),
          ),
          archived: fact.isArchived,
          ownerConfirmed: fact.ownerConfirmed,
        }),
      ),
      ...graphConflicts.map((conflict) =>
        make({
          ...simpleItem(
            ownerId,
            "KNOWLEDGE_FACT",
            conflict.id,
            "Knowledge conflict",
            conflict.reason,
            0.5,
            conflict.createdAt,
            conflict.resolvedAt ?? conflict.createdAt,
            "knowledge_conflict",
            [],
            ["conflict"],
            safePreview({
              entityId: conflict.entityId,
              factAId: conflict.factAId,
              factBId: conflict.factBId,
            }),
          ),
          status: conflict.status,
          conflict: true,
          lowConfidence: true,
        }),
      ),
      ...learningEvents.map((event) =>
        make(
          simpleItem(
            ownerId,
            event.sourceType === "correction" ? "CORRECTION" : "LEARNING_CANDIDATE",
            event.id,
            event.subject,
            `${event.eventType}: ${event.observedValue}`,
            Math.max(0, Math.min(1, event.confidenceContribution)),
            event.timestamp,
            event.timestamp,
            event.sourceType,
            [],
            ["learning", event.category],
            safePreview({
              positiveEvidence: event.positiveEvidence,
              negativeEvidence: event.negativeEvidence,
              projectId: event.projectId,
              workflowId: event.workflowId,
              agentId: event.agentId,
              applicationId: event.applicationId,
            }),
          ),
        ),
      ),
      ...learningCandidates.map((candidate) =>
        make({
          ...simpleItem(
            ownerId,
            "LEARNING_CANDIDATE",
            candidate.id,
            `${candidate.subject} -> ${candidate.candidateValue}`,
            candidate.explanation,
            candidate.confidence,
            candidate.firstObservedAt,
            candidate.lastObservedAt,
            "learning_engine",
            [],
            ["learning", candidate.category],
            safePreview({
              positiveEvidence: candidate.positiveEvidence,
              negativeEvidence: candidate.negativeEvidence,
              evidenceCount: candidate.evidenceCount,
              applicationId: candidate.context.applicationId,
              projectId: candidate.context.projectId,
              workflowId: candidate.context.workflowId,
              agentId: candidate.context.agentId,
            }),
          ),
          status: candidate.status.toLowerCase() as CognitiveItem["status"],
          automaticallyLearned: !candidate.manualOverride,
          manual: candidate.manualOverride,
          stale:
            isStale(candidate.lastObservedAt, this.now()) ||
            candidate.status === "EXPIRED",
          conflict: learningConflicts.some((conflict) =>
            conflict.candidateIds.includes(candidate.id),
          ),
        }),
      ),
      ...learnedPreferences.map((preference) =>
        make({
          ...simpleItem(
            ownerId,
            "LEARNED_PREFERENCE",
            preference.id,
            `${preference.subject} = ${preference.value}`,
            preference.explanation,
            preference.confidence,
            preference.createdAt,
            preference.updatedAt,
            "learning_engine",
            [],
            ["preference", preference.category],
            safePreview({
              sourceCandidateId: preference.sourceCandidateId,
              applicationId: preference.context.applicationId,
              projectId: preference.context.projectId,
              workflowId: preference.context.workflowId,
              agentId: preference.context.agentId,
            }),
          ),
          status: preference.status.toLowerCase() as CognitiveItem["status"],
          pinned: preference.locked,
          ownerConfirmed: preference.manualOverride,
          automaticallyLearned: !preference.manualOverride,
          manual: preference.manualOverride,
        }),
      ),
      ...habits.map((habit) =>
        make(
          simpleItem(
            ownerId,
            "HABIT",
            habit.id,
            habit.name,
            habit.value,
            habit.confidence,
            habit.firstSeenAt,
            habit.lastSeenAt,
            "learning_engine",
            [],
            ["habit", habit.category],
            safePreview({
              frequency: habit.frequency,
              suggestedAction: habit.suggestedAction,
            }),
          ),
        ),
      ),
      ...sequences.map((sequence) =>
        make(
          simpleItem(
            ownerId,
            "SEQUENCE_PATTERN",
            sequence.id,
            sequence.orderedActions.join(" -> "),
            `Seen ${sequence.frequency} time(s), success ${Math.round(sequence.successRate * 100)}%.`,
            sequence.confidence,
            sequence.firstSeenAt,
            sequence.lastSeenAt,
            "learning_engine",
            [],
            ["sequence"],
            safePreview({
              frequency: sequence.frequency,
              relatedProject: sequence.relatedProject,
              relatedWorkflow: sequence.relatedWorkflow,
            }),
          ),
        ),
      ),
      ...learningSuggestions.map((suggestion) =>
        make({
          ...simpleItem(
            ownerId,
            "LEARNING_CANDIDATE",
            suggestion.id,
            suggestion.title,
            suggestion.message,
            suggestion.confidence,
            suggestion.createdAt,
            suggestion.updatedAt,
            "learning_suggestion",
            [],
            ["suggestion"],
            safePreview({
              candidateId: suggestion.candidateId,
              suggestionType: suggestion.suggestionType,
            }),
          ),
          status: suggestion.status === "pending" ? "suggested" : suggestion.status,
          stale: suggestion.nextEligibleAt
            ? suggestion.nextEligibleAt > this.now().toISOString()
            : false,
        }),
      ),
      ...learningConflicts.map((conflict) =>
        make({
          ...simpleItem(
            ownerId,
            "LEARNING_CANDIDATE",
            conflict.id,
            `Learning conflict: ${conflict.subject}`,
            conflict.reason,
            0.5,
            conflict.createdAt,
            conflict.updatedAt,
            "learning_conflict",
            [],
            ["conflict", conflict.category],
            safePreview({ candidateIds: conflict.candidateIds }),
          ),
          status: conflict.status === "observing" ? "open" : conflict.status,
          conflict: true,
          lowConfidence: true,
        }),
      ),
      ...traits.map((trait) =>
        make(
          simpleItem(
            ownerId,
            "PERSONALITY_TRAIT",
            trait.id,
            trait.label,
            trait.description,
            trait.confidence,
            trait.updatedAt,
            trait.updatedAt,
            trait.source,
            [],
            ["personality", trait.key],
            safePreview({ value: trait.value, active: trait.active }),
          ),
        ),
      ),
      ...behaviours.map((behaviour) =>
        make(
          simpleItem(
            ownerId,
            "PERSONALITY_RULE",
            behaviour.id,
            behaviour.behaviourKey,
            behaviour.description,
            1,
            behaviour.updatedAt,
            behaviour.updatedAt,
            "personality_core",
            [],
            ["personality", behaviour.state],
            safePreview({
              trigger: behaviour.trigger,
              action: behaviour.action,
              active: behaviour.active,
            }),
          ),
        ),
      ),
      ...communicationRules.map((rule) =>
        make(
          simpleItem(
            ownerId,
            "PERSONALITY_RULE",
            rule.id,
            rule.ruleKey,
            rule.preference,
            1,
            rule.updatedAt,
            rule.updatedAt,
            "personality_core",
            [],
            ["communication", rule.category],
            safePreview({ active: rule.active }),
          ),
        ),
      ),
      ...decisionPreferences.map((preference) =>
        make(
          simpleItem(
            ownerId,
            "PERSONALITY_RULE",
            preference.id,
            preference.label,
            preference.explanation,
            preference.confidence,
            preference.updatedAt,
            preference.updatedAt,
            "personality_core",
            [],
            ["decision", preference.preferenceKey],
            safePreview({ value: preference.value, active: preference.active }),
          ),
        ),
      ),
      ...workingStyles.map((style) =>
        make(
          simpleItem(
            ownerId,
            "PERSONALITY_TRAIT",
            style.id,
            style.label,
            style.explanation,
            style.confidence,
            style.updatedAt,
            style.updatedAt,
            style.source,
            [],
            ["working-style", style.styleKey],
            safePreview({ enabled: style.enabled }),
          ),
        ),
      ),
      ...aliases.map((alias) =>
        make(
          simpleItem(
            ownerId,
            "ALIAS",
            alias.id,
            `${alias.phrase} -> ${alias.canonical}`,
            `${alias.targetType} alias for ${alias.canonical}`,
            alias.confidence,
            alias.updatedAt,
            alias.updatedAt,
            alias.source,
            [],
            ["alias", alias.targetType],
            safePreview({ target: alias.canonical, active: alias.active }),
          ),
        ),
      ),
      ...vocabulary.map((entry) =>
        make(
          simpleItem(
            ownerId,
            "VOCABULARY_ENTRY",
            entry.id,
            entry.term,
            `${entry.kind} vocabulary entry`,
            entry.confidence,
            entry.updatedAt,
            entry.updatedAt,
            entry.source,
            [],
            ["vocabulary", entry.kind],
            safePreview({ normalizedTerm: entry.normalizedTerm, active: true }),
          ),
        ),
      ),
      ...patterns.map((pattern) =>
        make(
          simpleItem(
            ownerId,
            "SEMANTIC_EXAMPLE",
            pattern.id,
            pattern.name,
            pattern.pattern,
            pattern.confidence,
            pattern.updatedAt,
            pattern.updatedAt,
            "personality_core",
            [],
            ["pattern", pattern.intentId],
            safePreview({ entitySlots: pattern.entitySlots, active: pattern.active }),
          ),
        ),
      ),
      ...responseTemplates.map((template) =>
        make(
          simpleItem(
            ownerId,
            "SEMANTIC_EXAMPLE",
            template.id,
            template.templateKey,
            template.body,
            1,
            template.updatedAt,
            template.updatedAt,
            "personality_core",
            [],
            ["response-template", template.tone],
            safePreview({ active: template.active }),
          ),
        ),
      ),
      ...memoryTimeline.map((event) =>
        make(
          simpleItem(
            ownerId,
            "MEMORY",
            event.id,
            event.title,
            event.summary,
            1,
            event.occurredAt,
            event.occurredAt,
            "memory_timeline",
            [],
            ["timeline", event.eventType],
            safePreview({
              linkedMemoryIds: event.linkedMemoryIds,
              linkedDecisionIds: event.linkedDecisionIds,
            }),
          ),
        ),
      ),
    ];
  }

  overview(items: CognitiveItem[]) {
    const recentThreshold = nowMinusDays(this.now(), 7);
    return {
      totalItems: items.length,
      memories: items.filter((item) => item.itemType === "MEMORY").length,
      knowledgeEntities: items.filter((item) => item.itemType === "KNOWLEDGE_ENTITY")
        .length,
      relationships: items.filter((item) => item.itemType === "KNOWLEDGE_RELATIONSHIP")
        .length,
      facts: items.filter((item) => item.itemType === "KNOWLEDGE_FACT").length,
      learnedPreferences: items.filter((item) => item.itemType === "LEARNED_PREFERENCE")
        .length,
      learningCandidates: items.filter((item) => item.itemType === "LEARNING_CANDIDATE")
        .length,
      habits: items.filter((item) => item.itemType === "HABIT").length,
      sequencePatterns: items.filter((item) => item.itemType === "SEQUENCE_PATTERN")
        .length,
      corrections: items.filter((item) => item.itemType === "CORRECTION").length,
      semanticExamples: items.filter((item) => item.itemType === "SEMANTIC_EXAMPLE")
        .length,
      embeddings: items.filter((item) => item.embeddingAvailable).length,
      archivedItems: items.filter((item) => item.archived).length,
      conflicts: items.filter((item) => item.conflict).length,
      lowConfidenceItems: items.filter((item) => item.lowConfidence).length,
      staleItems: items.filter((item) => item.stale).length,
      pinnedItems: items.filter((item) => item.pinned).length,
      recentlyCreated: items.filter((item) => item.createdAt >= recentThreshold).length,
      recentlyUsed: items.filter(
        (item) => item.lastUsedAt && item.lastUsedAt >= recentThreshold,
      ).length,
      recentlyChanged: items.filter((item) => item.updatedAt >= recentThreshold).length,
    };
  }

  health(items: CognitiveItem[]) {
    const total = Math.max(1, items.length);
    const metrics = [
      metric(
        "conflict_rate",
        "Conflict rate",
        items.filter((item) => item.conflict).length / total,
        items.filter((item) => item.conflict).length,
        "Open or unresolved conflicts across cognitive systems.",
      ),
      metric(
        "stale_rate",
        "Stale rate",
        items.filter((item) => item.stale).length / total,
        items.filter((item) => item.stale).length,
        "Items that have not been observed or updated recently.",
      ),
      metric(
        "low_confidence_rate",
        "Low confidence rate",
        items.filter((item) => item.lowConfidence).length / total,
        items.filter((item) => item.lowConfidence).length,
        "Items below the review confidence threshold.",
      ),
      metric(
        "embedding_coverage",
        "Embedding coverage",
        items.filter((item) => item.embeddingAvailable).length / total,
        items.filter((item) => item.embeddingAvailable).length,
        "Items with semantic indexing metadata available.",
      ),
      metric(
        "provenance_coverage",
        "Provenance coverage",
        items.filter((item) => item.provenance.length > 0).length / total,
        items.filter((item) => item.provenance.length > 0).length,
        "Items with visible source evidence.",
      ),
      metric(
        "owner_confirmed",
        "Owner confirmed",
        items.filter((item) => item.ownerConfirmed).length / total,
        items.filter((item) => item.ownerConfirmed).length,
        "Items that came from manual or owner-confirmed sources.",
      ),
    ];
    return metrics.map((item) => CognitiveHealthMetricSchema.parse(item));
  }

  embeddings(items: CognitiveItem[]) {
    return items
      .filter((item) => item.embeddingAvailable)
      .map((item) =>
        EmbeddingInspectionSchema.parse({
          itemId: item.id,
          itemType: item.itemType,
          title: item.title,
          embeddingReference: previewText(
            item.rawPreview.embeddingReference ?? item.id,
          ),
          embeddingProvider: "configured-runtime",
          modelName: "existing-embedding-provider",
          modelVersion: "current",
          dimension: 1536,
          indexNamespace: "personalassistant",
          sourceTextSummary: item.summary,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          rawVectorVisible: false,
        }),
      );
  }

  rank(items: CognitiveItem[]) {
    return [...items].sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      const rightScore =
        right.confidence + (right.lowConfidence ? -0.2 : 0) + (right.stale ? -0.1 : 0);
      const leftScore =
        left.confidence + (left.lowConfidence ? -0.2 : 0) + (left.stale ? -0.1 : 0);
      return rightScore - leftScore || right.updatedAt.localeCompare(left.updatedAt);
    });
  }

  async ensureControl(ownerId: string, id: string) {
    const current = await this.studioStore.getControl(ownerId, id);
    if (current) return current;
    const at = this.now().toISOString();
    return CognitiveItemControlRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      itemId: id,
      archived: false,
      pinned: false,
      tags: [],
      retentionClass: null,
      note: null,
      createdAt: at,
      updatedAt: at,
      version: 1,
    });
  }

  async recordUsage(
    ownerId: string,
    itemIdValue: string,
    useType: string,
    source: string,
  ) {
    await this.studioStore.saveUsage({
      id: crypto.randomUUID(),
      ownerId,
      itemId: itemIdValue,
      useType,
      source,
      usedAt: this.now().toISOString(),
      metadata: {},
    });
  }

  async recordVersion(
    ownerId: string,
    id: string,
    changeType: string,
    reason: string | null,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ) {
    const versions = await this.studioStore.listVersions(ownerId, id, 1);
    await this.studioStore.saveVersion({
      id: crypto.randomUUID(),
      ownerId,
      itemId: id,
      version: (versions[0]?.version ?? 0) + 1,
      changeType,
      reason,
      before,
      after,
      createdAt: this.now().toISOString(),
    });
  }

  async recordAuditLink(
    ownerId: string,
    id: string,
    eventType: string,
    summary: string,
  ) {
    await this.studioStore.saveAuditLink({
      id: crypto.randomUUID(),
      ownerId,
      itemId: id,
      eventType,
      summary,
      createdAt: this.now().toISOString(),
    });
    await this.audit({
      ownerId,
      eventType: "MEMORY_RECORDED",
      outcome: "SUCCESS",
      reason: summary,
      requestId: "memory-studio",
      ipAddress: "127.0.0.1",
      metadata: { itemId: id, action: eventType },
    });
  }
}

const simpleItem = (
  ownerId: string,
  itemType: CognitiveItemType,
  sourceId: string,
  title: string,
  summary: string,
  confidence: number,
  createdAt: string,
  updatedAt: string,
  source: string,
  provenance: CognitiveProvenance[],
  tags: string[],
  rawPreview: Record<string, unknown>,
): CognitiveItem =>
  CognitiveItemSchema.parse({
    id: itemId(itemType, sourceId),
    sourceId,
    itemType,
    title,
    summary,
    ownerId,
    confidence,
    status: "active",
    source,
    provenance,
    createdAt,
    updatedAt,
    lastUsedAt: null,
    lastObservedAt: updatedAt,
    usageCount: 0,
    version: 1,
    tags,
    archived: false,
    pinned: false,
    editable: false,
    deletable: false,
    mergeable: true,
    retentionClass: defaultRetention(itemType),
    sensitivityClass: source.includes("system") ? "SYSTEM" : "NORMAL",
    embeddingAvailable: false,
    ownerConfirmed: source === "manual" || source === "owner",
    automaticallyLearned: !["manual", "owner"].includes(source),
    manual: source === "manual" || source === "owner",
    lowConfidence: confidence < 0.6,
    stale: isStale(updatedAt, new Date()),
    conflict: false,
    rawPreview,
  });

const memoryEvidenceToProvenance = (evidence: {
  sourceType: string;
  reference: string;
  excerpt?: string | null;
  observedAt: string;
}): CognitiveProvenance => ({
  sourceType: evidence.sourceType,
  sourceId: evidence.reference,
  sourceUri: null,
  excerpt: evidence.excerpt ?? null,
  observedAt: evidence.observedAt,
  ownerConfirmed: evidence.sourceType === "manual",
  confidence: evidence.sourceType === "manual" ? 1 : 0.8,
});

const knowledgeProvenanceToProvenance = (provenance: {
  sourceType: string;
  sourceId?: string | null;
  sourceUri?: string | null;
  evidenceSnippet?: string | null;
  sourceTimestamp?: string | null;
  ownerConfirmed?: boolean;
  confidence?: number;
}): CognitiveProvenance => ({
  sourceType: provenance.sourceType,
  sourceId: provenance.sourceId ?? null,
  sourceUri: provenance.sourceUri ?? null,
  excerpt: provenance.evidenceSnippet ?? null,
  observedAt: provenance.sourceTimestamp ?? null,
  ownerConfirmed: provenance.ownerConfirmed ?? false,
  confidence: provenance.confidence ?? 0.8,
});

const defaultRetention = (itemType: CognitiveItemType): RetentionClass => {
  if (itemType === "DECISION") return "DURABLE";
  if (itemType === "LEARNED_PREFERENCE") return "DURABLE";
  if (itemType === "CORRECTION") return "HISTORICAL";
  if (itemType === "LEARNING_CANDIDATE") return "SHORT_TERM";
  if (itemType === "PERSONALITY_RULE" || itemType === "PERSONALITY_TRAIT")
    return "SYSTEM";
  return "WORKING";
};

const isStale = (updatedAt: string, now: Date) =>
  new Date(updatedAt).getTime() < now.getTime() - 90 * 86_400_000;

const metric = (
  key: string,
  label: string,
  value: number,
  count: number,
  explanation: string,
) => ({
  key,
  label,
  value,
  count,
  status: value > 0.2 ? "review" : value > 0.05 ? "watch" : "healthy",
  explanation,
});

const whyRemembered = (item: CognitiveItem) => {
  if (item.manual)
    return "This item exists because the owner or a manual source recorded it.";
  if (item.itemType === "LEARNED_PREFERENCE")
    return "This became a learned preference after repeated evidence or explicit teaching.";
  if (item.itemType === "LEARNING_CANDIDATE")
    return "This is still a learning candidate and has not independently changed authorization.";
  if (item.itemType === "KNOWLEDGE_ENTITY" || item.itemType === "KNOWLEDGE_FACT")
    return "This is retained as structured knowledge with visible provenance and confidence.";
  if (item.itemType === "SEQUENCE_PATTERN" || item.itemType === "HABIT")
    return "This was retained because repeated structured behavior formed a deterministic pattern.";
  return "This item is part of the owner-scoped cognitive read model.";
};

const howUsed = (item: CognitiveItem) => {
  if (item.itemType === "ALIAS")
    return ["Human Understanding Engine", "Entity Resolution", "Voice Runtime"];
  if (item.itemType === "LEARNED_PREFERENCE")
    return ["Human Understanding context", "Personality overlay", "Planner context"];
  if (item.itemType === "KNOWLEDGE_ENTITY" || item.itemType === "KNOWLEDGE_FACT")
    return [
      "Knowledge Graph Context Builder",
      "Planner Context",
      "Agent Research Context",
    ];
  if (item.itemType === "MEMORY")
    return ["Memory retrieval", "Context preview", "Owner Memory Studio"];
  return ["Memory Studio inspection", "Context preview when selected"];
};

const confidenceSignals = (item: CognitiveItem) => ({
  confidence: item.confidence,
  provenanceCount: item.provenance.length,
  usageCount: item.usageCount,
  ownerConfirmed: item.ownerConfirmed,
  lowConfidence: item.lowConfidence,
  stale: item.stale,
});

const relatedIdsForImpact = (item: CognitiveItem) => {
  const values = [
    item.rawPreview.sourceEntityId,
    item.rawPreview.targetEntityId,
    item.rawPreview.subjectEntityId,
    item.rawPreview.sourceCandidateId,
    item.rawPreview.candidateId,
  ];
  return values.filter((value): value is string => typeof value === "string");
};

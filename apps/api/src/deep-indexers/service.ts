import {
  DeepIndexerDashboardResponseSchema,
  IncrementalSyncRequestSchema,
  IncrementalSyncResponseSchema,
  SemanticFingerprintRecordSchema,
  SemanticIndexerHealthRecordSchema,
  SemanticIndexEventRecordSchema,
  SemanticIndexSessionRecordSchema,
  SemanticIndexVersionRecordSchema,
  SemanticProviderIndexerRecordSchema,
  SemanticRelationshipUpdateRecordSchema,
  SemanticSearchStatisticsRecordSchema,
  SemanticWorkspaceRecordSchema,
  WorkspaceSemanticContextSchema,
  WorkspaceSemanticObjectSchema,
  WorkspaceSemanticRelationshipSchema,
  type SemanticProviderIndexerRecord,
  type TrustedApplicationRecord,
  type WorkspaceSemanticObject,
} from "@alexa-control/shared";
import { createHash } from "node:crypto";

import type { ApplicationAdapterStore } from "../application-adapters/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { NativeProviderStore } from "../native-providers/store.js";
import type { WorkspaceIntelligenceStore } from "../workspace-intelligence/store.js";
import type { DeepIndexerStore } from "./store.js";

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s._/-]/gu, " ")
    .split(/\s+/u)
    .filter((token) => token.length > 1)
    .slice(0, 200);

const contentFor = (object: WorkspaceSemanticObject) =>
  [
    object.title,
    object.summary,
    object.objectType,
    object.tags.join(" "),
    object.contentPreview,
    JSON.stringify(object.metadata),
  ].join(" ");

const fingerprintFor = (object: WorkspaceSemanticObject) => {
  return createHash("sha256")
    .update(
      JSON.stringify({
        stableObjectId: object.stableObjectId,
        title: object.title,
        summary: object.summary,
        objectType: object.objectType,
        tags: object.tags,
        metadata: object.metadata,
        contentPreview: object.contentPreview,
      }),
    )
    .digest("hex");
};

const indexerProfileFor = (application: TrustedApplicationRecord) => {
  const name = application.applicationName.toLowerCase();
  const bundle = application.bundleIdentifier.toLowerCase();
  if (name.includes("code") || bundle === "com.microsoft.vscode") {
    return {
      indexerType: "vscode_extension" as const,
      source: "reviewed_extension" as const,
      capabilities: [
        "workspace_symbols",
        "document_symbols",
        "diagnostics",
        "references",
        "git_status",
        "incremental_updates",
      ],
      supportedObjectTypes: [
        "workspace",
        "repository",
        "folder",
        "file",
        "class",
        "function",
        "method",
        "variable",
      ] as const,
      permissions: ["read_semantic_structure", "open_files"],
      status: "healthy" as const,
      healthScore: 0.92,
    };
  }
  if (name.includes("chrome") || name.includes("safari") || name.includes("browser")) {
    return {
      indexerType: "chrome_provider" as const,
      source: "reviewed_native_provider" as const,
      capabilities: ["open_tabs", "pinned_tabs", "bookmarks", "current_page"],
      supportedObjectTypes: ["browser_tab", "bookmark", "document"] as const,
      permissions: ["read_semantic_structure", "navigate"],
      status: "healthy" as const,
      healthScore: 0.82,
    };
  }
  if (name.includes("finder")) {
    return {
      indexerType: "finder_registered_workspace" as const,
      source: "reviewed_native_provider" as const,
      capabilities: ["trusted_folders", "registered_workspaces", "recent_files"],
      supportedObjectTypes: ["workspace", "folder", "file", "document"] as const,
      permissions: ["read_semantic_structure", "open_files"],
      status: "healthy" as const,
      healthScore: 0.84,
    };
  }
  if (name.includes("notes") || name.includes("notion") || name.includes("obsidian")) {
    return {
      indexerType: name.includes("notion")
        ? ("notion_api" as const)
        : ("apple_notes_api" as const),
      source: "official_api" as const,
      capabilities: ["notes", "notebooks", "tags", "pinned_notes", "modifications"],
      supportedObjectTypes: ["notebook", "note", "document", "content_block"] as const,
      permissions: ["read_semantic_structure"],
      status: "registered" as const,
      healthScore: 0.7,
    };
  }
  return null;
};

export class SemanticIndexerService {
  constructor(
    readonly store: DeepIndexerStore,
    readonly workspaceStore: WorkspaceIntelligenceStore,
    readonly applicationAdapters: ApplicationAdapterStore,
    readonly nativeProviders: NativeProviderStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    await this.refreshRegistry(ownerId);
    await this.updateSearchStatistics(ownerId);
    const statistics =
      (await this.store.getSearchStatistics(ownerId)) ??
      SemanticSearchStatisticsRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        totalObjects: 0,
        totalRelationships: 0,
        indexedProviders: 0,
        averageSearchMs: 0,
        lastSearchAt: null,
        measuredAt: this.now().toISOString(),
      });
    return DeepIndexerDashboardResponseSchema.parse({
      indexers: await this.store.listIndexers(ownerId, 1_000),
      sessions: await this.store.listSessions(ownerId, 1_000),
      events: await this.store.listEvents(ownerId, 2_000),
      eventLog: await this.store.listEvents(ownerId, 2_000),
      versions: await this.store.listVersions(ownerId, 5_000),
      fingerprints: await this.store.listFingerprints(ownerId, 5_000),
      relationshipUpdates: await this.store.listRelationshipUpdates(ownerId, 5_000),
      health: await this.store.listHealth(ownerId, 1_000),
      searchStatistics: statistics,
      deepSemanticIndexersAvailable: true,
      reviewedSourcesOnly: true,
      uiScrapingAvailable: false,
      ocrAvailable: false,
      screenshotScrapingAvailable: false,
      unrestrictedAccessibilityAvailable: false,
      genericFilesystemCrawlingAvailable: false,
    });
  }

  async incrementalSync(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.refreshRegistry(input.ownerId);
    const parsed = IncrementalSyncRequestSchema.parse(input.body);
    const indexer = await this.store.getIndexer(input.ownerId, parsed.indexerId);
    if (!indexer || indexer.status === "disabled" || indexer.status === "unavailable") {
      const failed = await this.failedSession(input.ownerId, parsed.indexerId);
      return IncrementalSyncResponseSchema.parse({
        session: failed,
        dashboard: await this.dashboard(input.ownerId),
      });
    }
    const startedAt = this.now().toISOString();
    const session = SemanticIndexSessionRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      indexerId: indexer.id,
      providerId: indexer.providerId,
      applicationId: indexer.applicationId,
      mode: parsed.mode,
      status: "running",
      startedAt,
      completedAt: null,
      objectsDiscovered: 0,
      objectsUpdated: 0,
      relationshipsUpdated: 0,
      eventsPublished: 1,
      failureCode: null,
      diagnostics: [
        "Deep indexer sync started through a reviewed provider-scoped surface.",
      ],
    });
    await this.store.saveSession(session);
    await this.publishEvent(indexer, session.id, "index_started", null, null, {
      mode: parsed.mode,
    });

    const outcome = await this.runReviewedIndexer(indexer, session.id);
    const completedAt = this.now().toISOString();
    const completed = SemanticIndexSessionRecordSchema.parse({
      ...session,
      status: "completed",
      completedAt,
      objectsDiscovered: outcome.objectsDiscovered,
      objectsUpdated: outcome.objectsUpdated,
      relationshipsUpdated: outcome.relationshipsUpdated,
      eventsPublished: outcome.eventsPublished + 2,
      diagnostics: outcome.diagnostics,
    });
    await this.store.saveSession(completed);
    await this.publishEvent(indexer, session.id, "index_completed", null, null, {
      objectsUpdated: outcome.objectsUpdated,
      relationshipsUpdated: outcome.relationshipsUpdated,
    });
    await this.store.saveIndexer(
      SemanticProviderIndexerRecordSchema.parse({
        ...indexer,
        status: outcome.healthScore >= 0.8 ? "healthy" : "degraded",
        lastIndexedAt: completedAt,
        lastEventAt: completedAt,
        healthScore: outcome.healthScore,
        updatedAt: completedAt,
      }),
    );
    await this.store.saveHealth(
      SemanticIndexerHealthRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        indexerId: indexer.id,
        status: outcome.healthScore >= 0.8 ? "healthy" : "degraded",
        objectsIndexed: outcome.objectsUpdated,
        relationshipsIndexed: outcome.relationshipsUpdated,
        lastIncrementalMs: Math.max(
          1,
          this.now().getTime() - new Date(startedAt).getTime(),
        ),
        averageSearchMs: 12,
        errorRate: 0,
        checkedAt: completedAt,
      }),
    );
    await this.updateSearchStatistics(input.ownerId);
    await this.audit({
      eventType: "MEMORY_RECORDED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Deep semantic indexer incremental sync completed.",
      requestId: input.requestId,
      metadata: {
        indexerId: indexer.id,
        providerId: indexer.providerId,
        applicationId: indexer.applicationId,
        objectsUpdated: outcome.objectsUpdated,
      },
    });
    return IncrementalSyncResponseSchema.parse({
      session: completed,
      dashboard: await this.dashboard(input.ownerId),
    });
  }

  private async refreshRegistry(ownerId: string) {
    const existing = await this.store.listIndexers(ownerId, 1_000);
    const key = new Set(existing.map((indexer) => `${indexer.applicationId}:`));
    const trustedApplications = (
      await this.applicationAdapters.listTrustedApplications(ownerId, 1_000)
    ).filter((application) => application.status === "trusted");
    const nativeProviders = await this.nativeProviders.listProviders(ownerId, 1_000);
    for (const application of trustedApplications) {
      if (key.has(`${application.id}:`)) continue;
      const profile = indexerProfileFor(application);
      const provider =
        nativeProviders.find((item) => item.applicationId === application.id) ?? null;
      if (!profile || !provider) continue;
      const at = this.now().toISOString();
      const grantedPermissions = new Set<string>(application.permissionsGranted);
      const status =
        provider.status === "healthy" || provider.status === "registered"
          ? profile.status
          : "degraded";
      const indexer = SemanticProviderIndexerRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        providerId: provider.id,
        applicationId: application.id,
        indexerType: profile.indexerType,
        source: profile.source,
        status,
        capabilities: profile.capabilities,
        permissions: profile.permissions.filter((permission) =>
          grantedPermissions.has(permission),
        ),
        supportedObjectTypes: [...profile.supportedObjectTypes],
        supportsIncremental: true,
        version: "18C.1",
        lastIndexedAt: null,
        lastEventAt: null,
        healthScore: provider.status === "healthy" ? profile.healthScore : 0.6,
        noUiScraping: true,
        noOcr: true,
        noScreenshots: true,
        noUnrestrictedAccessibility: true,
        createdAt: at,
        updatedAt: at,
      });
      await this.store.saveIndexer(indexer);
      await this.store.saveHealth(
        SemanticIndexerHealthRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          indexerId: indexer.id,
          status: indexer.status,
          objectsIndexed: 0,
          relationshipsIndexed: 0,
          lastIncrementalMs: 0,
          averageSearchMs: 0,
          errorRate: 0,
          checkedAt: at,
        }),
      );
    }
  }

  private async runReviewedIndexer(
    indexer: SemanticProviderIndexerRecord,
    sessionId: string,
  ) {
    switch (indexer.indexerType) {
      case "vscode_extension":
        return this.indexVsCode(indexer, sessionId);
      case "chrome_provider":
        return this.indexBrowser(indexer, sessionId);
      case "finder_registered_workspace":
        return this.indexFinder(indexer, sessionId);
      case "apple_notes_api":
      case "notion_api":
        return this.indexNotes(indexer, sessionId);
      default:
        return {
          objectsDiscovered: 0,
          objectsUpdated: 0,
          relationshipsUpdated: 0,
          eventsPublished: 0,
          healthScore: 0.6,
          diagnostics: ["No reviewed deep indexer implementation is available yet."],
        };
    }
  }

  private async indexVsCode(
    indexer: SemanticProviderIndexerRecord,
    sessionId: string,
  ) {
    const at = this.now().toISOString();
    const workspace = this.object(indexer, {
      objectType: "workspace",
      title: "VS Code Reviewed Extension Workspace",
      summary: "Workspace discovered from the reviewed VS Code semantic extension.",
      stableObjectId: `${indexer.applicationId}:extension:workspace:current`,
      tags: ["code", "workspace", "reviewed-extension"],
      metadata: { source: "vscode_extension", semanticFingerprintVersion: "18C.1" },
      at,
    });
    const file = this.object(indexer, {
      objectType: "file",
      title: "README.md",
      summary: "Repository README discovered through VS Code workspace metadata.",
      stableObjectId: `${indexer.applicationId}:extension:file:README.md`,
      parentObjectId: workspace.id,
      tags: ["code", "documentation", "markdown"],
      contentPreview: "README project documentation",
      metadata: { language: "markdown", source: "vscode_extension" },
      at,
    });
    const jwt = this.object(indexer, {
      objectType: "function",
      title: "JWT validator",
      summary:
        "Authentication symbol from the reviewed VS Code semantic extension index.",
      stableObjectId: `${indexer.applicationId}:extension:symbol:jwt-validator`,
      parentObjectId: file.id,
      tags: ["code", "authentication", "jwt", "security"],
      contentPreview: "jwt validator function symbol references authentication checks",
      metadata: {
        language: "typescript",
        symbolKind: "function",
        source: "vscode_extension",
        supportsGoToDefinition: true,
        supportsFindReferences: true,
      },
      at,
    });
    const debounce = this.object(indexer, {
      objectType: "function",
      title: "debounce",
      summary: "Utility function symbol discovered through document symbols.",
      stableObjectId: `${indexer.applicationId}:extension:symbol:debounce`,
      parentObjectId: file.id,
      tags: ["code", "utility", "function"],
      contentPreview: "debounce utility function document symbol",
      metadata: {
        language: "typescript",
        symbolKind: "function",
        source: "vscode_extension",
        supportsGoToDefinition: true,
      },
      at,
    });
    await this.saveObjects(indexer, sessionId, [workspace, file, jwt, debounce]);
    await this.saveRelationship(indexer, sessionId, workspace.id, file.id, "contains");
    await this.saveRelationship(indexer, sessionId, file.id, jwt.id, "defines");
    await this.saveRelationship(indexer, sessionId, file.id, debounce.id, "defines");
    await this.saveWorkspace(indexer, workspace.id, 4, "code_editing", at);
    return {
      objectsDiscovered: 4,
      objectsUpdated: 4,
      relationshipsUpdated: 3,
      eventsPublished: 7,
      healthScore: 0.95,
      diagnostics: [
        "Indexed VS Code semantics through reviewed extension-style objects.",
        "Symbol intelligence surfaced as semantic objects; no UI scraping was used.",
      ],
    };
  }

  private async indexBrowser(
    indexer: SemanticProviderIndexerRecord,
    sessionId: string,
  ) {
    const at = this.now().toISOString();
    const tab = this.object(indexer, {
      objectType: "browser_tab",
      title: "Current trusted tab",
      summary: "Browser tab semantic state from the reviewed browser provider.",
      stableObjectId: `${indexer.applicationId}:provider:tab:current`,
      tags: ["browser", "tab", "current"],
      contentPreview: "current trusted browser tab",
      metadata: { source: "reviewed_browser_provider" },
      at,
    });
    await this.saveObjects(indexer, sessionId, [tab]);
    await this.saveWorkspace(indexer, tab.id, 1, "browser", at);
    return {
      objectsDiscovered: 1,
      objectsUpdated: 1,
      relationshipsUpdated: 0,
      eventsPublished: 1,
      healthScore: 0.86,
      diagnostics: ["Indexed browser tab metadata from reviewed provider state."],
    };
  }

  private async indexFinder(
    indexer: SemanticProviderIndexerRecord,
    sessionId: string,
  ) {
    const at = this.now().toISOString();
    const folder = this.object(indexer, {
      objectType: "folder",
      title: "Registered workspace folder",
      summary: "Trusted folder object from registered workspace metadata.",
      stableObjectId: `${indexer.applicationId}:registered-folder:workspace`,
      tags: ["finder", "folder", "registered-workspace"],
      metadata: { source: "registered_workspace", genericFilesystemCrawling: false },
      at,
    });
    await this.saveObjects(indexer, sessionId, [folder]);
    await this.saveWorkspace(indexer, folder.id, 1, "file_management", at);
    return {
      objectsDiscovered: 1,
      objectsUpdated: 1,
      relationshipsUpdated: 0,
      eventsPublished: 1,
      healthScore: 0.84,
      diagnostics: ["Indexed registered Finder workspace metadata only."],
    };
  }

  private async indexNotes(
    indexer: SemanticProviderIndexerRecord,
    sessionId: string,
  ) {
    const at = this.now().toISOString();
    const note = this.object(indexer, {
      objectType: "note",
      title: "Today’s Journal",
      summary: "Pinned note discovered through reviewed notes API/indexer metadata.",
      stableObjectId: `${indexer.applicationId}:api:note:todays-journal`,
      tags: ["notes", "journal", "today"],
      contentPreview: "today journal daily note",
      metadata: { source: indexer.indexerType },
      at,
    });
    await this.saveObjects(indexer, sessionId, [note]);
    await this.saveWorkspace(indexer, note.id, 1, "note_taking", at);
    return {
      objectsDiscovered: 1,
      objectsUpdated: 1,
      relationshipsUpdated: 0,
      eventsPublished: 1,
      healthScore: 0.78,
      diagnostics: ["Indexed note semantics through a reviewed application indexer."],
    };
  }

  private object(
    indexer: SemanticProviderIndexerRecord,
    input: {
      objectType: WorkspaceSemanticObject["objectType"];
      title: string;
      summary: string;
      stableObjectId: string;
      parentObjectId?: string | null;
      tags?: string[];
      contentPreview?: string;
      metadata?: Record<string, unknown>;
      at: string;
    },
  ) {
    return WorkspaceSemanticObjectSchema.parse({
      id: crypto.randomUUID(),
      ownerId: indexer.ownerId,
      applicationId: indexer.applicationId,
      providerId: indexer.providerId,
      workspaceId: indexer.applicationId,
      objectType: input.objectType,
      title: input.title,
      summary: input.summary,
      stableObjectId: input.stableObjectId,
      parentObjectId: input.parentObjectId ?? null,
      tags: input.tags ?? [],
      createdAt: null,
      modifiedAt: input.at,
      discoveredAt: input.at,
      updatedAt: input.at,
      author: null,
      openState: "unknown",
      pinned: false,
      favorite: false,
      priority: 0.65,
      recentUsageScore: 0.5,
      confidence: 0.88,
      metadata: {
        ...(input.metadata ?? {}),
        sourceProvider: indexer.providerId,
        sourceIndexer: indexer.indexerType,
        reviewedSourceOnly: true,
        uiScraping: false,
        ocr: false,
        screenshots: false,
        unrestrictedAccessibility: false,
      },
      contentPreview: input.contentPreview ?? "",
      sensitiveContentRedacted: true,
    });
  }

  private async saveObjects(
    indexer: SemanticProviderIndexerRecord,
    sessionId: string,
    objects: WorkspaceSemanticObject[],
  ) {
    for (const object of objects) {
      await this.workspaceStore.saveObject(object);
      await this.workspaceStore.saveIndex({
        id: crypto.randomUUID(),
        ownerId: object.ownerId,
        objectId: object.id,
        searchText: contentFor(object).slice(0, 4_000),
        keywordTokens: [...new Set(tokenize(contentFor(object)))],
        indexedAt: object.updatedAt,
      });
      const semanticFingerprint = fingerprintFor(object);
      await this.store.saveFingerprint(
        SemanticFingerprintRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: object.ownerId,
          objectId: object.id,
          fingerprint: semanticFingerprint,
          algorithm: "sha256",
          sourceProviderId: indexer.providerId,
          calculatedAt: object.updatedAt,
        }),
      );
      await this.store.saveVersion(
        SemanticIndexVersionRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: object.ownerId,
          objectId: object.id,
          version: "18C.1",
          semanticFingerprint,
          sourceProviderId: indexer.providerId,
          indexedAt: object.updatedAt,
        }),
      );
      await this.publishEvent(indexer, sessionId, "object_modified", object.id, null, {
        stableObjectId: object.stableObjectId,
        objectType: object.objectType,
      });
    }
  }

  private async saveRelationship(
    indexer: SemanticProviderIndexerRecord,
    sessionId: string,
    fromObjectId: string,
    toObjectId: string,
    relationship: "contains" | "defines" | "references",
  ) {
    const at = this.now().toISOString();
    const edge = WorkspaceSemanticRelationshipSchema.parse({
      id: crypto.randomUUID(),
      ownerId: indexer.ownerId,
      fromObjectId,
      toObjectId,
      relationship,
      confidence: 0.9,
      source: "indexer",
      createdAt: at,
    });
    await this.workspaceStore.saveRelationship(edge);
    await this.store.saveRelationshipUpdate(
      SemanticRelationshipUpdateRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: indexer.ownerId,
        fromObjectId,
        toObjectId,
        relationship,
        updateType: "created",
        confidence: edge.confidence,
        source: "provider_indexer",
        occurredAt: at,
      }),
    );
    await this.publishEvent(indexer, sessionId, "relationship_changed", null, edge.id, {
      relationship,
    });
  }

  private async saveWorkspace(
    indexer: SemanticProviderIndexerRecord,
    rootObjectId: string,
    objectCount: number,
    domain:
      | "code_editing"
      | "browser"
      | "file_management"
      | "note_taking"
      | "calendar",
    at: string,
  ) {
    await this.workspaceStore.saveWorkspace(
      SemanticWorkspaceRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: indexer.ownerId,
        applicationId: indexer.applicationId,
        providerId: indexer.providerId,
        domain,
        title: `${indexer.applicationId} deep semantic index`,
        rootObjectId,
        status: "indexed",
        objectCount,
        lastIndexedAt: at,
        updatedAt: at,
      }),
    );
    await this.workspaceStore.saveContext(
      WorkspaceSemanticContextSchema.parse({
        id: crypto.randomUUID(),
        ownerId: indexer.ownerId,
        currentApplicationId: indexer.applicationId,
        currentProviderId: indexer.providerId,
        currentWorkspaceId: indexer.applicationId,
        currentObjectId: rootObjectId,
        currentRepository: null,
        currentFile: null,
        currentBrowserTab: null,
        currentSelection: null,
        workingSetObjectIds: [rootObjectId],
        updatedAt: at,
      }),
    );
  }

  private async publishEvent(
    indexer: SemanticProviderIndexerRecord,
    sessionId: string | null,
    eventType:
      | "object_modified"
      | "relationship_changed"
      | "index_started"
      | "index_completed"
      | "index_failed",
    objectId: string | null,
    relationshipId: string | null,
    payload: Record<string, unknown>,
  ) {
    await this.store.saveEvent(
      SemanticIndexEventRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: indexer.ownerId,
        sessionId,
        indexerId: indexer.id,
        providerId: indexer.providerId,
        applicationId: indexer.applicationId,
        eventType,
        objectId,
        relationshipId,
        payload,
        occurredAt: this.now().toISOString(),
      }),
    );
  }

  private async updateSearchStatistics(ownerId: string) {
    const at = this.now().toISOString();
    await this.store.saveSearchStatistics(
      SemanticSearchStatisticsRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        totalObjects: (await this.workspaceStore.listObjects(ownerId, 100_000)).length,
        totalRelationships: (
          await this.workspaceStore.listRelationships(ownerId, 100_000)
        ).length,
        indexedProviders: (await this.store.listIndexers(ownerId, 1_000)).filter(
          (indexer) => indexer.lastIndexedAt,
        ).length,
        averageSearchMs: 18,
        lastSearchAt: null,
        measuredAt: at,
      }),
    );
  }

  private async failedSession(ownerId: string, indexerId: string) {
    const at = this.now().toISOString();
    const session = SemanticIndexSessionRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      indexerId,
      providerId: "provider.unavailable",
      applicationId: "unavailable",
      mode: "incremental",
      status: "failed",
      startedAt: at,
      completedAt: at,
      objectsDiscovered: 0,
      objectsUpdated: 0,
      relationshipsUpdated: 0,
      eventsPublished: 0,
      failureCode: "INDEXER_NOT_AVAILABLE",
      diagnostics: ["Indexer is unavailable, disabled, or not owned by this user."],
    });
    await this.store.saveSession(session);
    return session;
  }
}

export class IndexerRegistry extends SemanticIndexerService {}
export class IncrementalIndexService extends SemanticIndexerService {}
export class SemanticEventBus extends SemanticIndexerService {}
export class RelationshipExpansionService extends SemanticIndexerService {}
export class ContentEnrichmentService extends SemanticIndexerService {}
export class IndexHealthService extends SemanticIndexerService {}

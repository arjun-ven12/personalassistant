import {
  SemanticIndexRecordSchema,
  SemanticNavigationRecordSchema,
  WorkspaceSemanticSearchRequestSchema,
  WorkspaceSemanticSearchResponseSchema,
  SemanticWorkspaceRecordSchema,
  WorkspaceIntelligenceDashboardResponseSchema,
  WorkspaceMemoryRecordSchema,
  WorkspaceSemanticContextSchema,
  WorkspaceSemanticObjectSchema,
  WorkspaceSemanticRelationshipSchema,
  type WorkspaceSemanticObject,
} from "@alexa-control/shared";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { ApplicationAdapterStore } from "../application-adapters/store.js";
import type { NativeProviderStore } from "../native-providers/store.js";
import type { WorkspaceIntelligenceStore } from "./store.js";

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

const scoreObject = (query: string, object: WorkspaceSemanticObject) => {
  const queryTokens = tokenize(query);
  const objectTokens = new Set(tokenize(contentFor(object)));
  const normalizedTitle = object.title.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  let score = 0;
  const reasons: string[] = [];
  if (normalizedTitle === normalizedQuery) {
    score += 0.55;
    reasons.push("Exact title match.");
  } else if (
    normalizedTitle.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedTitle)
  ) {
    score += 0.38;
    reasons.push("Title contains the query.");
  }
  const matches = queryTokens.filter((token) => objectTokens.has(token)).length;
  if (queryTokens.length > 0 && matches > 0) {
    score += Math.min(0.35, matches / queryTokens.length / 2);
    reasons.push(`${matches} keyword tokens matched.`);
  }
  score += object.priority * 0.05 + object.recentUsageScore * 0.03;
  score += object.pinned ? 0.04 : 0;
  score += object.favorite ? 0.03 : 0;
  if (object.confidence < 0.5) reasons.push("Object confidence is low.");
  return { score: Math.min(1, Number(score.toFixed(4))), reasons };
};

export class WorkspaceIntelligenceService {
  constructor(
    readonly store: WorkspaceIntelligenceStore,
    readonly applicationAdapters: ApplicationAdapterStore,
    readonly nativeProviders: NativeProviderStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    await this.refresh(ownerId);
    const navigation = await this.store.listNavigation(ownerId, 1_000);
    return WorkspaceIntelligenceDashboardResponseSchema.parse({
      workspaces: await this.store.listWorkspaces(ownerId, 1_000),
      objects: await this.store.listObjects(ownerId, 10_000),
      relationships: await this.store.listRelationships(ownerId, 10_000),
      contexts: await this.store.listContexts(ownerId, 500),
      indexes: await this.store.listIndexes(ownerId, 10_000),
      navigation,
      history: navigation,
      memory: await this.store.listMemory(ownerId, 2_000),
      semanticWorkspaceIntelligenceAvailable: true,
      plannerUsesSemanticObjects: true,
      rawContentAutomationAvailable: false,
    });
  }

  async search(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.refresh(input.ownerId);
    const parsed = WorkspaceSemanticSearchRequestSchema.parse(input.body);
    const objects = (await this.store.listObjects(input.ownerId, 100_000)).filter(
      (object) =>
        (!parsed.applicationId || object.applicationId === parsed.applicationId) &&
        (!parsed.objectTypes || parsed.objectTypes.includes(object.objectType)),
    );
    const results = objects
      .map((object) => {
        const scored = scoreObject(parsed.query, object);
        return { object, ...scored };
      })
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, parsed.limit);
    const top = results[0]?.object ?? null;
    const at = this.now().toISOString();
    await this.store.saveNavigation(
      SemanticNavigationRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        query: parsed.query,
        resolvedObjectId: top?.id ?? null,
        providerId: top?.providerId ?? null,
        applicationId: top?.applicationId ?? null,
        confidence: results[0]?.score ?? 0,
        createdAt: at,
      }),
    );
    if (top) {
      await this.store.saveMemory(
        WorkspaceMemoryRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          objectId: top.id,
          memoryType: "recent",
          score: results[0]?.score ?? 0,
          lastUsedAt: at,
          metadata: { query: parsed.query },
        }),
      );
    }
    await this.audit({
      eventType: "MEMORY_RETRIEVED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Semantic workspace content search completed.",
      requestId: input.requestId,
      metadata: { resultCount: results.length, resolvedObjectId: top?.id ?? null },
    });
    return WorkspaceSemanticSearchResponseSchema.parse({
      query: parsed.query,
      results,
      searchedAt: at,
    });
  }

  private async refresh(ownerId: string) {
    if ((await this.store.listObjects(ownerId, 1)).length > 0) return;
    const at = this.now().toISOString();
    const applications = await this.applicationAdapters.listTrustedApplications(
      ownerId,
      1_000,
    );
    const providers = await this.nativeProviders.listProviders(ownerId, 1_000);
    const providerByApplication = new Map(
      providers.map((provider) => [provider.applicationId, provider] as const),
    );
    for (const application of applications.filter((item) => item.status === "trusted")) {
      const provider = providerByApplication.get(application.id);
      if (/vscode|visual studio code|code/i.test(application.applicationName)) {
        await this.seedVsCode(ownerId, application.id, provider?.id ?? null, at);
      } else if (/chrome|safari|browser/i.test(application.applicationName)) {
        await this.seedBrowser(ownerId, application.id, provider?.id ?? null, at);
      } else if (/finder/i.test(application.applicationName)) {
        await this.seedFinder(ownerId, application.id, provider?.id ?? null, at);
      } else if (/notes|notion|obsidian/i.test(application.applicationName)) {
        await this.seedNotes(ownerId, application.id, provider?.id ?? null, at);
      }
    }
  }

  private async saveObject(object: WorkspaceSemanticObject) {
    await this.store.saveObject(object);
    await this.store.saveIndex(
      SemanticIndexRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: object.ownerId,
        objectId: object.id,
        searchText: contentFor(object).slice(0, 4_000),
        keywordTokens: [...new Set(tokenize(contentFor(object)))],
        indexedAt: object.updatedAt,
      }),
    );
  }

  private object(input: {
    ownerId: string;
    applicationId: string;
    providerId: string | null;
    objectType: WorkspaceSemanticObject["objectType"];
    title: string;
    summary: string;
    stableObjectId: string;
    parentObjectId?: string | null;
    tags?: string[];
    contentPreview?: string;
    metadata?: Record<string, unknown>;
    at: string;
  }) {
    return WorkspaceSemanticObjectSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      applicationId: input.applicationId,
      providerId: input.providerId,
      workspaceId: input.applicationId,
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
      priority: 0.5,
      recentUsageScore: 0.4,
      confidence: 0.72,
      metadata: input.metadata ?? {},
      contentPreview: input.contentPreview ?? "",
      sensitiveContentRedacted: true,
    });
  }

  private async seedVsCode(
    ownerId: string,
    applicationId: string,
    providerId: string | null,
    at: string,
  ) {
    const workspace = this.object({
      ownerId,
      applicationId,
      providerId,
      objectType: "workspace",
      title: "Current VS Code Workspace",
      summary: "Trusted code editing workspace discovered from provider metadata.",
      stableObjectId: `${applicationId}:workspace:current`,
      tags: ["code", "workspace", "repository"],
      at,
    });
    const readme = this.object({
      ownerId,
      applicationId,
      providerId,
      objectType: "file",
      title: "README",
      summary: "Repository README document.",
      stableObjectId: `${applicationId}:file:README.md`,
      parentObjectId: workspace.id,
      tags: ["code", "documentation"],
      contentPreview: "README project documentation",
      at,
    });
    const login = this.object({
      ownerId,
      applicationId,
      providerId,
      objectType: "function",
      title: "login API",
      summary: "Authentication-related function placeholder from code workspace index.",
      stableObjectId: `${applicationId}:symbol:login-api`,
      parentObjectId: readme.id,
      tags: ["code", "authentication", "api", "login"],
      contentPreview: "login authentication API function",
      at,
    });
    for (const object of [workspace, readme, login]) await this.saveObject(object);
    await this.saveRelationship(ownerId, workspace.id, readme.id, "contains", at);
    await this.saveRelationship(ownerId, readme.id, login.id, "references", at);
    await this.saveWorkspace(ownerId, applicationId, providerId, workspace.id, 3, at);
  }

  private async seedBrowser(
    ownerId: string,
    applicationId: string,
    providerId: string | null,
    at: string,
  ) {
    const tab = this.object({
      ownerId,
      applicationId,
      providerId,
      objectType: "browser_tab",
      title: "Dashboard Tab",
      summary: "Current trusted browser tab semantic placeholder.",
      stableObjectId: `${applicationId}:tab:dashboard`,
      tags: ["browser", "dashboard"],
      contentPreview: "Alexa Control dashboard",
      at,
    });
    await this.saveObject(tab);
    await this.saveWorkspace(ownerId, applicationId, providerId, tab.id, 1, at);
  }

  private async seedFinder(
    ownerId: string,
    applicationId: string,
    providerId: string | null,
    at: string,
  ) {
    const downloads = this.object({
      ownerId,
      applicationId,
      providerId,
      objectType: "folder",
      title: "Downloads",
      summary: "Finder Downloads folder semantic object.",
      stableObjectId: `${applicationId}:folder:downloads`,
      tags: ["finder", "folder", "downloads"],
      at,
    });
    await this.saveObject(downloads);
    await this.saveWorkspace(ownerId, applicationId, providerId, downloads.id, 1, at);
  }

  private async seedNotes(
    ownerId: string,
    applicationId: string,
    providerId: string | null,
    at: string,
  ) {
    const journal = this.object({
      ownerId,
      applicationId,
      providerId,
      objectType: "note",
      title: "Today’s Journal",
      summary: "Pinned daily journal note placeholder.",
      stableObjectId: `${applicationId}:note:todays-journal`,
      tags: ["notes", "journal", "today"],
      contentPreview: "today journal daily note",
      at,
    });
    await this.saveObject(journal);
    await this.saveWorkspace(ownerId, applicationId, providerId, journal.id, 1, at);
  }

  private async saveRelationship(
    ownerId: string,
    fromObjectId: string,
    toObjectId: string,
    relationship: "contains" | "references",
    at: string,
  ) {
    await this.store.saveRelationship(
      WorkspaceSemanticRelationshipSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        fromObjectId,
        toObjectId,
        relationship,
        confidence: 0.8,
        source: "indexer",
        createdAt: at,
      }),
    );
  }

  private async saveWorkspace(
    ownerId: string,
    applicationId: string,
    providerId: string | null,
    rootObjectId: string,
    objectCount: number,
    at: string,
  ) {
    await this.store.saveWorkspace(
      SemanticWorkspaceRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        applicationId,
        providerId,
        domain: applicationId === "vscode" ? "code_editing" : "browser",
        title: `${applicationId} semantic workspace`,
        rootObjectId,
        status: "indexed",
        objectCount,
        lastIndexedAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveContext(
      WorkspaceSemanticContextSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        currentApplicationId: applicationId,
        currentProviderId: providerId,
        currentWorkspaceId: applicationId,
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
}

export class SemanticObjectService extends WorkspaceIntelligenceService {}
export class RelationshipGraphService extends WorkspaceIntelligenceService {}
export class ContentDiscoveryService extends WorkspaceIntelligenceService {}
export class SemanticSearchService extends WorkspaceIntelligenceService {}
export class ContextTrackingService extends WorkspaceIntelligenceService {}
export class WorkspaceMemoryService extends WorkspaceIntelligenceService {}

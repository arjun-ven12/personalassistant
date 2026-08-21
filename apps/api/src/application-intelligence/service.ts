import {
  ApplicationDomainRecordSchema,
  ApplicationIntelligenceDashboardResponseSchema,
  ApplicationMemoryRecordSchema,
  ApplicationProviderCapabilityRecordSchema,
  CrossApplicationWorkflowRecordSchema,
  ProviderSelectionRecordSchema,
  ProviderSelectionRequestSchema,
  ProviderSelectionResponseSchema,
  SemanticApplicationCapabilityRecordSchema,
  type SemanticDomain,
} from "@alexa-control/shared";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { ApplicationAdapterStore } from "../application-adapters/store.js";
import type { NativeProviderStore } from "../native-providers/store.js";
import type { ApplicationIntelligenceStore } from "./store.js";

const domainCatalog: Array<{
  id: string;
  domain: SemanticDomain;
  displayName: string;
  description: string;
}> = [
  {
    id: "domain.code-editing",
    domain: "code_editing",
    displayName: "Code Editing",
    description: "Create, open, patch, search, and save code workspace objects.",
  },
  {
    id: "domain.note-taking",
    domain: "note_taking",
    displayName: "Note Taking",
    description: "Create, open, append, search, and archive notes or pages.",
  },
  {
    id: "domain.browser",
    domain: "browser",
    displayName: "Browser",
    description: "Open URLs, manage tabs, search pages, reload, and bookmark pages.",
  },
  {
    id: "domain.file-management",
    domain: "file_management",
    displayName: "File Management",
    description: "Open, reveal, search, and organize files and folders.",
  },
  {
    id: "domain.terminal",
    domain: "terminal",
    displayName: "Terminal",
    description: "Run explicitly approved terminal workflows and inspect sessions.",
  },
];

const capabilityCatalog = [
  {
    capabilityId: "CodeEditing.CreateFile",
    domain: "code_editing",
    displayName: "Create File",
    description: "Create a file through governed workspace editing or a provider.",
    objectTypes: ["file"],
    requiredPermissions: ["create_documents", "open_files"],
    riskLevel: "medium",
  },
  {
    capabilityId: "CodeEditing.OpenFile",
    domain: "code_editing",
    displayName: "Open File",
    description: "Open an existing file in a trusted code editing provider.",
    objectTypes: ["file"],
    requiredPermissions: ["open_files"],
    riskLevel: "low",
  },
  {
    capabilityId: "CodeEditing.OpenWorkspace",
    domain: "code_editing",
    displayName: "Open Workspace",
    description: "Open a registered workspace or repository in a code editor.",
    objectTypes: ["workspace", "repository"],
    requiredPermissions: ["open_files"],
    riskLevel: "low",
  },
  {
    capabilityId: "CodeEditing.PatchFile",
    domain: "code_editing",
    displayName: "Patch File",
    description: "Apply a reviewed patch to a registered workspace file.",
    objectTypes: ["file"],
    requiredPermissions: ["edit_text"],
    riskLevel: "medium",
  },
  {
    capabilityId: "CodeEditing.SaveFile",
    domain: "code_editing",
    displayName: "Save File",
    description: "Save the current file when a reviewed provider supports it.",
    objectTypes: ["file"],
    requiredPermissions: ["interact"],
    riskLevel: "low",
  },
  {
    capabilityId: "CodeEditing.SearchWorkspace",
    domain: "code_editing",
    displayName: "Search Workspace",
    description: "Search a registered workspace through semantic code intelligence.",
    objectTypes: ["workspace", "repository"],
    requiredPermissions: ["read_semantic_structure"],
    riskLevel: "read_only",
  },
  {
    capabilityId: "Browser.OpenUrl",
    domain: "browser",
    displayName: "Open URL",
    description: "Open a reviewed HTTP(S) URL in a trusted browser provider.",
    objectTypes: ["browser_tab"],
    requiredPermissions: ["navigate"],
    riskLevel: "low",
  },
  {
    capabilityId: "Browser.ReloadPage",
    domain: "browser",
    displayName: "Reload Page",
    description: "Reload an existing browser page.",
    objectTypes: ["browser_tab"],
    requiredPermissions: ["navigate"],
    riskLevel: "low",
  },
  {
    capabilityId: "FileManagement.RevealFile",
    domain: "file_management",
    displayName: "Reveal File",
    description: "Reveal a registered file in a trusted file manager.",
    objectTypes: ["file"],
    requiredPermissions: ["open_files"],
    riskLevel: "low",
  },
  {
    capabilityId: "FileManagement.CreateFolder",
    domain: "file_management",
    displayName: "Create Folder",
    description: "Create a folder through a reviewed provider with approval as needed.",
    objectTypes: ["folder"],
    requiredPermissions: ["create_documents"],
    riskLevel: "medium",
  },
  {
    capabilityId: "NoteTaking.CreateNote",
    domain: "note_taking",
    displayName: "Create Note",
    description: "Create a note through the preferred note-taking provider.",
    objectTypes: ["note", "page"],
    requiredPermissions: ["create_documents", "edit_text"],
    riskLevel: "medium",
  },
  {
    capabilityId: "NoteTaking.SearchNotes",
    domain: "note_taking",
    displayName: "Search Notes",
    description: "Search trusted note-taking providers.",
    objectTypes: ["note", "page"],
    requiredPermissions: ["read_semantic_structure"],
    riskLevel: "read_only",
  },
] as const;

const nativeCapabilityMap: Record<string, string[]> = {
  open_file: ["CodeEditing.OpenFile"],
  open_workspace: ["CodeEditing.OpenWorkspace"],
  open_repository: ["CodeEditing.OpenWorkspace"],
  save_file: ["CodeEditing.SaveFile"],
  focus_search: ["CodeEditing.SearchWorkspace"],
  open_url: ["Browser.OpenUrl"],
  reload: ["Browser.ReloadPage"],
  reveal_file: ["FileManagement.RevealFile"],
  new_folder: ["FileManagement.CreateFolder"],
};

const domainForProviderType = (providerType: string): SemanticDomain => {
  if (providerType === "vscode") return "code_editing";
  if (providerType === "chrome" || providerType === "safari") return "browser";
  if (providerType === "finder") return "file_management";
  if (providerType === "terminal") return "terminal";
  if (providerType === "notion") return "note_taking";
  return "communication";
};

export class ApplicationIntelligenceService {
  constructor(
    readonly store: ApplicationIntelligenceStore,
    readonly applicationAdapters: ApplicationAdapterStore,
    readonly nativeProviders: NativeProviderStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    await this.refresh(ownerId);
    return ApplicationIntelligenceDashboardResponseSchema.parse({
      domains: await this.store.listDomains(ownerId, 100),
      capabilities: await this.store.listCapabilities(ownerId, 1_000),
      providerCapabilities: await this.store.listProviderCapabilities(ownerId, 2_000),
      sessions: await this.store.listSessions(ownerId, 500),
      memory: await this.store.listMemory(ownerId, 1_000),
      providerSelectionHistory: await this.store.listSelections(ownerId, 500),
      crossApplicationWorkflows: await this.store.listWorkflows(ownerId, 500),
      semanticObjects: await this.store.listSemanticObjects(ownerId, 10_000),
      universalApplicationIntelligenceAvailable: true,
      plannerUsesSemanticCapabilities: true,
      applicationsAreInterchangeableProviders: true,
      rawApplicationAutomationAvailable: false,
    });
  }

  async selectProvider(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.refresh(input.ownerId);
    const parsed = ProviderSelectionRequestSchema.parse(input.body);
    const capabilities = await this.store.listCapabilities(input.ownerId, 1_000);
    const requested = capabilities.find(
      (item) =>
        item.capabilityId === parsed.capabilityId &&
        (!parsed.domain || item.domain === parsed.domain),
    );
    const domain = parsed.domain ?? requested?.domain ?? "code_editing";
    const providerCapabilities = (
      await this.store.listProviderCapabilities(input.ownerId, 2_000)
    ).filter(
      (item) =>
        item.capabilityId === parsed.capabilityId &&
        (!parsed.domain || item.domain === parsed.domain) &&
        item.enabled,
    );
    const memories = await this.store.listMemory(input.ownerId, 1_000);
    const memoryByApp = new Map(memories.map((item) => [item.applicationId, item]));
    const candidates = providerCapabilities
      .map((item) => {
        const memory = memoryByApp.get(item.applicationId);
        const reasons: string[] = [
          `Capability ${item.capabilityId} is implemented by ${item.providerId}.`,
        ];
        let score = item.confidence * 0.5;
        if (item.permissionState === "granted") {
          score += 0.2;
          reasons.push("Required permissions are granted.");
        } else if (item.permissionState === "partial") {
          score += 0.08;
          reasons.push("Permissions are partially granted.");
        } else {
          reasons.push("Permission state is not fully granted.");
        }
        if (item.healthState === "healthy") {
          score += 0.15;
          reasons.push("Provider health is healthy.");
        } else if (item.healthState === "degraded") {
          score += 0.05;
          reasons.push("Provider health is degraded.");
        } else {
          reasons.push("Provider health is unknown or unavailable.");
        }
        if (memory) {
          score += memory.preferenceScore * 0.08 + memory.recentUseScore * 0.04;
          score += memory.successRate * 0.03;
          reasons.push("Application memory contributed preference/recent-use scores.");
        }
        if (parsed.preferredApplicationId === item.applicationId) {
          score += 0.12;
          reasons.push("User supplied a preferred application.");
        }
        return {
          applicationId: item.applicationId,
          providerId: item.providerId,
          capabilityId: item.capabilityId,
          score: Math.min(1, Number(score.toFixed(4))),
          reasons,
          permissionState: item.permissionState,
          healthState: item.healthState,
        };
      })
      .sort((left, right) => right.score - left.score);
    const selected = candidates[0] ?? null;
    const selection = ProviderSelectionRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      capabilityId: parsed.capabilityId,
      domain,
      origin: parsed.origin,
      selectedApplicationId: selected?.applicationId ?? null,
      selectedProviderId: selected?.providerId ?? null,
      selected: Boolean(selected),
      candidates: candidates.slice(0, 25),
      decisionReason: selected
        ? `Selected ${selected.providerId} for ${parsed.capabilityId}.`
        : `No trusted provider currently exposes ${parsed.capabilityId}.`,
      createdAt: this.now().toISOString(),
    });
    await this.store.saveSelection(selection);
    await this.audit({
      eventType: "POLICY_EVALUATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Application Intelligence provider selection evaluated.",
      requestId: input.requestId,
      metadata: {
        capabilityId: selection.capabilityId,
        selected: selection.selected,
        selectedProviderId: selection.selectedProviderId,
      },
    });
    return ProviderSelectionResponseSchema.parse({
      selection,
      dashboard: await this.dashboard(input.ownerId),
    });
  }

  private async refresh(ownerId: string) {
    const at = this.now().toISOString();
    for (const domain of domainCatalog) {
      await this.store.saveDomain(
        ApplicationDomainRecordSchema.parse({
          ...domain,
          ownerId,
          extensible: true,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
    for (const capability of capabilityCatalog) {
      await this.store.saveCapability(
        SemanticApplicationCapabilityRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          ...capability,
          plannerVisible: true,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
    await this.refreshProviderCapabilities(ownerId, at);
    await this.ensureBaselineWorkflow(ownerId, at);
  }

  private async refreshProviderCapabilities(ownerId: string, at: string) {
    const applications = await this.applicationAdapters.listTrustedApplications(
      ownerId,
      1_000,
    );
    const providers = await this.nativeProviders.listProviders(ownerId, 1_000);
    const providerCapabilities = await this.nativeProviders.listCapabilities(
      ownerId,
      2_000,
    );
    const health = await this.nativeProviders.listHealth(ownerId, 1_000);
    const healthByProvider = new Map(
      health.map((item) => [item.providerId, item] as const),
    );
    const appById = new Map(applications.map((item) => [item.id, item] as const));
    for (const provider of providers) {
      const application = appById.get(provider.applicationId);
      if (!application || application.status !== "trusted") continue;
      const providerHealth = healthByProvider.get(provider.id);
      for (const nativeCapability of providerCapabilities.filter(
        (item) => item.providerId === provider.id,
      )) {
        for (const capabilityId of nativeCapabilityMap[nativeCapability.capability] ??
        []) {
          const capability = capabilityCatalog.find(
            (item) => item.capabilityId === capabilityId,
          );
          if (!capability) continue;
          await this.store.saveProviderCapability(
            ApplicationProviderCapabilityRecordSchema.parse({
              id: crypto.randomUUID(),
              ownerId,
              applicationId: provider.applicationId,
              providerId: provider.id,
              capabilityId,
              domain: capability.domain,
              implementation: `native.${nativeCapability.capability}`,
              confidence: nativeCapability.enabled ? 0.82 : 0.35,
              enabled:
                nativeCapability.enabled &&
                provider.status !== "disabled" &&
                provider.status !== "unavailable",
              permissionState:
                providerHealth?.permissionState === "granted"
                  ? "granted"
                  : providerHealth?.permissionState === "partial"
                    ? "partial"
                    : "unknown",
              healthState:
                providerHealth?.status === "healthy"
                  ? "healthy"
                  : providerHealth?.status === "degraded"
                    ? "degraded"
                    : provider.status === "healthy"
                      ? "healthy"
                      : "unknown",
              source: "native_provider",
              updatedAt: at,
            }),
          );
        }
      }
      await this.store.saveMemory(
        ApplicationMemoryRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          applicationId: provider.applicationId,
          providerId: provider.id,
          domain: domainForProviderType(provider.providerType),
          preferenceScore: provider.providerType === "vscode" ? 0.8 : 0.5,
          recentUseScore: application.lastSeenAt ? 0.75 : 0.25,
          successRate: providerHealth?.executionSuccessRate ?? 0.5,
          failureCount: 0,
          notes: ["Generated from trusted application and native provider state."],
          updatedAt: at,
        }),
      );
    }
  }

  private async ensureBaselineWorkflow(ownerId: string, at: string) {
    await this.store.saveWorkflow(
      CrossApplicationWorkflowRecordSchema.parse({
        id: "00000000-0000-4000-8000-0000000018a1",
        ownerId,
        name: "Create code file and open in editor",
        domains: ["code_editing", "file_management"],
        capabilityIds: ["CodeEditing.CreateFile", "CodeEditing.OpenFile"],
        providerIds: [],
        status: "draft",
        updatedAt: at,
      }),
    );
  }
}

export class ProviderSelectionEngine extends ApplicationIntelligenceService {}
export class SemanticDomainRegistry extends ApplicationIntelligenceService {}
export class ApplicationMemoryService extends ApplicationIntelligenceService {}
export class CapabilityResolutionService extends ApplicationIntelligenceService {}
export class CrossApplicationWorkflowService extends ApplicationIntelligenceService {}
export class ApplicationContextService extends ApplicationIntelligenceService {}

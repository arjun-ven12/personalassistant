import {
  AdapterCompatibilityRecordSchema,
  AdapterDependencyRecordSchema,
  AdapterLifecycleRecordSchema,
  AdapterLifecycleTransitionRequestSchema,
  AdapterSandboxRecordSchema,
  AdapterSdkContractRecordSchema,
  AdapterSdkDashboardResponseSchema,
  AdapterUsageRecordSchema,
  type AdapterCapability,
  type AdapterInstanceRecord,
  type AdapterLifecycleRecord,
  type AdapterSdkContractRecord,
  type SemanticDomain,
  type TrustedApplicationRecord,
  type WorkspaceSemanticObject,
} from "@alexa-control/shared";

import type { ApplicationAdapterStore } from "../application-adapters/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { NativeProviderStore } from "../native-providers/store.js";
import type { DeepIndexerStore } from "../deep-indexers/store.js";
import type { AdapterSdkStore } from "./store.js";

const operationsByCapability: Partial<Record<AdapterCapability, string[]>> = {
  navigation: ["initialize", "health_check", "navigate", "synchronize"],
  editing: ["open", "update", "validate_permissions"],
  searching: ["search", "list"],
  saving: ["update"],
  printing: ["open"],
  opening_files: ["open", "list"],
  closing_windows: ["shutdown"],
  creating_documents: ["create"],
  terminal_input: ["open", "update", "validate_permissions"],
  sidebar_navigation: ["navigate"],
  selection: ["navigate", "resolve_relationships"],
  semantic_registry: ["search", "list", "resolve_relationships"],
  state_inspection: ["health_check", "list"],
  event_subscription: ["emit_events"],
};

const domainsFor = (application: TrustedApplicationRecord): SemanticDomain[] => {
  const value = `${application.applicationName} ${application.bundleIdentifier}`;
  if (/code|vscode|cursor/i.test(value)) return ["code_editing", "terminal"];
  if (/finder/i.test(value)) return ["file_management"];
  if (/chrome|safari|arc|browser/i.test(value)) return ["browser", "knowledge_base"];
  if (/notes|notion|obsidian/i.test(value)) return ["note_taking", "knowledge_base"];
  if (/calendar/i.test(value)) return ["calendar"];
  if (/mail|email/i.test(value)) return ["email", "communication"];
  if (/slack|discord|messages/i.test(value)) return ["messaging", "communication"];
  if (/figma/i.test(value)) return ["design"];
  if (/spotify|music/i.test(value)) return ["music"];
  return ["documents"];
};

const objectTypesFor = (domains: SemanticDomain[]): WorkspaceSemanticObject["objectType"][] => {
  const types = new Set<WorkspaceSemanticObject["objectType"]>();
  for (const domain of domains) {
    if (domain === "code_editing") {
      ["workspace", "repository", "folder", "file", "class", "function", "method"].forEach(
        (type) => types.add(type as WorkspaceSemanticObject["objectType"]),
      );
    } else if (domain === "browser") {
      ["browser_tab", "bookmark", "document"].forEach((type) =>
        types.add(type as WorkspaceSemanticObject["objectType"]),
      );
    } else if (domain === "file_management") {
      ["workspace", "folder", "file", "document"].forEach((type) =>
        types.add(type as WorkspaceSemanticObject["objectType"]),
      );
    } else if (domain === "note_taking" || domain === "knowledge_base") {
      ["notebook", "note", "page", "document", "content_block"].forEach((type) =>
        types.add(type as WorkspaceSemanticObject["objectType"]),
      );
    } else if (domain === "calendar") {
      ["calendar", "event"].forEach((type) =>
        types.add(type as WorkspaceSemanticObject["objectType"]),
      );
    } else {
      types.add("document");
    }
  }
  return [...types].slice(0, 80);
};

const semanticCapabilitiesFor = (
  domains: SemanticDomain[],
  capabilities: AdapterCapability[],
) => {
  const ids = new Set<string>();
  for (const domain of domains) {
    const prefix = domain
      .split("_")
      .map((part) => part[0]!.toUpperCase() + part.slice(1))
      .join("");
    if (capabilities.includes("opening_files")) ids.add(`${prefix}.OpenFile`);
    if (capabilities.includes("searching")) ids.add(`${prefix}.Search`);
    if (capabilities.includes("creating_documents")) ids.add(`${prefix}.Create`);
    if (capabilities.includes("editing")) ids.add(`${prefix}.Update`);
    if (capabilities.includes("navigation")) ids.add(`${prefix}.Navigate`);
  }
  return [...ids].slice(0, 100);
};

const lifecycleStateFor = (instance: AdapterInstanceRecord) => {
  if (instance.status === "disabled") return "disabled" as const;
  if (instance.status === "connected") return "active" as const;
  if (instance.status === "registered") return "installed" as const;
  if (instance.status === "degraded") return "paused" as const;
  return "discovered" as const;
};

export class AdapterRegistryService {
  constructor(
    readonly sdkStore: AdapterSdkStore,
    readonly applicationAdapterStore: ApplicationAdapterStore,
    readonly nativeProviderStore: NativeProviderStore,
    readonly deepIndexerStore: DeepIndexerStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    await this.refresh(ownerId);
    return AdapterSdkDashboardResponseSchema.parse({
      contracts: await this.sdkStore.listContracts(ownerId, 1_000),
      lifecycle: await this.sdkStore.listLifecycle(ownerId, 2_000),
      sandboxes: await this.sdkStore.listSandboxes(ownerId, 1_000),
      dependencies: await this.sdkStore.listDependencies(ownerId, 2_000),
      usage: await this.sdkStore.listUsage(ownerId, 2_000),
      compatibility: await this.sdkStore.listCompatibility(ownerId, 1_000),
      metadata: {
        sdkVersion: "18D.1",
        contractOperations: [
          "initialize",
          "shutdown",
          "health_check",
          "search",
          "open",
          "create",
          "update",
          "delete",
          "list",
          "navigate",
          "resolve_relationships",
          "emit_events",
          "synchronize",
          "validate_permissions",
        ],
        lifecycleStates: [
          "discovered",
          "installed",
          "validated",
          "enabled",
          "active",
          "paused",
          "disabled",
          "archived",
          "removed",
        ],
        reviewedAdapterSources: ["built_in", "local_reviewed", "third_party_reviewed"],
        plannerRemainsApplicationAgnostic: true,
        duplicatesProviderRegistry: false,
        duplicatesCapabilityRegistry: false,
        duplicatesSemanticObjectModel: false,
        duplicatesTransportLayer: false,
      },
      universalApplicationAdapterSdkAvailable: true,
      adaptersInstallIntoExistingFramework: true,
      plannerApplicationSpecificLogicAvailable: false,
      rawUiAutomationAvailable: false,
      genericExecutionAvailable: false,
    });
  }

  async transition(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = AdapterLifecycleTransitionRequestSchema.parse(input.body);
    await this.refresh(input.ownerId);
    const contract = await this.sdkStore.getContractByAdapterInstance(
      input.ownerId,
      parsed.adapterInstanceId,
    );
    if (!contract) {
      return this.dashboard(input.ownerId);
    }
    const at = this.now().toISOString();
    const updated = AdapterSdkContractRecordSchema.parse({
      ...contract,
      lifecycleState: parsed.toState,
      updatedAt: at,
    });
    await this.sdkStore.saveContract(updated);
    await this.sdkStore.saveLifecycle(
      AdapterLifecycleRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        applicationId: contract.applicationId,
        adapterInstanceId: contract.adapterInstanceId,
        fromState: contract.lifecycleState,
        toState: parsed.toState,
        reason: parsed.reason,
        audited: true,
        occurredAt: at,
      }),
    );
    await this.sdkStore.saveUsage(
      AdapterUsageRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        applicationId: contract.applicationId,
        adapterInstanceId: contract.adapterInstanceId,
        operation: parsed.toState === "disabled" ? "shutdown" : "initialize",
        capability: null,
        latencyMs: 0,
        outcome: "success",
        recordedAt: at,
      }),
    );
    await this.audit({
      eventType: "ADAPTER_SYNCHRONIZED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Adapter SDK lifecycle transition recorded.",
      requestId: input.requestId,
      metadata: {
        applicationId: contract.applicationId,
        adapterInstanceId: contract.adapterInstanceId,
        toState: parsed.toState,
      },
    });
    return this.dashboard(input.ownerId);
  }

  async refresh(ownerId: string) {
    const [applications, instances, capabilities, nativeProviders, indexers] =
      await Promise.all([
        this.applicationAdapterStore.listTrustedApplications(ownerId, 1_000),
        this.applicationAdapterStore.listAdapterInstances(ownerId, 1_000),
        this.applicationAdapterStore.listApplicationCapabilities(ownerId, 2_000),
        this.nativeProviderStore.listProviders(ownerId, 1_000),
        this.deepIndexerStore.listIndexers(ownerId, 1_000),
      ]);
    const existing = await this.sdkStore.listContracts(ownerId, 1_000);
    const existingByInstance = new Map(
      existing.map((contract) => [contract.adapterInstanceId, contract] as const),
    );
    for (const instance of instances) {
      const application = applications.find((item) => item.id === instance.applicationId);
      if (!application || application.status !== "trusted") continue;
      const provider =
        nativeProviders.find((item) => item.applicationId === application.id) ?? null;
      // Capability records are configuration state, not an event stream. Older
      // registrations may contain duplicates, so compose the contract from the
      // unique declared capability set before applying its bounded schema.
      const appCapabilities = [
        ...new Set(
          capabilities
            .filter((capability) => capability.applicationId === application.id)
            .map((capability) => capability.capability),
        ),
      ];
      const domains = domainsFor(application);
      const at = this.now().toISOString();
      const previous = existingByInstance.get(instance.id);
      const state = previous?.lifecycleState ?? lifecycleStateFor(instance);
      const operations = [
        ...new Set(
          appCapabilities.flatMap(
            (capability) => operationsByCapability[capability] ?? [],
          ),
        ),
      ];
      const contract = AdapterSdkContractRecordSchema.parse({
        id: previous?.id ?? crypto.randomUUID(),
        ownerId,
        applicationId: application.id,
        adapterInstanceId: instance.id,
        providerId: provider?.id ?? null,
        adapterName: `${application.applicationName} SDK adapter`,
        source: "built_in",
        sdkVersion: "18D.1",
        interfaceVersion: instance.interfaceVersion,
        lifecycleState: state,
        semanticDomains: domains,
        capabilities: appCapabilities,
        semanticCapabilityIds: semanticCapabilitiesFor(domains, appCapabilities),
        objectTypes: objectTypesFor(domains),
        operations,
        permissions: application.permissionsGranted,
        dependencies: [
          ...(provider ? [`native_provider:${provider.id}`] : []),
          ...indexers
            .filter((indexer) => indexer.applicationId === application.id)
            .map((indexer) => `semantic_indexer:${indexer.id}`),
        ],
        reviewed: true,
        sandboxed: true,
        plannerAgnostic: true,
        rawUiAutomationAvailable: false,
        unrestrictedOsApisAvailable: false,
        genericExecutionAvailable: false,
        createdAt: previous?.createdAt ?? at,
        updatedAt: at,
      });
      await this.sdkStore.saveContract(contract);
      if (!previous) await this.recordInitialLifecycle(contract, at);
      await this.saveSandbox(contract, at);
      await this.saveCompatibility(contract, application, at);
      if (provider) {
        await this.saveDependency(
          contract,
          "native_provider",
          provider.id,
          provider.status === "healthy" ? "satisfied" : "degraded",
          at,
        );
      }
      for (const indexer of indexers.filter(
        (item) => item.applicationId === application.id,
      )) {
        await this.saveDependency(
          contract,
          "semantic_indexer",
          indexer.id,
          indexer.status === "healthy" ? "satisfied" : "degraded",
          at,
        );
      }
    }
  }

  private async recordInitialLifecycle(
    contract: AdapterSdkContractRecord,
    at: string,
  ) {
    const states: AdapterLifecycleRecord["toState"][] = [
      "discovered",
      "installed",
      contract.lifecycleState,
    ];
    let fromState: AdapterLifecycleRecord["fromState"] = null;
    for (const state of states) {
      await this.sdkStore.saveLifecycle(
        AdapterLifecycleRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: contract.ownerId,
          applicationId: contract.applicationId,
          adapterInstanceId: contract.adapterInstanceId,
          fromState,
          toState: state,
          reason: "Adapter SDK contract registered from existing application adapter.",
          audited: true,
          occurredAt: at,
        }),
      );
      fromState = state;
    }
  }

  private async saveSandbox(contract: AdapterSdkContractRecord, at: string) {
    await this.sdkStore.saveSandbox(
      AdapterSandboxRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: contract.ownerId,
        applicationId: contract.applicationId,
        adapterInstanceId: contract.adapterInstanceId,
        filesystemScope: contract.permissions.includes("open_files")
          ? "registered_workspaces"
          : "none",
        networkScope: contract.semanticDomains.includes("browser")
          ? "official_api"
          : "none",
        allowedPermissions: contract.permissions,
        allowedCapabilities: contract.capabilities,
        applicationScope: contract.applicationId,
        unrestrictedFilesystemAvailable: false,
        unrestrictedNetworkAvailable: false,
        unrestrictedOsApisAvailable: false,
        updatedAt: at,
      }),
    );
  }

  private async saveCompatibility(
    contract: AdapterSdkContractRecord,
    application: TrustedApplicationRecord,
    at: string,
  ) {
    await this.sdkStore.saveCompatibility(
      AdapterCompatibilityRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: contract.ownerId,
        applicationId: contract.applicationId,
        adapterInstanceId: contract.adapterInstanceId,
        applicationVersion: application.applicationVersion,
        sdkVersion: contract.sdkVersion,
        compatibility: contract.providerId ? "compatible" : "warning",
        diagnostics: contract.providerId
          ? ["Reviewed provider dependency is registered."]
          : ["No reviewed native provider is registered for this adapter yet."],
        checkedAt: at,
      }),
    );
  }

  private async saveDependency(
    contract: AdapterSdkContractRecord,
    dependencyType: "native_provider" | "semantic_indexer" | "official_api" | "extension",
    dependencyId: string,
    status: "satisfied" | "missing" | "degraded" | "unknown",
    at: string,
  ) {
    await this.sdkStore.saveDependency(
      AdapterDependencyRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: contract.ownerId,
        applicationId: contract.applicationId,
        adapterInstanceId: contract.adapterInstanceId,
        dependencyType,
        dependencyId,
        required: dependencyType === "native_provider",
        status,
        updatedAt: at,
      }),
    );
  }
}

export class AdapterLifecycleService extends AdapterRegistryService {}
export class AdapterHealthService extends AdapterRegistryService {}
export class AdapterDiagnosticsService extends AdapterRegistryService {}
export class AdapterSandboxService extends AdapterRegistryService {}
export class AdapterCompatibilityService extends AdapterRegistryService {}
export class AdapterEventService extends AdapterRegistryService {}
export class SDKGenerationService extends AdapterRegistryService {}

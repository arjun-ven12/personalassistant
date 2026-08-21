import {
  AdapterActionHistoryRecordSchema,
  AdapterHealthMetricRecordSchema,
  AdapterPermissionStatusRecordSchema,
  ApplicationContextSnapshotRecordSchema,
  ApplicationSessionRecord18ESchema,
  ApplicationUsageRecord18ESchema,
  CoreAdapterCapabilityRecordSchema,
  CoreAdapterDashboardResponseSchema,
  CoreAdapterRecordSchema,
  CoreAdapterSemanticActionRequestSchema,
  CoreAdapterSemanticActionResponseSchema,
  SemanticActionHistoryRecordSchema,
  type AdapterPermission,
  type CoreAdapterCapabilityRecord,
  type CoreAdapterId,
  type CoreAdapterRecord,
  type NativeProviderCapability,
  type NetworkVerificationState,
  type SemanticDomain,
  type WorkspaceSemanticObject,
} from "@alexa-control/shared";

import type { AdapterRegistryService } from "../adapter-sdk/service.js";
import type { ApplicationAdapterStore } from "../application-adapters/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { NativeProviderRuntime } from "../native-providers/service.js";
import type { NativeProviderStore } from "../native-providers/store.js";
import type { CoreAdapterStore } from "./store.js";

interface CoreCapabilityDescriptor {
  capabilityId: string;
  displayName: string;
  domain: SemanticDomain;
  operation: CoreAdapterCapabilityRecord["operation"];
  objectTypes: WorkspaceSemanticObject["objectType"][];
  requiredPermissions: AdapterPermission[];
  nativeProviderCapability: NativeProviderCapability | null;
  officialApiRequired: boolean;
  approvalRequired: boolean;
}

interface CoreAdapterDescriptor {
  id: CoreAdapterId;
  applicationId: string;
  displayName: string;
  bundleIdentifier: string;
  semanticDomains: SemanticDomain[];
  supportedObjectTypes: WorkspaceSemanticObject["objectType"][];
  capabilities: CoreCapabilityDescriptor[];
}

const cap = (input: CoreCapabilityDescriptor) => input;

const coreAdapters: CoreAdapterDescriptor[] = [
  {
    id: "vscode",
    applicationId: "vscode",
    displayName: "VS Code",
    bundleIdentifier: "com.microsoft.VSCode",
    semanticDomains: ["code_editing", "terminal"],
    supportedObjectTypes: [
      "workspace",
      "repository",
      "folder",
      "file",
      "class",
      "function",
      "method",
      "variable",
    ],
    capabilities: [
      cap({
        capabilityId: "CodeEditing.OpenWorkspace",
        displayName: "Open Workspace",
        domain: "code_editing",
        operation: "open",
        objectTypes: ["workspace"],
        requiredPermissions: ["open_files"],
        nativeProviderCapability: "open_workspace",
        officialApiRequired: false,
        approvalRequired: false,
      }),
      cap({
        capabilityId: "CodeEditing.OpenRepository",
        displayName: "Open Repository",
        domain: "code_editing",
        operation: "open",
        objectTypes: ["repository"],
        requiredPermissions: ["open_files"],
        nativeProviderCapability: "open_repository",
        officialApiRequired: false,
        approvalRequired: false,
      }),
      cap({
        capabilityId: "CodeEditing.OpenFile",
        displayName: "Open File",
        domain: "code_editing",
        operation: "open",
        objectTypes: ["file"],
        requiredPermissions: ["open_files"],
        nativeProviderCapability: "open_file",
        officialApiRequired: false,
        approvalRequired: false,
      }),
      cap({
        capabilityId: "CodeEditing.CreateFile",
        displayName: "Create File",
        domain: "code_editing",
        operation: "create",
        objectTypes: ["file"],
        requiredPermissions: ["create_documents"],
        nativeProviderCapability: null,
        officialApiRequired: true,
        approvalRequired: false,
      }),
      cap({
        capabilityId: "CodeEditing.PatchFile",
        displayName: "Patch File",
        domain: "code_editing",
        operation: "update",
        objectTypes: ["file"],
        requiredPermissions: ["edit_text"],
        nativeProviderCapability: null,
        officialApiRequired: true,
        approvalRequired: true,
      }),
      cap({
        capabilityId: "CodeEditing.SaveFile",
        displayName: "Save File",
        domain: "code_editing",
        operation: "update",
        objectTypes: ["file"],
        requiredPermissions: ["interact"],
        nativeProviderCapability: "save_file",
        officialApiRequired: false,
        approvalRequired: false,
      }),
      cap({
        capabilityId: "CodeEditing.SearchWorkspace",
        displayName: "Search Workspace",
        domain: "code_editing",
        operation: "search",
        objectTypes: ["workspace", "file"],
        requiredPermissions: ["read_semantic_structure"],
        nativeProviderCapability: "focus_search",
        officialApiRequired: false,
        approvalRequired: false,
      }),
      cap({
        capabilityId: "CodeEditing.FindSymbol",
        displayName: "Find Symbol",
        domain: "code_editing",
        operation: "search",
        objectTypes: ["class", "function", "method", "variable"],
        requiredPermissions: ["read_semantic_structure"],
        nativeProviderCapability: null,
        officialApiRequired: true,
        approvalRequired: false,
      }),
      cap({
        capabilityId: "CodeEditing.RevealSymbol",
        displayName: "Reveal Symbol",
        domain: "code_editing",
        operation: "navigate",
        objectTypes: ["class", "function", "method", "variable"],
        requiredPermissions: ["navigate"],
        nativeProviderCapability: null,
        officialApiRequired: true,
        approvalRequired: false,
      }),
      cap({
        capabilityId: "CodeEditing.ShowProblems",
        displayName: "Show Problems",
        domain: "code_editing",
        operation: "navigate",
        objectTypes: ["workspace"],
        requiredPermissions: ["navigate"],
        nativeProviderCapability: "show_problems",
        officialApiRequired: false,
        approvalRequired: false,
      }),
      cap({
        capabilityId: "CodeEditing.ShowTerminal",
        displayName: "Show Terminal",
        domain: "terminal",
        operation: "navigate",
        objectTypes: ["workspace"],
        requiredPermissions: ["navigate"],
        nativeProviderCapability: "focus_terminal",
        officialApiRequired: false,
        approvalRequired: false,
      }),
      cap({
        capabilityId: "CodeEditing.ReadDiagnostics",
        displayName: "Read Diagnostics",
        domain: "code_editing",
        operation: "read",
        objectTypes: ["workspace", "file"],
        requiredPermissions: ["read_semantic_structure"],
        nativeProviderCapability: null,
        officialApiRequired: true,
        approvalRequired: false,
      }),
      cap({
        capabilityId: "CodeEditing.ReadContext",
        displayName: "Read Current Context",
        domain: "code_editing",
        operation: "read",
        objectTypes: ["workspace", "file"],
        requiredPermissions: ["read_semantic_structure"],
        nativeProviderCapability: null,
        officialApiRequired: true,
        approvalRequired: false,
      }),
    ],
  },
  {
    id: "finder",
    applicationId: "finder",
    displayName: "Finder",
    bundleIdentifier: "com.apple.finder",
    semanticDomains: ["file_management"],
    supportedObjectTypes: ["workspace", "folder", "file", "document"],
    capabilities: [
      cap({
        capabilityId: "FileManagement.OpenFolder",
        displayName: "Open Folder",
        domain: "file_management",
        operation: "open",
        objectTypes: ["folder"],
        requiredPermissions: ["open_files"],
        nativeProviderCapability: "open_folder",
        officialApiRequired: false,
        approvalRequired: false,
      }),
      cap({
        capabilityId: "FileManagement.RevealFile",
        displayName: "Reveal File",
        domain: "file_management",
        operation: "navigate",
        objectTypes: ["file"],
        requiredPermissions: ["open_files"],
        nativeProviderCapability: "reveal_file",
        officialApiRequired: false,
        approvalRequired: false,
      }),
      cap({
        capabilityId: "FileManagement.SearchFiles",
        displayName: "Search Files",
        domain: "file_management",
        operation: "search",
        objectTypes: ["file", "folder"],
        requiredPermissions: ["read_semantic_structure"],
        nativeProviderCapability: "search",
        officialApiRequired: false,
        approvalRequired: false,
      }),
      cap({
        capabilityId: "FileManagement.CreateFolder",
        displayName: "Create Folder",
        domain: "file_management",
        operation: "create",
        objectTypes: ["folder"],
        requiredPermissions: ["create_documents"],
        nativeProviderCapability: "new_folder",
        officialApiRequired: false,
        approvalRequired: true,
      }),
      ...["MoveFile", "CopyFile", "RenameFile", "DeleteFile", "ReadMetadata"].map(
        (name) =>
          cap({
            capabilityId: `FileManagement.${name}`,
            displayName: name.replace(/([A-Z])/g, " $1").trim(),
            domain: "file_management",
            operation: name === "ReadMetadata" ? "read" : name === "DeleteFile" ? "delete" : "update",
            objectTypes: ["file"],
            requiredPermissions:
              name === "ReadMetadata"
                ? ["read_semantic_structure"]
                : name === "DeleteFile"
                  ? ["delete_content"]
                  : ["open_files", "interact"],
            nativeProviderCapability: null,
            officialApiRequired: true,
            approvalRequired: name === "DeleteFile",
          }),
      ),
    ],
  },
  {
    id: "chrome",
    applicationId: "chrome",
    displayName: "Chrome",
    bundleIdentifier: "com.google.Chrome",
    semanticDomains: ["browser", "knowledge_base"],
    supportedObjectTypes: ["browser_tab", "bookmark", "document"],
    capabilities: [],
  },
  {
    id: "safari",
    applicationId: "safari",
    displayName: "Safari",
    bundleIdentifier: "com.apple.Safari",
    semanticDomains: ["browser", "knowledge_base"],
    supportedObjectTypes: ["browser_tab", "bookmark", "document"],
    capabilities: [],
  },
  {
    id: "terminal",
    applicationId: "terminal",
    displayName: "Terminal",
    bundleIdentifier: "com.apple.Terminal",
    semanticDomains: ["terminal"],
    supportedObjectTypes: ["workspace"],
    capabilities: [],
  },
  {
    id: "apple_notes",
    applicationId: "apple_notes",
    displayName: "Apple Notes",
    bundleIdentifier: "com.apple.Notes",
    semanticDomains: ["note_taking", "knowledge_base"],
    supportedObjectTypes: ["notebook", "note", "document", "content_block"],
    capabilities: [],
  },
  {
    id: "calendar",
    applicationId: "calendar",
    displayName: "Calendar",
    bundleIdentifier: "com.apple.iCal",
    semanticDomains: ["calendar"],
    supportedObjectTypes: ["calendar", "event"],
    capabilities: [],
  },
  {
    id: "reminders",
    applicationId: "reminders",
    displayName: "Reminders",
    bundleIdentifier: "com.apple.reminders",
    semanticDomains: ["task_management"],
    supportedObjectTypes: ["task"],
    capabilities: [],
  },
];

type CapabilityTuple = [
  suffix: string,
  label: string,
  nativeCapability: NativeProviderCapability | null,
  operation: CoreCapabilityDescriptor["operation"],
];

const browserCapabilities = (): CoreCapabilityDescriptor[] =>
  ([
    ["OpenUrl", "Open URL", "open_url", "open"],
    ["OpenLocalhost", "Open Localhost", "open_url", "open"],
    ["SearchTabs", "Search Tabs", null, "search"],
    ["OpenTab", "Open Tab", "new_tab", "open"],
    ["CloseTab", "Close Tab", "close_tab", "delete"],
    ["ReloadTab", "Reload Tab", "reload", "update"],
    ["ReadActiveUrl", "Read Active URL", null, "read"],
    ["ReadActiveTabMetadata", "Read Active Tab Metadata", null, "read"],
    ["BookmarkPage", "Bookmark Page", "bookmark", "create"],
    ["SearchBookmarks", "Search Bookmarks", null, "search"],
  ] satisfies CapabilityTuple[]).map(([suffix, label, nativeCapability, operation]) =>
    cap({
      capabilityId: `Browser.${suffix}`,
      displayName: label,
      domain: "browser",
      operation,
      objectTypes: suffix.includes("Bookmark") ? ["bookmark"] : ["browser_tab"],
      requiredPermissions:
        suffix === "BookmarkPage" ? ["interact"] : ["navigate", "read_semantic_structure"],
      nativeProviderCapability: nativeCapability,
      officialApiRequired: nativeCapability === null,
      approvalRequired: false,
    }),
  );

coreAdapters.find((adapter) => adapter.id === "chrome")!.capabilities = browserCapabilities();
coreAdapters.find((adapter) => adapter.id === "safari")!.capabilities =
  browserCapabilities().filter(
    (capability) => capability.capabilityId !== "Browser.BookmarkPage",
  );
coreAdapters.find((adapter) => adapter.id === "terminal")!.capabilities = ([
  ["Launch", "Launch", "launch", "open"],
  ["Focus", "Focus", "focus", "navigate"],
  ["OpenSession", "Open Session", "open_profile", "open"],
  ["SwitchSession", "Switch Session", "focus_session", "navigate"],
  ["ClearSession", "Clear Session", "clear_terminal", "update"],
  ["InterruptSession", "Interrupt Session", "interrupt_command", "update"],
  ["ExecuteApprovedCommand", "Execute Approved Commands", "run_approved_command", "execute"],
  ["ReadCwd", "Read Current Working Directory", null, "read"],
  ["ReadSessionMetadata", "Read Session Metadata", null, "read"],
] satisfies CapabilityTuple[]).map(([suffix, label, nativeCapability, operation]) =>
  cap({
    capabilityId: `Terminal.${suffix}`,
    displayName: label,
    domain: "terminal",
    operation,
    objectTypes: ["workspace"],
    requiredPermissions:
      suffix === "ExecuteApprovedCommand" ? ["execute_commands"] : ["navigate"],
    nativeProviderCapability: nativeCapability,
    officialApiRequired: nativeCapability === null,
    approvalRequired: suffix === "ExecuteApprovedCommand",
  }),
);

const appApiCapabilities = (
  domain: SemanticDomain,
  prefix: string,
  names: string[],
  objectType: WorkspaceSemanticObject["objectType"],
) =>
  names.map((name) =>
    cap({
      capabilityId: `${prefix}.${name}`,
      displayName: name.replace(/([A-Z])/g, " $1").trim(),
      domain,
      operation: name.startsWith("Search")
        ? "search"
        : name.startsWith("List")
          ? "list"
          : name.startsWith("Create")
            ? "create"
            : name.startsWith("Delete")
              ? "delete"
              : name.startsWith("Read") || name.startsWith("Pinned") || name.startsWith("Recent") || name.startsWith("Today") || name.startsWith("Upcoming")
                ? "read"
                : "update",
      objectTypes: [objectType],
      requiredPermissions: name.startsWith("Delete") ? ["delete_content"] : ["read_semantic_structure"],
      nativeProviderCapability: null,
      officialApiRequired: true,
      approvalRequired: name.startsWith("Delete") || name.startsWith("Accept"),
    }),
  );

coreAdapters.find((adapter) => adapter.id === "apple_notes")!.capabilities =
  appApiCapabilities("note_taking", "NoteTaking", [
    "CreateNote",
    "OpenNote",
    "SearchNotes",
    "AppendNote",
    "UpdateNote",
    "DeleteNote",
    "ListNotebooks",
    "MoveNote",
    "ReadNoteMetadata",
    "PinnedNotes",
    "RecentNotes",
  ], "note");
coreAdapters.find((adapter) => adapter.id === "calendar")!.capabilities =
  appApiCapabilities("calendar", "Calendar", [
    "CreateEvent",
    "UpdateEvent",
    "DeleteEvent",
    "SearchEvents",
    "TodayEvents",
    "UpcomingEvents",
    "MoveEvent",
    "ReadAttendees",
    "ReadMetadata",
    "AcceptInvitations",
  ], "event");
coreAdapters.find((adapter) => adapter.id === "reminders")!.capabilities =
  appApiCapabilities("task_management", "TaskManagement", [
    "CreateReminder",
    "CompleteReminder",
    "DeleteReminder",
    "MoveReminder",
    "SearchReminders",
    "ListLists",
    "TodayReminders",
    "UpcomingReminders",
  ], "task");

export class CoreAdapterService {
  constructor(
    readonly store: CoreAdapterStore,
    readonly applicationAdapterStore: ApplicationAdapterStore,
    readonly nativeProviderStore: NativeProviderStore,
    readonly adapterSdk: AdapterRegistryService,
    readonly nativeProviders: NativeProviderRuntime,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    const adapters = await this.adapters(ownerId);
    const capabilities = this.capabilities(ownerId);
    await this.refreshRuntimeRecords(ownerId, adapters, capabilities);
    return CoreAdapterDashboardResponseSchema.parse({
      adapters,
      capabilities,
      sessions: await this.store.listSessions(ownerId, 500),
      contextSnapshots: await this.store.listContextSnapshots(ownerId, 1_000),
      recentActions: await this.store.listActionHistory(ownerId, 2_000),
      healthMetrics: await this.store.listHealthMetrics(ownerId, 2_000),
      permissionStatus: await this.store.listPermissionStatus(ownerId, 2_000),
      semanticActions: await this.store.listSemanticActions(ownerId, 2_000),
      usage: await this.store.listUsage(ownerId, 1_000),
      coreApplicationAdapterSuiteAvailable: true,
      usesExistingAdapterSdk: true,
      usesExistingProviderRuntime: true,
      plannerApplicationSpecificLogicAvailable: false,
      rawUiAutomationAvailable: false,
      genericExecutionAvailable: false,
    });
  }

  async executeSemanticAction(input: {
    ownerId: string;
    sessionId: string;
    networkState: NetworkVerificationState;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = CoreAdapterSemanticActionRequestSchema.parse(input.body);
    const adapters = await this.adapters(input.ownerId);
    const capabilities = this.capabilities(input.ownerId);
    const adapter = adapters.find((item) => item.id === parsed.adapterId);
    const capability = capabilities.find(
      (item) =>
        item.adapterId === parsed.adapterId &&
        item.capabilityId === parsed.capabilityId,
    );
    const denied = async (errorCode: string, summary: string) =>
      this.recordAction(input, parsed, adapter ?? null, capability ?? null, {
        status: "denied",
        errorCode,
        verificationSummary: summary,
        executionRequestId: null,
      });
    if (!adapter || !capability) {
      return denied("CAPABILITY_NOT_DECLARED", "Core adapter capability is not declared.");
    }
    const trusted = await this.applicationAdapterStore.getTrustedApplication(
      input.ownerId,
      adapter.applicationId,
    );
    if (!trusted || trusted.status !== "trusted") {
      return denied(
        "APPLICATION_NOT_TRUSTED",
        "Application must be explicitly trusted before semantic adapter actions.",
      );
    }
    const missing = capability.requiredPermissions.filter(
      (permission) => !trusted.permissionsGranted.includes(permission),
    );
    if (missing.length > 0) {
      return denied(
        "ADAPTER_PERMISSION_MISSING",
        `Missing permissions: ${missing.join(", ")}`,
      );
    }
    if (capability.approvalRequired) {
      return denied(
        "APPROVAL_REQUIRED",
        "This semantic adapter action requires the existing approval workflow.",
      );
    }
    if (!capability.nativeProviderCapability) {
      return denied(
        "REVIEWED_SEMANTIC_INTEGRATION_REQUIRED",
        "Capability requires an official API, extension, or reviewed semantic provider that is not connected yet.",
      );
    }
    await this.nativeProviders.dispatch({
      ownerId: input.ownerId,
      sessionId: input.sessionId,
      networkState: input.networkState,
      body: {
        providerId: adapter.providerId,
        applicationId: adapter.applicationId,
        capability: capability.nativeProviderCapability,
        arguments: parsed.arguments,
        ...(parsed.approvedCommandId
          ? { approvedCommandId: parsed.approvedCommandId }
          : {}),
      },
      requestId: input.requestId,
      ipAddress: input.ipAddress,
    });
    const latest = (
      await this.nativeProviderStore.listExecution(input.ownerId, 10)
    ).find(
      (execution) =>
        execution.providerId === adapter.providerId &&
        execution.capability === capability.nativeProviderCapability,
    );
    return this.recordAction(input, parsed, adapter, capability, {
      status: latest?.status === "requested" ? "verified" : "failed",
      errorCode: latest?.errorCode ?? null,
      verificationSummary:
        latest?.verificationSummary ??
        "Native provider dispatch was attempted through the existing runtime.",
      executionRequestId: latest?.executionRequestId ?? null,
    });
  }

  private async recordAction(
    input: {
      ownerId: string;
      requestId: string;
      ipAddress: string;
    },
    parsed: ReturnType<typeof CoreAdapterSemanticActionRequestSchema.parse>,
    adapter: CoreAdapterRecord | null,
    capability: CoreAdapterCapabilityRecord | null,
    result: {
      status: "verified" | "failed" | "denied" | "unsupported";
      errorCode: string | null;
      verificationSummary: string;
      executionRequestId: string | null;
    },
  ) {
    const at = this.now().toISOString();
    const applicationId = adapter?.applicationId ?? parsed.adapterId;
    const action = AdapterActionHistoryRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      adapterId: parsed.adapterId,
      applicationId,
      capabilityId: parsed.capabilityId,
      origin: parsed.origin,
      status: result.status,
      providerId: adapter?.providerId ?? null,
      executionRequestId: result.executionRequestId,
      verificationSummary: result.verificationSummary,
      errorCode: result.errorCode,
      requestedAt: at,
      completedAt: result.status === "verified" ? null : at,
    });
    const semanticAction = SemanticActionHistoryRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      adapterId: parsed.adapterId,
      applicationId,
      capabilityId: parsed.capabilityId,
      semanticObjectType: capability?.objectTypes[0] ?? null,
      argumentsSummary: Object.keys(parsed.arguments).sort().join(", "),
      riskLevel: capability?.approvalRequired ? "high" : "low",
      approvalRequired: capability?.approvalRequired ?? false,
      outcome:
        result.status === "verified"
          ? "queued"
          : result.status === "denied"
            ? "denied"
            : "failed",
      createdAt: at,
    });
    await this.store.saveActionHistory(action);
    await this.store.saveSemanticAction(semanticAction);
    await this.store.saveUsage(
      ApplicationUsageRecord18ESchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        adapterId: parsed.adapterId,
        applicationId,
        capabilityId: parsed.capabilityId,
        useCount: 1,
        successRate: result.status === "verified" ? 1 : 0,
        lastUsedAt: at,
        updatedAt: at,
      }),
    );
    await this.audit({
      eventType: result.status === "verified" ? "ADAPTER_SYNCHRONIZED" : "POLICY_DENIED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: result.status === "verified" ? "SUCCESS" : "DENIED",
      reason: result.verificationSummary,
      requestId: input.requestId,
      metadata: {
        adapterId: parsed.adapterId,
        capabilityId: parsed.capabilityId,
        errorCode: result.errorCode,
      },
    });
    return CoreAdapterSemanticActionResponseSchema.parse({ action, semanticAction });
  }

  private async adapters(ownerId: string) {
    const [trusted, providers, sdk] = await Promise.all([
      this.applicationAdapterStore.listTrustedApplications(ownerId, 1_000),
      this.nativeProviderStore.listProviders(ownerId, 1_000),
      this.adapterSdk.dashboard(ownerId),
    ]);
    return coreAdapters.map((descriptor) => {
      const application = trusted.find(
        (item) =>
          item.id === descriptor.applicationId ||
          item.bundleIdentifier === descriptor.bundleIdentifier,
      );
      const provider =
        providers.find((item) => item.applicationId === descriptor.applicationId) ?? null;
      const contract =
        sdk.contracts.find((item) => item.applicationId === descriptor.applicationId) ??
        null;
      const trustedStatus = application?.status === "trusted";
      const providerHealthy = provider?.status === "healthy";
      const apiOnly = descriptor.capabilities.every(
        (capability) => !capability.nativeProviderCapability,
      );
      const dependencyState = providerHealthy
        ? "satisfied"
        : trustedStatus && apiOnly
          ? "missing"
          : trustedStatus
            ? "partial"
            : "missing";
      const status = !trustedStatus
        ? "installed"
        : providerHealthy
          ? "active"
          : apiOnly
            ? "degraded"
            : "enabled";
      return CoreAdapterRecordSchema.parse({
        id: descriptor.id,
        ownerId,
        applicationId: descriptor.applicationId,
        displayName: descriptor.displayName,
        bundleIdentifier: descriptor.bundleIdentifier,
        status,
        semanticDomains: descriptor.semanticDomains,
        supportedObjectTypes: descriptor.supportedObjectTypes,
        sdkContractId: contract?.id ?? null,
        providerId: provider?.id ?? null,
        providerVersion: provider?.version ?? null,
        dependencyState,
        health: providerHealthy ? 1 : trustedStatus ? 0.65 : 0.35,
        diagnostics: [
          trustedStatus
            ? "Trusted application record is present."
            : "Adapter installed but application is not trusted yet.",
          provider
            ? `Reviewed provider status: ${provider.status}.`
            : "No reviewed native provider dependency is registered.",
          "Planner remains application-agnostic; semantic capabilities route through SDK/provider systems.",
        ],
        currentContextId: null,
        updatedAt: this.now().toISOString(),
      });
    });
  }

  private capabilities(ownerId: string) {
    return coreAdapters.flatMap((adapter) =>
      adapter.capabilities.map((capability) =>
        CoreAdapterCapabilityRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          adapterId: adapter.id,
          applicationId: adapter.applicationId,
          capabilityId: capability.capabilityId,
          displayName: capability.displayName,
          domain: capability.domain,
          operation: capability.operation,
          objectTypes: capability.objectTypes,
          requiredPermissions: capability.requiredPermissions,
          nativeProviderCapability: capability.nativeProviderCapability,
          officialApiRequired: capability.officialApiRequired,
          approvalRequired: capability.approvalRequired,
          enabled: true,
          verified: true,
          updatedAt: this.now().toISOString(),
        }),
      ),
    );
  }

  private async refreshRuntimeRecords(
    ownerId: string,
    adapters: CoreAdapterRecord[],
    capabilities: CoreAdapterCapabilityRecord[],
  ) {
    const at = this.now().toISOString();
    const trusted = await this.applicationAdapterStore.listTrustedApplications(
      ownerId,
      1_000,
    );
    for (const adapter of adapters) {
      await this.store.saveSession(
        ApplicationSessionRecord18ESchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          adapterId: adapter.id,
          applicationId: adapter.applicationId,
          status: adapter.status === "active" ? "active" : "unknown",
          currentObjectId: null,
          startedAt: at,
          updatedAt: at,
        }),
      );
      await this.store.saveContextSnapshot(
        ApplicationContextSnapshotRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          adapterId: adapter.id,
          applicationId: adapter.applicationId,
          currentDocument: null,
          currentWorkspace: adapter.semanticDomains.includes("code_editing")
            ? "current workspace"
            : null,
          currentTab: adapter.semanticDomains.includes("browser")
            ? "active tab metadata unavailable"
            : null,
          currentFolder: adapter.semanticDomains.includes("file_management")
            ? "registered directories"
            : null,
          currentProject: null,
          currentReminderList:
            adapter.id === "reminders" ? "default reminder list" : null,
          currentCalendar: adapter.id === "calendar" ? "default calendar" : null,
          currentSelection: null,
          sessionIds: [],
          capturedAt: at,
        }),
      );
      const application = trusted.find((item) => item.id === adapter.applicationId);
      const permissions = new Set(application?.permissionsGranted ?? []);
      await this.store.saveHealthMetric(
        AdapterHealthMetricRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          adapterId: adapter.id,
          applicationId: adapter.applicationId,
          health: adapter.health,
          latencyMs: 0,
          failureRate: adapter.health === 1 ? 0 : 0.35,
          permissionState:
            permissions.size === 0
              ? "missing"
              : permissions.size < 3
                ? "partial"
                : "granted",
          measuredAt: at,
        }),
      );
      const related = capabilities.filter((item) => item.adapterId === adapter.id);
      for (const permission of new Set(related.flatMap((item) => item.requiredPermissions))) {
        await this.store.savePermissionStatus(
          AdapterPermissionStatusRecordSchema.parse({
            id: crypto.randomUUID(),
            ownerId,
            adapterId: adapter.id,
            applicationId: adapter.applicationId,
            permission,
            granted: permissions.has(permission),
            requiredByCapabilities: related
              .filter((item) => item.requiredPermissions.includes(permission))
              .map((item) => item.capabilityId)
              .slice(0, 50),
            updatedAt: at,
          }),
        );
      }
    }
  }
}

export class ApplicationContextManager extends CoreAdapterService {}
export class AdapterHealthMonitor extends CoreAdapterService {}
export class AdapterDiagnosticsService extends CoreAdapterService {}
export class AdapterPermissionManager extends CoreAdapterService {}
export class SemanticActionService extends CoreAdapterService {}
export class ApplicationSessionService extends CoreAdapterService {}

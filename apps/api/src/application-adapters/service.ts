import {
  AdapterInstanceRecordSchema,
  AdapterMetricRecordSchema,
  AdapterPluginRecordSchema,
  AdapterVersionRecordSchema,
  ApplicationAdapterDashboardResponseSchema,
  ApplicationCapabilityRecordSchema,
  ApplicationContextRecordSchema,
  ApplicationEventRecordSchema,
  ApplicationHealthRecordSchema,
  ApplicationPermissionRecordSchema,
  ApplicationProfileRecordSchema,
  TrustedApplicationRecordSchema,
  TrustApplicationRequestSchema,
  UpdateApplicationPermissionsRequestSchema,
  type AdapterCapability,
  type AdapterPermission,
  type TrustedApplicationRecord,
} from "@alexa-control/shared";

import { GovernanceError } from "../governance/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { ApplicationAdapterStore } from "./store.js";

const profileCatalog = [
  {
    id: "profile.vscode",
    matches: /visual studio code|vs code|vscode|com\.microsoft\.VSCode/i,
    aliases: ["VS Code", "Code", "Visual Studio Code"],
    knownCapabilities: [
      "navigation",
      "editing",
      "searching",
      "saving",
      "opening_files",
      "creating_documents",
      "terminal_input",
      "sidebar_navigation",
      "semantic_registry",
      "state_inspection",
    ],
    preferredNavigation: ["Command Palette", "Explorer", "Terminal", "Editor"],
    commonWorkflows: ["Open repository", "Run task", "Open terminal"],
    tags: ["developer", "editor", "repository", "terminal"],
    securityRules: ["Terminal input requires execute_commands permission."],
  },
  {
    id: "profile.finder",
    matches: /finder|com\.apple\.finder/i,
    aliases: ["Finder"],
    knownCapabilities: ["navigation", "opening_files", "selection", "state_inspection"],
    preferredNavigation: ["Sidebar", "List", "Column view"],
    commonWorkflows: ["Show Downloads", "Open folder"],
    tags: ["files", "folders", "macos"],
    securityRules: ["Delete content remains prohibited without elevated review."],
  },
  {
    id: "profile.browser",
    matches: /chrome|safari|browser|com\.google\.Chrome|com\.apple\.Safari/i,
    aliases: ["Browser", "Chrome", "Safari"],
    knownCapabilities: [
      "navigation",
      "searching",
      "semantic_registry",
      "event_subscription",
    ],
    preferredNavigation: ["Address bar", "Tabs", "Page semantic registry"],
    commonWorkflows: ["Open URL", "Search page", "Navigate dashboard"],
    tags: ["browser", "web", "tabs"],
    securityRules: ["Browser content is never trusted as instructions."],
  },
] as const;

const defaultCapabilities: AdapterCapability[] = [
  "navigation",
  "semantic_registry",
  "state_inspection",
  "event_subscription",
  "selection",
];

const permissionForCapability: Partial<Record<AdapterCapability, AdapterPermission>> = {
  navigation: "navigate",
  editing: "edit_text",
  opening_files: "open_files",
  creating_documents: "create_documents",
  terminal_input: "execute_commands",
  semantic_registry: "read_semantic_structure",
  state_inspection: "read_semantic_structure",
  event_subscription: "read_semantic_structure",
  selection: "navigate",
  saving: "interact",
  searching: "navigate",
  printing: "interact",
  closing_windows: "interact",
  sidebar_navigation: "navigate",
};

export class ApplicationRegistryService {
  constructor(
    readonly store: ApplicationAdapterStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return ApplicationAdapterDashboardResponseSchema.parse({
      trustedApplications: await this.store.listTrustedApplications(ownerId, 500),
      applicationProfiles: await this.store.listApplicationProfiles(ownerId, 500),
      applicationCapabilities: await this.store.listApplicationCapabilities(
        ownerId,
        1_000,
      ),
      adapterInstances: await this.store.listAdapterInstances(ownerId, 500),
      adapterPlugins: await this.store.listAdapterPlugins(ownerId, 500),
      applicationPermissions: await this.store.listApplicationPermissions(
        ownerId,
        1_000,
      ),
      applicationContext: await this.store.listApplicationContext(ownerId, 100),
      applicationEvents: await this.store.listApplicationEvents(ownerId, 1_000),
      adapterMetrics: await this.store.listAdapterMetrics(ownerId, 1_000),
      adapterVersions: await this.store.listAdapterVersions(ownerId, 500),
      applicationHealth: await this.store.listApplicationHealth(ownerId, 500),
      universalAdapterFrameworkAvailable: true,
      genericAccessibilityAdapterAvailable: true,
      applicationSpecificCoreHardcoding: false,
      pixelAutomationAvailable: false,
      ocrAutomationAvailable: false,
      coordinateReplayAvailable: false,
      untrustedApplicationControlAvailable: false,
      pluginsOptional: true,
    });
  }

  async trustApplication(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = TrustApplicationRequestSchema.parse(input.body);
    const existing = await this.store.getTrustedApplication(input.ownerId, parsed.id);
    const at = this.now().toISOString();
    const capabilities = discoverCapabilities(
      parsed.applicationName,
      parsed.bundleIdentifier,
    );
    const application = TrustedApplicationRecordSchema.parse({
      id: parsed.id,
      ownerId: input.ownerId,
      applicationName: parsed.applicationName,
      bundleIdentifier: parsed.bundleIdentifier,
      stableIdentifier: parsed.stableIdentifier,
      applicationVersion: parsed.applicationVersion,
      executablePath: null,
      executablePathUserSupplied: false,
      codeSignature: parsed.codeSignature,
      permissionsGranted: parsed.permissionsGranted,
      capabilities,
      status: "trusted",
      lastSeenAt: at,
      trustLevel: parsed.trustLevel,
      securityProfile: parsed.securityProfile,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    });
    await this.store.saveTrustedApplication(application);
    await this.registerAdapterSurface(input.ownerId, application, at);
    await this.audit({
      eventType: "ADAPTER_APPLICATION_TRUSTED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Application explicitly trusted for universal adapter metadata.",
      requestId: input.requestId,
      metadata: {
        applicationId: application.id,
        bundleIdentifier: application.bundleIdentifier,
        executablePathUserSupplied: false,
      },
    });
    return this.dashboard(input.ownerId);
  }

  async updatePermissions(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = UpdateApplicationPermissionsRequestSchema.parse(input.body);
    const application = await this.requireTrusted(input.ownerId, parsed.applicationId);
    const at = this.now().toISOString();
    const updated = TrustedApplicationRecordSchema.parse({
      ...application,
      permissionsGranted: parsed.permissions,
      updatedAt: at,
    });
    await this.store.saveTrustedApplication(updated);
    for (const permission of allPermissions) {
      await this.store.saveApplicationPermission(
        ApplicationPermissionRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          applicationId: application.id,
          permission,
          granted: parsed.permissions.includes(permission),
          source: "owner",
          updatedAt: at,
        }),
      );
    }
    await this.store.saveApplicationHealth(
      ApplicationHealthRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        applicationId: application.id,
        status: "healthy",
        connectionStatus: "Trusted application registered for semantic adapter use.",
        permissionState:
          parsed.permissions.length === allPermissions.length
            ? "granted"
            : parsed.permissions.length > 0
              ? "partial"
              : "not_granted",
        errors: [],
        warnings: ["Native Accessibility provider is not connected in this process."],
        checkedAt: at,
      }),
    );
    await this.audit({
      eventType: "ADAPTER_PERMISSIONS_UPDATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Application adapter permissions updated.",
      requestId: input.requestId,
      metadata: {
        applicationId: application.id,
        permissionCount: parsed.permissions.length,
      },
    });
    return this.dashboard(input.ownerId);
  }

  async refreshCapabilities(input: {
    ownerId: string;
    applicationId: string;
    requestId: string;
    ipAddress: string;
  }) {
    const application = await this.requireTrusted(input.ownerId, input.applicationId);
    const at = this.now().toISOString();
    await this.saveCapabilities(input.ownerId, application, at);
    await this.store.saveApplicationEvent(
      ApplicationEventRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        applicationId: application.id,
        eventType: "capabilities_refreshed",
        summary: "Application capabilities refreshed through adapter interface.",
        metadata: { genericAccessibilityAdapter: true },
        occurredAt: at,
      }),
    );
    await this.store.saveAdapterMetric(
      AdapterMetricRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        applicationId: application.id,
        metricName: "capability_refresh_ms",
        value: 0,
        measuredAt: at,
      }),
    );
    await this.audit({
      eventType: "ADAPTER_CAPABILITIES_REFRESHED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Application adapter capabilities refreshed.",
      requestId: input.requestId,
      metadata: {
        applicationId: application.id,
        capabilityCount: application.capabilities.length,
      },
    });
    return this.dashboard(input.ownerId);
  }

  async synchronize(input: {
    ownerId: string;
    applicationId: string;
    requestId: string;
    ipAddress: string;
  }) {
    const application = await this.requireTrusted(input.ownerId, input.applicationId);
    const at = this.now().toISOString();
    await this.store.saveApplicationContext(
      ApplicationContextRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        currentApplicationId: application.id,
        focusedWindowId: null,
        currentDocument: null,
        selectedObjectId: null,
        currentWorkspace: null,
        currentProject: null,
        currentRepository: null,
        openDialogIds: [],
        recentActionIds: [],
        updatedAt: at,
      }),
    );
    await this.store.saveApplicationEvent(
      ApplicationEventRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        applicationId: application.id,
        eventType: "synchronized",
        summary: "Application context synchronized using semantic adapter metadata.",
        metadata: { rawAccessibilityDumpStored: false },
        occurredAt: at,
      }),
    );
    await this.store.saveAdapterMetric(
      AdapterMetricRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        applicationId: application.id,
        metricName: "adapter_synchronization_ms",
        value: 0,
        measuredAt: at,
      }),
    );
    await this.audit({
      eventType: "ADAPTER_SYNCHRONIZED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Application adapter context synchronized.",
      requestId: input.requestId,
      metadata: { applicationId: application.id },
    });
    return this.dashboard(input.ownerId);
  }

  async revoke(input: {
    ownerId: string;
    applicationId: string;
    requestId: string;
    ipAddress: string;
  }) {
    const application = await this.requireTrusted(input.ownerId, input.applicationId);
    const at = this.now().toISOString();
    await this.store.saveTrustedApplication(
      TrustedApplicationRecordSchema.parse({
        ...application,
        status: "revoked",
        permissionsGranted: [],
        updatedAt: at,
      }),
    );
    await this.store.saveApplicationHealth(
      ApplicationHealthRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        applicationId: application.id,
        status: "revoked",
        connectionStatus: "Application trust was revoked by owner.",
        permissionState: "revoked",
        errors: [],
        warnings: ["Adapter disabled; application cannot be controlled."],
        checkedAt: at,
      }),
    );
    await this.audit({
      eventType: "ADAPTER_APPLICATION_REVOKED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Trusted application revoked.",
      requestId: input.requestId,
      metadata: { applicationId: application.id },
    });
    return this.dashboard(input.ownerId);
  }

  async ensureBaseline(ownerId: string) {
    if ((await this.store.listTrustedApplications(ownerId, 1)).length > 0) return;
    const at = this.now().toISOString();
    await this.store.saveApplicationContext(
      ApplicationContextRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        currentApplicationId: null,
        focusedWindowId: null,
        currentDocument: null,
        selectedObjectId: null,
        currentWorkspace: null,
        currentProject: null,
        currentRepository: null,
        openDialogIds: [],
        recentActionIds: [],
        updatedAt: at,
      }),
    );
  }

  private async requireTrusted(ownerId: string, applicationId: string) {
    const application = await this.store.getTrustedApplication(ownerId, applicationId);
    if (!application || application.status !== "trusted") {
      throw new GovernanceError(
        403,
        "APPLICATION_NOT_TRUSTED",
        "Application must be explicitly trusted before adapter control.",
      );
    }
    return application;
  }

  private async registerAdapterSurface(
    ownerId: string,
    application: TrustedApplicationRecord,
    at: string,
  ) {
    await this.saveProfile(ownerId, application, at);
    await this.saveCapabilities(ownerId, application, at);
    const adapterId = crypto.randomUUID();
    await this.store.saveAdapterInstance(
      AdapterInstanceRecordSchema.parse({
        id: adapterId,
        ownerId,
        applicationId: application.id,
        adapterType: isBrowser(application)
          ? "browser_semantic"
          : "generic_accessibility",
        status: "registered",
        interfaceVersion: "17E.1",
        health:
          "Adapter registered. Native control remains unavailable until macOS permissions and provider health are verified.",
        synchronizedAt: null,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveAdapterVersion(
      AdapterVersionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        applicationId: application.id,
        adapterId,
        applicationVersion: application.applicationVersion,
        adapterVersion: "17E.1",
        compatibility: "unknown",
        recordedAt: at,
      }),
    );
    await this.store.saveAdapterPlugin(
      AdapterPluginRecordSchema.parse({
        id: `${application.id}.plugin.optional`,
        ownerId,
        applicationId: application.id,
        name: `${application.applicationName} optional adapter plugin`,
        version: "0.0.0",
        status: "disabled",
        optional: true,
        exposesCustomCommands: false,
        exposesApplicationApis: false,
        updatedAt: at,
      }),
    );
    await this.store.saveApplicationHealth(
      ApplicationHealthRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        applicationId: application.id,
        status: "healthy",
        connectionStatus: "Trusted application registered for semantic adapter use.",
        permissionState: application.permissionsGranted.length
          ? "partial"
          : "not_granted",
        errors: [],
        warnings: ["Native Accessibility provider is not connected in this process."],
        checkedAt: at,
      }),
    );
  }

  private async saveProfile(
    ownerId: string,
    application: TrustedApplicationRecord,
    at: string,
  ) {
    const matched = profileFor(application);
    const profile = ApplicationProfileRecordSchema.parse({
      id: `${application.id}.profile`,
      ownerId,
      applicationId: application.id,
      name: matched ? matched.id : `${application.applicationName} generic profile`,
      aliases: matched?.aliases ?? [application.applicationName],
      knownCapabilities: matched?.knownCapabilities ?? application.capabilities,
      preferredNavigation: matched?.preferredNavigation ?? ["Accessibility hierarchy"],
      commonWorkflows: matched?.commonWorkflows ?? [
        "Focus window",
        "Navigate controls",
      ],
      recommendedSemanticTags: matched?.tags ?? ["generic", "accessibility"],
      securityRules: matched?.securityRules ?? [
        "Use generic accessibility adapter only through governed capabilities.",
      ],
      updatedAt: at,
    });
    await this.store.saveApplicationProfile(profile);
  }

  private async saveCapabilities(
    ownerId: string,
    application: TrustedApplicationRecord,
    at: string,
  ) {
    for (const capability of application.capabilities) {
      const permission = permissionForCapability[capability];
      await this.store.saveApplicationCapability(
        ApplicationCapabilityRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          applicationId: application.id,
          capability,
          source: isBrowser(application) ? "browser_registry" : "generic_accessibility",
          plannerVisible:
            Boolean(
              permission && application.permissionsGranted.includes(permission),
            ) || capability === "state_inspection",
          voiceAliasIds: [`voice.${application.id}.${capability}`],
          gestureMappingIds: [],
          riskLevel:
            capability === "terminal_input" || capability === "creating_documents"
              ? "high"
              : capability === "editing" || capability === "saving"
                ? "medium"
                : "read_only",
          discoveredAt: at,
          updatedAt: at,
        }),
      );
    }
    for (const permission of allPermissions) {
      await this.store.saveApplicationPermission(
        ApplicationPermissionRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          applicationId: application.id,
          permission,
          granted: application.permissionsGranted.includes(permission),
          source: "owner",
          updatedAt: at,
        }),
      );
    }
  }
}

export class AdapterManagerService extends ApplicationRegistryService {}
export class CapabilityDiscoveryService extends ApplicationRegistryService {}
export class ApplicationProfileService extends ApplicationRegistryService {}
export class PluginManagerService extends ApplicationRegistryService {}
export class PermissionService extends ApplicationRegistryService {}
export class ApplicationLifecycleService extends ApplicationRegistryService {}
export class ApplicationContextService extends ApplicationRegistryService {}
export class AdapterDiagnosticsService extends ApplicationRegistryService {}
export class SynchronizationService extends ApplicationRegistryService {}

const allPermissions: AdapterPermission[] = [
  "read_semantic_structure",
  "navigate",
  "interact",
  "edit_text",
  "open_files",
  "create_documents",
  "delete_content",
  "execute_commands",
  "clipboard_access",
];

const discoverCapabilities = (name: string, bundleId: string): AdapterCapability[] => {
  const matched = profileCatalog.find((profile) =>
    profile.matches.test(`${name} ${bundleId}`),
  );
  return [...new Set([...(matched?.knownCapabilities ?? []), ...defaultCapabilities])];
};

const profileFor = (application: TrustedApplicationRecord) =>
  profileCatalog.find((profile) =>
    profile.matches.test(
      `${application.applicationName} ${application.bundleIdentifier}`,
    ),
  );

const isBrowser = (application: TrustedApplicationRecord) =>
  /chrome|safari|browser/i.test(
    `${application.applicationName} ${application.bundleIdentifier}`,
  );

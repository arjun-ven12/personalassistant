import { z } from "zod";

import { ApplicationCapabilitySchema } from "./capabilities.js";
import { RiskLevelSchema } from "./tools.js";

const applicationPermissionDefaults = {
  open: false,
  focus: false,
  inspectWindow: false,
  captureWindow: false,
  automate: false,
  sendKeyboardShortcuts: false,
  readSemanticStructure: false,
  navigate: false,
  interact: false,
  editText: false,
  openFiles: false,
  createDocuments: false,
  deleteContent: false,
  executeCommands: false,
  clipboardAccess: false,
};

export const RegistryIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9._-]{2,63}$/);

export const MacBundleIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(255)
  .regex(/^[A-Za-z0-9]+(?:[.-][A-Za-z0-9_-]+)+$/)
  .refine((value) => !value.includes("/") && !value.includes("\\"), {
    message: "Bundle ID must be an identifier, not a path.",
  });

export const ApplicationPermissionsSchema = z
  .object({
    open: z.boolean().default(false),
    focus: z.boolean().default(false),
    inspectWindow: z.boolean().default(false),
    captureWindow: z.boolean().default(false),
    automate: z.boolean().default(false),
    sendKeyboardShortcuts: z.boolean().default(false),
    readSemanticStructure: z.boolean().default(false),
    navigate: z.boolean().default(false),
    interact: z.boolean().default(false),
    editText: z.boolean().default(false),
    openFiles: z.boolean().default(false),
    createDocuments: z.boolean().default(false),
    deleteContent: z.boolean().default(false),
    executeCommands: z.boolean().default(false),
    clipboardAccess: z.boolean().default(false),
  })
  .strict();

export const AllowedApplicationSchema = z
  .object({
    id: RegistryIdSchema,
    ownerId: z.string().uuid(),
    displayName: z.string().trim().min(1).max(100),
    macBundleId: MacBundleIdSchema,
    enabled: z.boolean(),
    permissions: ApplicationPermissionsSchema,
    riskOverrides: z.partialRecord(ApplicationCapabilitySchema, RiskLevelSchema),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CreateApplicationRequestSchema = z
  .object({
    id: RegistryIdSchema,
    displayName: z.string().trim().min(1).max(100),
    macBundleId: MacBundleIdSchema,
    enabled: z.boolean().default(false),
    permissions: ApplicationPermissionsSchema.default(applicationPermissionDefaults),
    riskOverrides: z
      .partialRecord(ApplicationCapabilitySchema, RiskLevelSchema)
      .default({}),
  })
  .strict();

export const UpdateApplicationRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100).optional(),
    enabled: z.boolean().optional(),
    permissions: ApplicationPermissionsSchema.optional(),
    riskOverrides: z
      .partialRecord(ApplicationCapabilitySchema, RiskLevelSchema)
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one application field must be updated.",
  });

export const ApplicationResponseSchema = AllowedApplicationSchema;
export const ApplicationListResponseSchema = z.array(AllowedApplicationSchema);
export const ApplicationIdParametersSchema = z
  .object({ applicationId: RegistryIdSchema })
  .strict();

export const DiscoveredApplicationSourceSchema = z.enum([
  "mac_agent_startup",
  "mac_agent_refresh",
  "mac_agent_manual_refresh",
]);

const MacApplicationBundlePathSchema = z
  .string()
  .trim()
  .min(5)
  .max(700)
  .refine(
    (value) =>
      value.endsWith(".app") &&
      (value.startsWith("/Applications/") ||
        value.startsWith("/System/Applications/") ||
        /^\/Users\/[^/]+\/Applications\//.test(value)) &&
      !value.includes("\0") &&
      !value.includes("/../"),
    { message: "Application bundle path must be in a fixed macOS application root." },
  );

const ApplicationMetadataStringSchema = z.string().trim().min(1).max(240);

export const DiscoveredMacApplicationSchema = z
  .object({
    displayName: ApplicationMetadataStringSchema.max(160),
    bundleIdentifier: MacBundleIdSchema,
    bundlePath: MacApplicationBundlePathSchema,
    executableName: ApplicationMetadataStringSchema.max(180).nullable(),
    version: ApplicationMetadataStringSchema.max(80).nullable(),
    buildVersion: ApplicationMetadataStringSchema.max(80).nullable(),
    iconPath: z
      .string()
      .trim()
      .min(1)
      .max(900)
      .refine(
        (value) =>
          !value.includes("\0") &&
          value.endsWith(".icns") &&
          (value.startsWith("/Applications/") ||
            value.startsWith("/System/Applications/") ||
            /^\/Users\/[^/]+\/Applications\//.test(value)),
        { message: "Application icon path must stay within a fixed macOS root." },
      )
      .nullable(),
    bundleUrl: z
      .string()
      .trim()
      .min(1)
      .max(1_000)
      .refine((value) => value.startsWith("file://") && value.endsWith(".app"), {
        message: "Application bundle URL must be a file URL for an app bundle.",
      }),
    isSystemApp: z.boolean(),
    isUserInstalled: z.boolean(),
    source: DiscoveredApplicationSourceSchema,
    discoveredAt: z.iso.datetime(),
  })
  .strict();

export const ApplicationInstallationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    deviceId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    displayName: z.string().trim().min(1).max(160),
    bundleIdentifier: MacBundleIdSchema,
    canonicalName: z.string().trim().min(1).max(160),
    aliases: z.array(z.string().trim().min(1).max(120)).max(20),
    searchTokens: z.array(z.string().trim().min(1).max(80)).max(80),
    capabilityHints: z
      .array(
        z.enum([
          "browser",
          "terminal",
          "editor",
          "communication",
          "productivity",
          "system",
          "media",
          "developer",
        ]),
      )
      .max(12),
    supportedAdapterId: z.string().uuid().nullable(),
    nativeProviderId: RegistryIdSchema.nullable(),
    bundlePath: MacApplicationBundlePathSchema,
    executableName: ApplicationMetadataStringSchema.max(180).nullable(),
    version: ApplicationMetadataStringSchema.max(80).nullable(),
    buildVersion: ApplicationMetadataStringSchema.max(80).nullable(),
    iconPath: z.string().trim().min(1).max(900).nullable(),
    bundleUrl: z.string().trim().min(1).max(1_000),
    source: DiscoveredApplicationSourceSchema,
    isSystemApp: z.boolean(),
    isUserInstalled: z.boolean(),
    launchable: z.boolean(),
    installed: z.boolean(),
    discoveredAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    unavailableSince: z.iso.datetime().nullable(),
    provenance: z
      .object({
        discoveredBy: z.literal("mac_agent_bundle_scan"),
        rootScope: z.enum(["fixed_macos_application_roots"]),
        trustGranted: z.literal(false),
        permissionsGranted: z.literal(false),
      })
      .strict(),
  })
  .strict();

export const ApplicationDiscoveryIngestRequestSchema = z
  .object({
    operation: z.literal("application_discovery_ingest"),
    source: DiscoveredApplicationSourceSchema,
    applications: z.array(DiscoveredMacApplicationSchema).max(1_000),
  })
  .strict();

export const ApplicationDiscoveryResponseSchema = z
  .object({
    ingested: z.number().int().min(0),
    createdApplications: z.number().int().min(0),
    updatedInstallations: z.number().int().min(0),
    markedUnavailable: z.number().int().min(0),
    installations: z.array(ApplicationInstallationRecordSchema).max(1_000),
    permissionsGranted: z.literal(false),
    dynamicAdaptersCreated: z.literal(false),
  })
  .strict();

export const ApplicationInstallationListResponseSchema = z.array(
  ApplicationInstallationRecordSchema,
);

export const AdapterPermissionSchema = z.enum([
  "read_semantic_structure",
  "navigate",
  "interact",
  "edit_text",
  "open_files",
  "create_documents",
  "delete_content",
  "execute_commands",
  "clipboard_access",
]);

export const AdapterCapabilitySchema = z.enum([
  "navigation",
  "editing",
  "searching",
  "saving",
  "printing",
  "opening_files",
  "closing_windows",
  "creating_documents",
  "terminal_input",
  "sidebar_navigation",
  "selection",
  "semantic_registry",
  "state_inspection",
  "event_subscription",
]);

export const TrustedApplicationRecordSchema = z
  .object({
    id: RegistryIdSchema,
    ownerId: z.string().uuid(),
    applicationName: z.string().min(1).max(160),
    bundleIdentifier: MacBundleIdSchema,
    stableIdentifier: RegistryIdSchema,
    applicationVersion: z.string().min(1).max(80),
    executablePath: z.string().max(500).nullable(),
    executablePathUserSupplied: z.literal(false),
    codeSignature: z.string().min(1).max(300),
    permissionsGranted: z.array(AdapterPermissionSchema).max(30),
    capabilities: z.array(AdapterCapabilitySchema).max(50),
    status: z.enum(["pending", "trusted", "revoked", "disabled", "unavailable"]),
    lastSeenAt: z.iso.datetime().nullable(),
    trustLevel: z.enum(["metadata_only", "semantic_read", "interaction", "automation"]),
    securityProfile: z.enum(["strict", "standard", "elevated_review_required"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ApplicationProfileRecordSchema = z
  .object({
    id: RegistryIdSchema,
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    name: z.string().min(1).max(160),
    aliases: z.array(z.string().min(1).max(120)).max(40),
    knownCapabilities: z.array(AdapterCapabilitySchema).max(50),
    preferredNavigation: z.array(z.string().min(1).max(160)).max(40),
    commonWorkflows: z.array(z.string().min(1).max(240)).max(40),
    recommendedSemanticTags: z.array(z.string().min(1).max(80)).max(60),
    securityRules: z.array(z.string().min(1).max(240)).max(40),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ApplicationCapabilityRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    capability: AdapterCapabilitySchema,
    source: z.enum(["generic_accessibility", "profile", "plugin", "browser_registry"]),
    plannerVisible: z.boolean(),
    voiceAliasIds: z.array(z.string().min(1).max(160)).max(50),
    gestureMappingIds: z.array(z.string().min(1).max(160)).max(50),
    riskLevel: z.enum(["read_only", "low", "medium", "high", "prohibited"]),
    discoveredAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AdapterInstanceRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    adapterType: z.enum(["generic_accessibility", "browser_semantic", "plugin"]),
    status: z.enum(["registered", "connected", "degraded", "unavailable", "disabled"]),
    interfaceVersion: z.string().min(1).max(40),
    health: z.string().min(1).max(500),
    synchronizedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AdapterPluginRecordSchema = z
  .object({
    id: RegistryIdSchema,
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    name: z.string().min(1).max(160),
    version: z.string().min(1).max(80),
    status: z.enum(["available", "enabled", "disabled", "failed"]),
    optional: z.literal(true),
    exposesCustomCommands: z.boolean(),
    exposesApplicationApis: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ApplicationPermissionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    permission: AdapterPermissionSchema,
    granted: z.boolean(),
    source: z.enum(["owner", "profile", "system_default"]),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ApplicationContextRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    currentApplicationId: RegistryIdSchema.nullable(),
    focusedWindowId: z.string().min(1).max(180).nullable(),
    currentDocument: z.string().max(240).nullable(),
    selectedObjectId: z.string().max(180).nullable(),
    currentWorkspace: z.string().max(180).nullable(),
    currentProject: z.string().max(180).nullable(),
    currentRepository: z.string().max(180).nullable(),
    openDialogIds: z.array(z.string().min(1).max(180)).max(50),
    recentActionIds: z.array(z.string().uuid()).max(100),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ApplicationEventRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    eventType: z.enum([
      "launch",
      "activation",
      "deactivation",
      "background",
      "termination",
      "crash",
      "restart",
      "window_created",
      "window_destroyed",
      "focus_changed",
      "suspend",
      "resume",
      "capabilities_refreshed",
      "synchronized",
    ]),
    summary: z.string().min(1).max(500),
    metadata: z.record(z.string().max(80), z.json()).default({}),
    occurredAt: z.iso.datetime(),
  })
  .strict();

export const AdapterMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    metricName: z.string().min(1).max(120),
    value: z.number(),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const AdapterVersionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    adapterId: z.string().uuid(),
    applicationVersion: z.string().min(1).max(80),
    adapterVersion: z.string().min(1).max(80),
    compatibility: z.enum(["compatible", "warning", "unsupported", "unknown"]),
    recordedAt: z.iso.datetime(),
  })
  .strict();

export const ApplicationHealthRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    status: z.enum(["healthy", "degraded", "unavailable", "revoked"]),
    connectionStatus: z.string().min(1).max(160),
    permissionState: z.enum(["not_granted", "partial", "granted", "revoked"]),
    errors: z.array(z.string().min(1).max(300)).max(20),
    warnings: z.array(z.string().min(1).max(300)).max(20),
    checkedAt: z.iso.datetime(),
  })
  .strict();

export const TrustApplicationRequestSchema = z
  .object({
    id: RegistryIdSchema,
    applicationName: z.string().trim().min(1).max(160),
    bundleIdentifier: MacBundleIdSchema,
    stableIdentifier: RegistryIdSchema,
    applicationVersion: z.string().trim().min(1).max(80).default("unknown"),
    codeSignature: z.string().trim().min(1).max(300).default("not_verified"),
    permissionsGranted: z.array(AdapterPermissionSchema).max(30).default([]),
    trustLevel: z
      .enum(["metadata_only", "semantic_read", "interaction", "automation"])
      .default("metadata_only"),
    securityProfile: z
      .enum(["strict", "standard", "elevated_review_required"])
      .default("strict"),
  })
  .strict();

export const UpdateApplicationPermissionsRequestSchema = z
  .object({
    applicationId: RegistryIdSchema,
    permissions: z.array(AdapterPermissionSchema).max(30),
  })
  .strict();

export const ApplicationAdapterDashboardResponseSchema = z
  .object({
    trustedApplications: z.array(TrustedApplicationRecordSchema).max(500),
    applicationProfiles: z.array(ApplicationProfileRecordSchema).max(500),
    applicationCapabilities: z.array(ApplicationCapabilityRecordSchema).max(1_000),
    adapterInstances: z.array(AdapterInstanceRecordSchema).max(500),
    adapterPlugins: z.array(AdapterPluginRecordSchema).max(500),
    applicationPermissions: z.array(ApplicationPermissionRecordSchema).max(1_000),
    applicationContext: z.array(ApplicationContextRecordSchema).max(100),
    applicationEvents: z.array(ApplicationEventRecordSchema).max(1_000),
    adapterMetrics: z.array(AdapterMetricRecordSchema).max(1_000),
    adapterVersions: z.array(AdapterVersionRecordSchema).max(500),
    applicationHealth: z.array(ApplicationHealthRecordSchema).max(500),
    universalAdapterFrameworkAvailable: z.literal(true),
    genericAccessibilityAdapterAvailable: z.literal(true),
    applicationSpecificCoreHardcoding: z.literal(false),
    pixelAutomationAvailable: z.literal(false),
    ocrAutomationAvailable: z.literal(false),
    coordinateReplayAvailable: z.literal(false),
    untrustedApplicationControlAvailable: z.literal(false),
    pluginsOptional: z.literal(true),
  })
  .strict();

export type ApplicationPermissions = z.infer<typeof ApplicationPermissionsSchema>;
export type AllowedApplication = z.infer<typeof AllowedApplicationSchema>;
export type CreateApplicationRequest = z.infer<typeof CreateApplicationRequestSchema>;
export type UpdateApplicationRequest = z.infer<typeof UpdateApplicationRequestSchema>;
export type DiscoveredApplicationSource = z.infer<
  typeof DiscoveredApplicationSourceSchema
>;
export type DiscoveredMacApplication = z.infer<typeof DiscoveredMacApplicationSchema>;
export type ApplicationInstallationRecord = z.infer<
  typeof ApplicationInstallationRecordSchema
>;
export type ApplicationDiscoveryIngestRequest = z.infer<
  typeof ApplicationDiscoveryIngestRequestSchema
>;
export type ApplicationDiscoveryResponse = z.infer<
  typeof ApplicationDiscoveryResponseSchema
>;
export type AdapterPermission = z.infer<typeof AdapterPermissionSchema>;
export type AdapterCapability = z.infer<typeof AdapterCapabilitySchema>;
export type TrustedApplicationRecord = z.infer<typeof TrustedApplicationRecordSchema>;
export type ApplicationProfileRecord = z.infer<typeof ApplicationProfileRecordSchema>;
export type ApplicationCapabilityRecord = z.infer<
  typeof ApplicationCapabilityRecordSchema
>;
export type AdapterInstanceRecord = z.infer<typeof AdapterInstanceRecordSchema>;
export type AdapterPluginRecord = z.infer<typeof AdapterPluginRecordSchema>;
export type ApplicationPermissionRecord = z.infer<
  typeof ApplicationPermissionRecordSchema
>;
export type ApplicationContextRecord = z.infer<typeof ApplicationContextRecordSchema>;
export type ApplicationEventRecord = z.infer<typeof ApplicationEventRecordSchema>;
export type AdapterMetricRecord = z.infer<typeof AdapterMetricRecordSchema>;
export type AdapterVersionRecord = z.infer<typeof AdapterVersionRecordSchema>;
export type ApplicationHealthRecord = z.infer<typeof ApplicationHealthRecordSchema>;
export type TrustApplicationRequest = z.infer<typeof TrustApplicationRequestSchema>;
export type UpdateApplicationPermissionsRequest = z.infer<
  typeof UpdateApplicationPermissionsRequestSchema
>;
export type ApplicationAdapterDashboardResponse = z.infer<
  typeof ApplicationAdapterDashboardResponseSchema
>;

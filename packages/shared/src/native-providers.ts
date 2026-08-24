import { z } from "zod";

import { AdapterPermissionSchema, RegistryIdSchema } from "./applications.js";

export const NativeProviderCapabilitySchema = z.enum([
  "launch",
  "focus",
  "open_repository",
  "open_workspace",
  "focus_explorer",
  "focus_search",
  "focus_terminal",
  "open_file",
  "save_file",
  "switch_tab",
  "show_problems",
  "show_extensions",
  "close_tab",
  "open_folder",
  "reveal_file",
  "focus_downloads",
  "focus_desktop",
  "search",
  "new_folder",
  "focus_sidebar",
  "open_url",
  "new_tab",
  "reload",
  "find",
  "bookmark",
  "open_profile",
  "run_approved_command",
  "interrupt_command",
  "clear_terminal",
  "focus_session",
  "focus_semantic_control",
  "insert_text",
  "replace_selection",
  "activate_semantic_control",
  "submit_composer",
  "open_selected_resource",
]);

export const NativeSemanticTargetTypeSchema = z.enum([
  "TEXT_FIELD",
  "BUTTON",
  "DOCUMENT",
  "TAB",
  "LINK",
  "COMPOSER",
  "MENU_ITEM",
]);

export const NativeSemanticInteractionTargetSchema = z
  .object({
    type: NativeSemanticTargetTypeSchema,
    role: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(240).nullable().default(null),
    identifier: z.string().trim().min(1).max(240).nullable().default(null),
    semanticId: z.string().regex(/^[a-f0-9]{64}$/),
    registryObjectId: z.string().min(3).max(180).nullable().default(null),
    registryVersion: z.string().min(1).max(40).nullable().default(null),
    secure: z.literal(false).default(false),
    source: z.enum(["ACTIVE_CONTEXT", "CONTINUITY", "PROVIDER", "EXPLICIT"]),
    confidence: z.number().min(0).max(1),
    capturedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const NativeSemanticControlArgumentsSchema = z
  .object({ target: NativeSemanticInteractionTargetSchema })
  .strict();

export const NativeSemanticTextArgumentsSchema = z
  .object({
    target: NativeSemanticInteractionTargetSchema,
    text: z.string().min(1).max(8_000),
  })
  .strict();

export const NativeProviderStatusSchema = z.enum([
  "registered",
  "validating",
  "healthy",
  "degraded",
  "disabled",
  "unavailable",
]);

export const NativeProviderRecordSchema = z
  .object({
    id: RegistryIdSchema,
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    name: z.string().min(1).max(160),
    providerType: z.enum([
      "vscode",
      "finder",
      "terminal",
      "chrome",
      "safari",
      "slack",
      "notion",
      "figma",
      "github_desktop",
      "chatgpt",
      "codex",
    ]),
    bundleIdentifier: z.string().min(3).max(255),
    version: z.string().min(1).max(80),
    supportedMacosVersions: z.array(z.string().min(1).max(80)).max(20),
    status: NativeProviderStatusSchema,
    sandboxed: z.literal(true),
    arbitraryExecutionAvailable: z.literal(false),
    arbitraryAppleScriptAvailable: z.literal(false),
    arbitraryShellAvailable: z.literal(false),
    coordinateClickingAvailable: z.literal(false),
    keyboardReplayAvailable: z.literal(false),
    ocrAvailable: z.literal(false),
    screenshotAutomationAvailable: z.literal(false),
    unrestrictedAccessibilityAvailable: z.literal(false),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ProviderCapabilityRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    providerId: RegistryIdSchema,
    capability: NativeProviderCapabilitySchema,
    inputs: z.array(z.string().min(1).max(120)).max(30),
    outputs: z.array(z.string().min(1).max(120)).max(30),
    permissions: z.array(AdapterPermissionSchema).max(30),
    dependencies: z.array(z.string().min(1).max(160)).max(30),
    verification: z.string().min(1).max(500),
    examples: z.array(z.string().min(1).max(240)).max(20),
    riskLevel: z.enum(["read_only", "low", "medium", "high", "prohibited"]),
    enabled: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ProviderHealthRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    providerId: RegistryIdSchema,
    status: NativeProviderStatusSchema,
    availability: z.number().min(0).max(1),
    latencyMs: z.number().nonnegative(),
    executionSuccessRate: z.number().min(0).max(1),
    verificationFailureRate: z.number().min(0).max(1),
    permissionState: z.enum(["missing", "partial", "granted", "unknown"]),
    applicationVersion: z.string().min(1).max(80),
    healthScore: z.number().min(0).max(1),
    checkedAt: z.iso.datetime(),
  })
  .strict();

export const ProviderValidationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    providerId: RegistryIdSchema,
    installed: z.boolean(),
    bundleIdentifierMatches: z.boolean(),
    codeSignatureValid: z.boolean(),
    macosPermissionsGranted: z.boolean(),
    accessibilityAvailable: z.boolean(),
    providerVersionCompatible: z.boolean(),
    declaredCapabilitiesHealthy: z.boolean(),
    applicationVersionSupported: z.boolean(),
    status: z.enum(["passed", "warning", "failed"]),
    diagnostics: z.array(z.string().min(1).max(300)).max(50),
    validatedAt: z.iso.datetime(),
  })
  .strict();

export const ProviderExecutionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    executionRequestId: z.string().uuid().nullable().optional(),
    providerId: RegistryIdSchema,
    capability: NativeProviderCapabilitySchema,
    applicationId: RegistryIdSchema,
    approvedCommandId: z.string().uuid().nullable(),
    status: z.enum(["requested", "denied", "executed", "verified", "failed"]),
    inputSummary: z.string().min(1).max(500),
    resultSummary: z.string().min(1).max(500),
    verificationSummary: z.string().min(1).max(500),
    errorCode: z.string().min(1).max(120).nullable(),
    requestedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const ProviderMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    providerId: RegistryIdSchema,
    metricName: z.string().min(1).max(120),
    value: z.number(),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const ProviderDiagnosticRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    providerId: RegistryIdSchema,
    executionRequestId: z.string().uuid().nullable().optional(),
    capability: NativeProviderCapabilitySchema.nullable().optional(),
    stage: z
      .enum([
        "dashboard_dispatch",
        "backend_dispatch",
        "execution_queued",
        "transport_sent",
        "mac_agent_received",
        "mac_agent_executing",
        "provider_verifying",
        "signed_result_received",
        "dashboard_updated",
        "failed",
      ])
      .nullable()
      .optional(),
    verificationResult: z
      .enum(["pending", "succeeded", "failed"])
      .nullable()
      .optional(),
    auditEventType: z.string().min(1).max(120).nullable().optional(),
    severity: z.enum(["info", "warning", "error"]),
    message: z.string().min(1).max(500),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const ApprovedTerminalCommandRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(160),
    commandTemplate: z.string().min(1).max(300),
    placeholders: z.array(z.string().min(1).max(80)).max(20),
    allowedWorkspaceIds: z.array(RegistryIdSchema).max(50),
    riskLevel: z.enum(["medium", "high"]),
    approvalRequired: z.literal(true),
    enabled: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const NativeCapabilityDispatchRequestSchema = z
  .object({
    providerId: RegistryIdSchema,
    capability: NativeProviderCapabilitySchema,
    applicationId: RegistryIdSchema,
    interactionProposalId: z.string().uuid().optional(),
    arguments: z.record(z.string().min(1).max(80), z.json()).default({}),
    approvedCommandId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const textCapabilities: NativeProviderCapability[] = [
      "insert_text",
      "replace_selection",
    ];
    const controlCapabilities: NativeProviderCapability[] = [
      "focus_semantic_control",
      "activate_semantic_control",
      "submit_composer",
    ];
    const schema = textCapabilities.includes(value.capability)
      ? NativeSemanticTextArgumentsSchema
      : controlCapabilities.includes(value.capability)
        ? NativeSemanticControlArgumentsSchema
        : null;
    if (!schema) return;
    const parsed = schema.safeParse(value.arguments);
    if (!parsed.success)
      context.addIssue({
        code: "custom",
        path: ["arguments"],
        message: "Semantic interaction arguments are invalid for this capability.",
      });
  });

export const NativeProviderBridgeStatusSchema = z.enum([
  "not_required",
  "available_reviewed",
  "required_not_available",
]);

export const NativeProviderExecutionStatusSchema = z.enum([
  "verified",
  "failed",
  "unsupported",
  "denied",
]);

export const NativeProviderImplementationSchema = z
  .object({
    providerId: RegistryIdSchema,
    applicationId: RegistryIdSchema,
    bundleIdentifier: z.string().min(3).max(255),
    providerVersion: z.literal("17H.1"),
    implementedCapabilities: z.array(NativeProviderCapabilitySchema).max(50),
    unsupportedCapabilities: z.array(NativeProviderCapabilitySchema).max(50),
    nativeBridgeStatus: NativeProviderBridgeStatusSchema,
    accessibilityRequired: z.boolean(),
    verificationMethod: z.string().min(1).max(240),
  })
  .strict();

export const NativeProviderHostStatusSchema = z
  .object({
    available: z.boolean(),
    checkedAt: z.iso.datetime(),
    hostVersion: z.literal("17H.1"),
    nativeBridgeStatus: NativeProviderBridgeStatusSchema,
    accessibilityTrusted: z.boolean(),
    providerImplementations: z.array(NativeProviderImplementationSchema).max(20),
    arbitraryExecutionAvailable: z.literal(false),
    arbitraryAppleScriptAvailable: z.literal(false),
    arbitraryShellAvailable: z.literal(false),
    coordinateClickingAvailable: z.literal(false),
    keyboardReplayAvailable: z.literal(false),
    ocrAvailable: z.literal(false),
    screenshotAutomationAvailable: z.literal(false),
    unrestrictedAccessibilityAvailable: z.literal(false),
  })
  .strict();

export const NativeProviderExecutionTransportResultSchema = z
  .object({
    providerId: RegistryIdSchema,
    applicationId: RegistryIdSchema,
    capability: NativeProviderCapabilitySchema,
    status: NativeProviderExecutionStatusSchema,
    verified: z.boolean(),
    verificationSummary: z.string().min(1).max(500),
    resultSummary: z.string().min(1).max(500),
    errorCode: z.string().min(1).max(120).nullable(),
    latencyMs: z.number().nonnegative(),
    completedAt: z.iso.datetime(),
    nativeBridgeUsed: z.boolean(),
    semanticId: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .default(null),
    matchedCount: z.number().int().nonnegative().max(10_000).default(0),
    arbitraryExecutionAvailable: z.literal(false),
    arbitraryAppleScriptAvailable: z.literal(false),
    arbitraryShellAvailable: z.literal(false),
    coordinateClickingAvailable: z.literal(false),
    keyboardReplayAvailable: z.literal(false),
    unrestrictedAccessibilityAvailable: z.literal(false),
  })
  .strict();

export const NativeProviderDashboardResponseSchema = z
  .object({
    nativeProviders: z.array(NativeProviderRecordSchema).max(500),
    providerCapabilities: z.array(ProviderCapabilityRecordSchema).max(2_000),
    providerHealth: z.array(ProviderHealthRecordSchema).max(500),
    providerValidation: z.array(ProviderValidationRecordSchema).max(500),
    providerExecution: z.array(ProviderExecutionRecordSchema).max(1_000),
    providerMetrics: z.array(ProviderMetricRecordSchema).max(1_000),
    providerDiagnostics: z.array(ProviderDiagnosticRecordSchema).max(1_000),
    approvedTerminalCommands: z.array(ApprovedTerminalCommandRecordSchema).max(500),
    reviewedNativeProviderRuntimeAvailable: z.literal(true),
    nativeCapabilityDispatcherAvailable: z.literal(true),
    providerSandboxEnforced: z.literal(true),
    arbitraryAppleScriptAvailable: z.literal(false),
    arbitraryShellAvailable: z.literal(false),
    coordinateClickingAvailable: z.literal(false),
    keyboardReplayAvailable: z.literal(false),
    ocrAvailable: z.literal(false),
    screenshotAutomationAvailable: z.literal(false),
    unrestrictedAccessibilityAvailable: z.literal(false),
  })
  .strict();

export type NativeProviderCapability = z.infer<typeof NativeProviderCapabilitySchema>;
export type NativeSemanticInteractionTarget = z.infer<
  typeof NativeSemanticInteractionTargetSchema
>;
export type NativeProviderRecord = z.infer<typeof NativeProviderRecordSchema>;
export type ProviderCapabilityRecord = z.infer<typeof ProviderCapabilityRecordSchema>;
export type ProviderHealthRecord = z.infer<typeof ProviderHealthRecordSchema>;
export type ProviderValidationRecord = z.infer<typeof ProviderValidationRecordSchema>;
export type ProviderExecutionRecord = z.infer<typeof ProviderExecutionRecordSchema>;
export type ProviderMetricRecord = z.infer<typeof ProviderMetricRecordSchema>;
export type ProviderDiagnosticRecord = z.infer<typeof ProviderDiagnosticRecordSchema>;
export type ApprovedTerminalCommandRecord = z.infer<
  typeof ApprovedTerminalCommandRecordSchema
>;
export type NativeCapabilityDispatchRequest = z.infer<
  typeof NativeCapabilityDispatchRequestSchema
>;
export type NativeProviderHostStatus = z.infer<typeof NativeProviderHostStatusSchema>;
export type NativeProviderExecutionTransportResult = z.infer<
  typeof NativeProviderExecutionTransportResultSchema
>;
export type NativeProviderDashboardResponse = z.infer<
  typeof NativeProviderDashboardResponseSchema
>;

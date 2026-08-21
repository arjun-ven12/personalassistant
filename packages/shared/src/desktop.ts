import { z } from "zod";

import { CommandSafetyLevelSchema } from "./intent.js";

export const DesktopCapabilityCategorySchema = z.enum([
  "application_management",
  "window_management",
  "clipboard",
  "keyboard",
  "mouse",
  "filesystem",
  "browser",
  "email",
  "calendar",
  "notifications",
  "media",
  "camera",
  "microphone",
  "ocr",
  "vision",
  "networking",
  "desktop",
  "system_information",
  "developer_tools",
  "automation",
  "printing",
  "accessibility",
]);

export const DesktopCapabilityStatusSchema = z.enum([
  "available",
  "disabled",
  "unavailable",
  "experimental",
]);

export const DesktopProviderStatusSchema = z.enum([
  "healthy",
  "degraded",
  "unavailable",
  "disabled",
]);

export const DesktopActionStatusSchema = z.enum([
  "requested",
  "waiting_approval",
  "running",
  "completed",
  "failed",
  "denied",
  "cancelled",
]);

export const DesktopCapabilitySchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(160),
    category: DesktopCapabilityCategorySchema,
    description: z.string().min(1).max(1_000),
    inputSchema: z.record(z.string().max(80), z.json()),
    outputSchema: z.record(z.string().max(80), z.json()),
    permissions: z.array(z.string().min(1).max(120)).max(50),
    riskLevel: CommandSafetyLevelSchema,
    dependencies: z.array(z.string().min(1).max(160)).max(50),
    version: z.string().min(1).max(40),
    providerId: z.string().min(3).max(160),
    status: DesktopCapabilityStatusSchema,
    tags: z.array(z.string().min(1).max(80)).max(50),
    approvalRequired: z.boolean(),
    rollbackSupported: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CapabilityProviderSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(160),
    providerType: z.enum([
      "mac_agent",
      "electron_main",
      "browser_provider",
      "integration_provider",
      "mock",
      "future",
    ]),
    supportedCategories: z.array(DesktopCapabilityCategorySchema).max(50),
    status: DesktopProviderStatusSchema,
    health: z.string().min(1).max(500),
    version: z.string().min(1).max(40),
    lastCheckedAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DesktopContextSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    currentApplicationId: z.string().min(1).max(160).nullable(),
    focusedWindowId: z.string().min(1).max(160).nullable(),
    openApplications: z.array(z.string().min(1).max(160)).max(200),
    desktopLayout: z.string().min(1).max(1_000),
    clipboardSummary: z.string().min(1).max(500),
    displays: z.array(z.string().min(1).max(160)).max(20),
    recentActionIds: z.array(z.string().uuid()).max(100),
    runningWorkflowIds: z.array(z.string().uuid()).max(100),
    permissionState: z.enum(["not_requested", "partial", "available", "denied"]),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DesktopApplicationRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    displayName: z.string().min(1).max(160),
    bundleId: z.string().min(1).max(255),
    status: z.enum(["registered", "running", "not_running", "disabled"]),
    pinned: z.boolean(),
    recent: z.boolean(),
    executablePathAccepted: z.literal(false),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const WindowLayoutRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(160),
    displayId: z.string().min(1).max(160),
    windows: z.array(z.string().min(1).max(160)).max(100),
    rollbackSnapshotAvailable: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ClipboardHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    format: z.enum(["text", "image", "file", "rich_text", "unknown"]),
    summary: z.string().min(1).max(500),
    sensitive: z.boolean(),
    capturedAt: z.iso.datetime(),
  })
  .strict();

export const DesktopActionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    capabilityId: z.string().min(3).max(160),
    providerId: z.string().min(3).max(160),
    status: DesktopActionStatusSchema,
    requestedInput: z.record(z.string().max(80), z.json()),
    safeOutput: z.record(z.string().max(80), z.json()),
    riskLevel: CommandSafetyLevelSchema,
    approvalRequired: z.boolean(),
    policyChecked: z.literal(true),
    executionTimeMs: z.number().int().nonnegative(),
    warnings: z.array(z.string().min(1).max(500)).max(20),
    errorCode: z.string().min(1).max(120).nullable(),
    rollbackAvailable: z.boolean(),
    requestedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const CapabilityMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    capabilityId: z.string().min(3).max(160),
    metricName: z.string().min(1).max(120),
    value: z.number(),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const DesktopPreferenceRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    key: z.string().min(1).max(120),
    value: z.json(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DesktopObjectTypeSchema = z.enum([
  "application",
  "window",
  "dock_item",
  "menu_bar_item",
  "desktop_widget",
  "registered_folder",
  "registered_repository",
  "notification",
  "browser_tab",
  "workspace",
  "panel",
]);

export const DesktopObjectStatusSchema = z.enum([
  "registered",
  "available",
  "unavailable",
  "disabled",
]);

export const DesktopInteractionTypeSchema = z.enum([
  "hover",
  "focus",
  "inspect",
  "select",
  "activate",
  "preview",
  "move",
  "resize",
  "tile",
  "snap",
  "dock",
  "undock",
  "navigate",
  "dismiss",
]);

export const DesktopInteractionAnchorSchema = z
  .object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(120),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    z: z.number().min(-1).max(1).default(0),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const DesktopObjectRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    objectType: DesktopObjectTypeSchema,
    displayName: z.string().min(1).max(160),
    providerId: z.string().min(3).max(160),
    sourceCapabilityId: z.string().min(3).max(160).nullable(),
    status: DesktopObjectStatusSchema,
    riskLevel: CommandSafetyLevelSchema,
    capabilities: z.array(z.string().min(1).max(120)).max(50),
    permissions: z.array(z.string().min(1).max(120)).max(50),
    interactionAnchors: z.array(DesktopInteractionAnchorSchema).max(20),
    metadata: z.record(z.string().max(80), z.json()).default({}),
    current: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DesktopProfileRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    mode: z.enum([
      "development",
      "presentation",
      "meeting",
      "productivity",
      "design",
      "accessibility",
      "gaming",
      "custom",
    ]),
    active: z.boolean(),
    snapStrength: z.number().min(0).max(1),
    dwellMs: z.number().int().min(250).max(10_000),
    overlayEnabled: z.boolean(),
    cursorSensitivity: z.number().min(0.1).max(3),
    approvalPreviewRequired: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DesktopOverlaySettingsRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    enabled: z.boolean(),
    showRays: z.boolean(),
    showCursor: z.boolean(),
    showTargetHighlights: z.boolean(),
    showGestureLabels: z.boolean(),
    opacity: z.number().min(0).max(1),
    monitorId: z.string().min(1).max(160),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DockItemRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    label: z.string().min(1).max(120),
    itemType: z.enum(["application", "workflow", "command", "agent", "workspace"]),
    targetId: z.string().min(1).max(160),
    position: z.number().int().nonnegative(),
    pinned: z.boolean(),
    riskLevel: CommandSafetyLevelSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DesktopPanelRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    title: z.string().min(1).max(120),
    panelType: z.enum([
      "system_status",
      "agent_activity",
      "clipboard",
      "notifications",
      "workflows",
      "commands",
      "custom",
    ]),
    visible: z.boolean(),
    movable: z.boolean(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DesktopNavigationHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    fromObjectId: z.string().min(3).max(160).nullable(),
    toObjectId: z.string().min(3).max(160),
    gesture: z.string().min(1).max(80),
    routedThroughIntentEngine: z.literal(true),
    directOsControlAvailable: z.literal(false),
    navigatedAt: z.iso.datetime(),
  })
  .strict();

export const DesktopMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    metricName: z.string().min(1).max(120),
    value: z.number(),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const SemanticDesktopRoleSchema = z.enum([
  "application",
  "window",
  "dialog",
  "button",
  "menu",
  "menu_item",
  "toolbar",
  "sidebar_item",
  "tab",
  "tab_group",
  "list",
  "table",
  "tree",
  "card",
  "form",
  "input_field",
  "password_field",
  "search_field",
  "dropdown",
  "checkbox",
  "radio_button",
  "slider",
  "switch",
  "progress_indicator",
  "status_bar",
  "notification",
  "popover",
  "context_menu",
  "canvas_region",
  "scrollable_container",
  "terminal_panel",
  "editor",
  "split_view",
  "panel",
  "group",
  "unknown",
]);

export const SemanticDesktopActionSchema = z.enum([
  "inspect",
  "focus",
  "select",
  "click",
  "double_click",
  "activate",
  "expand",
  "collapse",
  "open",
  "close",
  "scroll",
  "scroll_into_view",
  "reveal",
  "highlight",
  "hover",
  "set_value",
  "choose",
  "deselect",
  "toggle",
  "submit",
  "cancel",
  "accept",
  "reject",
]);

export const SemanticDesktopStateSchema = z
  .object({
    enabled: z.boolean(),
    visible: z.boolean(),
    focused: z.boolean(),
    selected: z.boolean(),
    checked: z.boolean().nullable(),
    expanded: z.boolean().nullable(),
    valueSummary: z.string().max(240).nullable(),
    secureText: z.boolean(),
  })
  .strict();

export const SemanticDesktopBoundsSchema = z
  .object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  })
  .strict();

export const SemanticDesktopObjectRecordSchema = z
  .object({
    id: z.string().min(3).max(180),
    ownerId: z.string().uuid(),
    applicationId: z.string().min(3).max(160),
    windowId: z.string().min(3).max(180).nullable(),
    parentId: z.string().min(3).max(180).nullable(),
    childIds: z.array(z.string().min(3).max(180)).max(500),
    role: SemanticDesktopRoleSchema,
    displayName: z.string().min(1).max(180),
    aliases: z.array(z.string().min(1).max(120)).max(40),
    accessibilityLabel: z.string().max(300).nullable(),
    accessibilityIdentifier: z.string().max(240).nullable(),
    description: z.string().max(1_000),
    supportedActions: z.array(SemanticDesktopActionSchema).max(20),
    permissions: z.array(z.string().min(1).max(120)).max(40),
    visibility: z.enum(["visible", "hidden", "unavailable"]),
    state: SemanticDesktopStateSchema,
    bounds: SemanticDesktopBoundsSchema.nullable(),
    relationships: z.array(z.string().min(1).max(180)).max(200),
    version: z.string().min(1).max(40),
    confidence: z.number().min(0).max(1),
    source: z.enum([
      "accessibility",
      "browser_semantic_registry",
      "registered_metadata",
    ]),
    secureContentRedacted: z.literal(true),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DesktopWindowRecordSchema = z
  .object({
    id: z.string().min(3).max(180),
    ownerId: z.string().uuid(),
    applicationId: z.string().min(3).max(160),
    title: z.string().min(1).max(180),
    role: z.enum(["main", "dialog", "popover", "panel", "menu", "unknown"]),
    focused: z.boolean(),
    visible: z.boolean(),
    modal: z.boolean(),
    bounds: SemanticDesktopBoundsSchema.nullable(),
    parentWindowId: z.string().min(3).max(180).nullable(),
    semanticRootObjectId: z.string().min(3).max(180).nullable(),
    updatedAt: z.iso.datetime(),
    recordVersion: z.string().min(1).max(40),
  })
  .strict();

export const SemanticRelationshipRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    fromObjectId: z.string().min(3).max(180),
    toObjectId: z.string().min(3).max(180),
    relationship: z.enum([
      "parent_of",
      "child_of",
      "sibling_of",
      "labels",
      "controls",
      "opens",
      "belongs_to_window",
      "belongs_to_application",
    ]),
    confidence: z.number().min(0).max(1),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DesktopSemanticEventRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    eventType: z.enum([
      "window_opened",
      "window_closed",
      "control_focused",
      "dialog_appeared",
      "menu_opened",
      "selection_changed",
      "form_updated",
      "button_enabled",
      "button_disabled",
      "registry_refreshed",
      "snapshot_rejected",
    ]),
    applicationId: z.string().min(3).max(160).nullable(),
    windowId: z.string().min(3).max(180).nullable(),
    objectId: z.string().min(3).max(180).nullable(),
    summary: z.string().min(1).max(500),
    metadata: z.record(z.string().max(80), z.json()).default({}),
    occurredAt: z.iso.datetime(),
  })
  .strict();

export const AccessibilitySnapshotRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    providerId: z.string().min(3).max(160),
    applicationId: z.string().min(3).max(160),
    windowId: z.string().min(3).max(180).nullable(),
    objectCount: z.number().int().nonnegative(),
    secureFieldsRedacted: z.literal(true),
    rawPixelsCaptured: z.literal(false),
    rawOcrCaptured: z.literal(false),
    rawPasswordsCaptured: z.literal(false),
    status: z.enum(["accepted", "rejected", "partial"]),
    reason: z.string().min(1).max(500),
    capturedAt: z.iso.datetime(),
    record: z.record(z.string().max(80), z.json()).default({}),
  })
  .strict();

export const SemanticDesktopContextRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    currentApplicationId: z.string().min(3).max(160).nullable(),
    currentWindowId: z.string().min(3).max(180).nullable(),
    currentDialogId: z.string().min(3).max(180).nullable(),
    focusedObjectId: z.string().min(3).max(180).nullable(),
    selectedObjectIds: z.array(z.string().min(3).max(180)).max(100),
    currentWorkspace: z.string().max(180).nullable(),
    currentProject: z.string().max(180).nullable(),
    currentRepositoryId: z.string().uuid().nullable(),
    currentTaskId: z.string().uuid().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SemanticDesktopSearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(240),
    applicationId: z.string().min(3).max(160).nullable().default(null),
    windowId: z.string().min(3).max(180).nullable().default(null),
    roles: z.array(SemanticDesktopRoleSchema).max(30).default([]),
    visibleOnly: z.boolean().default(true),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict();

export const SemanticDesktopSearchResponseSchema = z
  .object({
    query: z.string(),
    normalizedQuery: z.string(),
    results: z
      .array(
        z.object({
          objectId: z.string().min(3).max(180),
          displayName: z.string(),
          role: SemanticDesktopRoleSchema,
          applicationId: z.string(),
          windowId: z.string().nullable(),
          confidence: z.number().min(0).max(1),
          reason: z.string().min(1).max(240),
        }),
      )
      .max(50),
    deterministic: z.literal(true),
    aiUsed: z.literal(false),
  })
  .strict();

export const DesktopNavigationActionSchema = z.enum([
  "navigate_to_object",
  "focus_object",
  "preview_object",
  "next_sibling",
  "previous_sibling",
  "parent",
  "first_child",
  "last_child",
  "back",
  "forward",
]);

export const DesktopNavigationStatusSchema = z.enum([
  "completed",
  "failed",
  "previewed",
]);

export const NavigationGraphRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    graphVersion: z.string().min(1).max(40),
    nodeCount: z.number().int().nonnegative(),
    edgeCount: z.number().int().nonnegative(),
    rootObjectIds: z.array(z.string().min(3).max(180)).max(100),
    generatedAt: z.iso.datetime(),
    deterministic: z.literal(true),
  })
  .strict();

export const FocusHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    objectId: z.string().min(3).max(180),
    previousObjectId: z.string().min(3).max(180).nullable(),
    focusReason: z.enum(["navigation", "search", "preview", "restore", "baseline"]),
    changedAt: z.iso.datetime(),
  })
  .strict();

export const SemanticNavigationHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    action: DesktopNavigationActionSchema,
    fromObjectId: z.string().min(3).max(180).nullable(),
    toObjectId: z.string().min(3).max(180).nullable(),
    status: DesktopNavigationStatusSchema,
    reason: z.string().min(1).max(500),
    readOnly: z.literal(true),
    activatedControl: z.literal(false),
    typedText: z.literal(false),
    clickedButton: z.literal(false),
    occurredAt: z.iso.datetime(),
  })
  .strict();

export const NavigationSessionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    status: z.enum(["active", "completed", "failed"]),
    currentObjectId: z.string().min(3).max(180).nullable(),
    startedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const NavigationTargetRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    objectId: z.string().min(3).max(180),
    label: z.string().min(1).max(180),
    role: SemanticDesktopRoleSchema,
    priority: z.number().min(0).max(1),
    visible: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const HighlightProfileRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    focusedColor: z.string().min(1).max(40),
    previewColor: z.string().min(1).max(40),
    reducedMotion: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const NavigationMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    metricName: z.string().min(1).max(120),
    value: z.number(),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const WindowNavigationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    windowId: z.string().min(3).max(180),
    applicationId: z.string().min(3).max(160),
    focusedObjectId: z.string().min(3).max(180).nullable(),
    navigatedAt: z.iso.datetime(),
  })
  .strict();

export const DesktopNavigationRequestSchema = z
  .object({
    action: DesktopNavigationActionSchema,
    objectId: z.string().min(3).max(180).nullable().default(null),
    query: z.string().trim().min(1).max(240).nullable().default(null),
    applicationId: z.string().min(3).max(160).nullable().default(null),
    windowId: z.string().min(3).max(180).nullable().default(null),
  })
  .strict();

export const DesktopNavigationResponseSchema = z
  .object({
    action: DesktopNavigationActionSchema,
    status: DesktopNavigationStatusSchema,
    fromObject: SemanticDesktopObjectRecordSchema.nullable(),
    targetObject: SemanticDesktopObjectRecordSchema.nullable(),
    highlightObjectId: z.string().min(3).max(180).nullable(),
    message: z.string().min(1).max(500),
    readOnly: z.literal(true),
    activatedControl: z.literal(false),
    typedText: z.literal(false),
    clickedButton: z.literal(false),
  })
  .strict();

export const SemanticInteractionActionSchema = z.enum([
  "click",
  "double_click",
  "focus",
  "activate",
  "expand",
  "collapse",
  "open",
  "close",
  "submit",
  "cancel",
  "accept",
  "reject",
  "select",
  "deselect",
  "toggle",
  "choose",
  "hover",
  "scroll_into_view",
  "reveal",
  "highlight",
  "set_value",
  "clear",
  "replace",
  "append",
  "reset",
  "review",
  "preview",
]);

export const SemanticInteractionOriginSchema = z.enum([
  "voice",
  "gesture",
  "planner",
  "command",
  "dashboard",
  "browser",
  "electron",
]);

export const SemanticInteractionStatusSchema = z.enum([
  "previewed",
  "completed",
  "waiting_approval",
  "failed",
  "denied",
  "needs_clarification",
]);

export const SemanticFieldTypeSchema = z.enum([
  "text",
  "password",
  "email",
  "search",
  "number",
  "date",
  "time",
  "dropdown",
  "checkbox",
  "radio",
  "slider",
  "multi_select",
]);

export const FieldValidationRuleSchema = z
  .object({
    required: z.boolean().default(false),
    minLength: z.number().int().nonnegative().max(10_000).nullable().default(null),
    maxLength: z.number().int().positive().max(10_000).nullable().default(null),
    regex: z.string().min(1).max(500).nullable().default(null),
    min: z.number().nullable().default(null),
    max: z.number().nullable().default(null),
    allowedValues: z.array(z.string().min(1).max(300)).max(500).default([]),
  })
  .strict();

export const FieldMappingRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    objectId: z.string().min(3).max(180),
    fieldKey: z.string().min(1).max(160),
    label: z.string().min(1).max(180),
    aliases: z.array(z.string().min(1).max(120)).max(40),
    fieldType: SemanticFieldTypeSchema,
    semanticTags: z.array(z.string().min(1).max(80)).max(40),
    validation: FieldValidationRuleSchema,
    secureEntryAllowed: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SemanticInteractionTargetSchema = z
  .object({
    objectId: z.string().min(3).max(180).nullable().default(null),
    query: z.string().trim().min(1).max(240).nullable().default(null),
    fieldKey: z.string().min(1).max(160).nullable().default(null),
    applicationId: z.string().min(3).max(160).nullable().default(null),
    windowId: z.string().min(3).max(180).nullable().default(null),
    contextObjectId: z.string().min(3).max(180).nullable().default(null),
  })
  .strict();

export const SemanticInteractionStepSchema = z
  .object({
    action: SemanticInteractionActionSchema,
    target: SemanticInteractionTargetSchema,
    value: z.json().optional(),
  })
  .strict();

export const SemanticInteractionRequestSchema = z
  .object({
    origin: SemanticInteractionOriginSchema,
    action: SemanticInteractionActionSchema,
    target: SemanticInteractionTargetSchema,
    value: z.json().optional(),
    preview: z.boolean().default(false),
    steps: z.array(SemanticInteractionStepSchema).max(20).default([]),
  })
  .strict();

export const FormFillRequestSchema = z
  .object({
    origin: SemanticInteractionOriginSchema,
    formObjectId: z.string().min(3).max(180).nullable().default(null),
    fields: z
      .array(
        z
          .object({
            field: z.string().trim().min(1).max(180),
            value: z.json(),
            mode: z.enum(["fill", "clear", "replace", "append"]).default("replace"),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    submit: z.boolean().default(false),
    preview: z.boolean().default(false),
  })
  .strict();

export const TargetResolutionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    query: z.string().max(240).nullable(),
    objectId: z.string().min(3).max(180).nullable(),
    resolvedObjectId: z.string().min(3).max(180).nullable(),
    status: z.enum(["resolved", "ambiguous", "not_found", "invalid", "denied"]),
    confidence: z.number().min(0).max(1),
    candidateObjectIds: z.array(z.string().min(3).max(180)).max(10),
    reason: z.string().min(1).max(500),
    validatedVisible: z.boolean(),
    validatedEnabled: z.boolean(),
    validatedPermission: z.boolean(),
    supportedActions: z.array(SemanticDesktopActionSchema).max(40),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const SemanticActionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    interactionId: z.string().uuid(),
    sequence: z.number().int().nonnegative(),
    action: SemanticInteractionActionSchema,
    targetObjectId: z.string().min(3).max(180).nullable(),
    fieldMappingId: z.string().uuid().nullable(),
    capabilityId: z.string().min(3).max(160),
    status: SemanticInteractionStatusSchema,
    validationStatus: z.enum(["passed", "failed", "not_required"]),
    verificationStatus: z.enum(["passed", "failed", "pending", "not_required"]),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const SemanticInteractionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    origin: SemanticInteractionOriginSchema,
    requestedAction: SemanticInteractionActionSchema,
    targetObjectId: z.string().min(3).max(180).nullable(),
    targetDisplayName: z.string().max(180).nullable(),
    targetRole: SemanticDesktopRoleSchema.nullable(),
    semanticMetadata: z.record(z.string().max(80), z.json()).default({}),
    status: SemanticInteractionStatusSchema,
    preview: z.boolean(),
    capabilityId: z.string().min(3).max(160),
    policyChecked: z.literal(true),
    deterministic: z.literal(true),
    aiUsed: z.literal(false),
    ocrUsed: z.literal(false),
    computerVisionUsed: z.literal(false),
    coordinateAutomationUsed: z.literal(false),
    ambiguityReason: z.string().max(500).nullable(),
    failureReason: z.string().max(500).nullable(),
    requestedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const InteractionHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    interactionId: z.string().uuid(),
    action: SemanticInteractionActionSchema,
    targetObjectId: z.string().min(3).max(180).nullable(),
    origin: SemanticInteractionOriginSchema,
    result: SemanticInteractionStatusSchema,
    summary: z.string().min(1).max(500),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const InteractionVerificationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    interactionId: z.string().uuid(),
    targetObjectId: z.string().min(3).max(180).nullable(),
    verificationType: z.enum([
      "state_changed",
      "value_updated",
      "selection_changed",
      "dialog_closed",
      "submission_completed",
      "preview_visible",
      "capability_recorded",
    ]),
    status: z.enum(["passed", "failed", "pending", "not_required"]),
    expected: z.string().max(300).nullable(),
    observed: z.string().max(300).nullable(),
    latencyMs: z.number().int().nonnegative(),
    verifiedAt: z.iso.datetime(),
  })
  .strict();

export const InteractionFailureRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    interactionId: z.string().uuid(),
    targetObjectId: z.string().min(3).max(180).nullable(),
    failureCode: z.string().min(1).max(120),
    reason: z.string().min(1).max(500),
    retrySafe: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const DesktopInteractionProfileRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    previewRequiredForRisk: z.array(CommandSafetyLevelSchema).max(5),
    safeRetryActions: z.array(SemanticInteractionActionSchema).max(20),
    securePasswordEntryDefault: z.literal(false),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DesktopInteractionMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    metricName: z.string().min(1).max(120),
    value: z.number(),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const SemanticInteractionResponseSchema = z
  .object({
    interaction: SemanticInteractionRecordSchema,
    target: SemanticDesktopObjectRecordSchema.nullable(),
    actions: z.array(SemanticActionRecordSchema).max(20),
    verification: z.array(InteractionVerificationRecordSchema).max(20),
    message: z.string().min(1).max(700),
    requiresClarification: z.boolean(),
    clarificationPrompt: z.string().max(700).nullable(),
    deterministic: z.literal(true),
    aiUsed: z.literal(false),
  })
  .strict();

export const DesktopControlCenterResponseSchema = z
  .object({
    capabilities: z.array(DesktopCapabilitySchema).max(500),
    providers: z.array(CapabilityProviderSchema).max(200),
    contexts: z.array(DesktopContextSchema).max(50),
    applications: z.array(DesktopApplicationRecordSchema).max(500),
    windowLayouts: z.array(WindowLayoutRecordSchema).max(500),
    clipboardHistory: z.array(ClipboardHistoryRecordSchema).max(500),
    actions: z.array(DesktopActionRecordSchema).max(500),
    metrics: z.array(CapabilityMetricRecordSchema).max(500),
    preferences: z.array(DesktopPreferenceRecordSchema).max(500),
    desktopObjects: z.array(DesktopObjectRecordSchema).max(1_000),
    desktopProfiles: z.array(DesktopProfileRecordSchema).max(100),
    overlaySettings: z.array(DesktopOverlaySettingsRecordSchema).max(50),
    dockItems: z.array(DockItemRecordSchema).max(200),
    desktopPanels: z.array(DesktopPanelRecordSchema).max(200),
    desktopNavigationHistory: z.array(DesktopNavigationHistoryRecordSchema).max(500),
    desktopMetrics: z.array(DesktopMetricRecordSchema).max(500),
    desktopWindows: z.array(DesktopWindowRecordSchema).max(500),
    semanticObjects: z.array(SemanticDesktopObjectRecordSchema).max(2_000),
    semanticRelationships: z.array(SemanticRelationshipRecordSchema).max(2_000),
    semanticEvents: z.array(DesktopSemanticEventRecordSchema).max(500),
    accessibilitySnapshots: z.array(AccessibilitySnapshotRecordSchema).max(500),
    semanticDesktopContexts: z.array(SemanticDesktopContextRecordSchema).max(50),
    navigationGraphs: z.array(NavigationGraphRecordSchema).max(100),
    focusHistory: z.array(FocusHistoryRecordSchema).max(500),
    semanticNavigationHistory: z.array(SemanticNavigationHistoryRecordSchema).max(500),
    navigationSessions: z.array(NavigationSessionRecordSchema).max(100),
    navigationTargets: z.array(NavigationTargetRecordSchema).max(1_000),
    highlightProfiles: z.array(HighlightProfileRecordSchema).max(50),
    navigationMetrics: z.array(NavigationMetricRecordSchema).max(500),
    windowNavigation: z.array(WindowNavigationRecordSchema).max(500),
    semanticInteractions: z.array(SemanticInteractionRecordSchema).max(500),
    interactionHistory: z.array(InteractionHistoryRecordSchema).max(500),
    interactionVerification: z.array(InteractionVerificationRecordSchema).max(500),
    fieldMappings: z.array(FieldMappingRecordSchema).max(1_000),
    interactionFailures: z.array(InteractionFailureRecordSchema).max(500),
    interactionProfiles: z.array(DesktopInteractionProfileRecordSchema).max(100),
    interactionMetrics: z.array(DesktopInteractionMetricRecordSchema).max(500),
    semanticActions: z.array(SemanticActionRecordSchema).max(1_000),
    genericExecutorAvailable: z.literal(false),
    unrestrictedAccessibilityAvailable: z.literal(false),
    semanticDesktopModelAvailable: z.literal(true),
    semanticDesktopNavigationAvailable: z.literal(true),
    semanticInteractionEngineAvailable: z.literal(true),
    nativeAccessibilityProviderAvailable: z.boolean(),
    computerVisionRequiredForSemanticModel: z.literal(false),
    ocrRequiredForAccessibilityObjects: z.literal(false),
    arbitraryAppleScriptAvailable: z.literal(false),
    spatialDesktopLayerAvailable: z.literal(true),
    directOsPointerControlAvailable: z.literal(false),
    unrestrictedDesktopAutomationAvailable: z.literal(false),
    pixelAutomationAvailable: z.literal(false),
    coordinateAutomationAvailable: z.literal(false),
    semanticInteractionRequiresDesktopCapabilityLayer: z.literal(true),
  })
  .strict();

export const DesktopCapabilityRequestSchema = z
  .object({
    capabilityId: z.string().min(3).max(160),
    input: z.record(z.string().max(80), z.json()).default({}),
  })
  .strict();

export const DesktopSpatialInteractionRequestSchema = z
  .object({
    objectId: z.string().min(3).max(160),
    interactionType: DesktopInteractionTypeSchema,
    gesture: z.string().min(1).max(80).optional(),
    anchorId: z.string().min(1).max(80).optional(),
    profileId: z.string().min(3).max(160).optional(),
    intentPreview: z.string().min(1).max(300).optional(),
    input: z.record(z.string().max(80), z.json()).default({}),
  })
  .strict()
  .refine(
    (value) =>
      !Object.keys(value.input).some((key) =>
        ["rawMouse", "rawKeyboard", "appleScript", "shell", "executablePath"].includes(
          key,
        ),
      ),
    "Spatial desktop interactions must not contain raw OS automation inputs.",
  );

export type DesktopCapabilityCategory = z.infer<typeof DesktopCapabilityCategorySchema>;
export type DesktopCapability = z.infer<typeof DesktopCapabilitySchema>;
export type CapabilityProvider = z.infer<typeof CapabilityProviderSchema>;
export type DesktopContext = z.infer<typeof DesktopContextSchema>;
export type DesktopApplicationRecord = z.infer<typeof DesktopApplicationRecordSchema>;
export type WindowLayoutRecord = z.infer<typeof WindowLayoutRecordSchema>;
export type ClipboardHistoryRecord = z.infer<typeof ClipboardHistoryRecordSchema>;
export type DesktopActionRecord = z.infer<typeof DesktopActionRecordSchema>;
export type CapabilityMetricRecord = z.infer<typeof CapabilityMetricRecordSchema>;
export type DesktopPreferenceRecord = z.infer<typeof DesktopPreferenceRecordSchema>;
export type DesktopObjectType = z.infer<typeof DesktopObjectTypeSchema>;
export type DesktopObjectRecord = z.infer<typeof DesktopObjectRecordSchema>;
export type DesktopProfileRecord = z.infer<typeof DesktopProfileRecordSchema>;
export type DesktopOverlaySettingsRecord = z.infer<
  typeof DesktopOverlaySettingsRecordSchema
>;
export type DockItemRecord = z.infer<typeof DockItemRecordSchema>;
export type DesktopPanelRecord = z.infer<typeof DesktopPanelRecordSchema>;
export type DesktopNavigationHistoryRecord = z.infer<
  typeof DesktopNavigationHistoryRecordSchema
>;
export type DesktopMetricRecord = z.infer<typeof DesktopMetricRecordSchema>;
export type SemanticDesktopRole = z.infer<typeof SemanticDesktopRoleSchema>;
export type SemanticDesktopObjectRecord = z.infer<
  typeof SemanticDesktopObjectRecordSchema
>;
export type DesktopWindowRecord = z.infer<typeof DesktopWindowRecordSchema>;
export type SemanticRelationshipRecord = z.infer<
  typeof SemanticRelationshipRecordSchema
>;
export type DesktopSemanticEventRecord = z.infer<
  typeof DesktopSemanticEventRecordSchema
>;
export type AccessibilitySnapshotRecord = z.infer<
  typeof AccessibilitySnapshotRecordSchema
>;
export type SemanticDesktopContextRecord = z.infer<
  typeof SemanticDesktopContextRecordSchema
>;
export type SemanticDesktopSearchRequest = z.infer<
  typeof SemanticDesktopSearchRequestSchema
>;
export type SemanticDesktopSearchResponse = z.infer<
  typeof SemanticDesktopSearchResponseSchema
>;
export type DesktopNavigationAction = z.infer<typeof DesktopNavigationActionSchema>;
export type NavigationGraphRecord = z.infer<typeof NavigationGraphRecordSchema>;
export type FocusHistoryRecord = z.infer<typeof FocusHistoryRecordSchema>;
export type SemanticNavigationHistoryRecord = z.infer<
  typeof SemanticNavigationHistoryRecordSchema
>;
export type NavigationSessionRecord = z.infer<typeof NavigationSessionRecordSchema>;
export type NavigationTargetRecord = z.infer<typeof NavigationTargetRecordSchema>;
export type HighlightProfileRecord = z.infer<typeof HighlightProfileRecordSchema>;
export type NavigationMetricRecord = z.infer<typeof NavigationMetricRecordSchema>;
export type WindowNavigationRecord = z.infer<typeof WindowNavigationRecordSchema>;
export type DesktopNavigationRequest = z.infer<typeof DesktopNavigationRequestSchema>;
export type DesktopNavigationResponse = z.infer<typeof DesktopNavigationResponseSchema>;
export type SemanticInteractionAction = z.infer<typeof SemanticInteractionActionSchema>;
export type SemanticInteractionOrigin = z.infer<typeof SemanticInteractionOriginSchema>;
export type SemanticInteractionStatus = z.infer<typeof SemanticInteractionStatusSchema>;
export type SemanticFieldType = z.infer<typeof SemanticFieldTypeSchema>;
export type FieldMappingRecord = z.infer<typeof FieldMappingRecordSchema>;
export type SemanticInteractionRequest = z.infer<
  typeof SemanticInteractionRequestSchema
>;
export type FormFillRequest = z.infer<typeof FormFillRequestSchema>;
export type TargetResolutionRecord = z.infer<typeof TargetResolutionRecordSchema>;
export type SemanticActionRecord = z.infer<typeof SemanticActionRecordSchema>;
export type SemanticInteractionRecord = z.infer<typeof SemanticInteractionRecordSchema>;
export type InteractionHistoryRecord = z.infer<typeof InteractionHistoryRecordSchema>;
export type InteractionVerificationRecord = z.infer<
  typeof InteractionVerificationRecordSchema
>;
export type InteractionFailureRecord = z.infer<typeof InteractionFailureRecordSchema>;
export type DesktopInteractionProfileRecord = z.infer<
  typeof DesktopInteractionProfileRecordSchema
>;
export type DesktopInteractionMetricRecord = z.infer<
  typeof DesktopInteractionMetricRecordSchema
>;
export type SemanticInteractionResponse = z.infer<
  typeof SemanticInteractionResponseSchema
>;
export type DesktopCapabilityRequest = z.infer<typeof DesktopCapabilityRequestSchema>;
export type DesktopSpatialInteractionRequest = z.infer<
  typeof DesktopSpatialInteractionRequestSchema
>;
export type DesktopControlCenterResponse = z.infer<
  typeof DesktopControlCenterResponseSchema
>;

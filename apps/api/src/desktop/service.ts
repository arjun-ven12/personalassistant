import {
  CapabilityMetricRecordSchema,
  CapabilityProviderSchema,
  ClipboardHistoryRecordSchema,
  DesktopActionRecordSchema,
  DesktopApplicationRecordSchema,
  DesktopCapabilityRequestSchema,
  DesktopCapabilitySchema,
  DesktopContextSchema,
  DesktopControlCenterResponseSchema,
  FormFillRequestSchema,
  DesktopNavigationRequestSchema,
  DesktopNavigationResponseSchema,
  DesktopSemanticEventRecordSchema,
  DesktopWindowRecordSchema,
  FocusHistoryRecordSchema,
  HighlightProfileRecordSchema,
  NavigationGraphRecordSchema,
  NavigationMetricRecordSchema,
  NavigationSessionRecordSchema,
  NavigationTargetRecordSchema,
  DesktopMetricRecordSchema,
  DesktopNavigationHistoryRecordSchema,
  DesktopObjectRecordSchema,
  DesktopOverlaySettingsRecordSchema,
  DesktopPanelRecordSchema,
  DesktopProfileRecordSchema,
  DesktopPreferenceRecordSchema,
  DesktopSpatialInteractionRequestSchema,
  DockItemRecordSchema,
  SemanticDesktopContextRecordSchema,
  SemanticDesktopObjectRecordSchema,
  SemanticInteractionResponseSchema,
  SemanticDesktopSearchRequestSchema,
  SemanticDesktopSearchResponseSchema,
  SemanticNavigationHistoryRecordSchema,
  SemanticRelationshipRecordSchema,
  WindowNavigationRecordSchema,
  WindowLayoutRecordSchema,
  type CommandSafetyLevel,
  type DesktopCapabilityCategory,
  type SemanticDesktopObjectRecord,
} from "@alexa-control/shared";

import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { SemanticInteractionService } from "./interaction-services.js";
import type { DesktopStore } from "./store.js";

const categories: DesktopCapabilityCategory[] = [
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
];

const baselineCapability = (
  ownerId: string,
  at: string,
  category: DesktopCapabilityCategory,
) => {
  const available = category === "desktop" || category === "system_information";
  const id =
    category === "desktop"
      ? "desktop.context.read"
      : category === "system_information"
        ? "system_information.framework_status"
        : `${category}.provider_required`;
  const mutating = [
    "application_management",
    "window_management",
    "clipboard",
    "keyboard",
    "mouse",
    "filesystem",
    "browser",
    "email",
    "calendar",
    "media",
    "camera",
    "microphone",
    "accessibility",
    "automation",
  ].includes(category);
  const riskLevel: CommandSafetyLevel = mutating
    ? category === "filesystem" || category === "email" || category === "calendar"
      ? "high_risk"
      : "moderate_risk"
    : "read_only";
  return DesktopCapabilitySchema.parse({
    id,
    ownerId,
    name: available
      ? category === "desktop"
        ? "Read desktop context"
        : "Query capability framework status"
      : `${category.replaceAll("_", " ")} provider boundary`,
    category,
    description: available
      ? "Safe metadata-only capability served by the governed desktop layer."
      : "Capability contract is registered, but no reviewed OS provider is installed.",
    inputSchema: {},
    outputSchema: {},
    permissions: available ? ["owner_session"] : [`${category}_permission`],
    riskLevel,
    dependencies: available ? [] : ["reviewed_desktop_provider"],
    version: "1.0.0",
    providerId: available ? "desktop_metadata_provider" : "mac_agent_desktop_provider",
    status: available ? "available" : "unavailable",
    tags: [category, available ? "metadata" : "provider_required"],
    approvalRequired: riskLevel !== "read_only",
    rollbackSupported: mutating,
    createdAt: at,
    updatedAt: at,
  });
};

export class DesktopCapabilityService {
  readonly interactions: SemanticInteractionService;

  constructor(
    readonly store: DesktopStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {
    this.interactions = new SemanticInteractionService(store, audit, now);
  }

  async dashboard(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return DesktopControlCenterResponseSchema.parse({
      capabilities: await this.store.listCapabilities(ownerId, 500),
      providers: await this.store.listProviders(ownerId, 200),
      contexts: await this.store.listContexts(ownerId, 50),
      applications: await this.store.listApplications(ownerId, 500),
      windowLayouts: await this.store.listWindowLayouts(ownerId, 500),
      clipboardHistory: await this.store.listClipboard(ownerId, 500),
      actions: await this.store.listActions(ownerId, 500),
      metrics: await this.store.listMetrics(ownerId, 500),
      preferences: await this.store.listPreferences(ownerId, 500),
      desktopObjects: await this.store.listDesktopObjects(ownerId, 1_000),
      desktopProfiles: await this.store.listDesktopProfiles(ownerId, 100),
      overlaySettings: await this.store.listOverlaySettings(ownerId, 50),
      dockItems: await this.store.listDockItems(ownerId, 200),
      desktopPanels: await this.store.listDesktopPanels(ownerId, 200),
      desktopNavigationHistory: await this.store.listDesktopNavigationHistory(
        ownerId,
        500,
      ),
      desktopMetrics: await this.store.listDesktopMetrics(ownerId, 500),
      desktopWindows: await this.store.listDesktopWindows(ownerId, 500),
      semanticObjects: await this.store.listSemanticObjects(ownerId, 2_000),
      semanticRelationships: await this.store.listSemanticRelationships(ownerId, 2_000),
      semanticEvents: await this.store.listSemanticEvents(ownerId, 500),
      accessibilitySnapshots: await this.store.listAccessibilitySnapshots(ownerId, 500),
      semanticDesktopContexts: await this.store.listSemanticDesktopContexts(
        ownerId,
        50,
      ),
      navigationGraphs: await this.store.listNavigationGraphs(ownerId, 100),
      focusHistory: await this.store.listFocusHistory(ownerId, 500),
      semanticNavigationHistory: await this.store.listSemanticNavigationHistory(
        ownerId,
        500,
      ),
      navigationSessions: await this.store.listNavigationSessions(ownerId, 100),
      navigationTargets: await this.store.listNavigationTargets(ownerId, 1_000),
      highlightProfiles: await this.store.listHighlightProfiles(ownerId, 50),
      navigationMetrics: await this.store.listNavigationMetrics(ownerId, 500),
      windowNavigation: await this.store.listWindowNavigation(ownerId, 500),
      semanticInteractions: await this.store.listSemanticInteractions(ownerId, 500),
      interactionHistory: await this.store.listInteractionHistory(ownerId, 500),
      interactionVerification: await this.store.listInteractionVerification(
        ownerId,
        500,
      ),
      fieldMappings: await this.store.listFieldMappings(ownerId, 1_000),
      interactionFailures: await this.store.listInteractionFailures(ownerId, 500),
      interactionProfiles: await this.store.listInteractionProfiles(ownerId, 100),
      interactionMetrics: await this.store.listInteractionMetrics(ownerId, 500),
      semanticActions: await this.store.listSemanticActions(ownerId, 1_000),
      genericExecutorAvailable: false,
      unrestrictedAccessibilityAvailable: false,
      semanticDesktopModelAvailable: true,
      semanticDesktopNavigationAvailable: true,
      semanticInteractionEngineAvailable: true,
      nativeAccessibilityProviderAvailable: false,
      computerVisionRequiredForSemanticModel: false,
      ocrRequiredForAccessibilityObjects: false,
      arbitraryAppleScriptAvailable: false,
      spatialDesktopLayerAvailable: true,
      directOsPointerControlAvailable: false,
      unrestrictedDesktopAutomationAvailable: false,
      pixelAutomationAvailable: false,
      coordinateAutomationAvailable: false,
      semanticInteractionRequiresDesktopCapabilityLayer: true,
    });
  }

  async interactSemantically(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    return SemanticInteractionResponseSchema.parse(
      await this.interactions.interact(input),
    );
  }

  async fillSemanticForm(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const body = FormFillRequestSchema.parse(input.body);
    return SemanticInteractionResponseSchema.parse(
      await this.interactions.fillForm({ ...input, body }),
    );
  }

  async refreshContext(input: {
    ownerId: string;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const context = await this.recordContext(input.ownerId);
    await this.audit({
      eventType: "DESKTOP_CONTEXT_REFRESHED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Desktop context metadata refreshed without OS inspection.",
      metadata: { contextId: context.id },
      requestId: input.requestId,
    });
    return this.dashboard(input.ownerId);
  }

  async navigateSemanticDesktop(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = DesktopNavigationRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    const contexts = await this.store.listSemanticDesktopContexts(input.ownerId, 1);
    const currentObjectId = contexts[0]?.focusedObjectId ?? null;
    const current = currentObjectId
      ? await this.store.getSemanticObject(input.ownerId, currentObjectId)
      : null;
    const objects = await this.store.listSemanticObjects(input.ownerId, 2_000);
    const target = await this.resolveNavigationTarget(
      input.ownerId,
      parsed,
      current,
      objects,
    );
    const status = target
      ? parsed.action === "preview_object"
        ? "previewed"
        : "completed"
      : "failed";
    const response = DesktopNavigationResponseSchema.parse({
      action: parsed.action,
      status,
      fromObject: current,
      targetObject: target,
      highlightObjectId: target?.id ?? null,
      message: target
        ? `${parsed.action.replaceAll("_", " ")} prepared focus for ${target.displayName}. No control was activated.`
        : "Navigation target could not be resolved deterministically.",
      readOnly: true,
      activatedControl: false,
      typedText: false,
      clickedButton: false,
    });
    await this.store.saveSemanticNavigationHistory(
      SemanticNavigationHistoryRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        action: parsed.action,
        fromObjectId: current?.id ?? null,
        toObjectId: target?.id ?? null,
        status,
        reason: response.message,
        readOnly: true,
        activatedControl: false,
        typedText: false,
        clickedButton: false,
        occurredAt: at,
      }),
    );
    if (target) {
      await this.store.saveFocusHistory(
        FocusHistoryRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          objectId: target.id,
          previousObjectId: current?.id ?? null,
          focusReason: parsed.action === "preview_object" ? "preview" : "navigation",
          changedAt: at,
        }),
      );
      await this.store.saveSemanticDesktopContext(
        SemanticDesktopContextRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          currentApplicationId: target.applicationId,
          currentWindowId: target.windowId,
          currentDialogId: target.role === "dialog" ? target.id : null,
          focusedObjectId: target.id,
          selectedObjectIds: [],
          currentWorkspace: "dashboard",
          currentProject: null,
          currentRepositoryId: null,
          currentTaskId: null,
          updatedAt: at,
        }),
      );
      await this.store.saveWindowNavigation(
        WindowNavigationRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          windowId: target.windowId ?? "semantic.window.unknown",
          applicationId: target.applicationId,
          focusedObjectId: target.id,
          navigatedAt: at,
        }),
      );
      await this.store.saveSemanticEvent(
        DesktopSemanticEventRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          eventType: "control_focused",
          applicationId: target.applicationId,
          windowId: target.windowId,
          objectId: target.id,
          summary:
            "Semantic desktop navigation changed focus metadata only. No activation occurred.",
          metadata: {
            action: parsed.action,
            readOnly: true,
            activatedControl: false,
          },
          occurredAt: at,
        }),
      );
    }
    await this.store.saveNavigationMetric(
      NavigationMetricRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        metricName: status === "failed" ? "navigation_failed" : "navigation_completed",
        value: 1,
        measuredAt: at,
      }),
    );
    await this.audit({
      eventType:
        status === "failed"
          ? "DESKTOP_NAVIGATION_FAILED"
          : parsed.action === "preview_object"
            ? "DESKTOP_TARGET_HIGHLIGHTED"
            : "DESKTOP_NAVIGATION_COMPLETED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: status === "failed" ? "DENIED" : "SUCCESS",
      reason: response.message,
      requestId: input.requestId,
      metadata: {
        action: parsed.action,
        targetObjectId: target?.id ?? null,
        readOnly: true,
        activatedControl: false,
        clickedButton: false,
        typedText: false,
      },
    });
    return response;
  }

  async searchSemanticDesktop(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = SemanticDesktopSearchRequestSchema.parse(input.body);
    const normalized = normalize(parsed.query);
    const objects = await this.store.listSemanticObjects(input.ownerId, 2_000);
    const results = objects
      .filter((object) => !parsed.visibleOnly || object.visibility === "visible")
      .filter(
        (object) =>
          !parsed.applicationId || object.applicationId === parsed.applicationId,
      )
      .filter((object) => !parsed.windowId || object.windowId === parsed.windowId)
      .filter(
        (object) => parsed.roles.length === 0 || parsed.roles.includes(object.role),
      )
      .map((object) => rankSemanticObject(object, normalized))
      .filter((result) => result.confidence > 0)
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, parsed.limit);
    await this.audit({
      eventType: "SEMANTIC_DESKTOP_SEARCHED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason:
        "Semantic desktop registry searched deterministically without AI, OCR, or pixel inspection.",
      requestId: input.requestId,
      metadata: {
        resultCount: results.length,
        aiUsed: false,
        computerVisionUsed: false,
        ocrUsed: false,
      },
    });
    return SemanticDesktopSearchResponseSchema.parse({
      query: parsed.query,
      normalizedQuery: normalized,
      results,
      deterministic: true,
      aiUsed: false,
    });
  }

  async requestCapability(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = DesktopCapabilityRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    const capability = await this.store.getCapability(
      input.ownerId,
      parsed.capabilityId,
    );
    if (!capability) {
      throw new ExecutionError(
        404,
        "DESKTOP_CAPABILITY_NOT_FOUND",
        "Capability not found.",
      );
    }
    const provider = await this.store.getProvider(input.ownerId, capability.providerId);
    const providerReady = provider?.status === "healthy";
    const status =
      capability.status !== "available" || !providerReady
        ? "denied"
        : capability.approvalRequired
          ? "waiting_approval"
          : "completed";
    const action = DesktopActionRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      capabilityId: capability.id,
      providerId: capability.providerId,
      status,
      requestedInput: parsed.input,
      safeOutput:
        status === "completed"
          ? {
              message:
                "Metadata-only desktop capability completed. No operating-system action was performed.",
            }
          : {},
      riskLevel: capability.riskLevel,
      approvalRequired: capability.approvalRequired,
      policyChecked: true,
      executionTimeMs: 0,
      warnings:
        status === "denied"
          ? ["No reviewed healthy provider is installed for this desktop capability."]
          : [],
      errorCode: status === "denied" ? "DESKTOP_PROVIDER_UNAVAILABLE" : null,
      rollbackAvailable: false,
      requestedAt: at,
      completedAt: status === "completed" || status === "denied" ? at : null,
    });
    await this.store.saveAction(action);
    await this.audit({
      eventType:
        status === "denied"
          ? "DESKTOP_ACTION_DENIED"
          : status === "waiting_approval"
            ? "DESKTOP_ACTION_APPROVAL_REQUIRED"
            : "DESKTOP_ACTION_COMPLETED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: status === "denied" ? "DENIED" : "SUCCESS",
      reason:
        status === "denied"
          ? "Desktop capability denied because provider is unavailable."
          : "Desktop capability request recorded through governed layer.",
      metadata: {
        actionId: action.id,
        capabilityId: capability.id,
        providerId: capability.providerId,
        genericExecutorAvailable: false,
      },
      requestId: input.requestId,
    });
    return this.dashboard(input.ownerId);
  }

  async requestSpatialDesktopInteraction(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = DesktopSpatialInteractionRequestSchema.parse(input.body);
    const object = await this.store.getDesktopObject(input.ownerId, parsed.objectId);
    if (!object) {
      throw new ExecutionError(
        404,
        "DESKTOP_OBJECT_NOT_FOUND",
        "Desktop object not found.",
      );
    }
    const at = this.now().toISOString();
    const capabilityId = object.sourceCapabilityId ?? "desktop.context.read";
    const capability = await this.store.getCapability(input.ownerId, capabilityId);
    if (!capability) {
      throw new ExecutionError(
        404,
        "DESKTOP_CAPABILITY_NOT_FOUND",
        "Desktop object capability not found.",
      );
    }
    const provider = await this.store.getProvider(input.ownerId, capability.providerId);
    const readOnlyInspection = ["hover", "focus", "inspect", "preview"].includes(
      parsed.interactionType,
    );
    const providerReady = provider?.status === "healthy";
    const status =
      capability.status !== "available" ||
      !providerReady ||
      object.status === "unavailable"
        ? "denied"
        : capability.approvalRequired && !readOnlyInspection
          ? "waiting_approval"
          : "completed";
    const action = DesktopActionRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      capabilityId: capability.id,
      providerId: capability.providerId,
      status,
      requestedInput: {
        objectId: object.id,
        interactionType: parsed.interactionType,
        gesture: parsed.gesture ?? "unspecified",
        anchorId: parsed.anchorId ?? "primary",
        profileId: parsed.profileId ?? "desktop.profile.development",
        intentPreview:
          parsed.intentPreview ??
          `Spatial ${parsed.interactionType} interaction for ${object.displayName}.`,
        input: parsed.input,
      },
      safeOutput:
        status === "completed"
          ? {
              objectId: object.id,
              objectType: object.objectType,
              message:
                "Spatial desktop interaction recorded through governed Desktop Capability Layer. No direct OS control was performed.",
            }
          : {},
      riskLevel: capability.riskLevel,
      approvalRequired: capability.approvalRequired && !readOnlyInspection,
      policyChecked: true,
      executionTimeMs: 0,
      warnings:
        status === "denied"
          ? [
              "Spatial desktop interaction denied because the required reviewed provider or object is unavailable.",
            ]
          : [],
      errorCode: status === "denied" ? "DESKTOP_SPATIAL_PROVIDER_UNAVAILABLE" : null,
      rollbackAvailable: false,
      requestedAt: at,
      completedAt: status === "completed" || status === "denied" ? at : null,
    });
    await this.store.saveAction(action);
    await this.store.saveDesktopNavigationHistory(
      DesktopNavigationHistoryRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        fromObjectId: null,
        toObjectId: object.id,
        gesture: parsed.gesture ?? "unspecified",
        routedThroughIntentEngine: true,
        directOsControlAvailable: false,
        navigatedAt: at,
      }),
    );
    await this.store.saveDesktopMetric(
      DesktopMetricRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        metricName: "spatial_desktop_interaction_recorded",
        value: 1,
        measuredAt: at,
      }),
    );
    await this.audit({
      eventType: "SPATIAL_DESKTOP_INTERACTION_RECORDED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: status === "denied" ? "DENIED" : "SUCCESS",
      reason:
        status === "denied"
          ? "Spatial desktop interaction denied by governed desktop provider boundary."
          : "Spatial desktop interaction routed through governed Desktop Capability Layer.",
      metadata: {
        actionId: action.id,
        objectId: object.id,
        interactionType: parsed.interactionType,
        capabilityId: capability.id,
        directOsControlAvailable: false,
        genericExecutorAvailable: false,
      },
      requestId: input.requestId,
    });
    return this.dashboard(input.ownerId);
  }

  async ensureBaseline(ownerId: string, requestId = "system") {
    const at = this.now().toISOString();
    if ((await this.store.listCapabilities(ownerId, 1)).length > 0) {
      await this.ensureSpatialDesktopBaseline(ownerId, at, requestId);
      await this.ensureSemanticDesktopBaseline(ownerId, at, requestId);
      await this.interactions.ensureBaseline(ownerId, at);
      return;
    }
    await this.store.saveProvider(
      CapabilityProviderSchema.parse({
        id: "desktop_metadata_provider",
        ownerId,
        name: "Desktop metadata provider",
        providerType: "mock",
        supportedCategories: ["desktop", "system_information"],
        status: "healthy",
        health: "Metadata-only provider is available. It performs no OS control.",
        version: "1.0.0",
        lastCheckedAt: at,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveProvider(
      CapabilityProviderSchema.parse({
        id: "mac_agent_desktop_provider",
        ownerId,
        name: "Mac agent desktop provider",
        providerType: "mac_agent",
        supportedCategories: categories,
        status: "unavailable",
        health:
          "No reviewed OS provider is installed. Application control, windows, input, OCR, vision, and filesystem actions remain unavailable.",
        version: "0.0.0",
        lastCheckedAt: at,
        createdAt: at,
        updatedAt: at,
      }),
    );
    for (const category of categories) {
      await this.store.saveCapability(baselineCapability(ownerId, at, category));
    }
    await this.recordContext(ownerId);
    await this.store.saveApplication(
      DesktopApplicationRecordSchema.parse({
        id: "com.personalassistant.dashboard",
        ownerId,
        displayName: "Personal Assistant Dashboard",
        bundleId: "com.personalassistant.dashboard",
        status: "registered",
        pinned: true,
        recent: true,
        executablePathAccepted: false,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveWindowLayout(
      WindowLayoutRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        name: "No captured layout",
        displayId: "unknown",
        windows: [],
        rollbackSnapshotAvailable: false,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveClipboard(
      ClipboardHistoryRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        format: "unknown",
        summary: "Clipboard monitoring is not enabled.",
        sensitive: false,
        capturedAt: at,
      }),
    );
    await this.store.saveMetric(
      CapabilityMetricRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        capabilityId: "desktop.context.read",
        metricName: "capability_framework_readiness",
        value: 0.55,
        measuredAt: at,
      }),
    );
    await this.store.savePreference(
      DesktopPreferenceRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        key: "desktop_capability_policy",
        value: "deny_unreviewed_providers",
        updatedAt: at,
      }),
    );
    await this.audit({
      eventType: "DESKTOP_CAPABILITY_REGISTERED",
      ownerId,
      ipAddress: "system",
      outcome: "SUCCESS",
      reason: "Baseline desktop capability contracts registered.",
      metadata: {
        capabilityCount: categories.length,
        genericExecutorAvailable: false,
      },
      requestId,
    });
    await this.ensureSpatialDesktopBaseline(ownerId, at, requestId);
    await this.ensureSemanticDesktopBaseline(ownerId, at, requestId);
    await this.interactions.ensureBaseline(ownerId, at);
  }

  private async ensureSpatialDesktopBaseline(
    ownerId: string,
    at: string,
    requestId: string,
  ) {
    if ((await this.store.listDesktopObjects(ownerId, 1)).length > 0) return;
    const objects = [
      DesktopObjectRecordSchema.parse({
        id: "desktop.object.dashboard",
        ownerId,
        objectType: "application",
        displayName: "Personal Assistant Dashboard",
        providerId: "desktop_metadata_provider",
        sourceCapabilityId: "desktop.context.read",
        status: "available",
        riskLevel: "read_only",
        capabilities: ["hover", "focus", "inspect", "select", "activate"],
        permissions: ["owner_session"],
        interactionAnchors: [
          {
            id: "center",
            label: "Dashboard center",
            x: 0.5,
            y: 0.5,
            z: 0,
            width: 0.32,
            height: 0.24,
            confidence: 0.9,
          },
        ],
        metadata: {
          desktopCapabilityLayerRequired: true,
          directOsControlAvailable: false,
        },
        current: true,
        createdAt: at,
        updatedAt: at,
      }),
      DesktopObjectRecordSchema.parse({
        id: "desktop.object.registered-applications",
        ownerId,
        objectType: "dock_item",
        displayName: "Registered Applications",
        providerId: "mac_agent_desktop_provider",
        sourceCapabilityId: "application_management.provider_required",
        status: "unavailable",
        riskLevel: "moderate_risk",
        capabilities: ["inspect", "select", "activate", "launch", "focus"],
        permissions: ["application_management_permission"],
        interactionAnchors: [
          {
            id: "dock",
            label: "Spatial dock target",
            x: 0.5,
            y: 0.92,
            z: 0,
            width: 0.14,
            height: 0.08,
            confidence: 0.7,
          },
        ],
        metadata: {
          reviewedProviderRequired: true,
          arbitraryExecutablePathsAccepted: false,
        },
        current: false,
        createdAt: at,
        updatedAt: at,
      }),
      DesktopObjectRecordSchema.parse({
        id: "desktop.object.window-layout",
        ownerId,
        objectType: "window",
        displayName: "Governed Window Layout",
        providerId: "mac_agent_desktop_provider",
        sourceCapabilityId: "window_management.provider_required",
        status: "unavailable",
        riskLevel: "moderate_risk",
        capabilities: ["inspect", "preview", "move", "resize", "tile", "snap"],
        permissions: ["window_management_permission"],
        interactionAnchors: [
          {
            id: "frame",
            label: "Window frame",
            x: 0.5,
            y: 0.45,
            z: 0,
            width: 0.42,
            height: 0.32,
            confidence: 0.65,
          },
        ],
        metadata: {
          unrestrictedAccessibilityAvailable: false,
          providerBasedOnly: true,
        },
        current: false,
        createdAt: at,
        updatedAt: at,
      }),
    ];
    for (const object of objects) {
      await this.store.saveDesktopObject(object);
    }
    await this.store.saveDesktopProfile(
      DesktopProfileRecordSchema.parse({
        id: "desktop.profile.development",
        ownerId,
        name: "Development spatial desktop profile",
        mode: "development",
        active: true,
        snapStrength: 0.42,
        dwellMs: 1_200,
        overlayEnabled: true,
        cursorSensitivity: 1,
        approvalPreviewRequired: true,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveOverlaySettings(
      DesktopOverlaySettingsRecordSchema.parse({
        id: "desktop.overlay.default",
        ownerId,
        enabled: false,
        showRays: true,
        showCursor: true,
        showTargetHighlights: true,
        showGestureLabels: true,
        opacity: 0.72,
        monitorId: "primary",
        updatedAt: at,
      }),
    );
    await this.store.saveDockItem(
      DockItemRecordSchema.parse({
        id: "desktop.dock.dashboard",
        ownerId,
        label: "Dashboard",
        itemType: "application",
        targetId: "desktop.object.dashboard",
        position: 0,
        pinned: true,
        riskLevel: "read_only",
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveDesktopPanel(
      DesktopPanelRecordSchema.parse({
        id: "desktop.panel.system-status",
        ownerId,
        title: "System Status",
        panelType: "system_status",
        visible: true,
        movable: true,
        x: 0.72,
        y: 0.18,
        width: 0.22,
        height: 0.18,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveDesktopMetric(
      DesktopMetricRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        metricName: "spatial_desktop_registry_readiness",
        value: 0.5,
        measuredAt: at,
      }),
    );
    await this.audit({
      eventType: "SPATIAL_DESKTOP_BASELINE_REGISTERED",
      ownerId,
      ipAddress: "system",
      outcome: "SUCCESS",
      reason:
        "Spatial desktop registry baseline registered without direct operating-system control.",
      metadata: {
        objectCount: objects.length,
        directOsControlAvailable: false,
        desktopCapabilityLayerRequired: true,
      },
      requestId,
    });
  }

  private async ensureSemanticDesktopBaseline(
    ownerId: string,
    at: string,
    requestId: string,
  ) {
    if ((await this.store.listSemanticObjects(ownerId, 1)).length > 0) {
      await this.ensureNavigationBaseline(ownerId, at, requestId);
      return;
    }
    const appId = "com.personalassistant.dashboard";
    const windowId = "semantic.window.dashboard.main";
    await this.store.saveDesktopWindow(
      DesktopWindowRecordSchema.parse({
        id: windowId,
        ownerId,
        applicationId: appId,
        title: "Personal Assistant Dashboard",
        role: "main",
        focused: true,
        visible: true,
        modal: false,
        bounds: null,
        parentWindowId: null,
        semanticRootObjectId: "semantic.object.dashboard.root",
        updatedAt: at,
        recordVersion: "1.0.0",
      }),
    );
    const objects = [
      semanticObject(ownerId, appId, null, null, "semantic.object.dashboard.app", {
        role: "application",
        displayName: "Personal Assistant Dashboard",
        aliases: ["alexa control", "dashboard app"],
        childIds: ["semantic.object.dashboard.root"],
        supportedActions: ["inspect", "focus", "highlight", "reveal", "hover"],
      }),
      semanticObject(
        ownerId,
        appId,
        windowId,
        "semantic.object.dashboard.app",
        "semantic.object.dashboard.root",
        {
          role: "window",
          displayName: "Dashboard Window",
          aliases: ["main window", "home window"],
          childIds: [
            "semantic.object.dashboard.sidebar",
            "semantic.object.dashboard.command-palette",
            "semantic.object.dashboard.content",
          ],
          supportedActions: ["inspect", "focus", "highlight", "reveal", "hover"],
        },
      ),
      semanticObject(
        ownerId,
        appId,
        windowId,
        "semantic.object.dashboard.root",
        "semantic.object.dashboard.sidebar",
        {
          role: "sidebar_item",
          displayName: "Primary Navigation Sidebar",
          aliases: ["sidebar", "navigation"],
          childIds: [],
          supportedActions: [
            "inspect",
            "focus",
            "select",
            "highlight",
            "reveal",
            "hover",
          ],
        },
      ),
      semanticObject(
        ownerId,
        appId,
        windowId,
        "semantic.object.dashboard.root",
        "semantic.object.dashboard.command-palette",
        {
          role: "search_field",
          displayName: "Global Command Palette",
          aliases: ["search", "command search", "global search"],
          childIds: [],
          supportedActions: [
            "inspect",
            "focus",
            "set_value",
            "highlight",
            "reveal",
            "hover",
          ],
        },
      ),
      semanticObject(
        ownerId,
        appId,
        windowId,
        "semantic.object.dashboard.root",
        "semantic.object.dashboard.content",
        {
          role: "panel",
          displayName: "Current Page Content",
          aliases: ["content", "main page", "workspace"],
          childIds: [],
          supportedActions: [
            "inspect",
            "focus",
            "scroll",
            "highlight",
            "reveal",
            "hover",
          ],
        },
      ),
    ].map((object) =>
      SemanticDesktopObjectRecordSchema.parse({
        ...object,
        secureContentRedacted: true,
        updatedAt: at,
      }),
    );
    for (const object of objects) await this.store.saveSemanticObject(object);
    for (const object of objects.filter((item) => item.parentId)) {
      await this.store.saveSemanticRelationship(
        SemanticRelationshipRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          fromObjectId: object.parentId,
          toObjectId: object.id,
          relationship: "parent_of",
          confidence: 0.92,
          updatedAt: at,
        }),
      );
    }
    await this.store.saveSemanticDesktopContext(
      SemanticDesktopContextRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        currentApplicationId: appId,
        currentWindowId: windowId,
        currentDialogId: null,
        focusedObjectId: "semantic.object.dashboard.command-palette",
        selectedObjectIds: [],
        currentWorkspace: "dashboard",
        currentProject: null,
        currentRepositoryId: null,
        currentTaskId: null,
        updatedAt: at,
      }),
    );
    await this.store.saveSemanticEvent(
      DesktopSemanticEventRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        eventType: "registry_refreshed",
        applicationId: appId,
        windowId,
        objectId: "semantic.object.dashboard.root",
        summary:
          "Semantic desktop baseline registered from trusted dashboard metadata. Native Accessibility provider is not installed.",
        metadata: {
          aiUsed: false,
          ocrUsed: false,
          computerVisionUsed: false,
          nativeAccessibilityProviderAvailable: false,
        },
        occurredAt: at,
      }),
    );
    await this.audit({
      eventType: "SEMANTIC_DESKTOP_BASELINE_REGISTERED",
      ownerId,
      ipAddress: "system",
      outcome: "SUCCESS",
      reason:
        "Semantic desktop model baseline registered without OS control, OCR, computer vision, or unrestricted Accessibility.",
      requestId,
      metadata: {
        objectCount: objects.length,
        nativeAccessibilityProviderAvailable: false,
        readOnly: true,
      },
    });
    await this.ensureNavigationBaseline(ownerId, at, requestId);
  }

  private async ensureNavigationBaseline(
    ownerId: string,
    at: string,
    requestId: string,
  ) {
    if ((await this.store.listNavigationGraphs(ownerId, 1)).length > 0) return;
    const objects = await this.store.listSemanticObjects(ownerId, 2_000);
    const relationships = await this.store.listSemanticRelationships(ownerId, 2_000);
    await this.store.saveNavigationGraph(
      NavigationGraphRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        graphVersion: "1.0.0",
        nodeCount: objects.length,
        edgeCount: relationships.length,
        rootObjectIds: objects
          .filter((object) => !object.parentId)
          .map((object) => object.id),
        generatedAt: at,
        deterministic: true,
      }),
    );
    for (const object of objects) {
      await this.store.saveNavigationTarget(
        NavigationTargetRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          objectId: object.id,
          label: object.displayName,
          role: object.role,
          priority: object.state.focused ? 1 : object.confidence,
          visible: object.visibility === "visible",
          updatedAt: at,
        }),
      );
    }
    await this.store.saveHighlightProfile(
      HighlightProfileRecordSchema.parse({
        id: "desktop.highlight.default",
        ownerId,
        name: "Accessible focus preview",
        focusedColor: "#7dd3fc",
        previewColor: "#f0c25e",
        reducedMotion: true,
        updatedAt: at,
      }),
    );
    await this.store.saveNavigationSession(
      NavigationSessionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        status: "active",
        currentObjectId: "semantic.object.dashboard.command-palette",
        startedAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveFocusHistory(
      FocusHistoryRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        objectId: "semantic.object.dashboard.command-palette",
        previousObjectId: null,
        focusReason: "baseline",
        changedAt: at,
      }),
    );
    await this.audit({
      eventType: "DESKTOP_NAVIGATION_GRAPH_BUILT",
      ownerId,
      ipAddress: "system",
      outcome: "SUCCESS",
      reason:
        "Read-only semantic desktop navigation graph built from registered semantic objects.",
      requestId,
      metadata: {
        nodeCount: objects.length,
        edgeCount: relationships.length,
        readOnly: true,
      },
    });
  }

  private async recordContext(ownerId: string) {
    const at = this.now().toISOString();
    const context = DesktopContextSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      currentApplicationId: null,
      focusedWindowId: null,
      openApplications: [],
      desktopLayout:
        "Desktop context is metadata-only until a reviewed provider supplies bounded OS state.",
      clipboardSummary: "Clipboard access not enabled.",
      displays: [],
      recentActionIds: [],
      runningWorkflowIds: [],
      permissionState: "not_requested",
      updatedAt: at,
    });
    await this.store.saveContext(context);
    return context;
  }

  private async resolveNavigationTarget(
    ownerId: string,
    parsed: ReturnType<typeof DesktopNavigationRequestSchema.parse>,
    current: SemanticDesktopObjectRecord | null,
    objects: SemanticDesktopObjectRecord[],
  ) {
    if (parsed.objectId) return this.store.getSemanticObject(ownerId, parsed.objectId);
    if (parsed.query) {
      const ranked = objects
        .filter((object) => object.visibility === "visible")
        .filter(
          (object) =>
            !parsed.applicationId || object.applicationId === parsed.applicationId,
        )
        .filter((object) => !parsed.windowId || object.windowId === parsed.windowId)
        .map((object) => rankSemanticObject(object, normalize(parsed.query ?? "")))
        .filter((result) => result.confidence >= 0.2)
        .sort((left, right) => right.confidence - left.confidence);
      return ranked[0]
        ? this.store.getSemanticObject(ownerId, ranked[0].objectId)
        : null;
    }
    if (!current)
      return objects.find((object) => object.visibility === "visible") ?? null;
    if (parsed.action === "parent") {
      return current.parentId
        ? this.store.getSemanticObject(ownerId, current.parentId)
        : null;
    }
    if (parsed.action === "first_child") {
      return current.childIds[0]
        ? this.store.getSemanticObject(ownerId, current.childIds[0])
        : null;
    }
    if (parsed.action === "last_child") {
      const childId = current.childIds.at(-1);
      return childId ? this.store.getSemanticObject(ownerId, childId) : null;
    }
    const siblings = objects.filter((object) => object.parentId === current.parentId);
    const currentIndex = siblings.findIndex((object) => object.id === current.id);
    if (parsed.action === "next_sibling") {
      return siblings[currentIndex + 1] ?? siblings[0] ?? null;
    }
    if (parsed.action === "previous_sibling") {
      return siblings[currentIndex - 1] ?? siblings.at(-1) ?? null;
    }
    if (parsed.action === "back" || parsed.action === "forward") {
      const focus = await this.store.listFocusHistory(ownerId, 20);
      const record = parsed.action === "back" ? focus[1] : focus[0];
      return record ? this.store.getSemanticObject(ownerId, record.objectId) : null;
    }
    return current;
  }
}

const semanticObject = (
  ownerId: string,
  applicationId: string,
  windowId: string | null,
  parentId: string | null,
  id: string,
  input: {
    role: SemanticDesktopObjectRecord["role"];
    displayName: string;
    aliases: string[];
    childIds: string[];
    supportedActions: SemanticDesktopObjectRecord["supportedActions"];
  },
): Omit<SemanticDesktopObjectRecord, "secureContentRedacted" | "updatedAt"> => ({
  id,
  ownerId,
  applicationId,
  windowId,
  parentId,
  childIds: input.childIds,
  role: input.role,
  displayName: input.displayName,
  aliases: input.aliases,
  accessibilityLabel: input.displayName,
  accessibilityIdentifier: id,
  description:
    "Trusted dashboard semantic metadata. Native application Accessibility snapshots require a reviewed provider.",
  supportedActions: input.supportedActions,
  permissions: ["owner_authenticated_read"],
  visibility: "visible",
  state: {
    enabled: true,
    visible: true,
    focused: id === "semantic.object.dashboard.command-palette",
    selected: false,
    checked: null,
    expanded: null,
    valueSummary: null,
    secureText: false,
  },
  bounds: null,
  relationships: input.childIds,
  version: "1.0.0",
  confidence: 0.88,
  source: "registered_metadata",
});

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const rankSemanticObject = (object: SemanticDesktopObjectRecord, query: string) => {
  const label = normalize(object.displayName);
  const aliases = object.aliases.map(normalize);
  const text = [label, object.role, object.description, aliases.join(" ")]
    .map(normalize)
    .join(" ");
  const exact = query === label || aliases.includes(query);
  const queryTokens = query.split(/\s+/).filter(Boolean);
  const textTokens = new Set(text.split(/\s+/).filter(Boolean));
  const tokenScore =
    queryTokens.length === 0
      ? 0
      : queryTokens.filter((token) => textTokens.has(token)).length /
        queryTokens.length;
  const confidence = exact
    ? 0.98
    : Math.min(0.92, tokenScore * 0.78 + object.confidence * 0.12);
  return {
    objectId: object.id,
    displayName: object.displayName,
    role: object.role,
    applicationId: object.applicationId,
    windowId: object.windowId,
    confidence,
    reason: exact ? "exact label or alias match" : "deterministic token match",
  };
};

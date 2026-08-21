import { describe, expect, it } from "vitest";
import { SemanticDesktopObjectRecordSchema } from "@alexa-control/shared";

import { ExecutionError } from "../execution/errors.js";
import type {
  GovernanceAuditInput,
  GovernanceAuditWriter,
} from "../governance/approval-service.js";
import { DesktopCapabilityService } from "./service.js";
import { InMemoryDesktopStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const audits: GovernanceAuditInput[] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const desktop = new DesktopCapabilityService(new InMemoryDesktopStore(), audit);
  return { audits, desktop, ownerId };
};

describe("DesktopCapabilityService", () => {
  it("registers a deny-by-default desktop capability baseline", async () => {
    const { desktop, ownerId } = setup();
    const dashboard = await desktop.dashboard(ownerId);

    expect(dashboard.capabilities.length).toBeGreaterThanOrEqual(20);
    expect(dashboard.providers.map((provider) => provider.id)).toEqual(
      expect.arrayContaining([
        "desktop_metadata_provider",
        "mac_agent_desktop_provider",
      ]),
    );
    expect(dashboard.genericExecutorAvailable).toBe(false);
    expect(dashboard.unrestrictedAccessibilityAvailable).toBe(false);
    expect(dashboard.semanticDesktopModelAvailable).toBe(true);
    expect(dashboard.nativeAccessibilityProviderAvailable).toBe(false);
    expect(dashboard.computerVisionRequiredForSemanticModel).toBe(false);
    expect(dashboard.ocrRequiredForAccessibilityObjects).toBe(false);
    expect(dashboard.arbitraryAppleScriptAvailable).toBe(false);
    expect(dashboard.spatialDesktopLayerAvailable).toBe(true);
    expect(dashboard.directOsPointerControlAvailable).toBe(false);
    expect(dashboard.unrestrictedDesktopAutomationAvailable).toBe(false);
    expect(dashboard.desktopObjects.length).toBeGreaterThanOrEqual(3);
    expect(dashboard.desktopProfiles[0]).toMatchObject({
      id: "desktop.profile.development",
      active: true,
    });
    expect(dashboard.overlaySettings[0]).toMatchObject({
      id: "desktop.overlay.default",
      enabled: false,
    });
    expect(dashboard.dockItems[0]).toMatchObject({
      targetId: "desktop.object.dashboard",
    });
    expect(dashboard.semanticObjects.length).toBeGreaterThanOrEqual(5);
    expect(dashboard.desktopWindows[0]).toMatchObject({
      applicationId: "com.personalassistant.dashboard",
      focused: true,
    });
    expect(dashboard.semanticDesktopContexts[0]).toMatchObject({
      currentApplicationId: "com.personalassistant.dashboard",
      focusedObjectId: "semantic.object.dashboard.command-palette",
    });
    expect(dashboard.semanticDesktopNavigationAvailable).toBe(true);
    expect(dashboard.navigationGraphs[0]).toMatchObject({
      deterministic: true,
    });
    expect(dashboard.navigationGraphs[0]?.nodeCount).toBeGreaterThanOrEqual(5);
    expect(dashboard.navigationTargets.length).toBeGreaterThanOrEqual(5);
    expect(dashboard.highlightProfiles[0]).toMatchObject({
      id: "desktop.highlight.default",
      reducedMotion: true,
    });
    expect(dashboard.focusHistory[0]).toMatchObject({
      objectId: "semantic.object.dashboard.command-palette",
      focusReason: "baseline",
    });
    expect(
      dashboard.capabilities.filter((capability) => capability.status === "available"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "desktop.context.read", riskLevel: "read_only" }),
        expect.objectContaining({
          id: "system_information.framework_status",
          riskLevel: "read_only",
        }),
      ]),
    );
    expect(
      dashboard.capabilities.find(
        (capability) => capability.id === "application_management.provider_required",
      ),
    ).toMatchObject({
      status: "unavailable",
      providerId: "mac_agent_desktop_provider",
      approvalRequired: true,
    });
  });

  it("completes only metadata-safe capabilities through the governed layer", async () => {
    const { audits, desktop, ownerId } = setup();
    const dashboard = await desktop.requestCapability({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: { capabilityId: "desktop.context.read", input: {} },
    });

    expect(dashboard.actions[0]).toMatchObject({
      capabilityId: "desktop.context.read",
      status: "completed",
      policyChecked: true,
      rollbackAvailable: false,
    });
    const message = dashboard.actions[0]?.safeOutput.message;
    expect(typeof message === "string" ? message : "").toContain(
      "No operating-system action was performed",
    );
    expect(audits.map((audit) => audit.eventType)).toContain(
      "DESKTOP_ACTION_COMPLETED",
    );
  });

  it("denies OS capabilities when a reviewed healthy provider is unavailable", async () => {
    const { audits, desktop, ownerId } = setup();
    const dashboard = await desktop.requestCapability({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: { capabilityId: "application_management.provider_required", input: {} },
    });

    expect(dashboard.actions[0]).toMatchObject({
      capabilityId: "application_management.provider_required",
      status: "denied",
      errorCode: "DESKTOP_PROVIDER_UNAVAILABLE",
      policyChecked: true,
    });
    expect(audits.map((audit) => audit.eventType)).toContain("DESKTOP_ACTION_DENIED");
  });

  it("records metadata-only context refreshes without OS inspection", async () => {
    const { audits, desktop, ownerId } = setup();
    const before = await desktop.dashboard(ownerId);
    const after = await desktop.refreshContext({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(after.contexts.length).toBeGreaterThan(before.contexts.length);
    expect(after.contexts[0]).toMatchObject({
      openApplications: [],
      displays: [],
      permissionState: "not_requested",
    });
    expect(audits.map((audit) => audit.eventType)).toContain(
      "DESKTOP_CONTEXT_REFRESHED",
    );
  });

  it("rejects unknown capabilities instead of routing to a fallback executor", async () => {
    const { desktop, ownerId } = setup();

    await expect(
      desktop.requestCapability({
        ownerId,
        requestId: crypto.randomUUID(),
        ipAddress: "127.0.0.1",
        body: { capabilityId: "shell.run", input: {} },
      }),
    ).rejects.toMatchObject(
      new ExecutionError(404, "DESKTOP_CAPABILITY_NOT_FOUND", "Capability not found."),
    );
  });

  it("records spatial desktop inspection through the governed capability layer", async () => {
    const { audits, desktop, ownerId } = setup();
    const dashboard = await desktop.requestSpatialDesktopInteraction({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        objectId: "desktop.object.dashboard",
        interactionType: "inspect",
        gesture: "point",
        intentPreview: "Inspect dashboard from spatial desktop layer.",
      },
    });

    expect(dashboard.actions[0]).toMatchObject({
      capabilityId: "desktop.context.read",
      status: "completed",
      policyChecked: true,
      rollbackAvailable: false,
    });
    expect(dashboard.desktopNavigationHistory[0]).toMatchObject({
      toObjectId: "desktop.object.dashboard",
      routedThroughIntentEngine: true,
      directOsControlAvailable: false,
    });
    expect(audits.map((audit) => audit.eventType)).toContain(
      "SPATIAL_DESKTOP_INTERACTION_RECORDED",
    );
  });

  it("denies spatial desktop app activation when reviewed provider is unavailable", async () => {
    const { desktop, ownerId } = setup();
    const dashboard = await desktop.requestSpatialDesktopInteraction({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        objectId: "desktop.object.registered-applications",
        interactionType: "activate",
        gesture: "pinch",
      },
    });

    expect(dashboard.actions[0]).toMatchObject({
      capabilityId: "application_management.provider_required",
      status: "denied",
      errorCode: "DESKTOP_SPATIAL_PROVIDER_UNAVAILABLE",
      approvalRequired: true,
    });
  });

  it("searches semantic desktop objects deterministically without AI, OCR, or vision", async () => {
    const { audits, desktop, ownerId } = setup();
    const response = await desktop.searchSemanticDesktop({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        query: "command palette",
        applicationId: null,
        windowId: null,
        roles: [],
        visibleOnly: true,
        limit: 5,
      },
    });

    expect(response.deterministic).toBe(true);
    expect(response.aiUsed).toBe(false);
    expect(response.results[0]).toMatchObject({
      objectId: "semantic.object.dashboard.command-palette",
      role: "search_field",
    });
    expect(audits.map((audit) => audit.eventType)).toContain(
      "SEMANTIC_DESKTOP_SEARCHED",
    );
  });

  it("previews semantic desktop navigation targets without activation", async () => {
    const { audits, desktop, ownerId } = setup();
    const response = await desktop.navigateSemanticDesktop({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        action: "preview_object",
        objectId: null,
        query: "current page content",
        applicationId: null,
        windowId: null,
      },
    });

    expect(response).toMatchObject({
      status: "previewed",
      highlightObjectId: "semantic.object.dashboard.content",
      readOnly: true,
      activatedControl: false,
      typedText: false,
      clickedButton: false,
    });
    expect(response.targetObject).toMatchObject({
      id: "semantic.object.dashboard.content",
      role: "panel",
    });
    expect(audits.map((audit) => audit.eventType)).toContain(
      "DESKTOP_TARGET_HIGHLIGHTED",
    );
  });

  it("records focus navigation while preserving the navigation-only boundary", async () => {
    const { audits, desktop, ownerId } = setup();
    const response = await desktop.navigateSemanticDesktop({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        action: "focus_object",
        objectId: "semantic.object.dashboard.sidebar",
        query: null,
        applicationId: null,
        windowId: null,
      },
    });
    const dashboard = await desktop.dashboard(ownerId);

    expect(response).toMatchObject({
      status: "completed",
      highlightObjectId: "semantic.object.dashboard.sidebar",
      readOnly: true,
      activatedControl: false,
      typedText: false,
      clickedButton: false,
    });
    expect(dashboard.semanticNavigationHistory[0]).toMatchObject({
      action: "focus_object",
      toObjectId: "semantic.object.dashboard.sidebar",
      readOnly: true,
      activatedControl: false,
      typedText: false,
      clickedButton: false,
    });
    expect(dashboard.focusHistory[0]).toMatchObject({
      objectId: "semantic.object.dashboard.sidebar",
      previousObjectId: "semantic.object.dashboard.command-palette",
    });
    expect(dashboard.semanticDesktopContexts[0]).toMatchObject({
      focusedObjectId: "semantic.object.dashboard.sidebar",
    });
    expect(audits.map((audit) => audit.eventType)).toContain(
      "DESKTOP_NAVIGATION_COMPLETED",
    );
  });

  it("previews semantic interactions through metadata without pixels or coordinates", async () => {
    const { audits, desktop, ownerId } = setup();
    const response = await desktop.interactSemantically({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        origin: "voice",
        action: "highlight",
        target: {
          objectId: "semantic.object.dashboard.command-palette",
          query: null,
          fieldKey: null,
          applicationId: null,
          windowId: null,
          contextObjectId: null,
        },
        preview: true,
        steps: [],
      },
    });
    const dashboard = await desktop.dashboard(ownerId);

    expect(response).toMatchObject({
      deterministic: true,
      aiUsed: false,
      requiresClarification: false,
      interaction: {
        status: "previewed",
        policyChecked: true,
        ocrUsed: false,
        computerVisionUsed: false,
        coordinateAutomationUsed: false,
      },
      target: {
        id: "semantic.object.dashboard.command-palette",
      },
    });
    expect(response.verification[0]).toMatchObject({
      verificationType: "preview_visible",
      status: "passed",
    });
    expect(dashboard.semanticInteractions[0]).toMatchObject({
      status: "previewed",
      origin: "voice",
    });
    expect(dashboard.semanticActions[0]).toMatchObject({
      action: "highlight",
      capabilityId: "desktop.context.read",
      status: "previewed",
    });
    expect(audits.map((audit) => audit.eventType)).toContain(
      "SEMANTIC_INTERACTION_COMPLETED",
    );
  });

  it("denies semantic clicks when the reviewed interaction provider is unavailable", async () => {
    const { audits, desktop, ownerId } = setup();
    await desktop.dashboard(ownerId);
    const at = new Date().toISOString();
    await desktop.store.saveSemanticObject(
      SemanticDesktopObjectRecordSchema.parse({
        id: "semantic.object.dashboard.save-button",
        ownerId,
        applicationId: "com.personalassistant.dashboard",
        windowId: "semantic.window.dashboard.main",
        parentId: "semantic.object.dashboard.root",
        childIds: [],
        role: "button",
        displayName: "Save",
        aliases: ["save"],
        accessibilityLabel: "Save",
        accessibilityIdentifier: "dashboard.save",
        description: "Save button.",
        supportedActions: ["click", "focus", "highlight"],
        permissions: ["owner_session"],
        visibility: "visible",
        state: {
          enabled: true,
          visible: true,
          focused: false,
          selected: false,
          checked: null,
          expanded: null,
          valueSummary: null,
          secureText: false,
        },
        bounds: null,
        relationships: [],
        version: "1.0.0",
        confidence: 0.96,
        source: "registered_metadata",
        secureContentRedacted: true,
        updatedAt: at,
      }),
    );
    const response = await desktop.interactSemantically({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        origin: "planner",
        action: "click",
        target: {
          objectId: "semantic.object.dashboard.save-button",
          query: null,
          fieldKey: null,
          applicationId: null,
          windowId: null,
          contextObjectId: null,
        },
        preview: false,
        steps: [],
      },
    });

    expect(response.interaction).toMatchObject({
      status: "denied",
      capabilityId: "accessibility.provider_required",
      deterministic: true,
      coordinateAutomationUsed: false,
    });
    expect(response.verification[0]).toMatchObject({
      status: "failed",
    });
    expect(audits.map((audit) => audit.eventType)).toContain(
      "SEMANTIC_INTERACTION_DENIED",
    );
  });

  it("asks for clarification instead of guessing ambiguous semantic targets", async () => {
    const { audits, desktop, ownerId } = setup();
    await desktop.dashboard(ownerId);
    const at = new Date().toISOString();
    await desktop.store.saveSemanticObject(
      SemanticDesktopObjectRecordSchema.parse({
        id: "semantic.object.settings.save",
        ownerId,
        applicationId: "com.personalassistant.dashboard",
        windowId: "semantic.window.dashboard.main",
        parentId: "semantic.object.dashboard.root",
        childIds: [],
        role: "button",
        displayName: "Save",
        aliases: ["save"],
        accessibilityLabel: "Save",
        accessibilityIdentifier: "settings.save",
        description: "Save button in Settings.",
        supportedActions: ["click", "focus"],
        permissions: ["owner_session"],
        visibility: "visible",
        state: {
          enabled: true,
          visible: true,
          focused: false,
          selected: false,
          checked: null,
          expanded: null,
          valueSummary: null,
          secureText: false,
        },
        bounds: null,
        relationships: ["Settings"],
        version: "1.0.0",
        confidence: 0.96,
        source: "registered_metadata",
        secureContentRedacted: true,
        updatedAt: at,
      }),
    );
    await desktop.store.saveSemanticObject(
      SemanticDesktopObjectRecordSchema.parse({
        id: "semantic.object.extensions.save",
        ownerId,
        applicationId: "com.personalassistant.dashboard",
        windowId: "semantic.window.dashboard.main",
        parentId: "semantic.object.dashboard.root",
        childIds: [],
        role: "button",
        displayName: "Save",
        aliases: ["save"],
        accessibilityLabel: "Save",
        accessibilityIdentifier: "extensions.save",
        description: "Save button in Extensions.",
        supportedActions: ["click", "focus"],
        permissions: ["owner_session"],
        visibility: "visible",
        state: {
          enabled: true,
          visible: true,
          focused: false,
          selected: false,
          checked: null,
          expanded: null,
          valueSummary: null,
          secureText: false,
        },
        bounds: null,
        relationships: ["Extensions"],
        version: "1.0.0",
        confidence: 0.96,
        source: "registered_metadata",
        secureContentRedacted: true,
        updatedAt: at,
      }),
    );

    const response = await desktop.interactSemantically({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        origin: "command",
        action: "click",
        target: {
          objectId: null,
          query: "save",
          fieldKey: null,
          applicationId: null,
          windowId: null,
          contextObjectId: null,
        },
        preview: false,
        steps: [],
      },
    });

    expect(response).toMatchObject({
      requiresClarification: true,
      interaction: {
        status: "needs_clarification",
      },
    });
    expect(response.clarificationPrompt).toContain("Which would you like?");
    expect(audits.map((audit) => audit.eventType)).toContain(
      "SEMANTIC_INTERACTION_AMBIGUOUS",
    );
  });

  it("validates form values against semantic field rules before interaction", async () => {
    const { audits, desktop, ownerId } = setup();
    const response = await desktop.fillSemanticForm({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        origin: "dashboard",
        formObjectId: null,
        fields: [
          {
            field: "command palette",
            value: "x".repeat(300),
            mode: "replace",
          },
        ],
        submit: false,
        preview: false,
      },
    });

    expect(response).toMatchObject({
      requiresClarification: true,
      interaction: {
        status: "failed",
      },
    });
    expect(response.message).toContain("longer than 240 characters");
    expect(audits.map((audit) => audit.eventType)).toContain(
      "SEMANTIC_INTERACTION_VALIDATION_FAILED",
    );
  });
});

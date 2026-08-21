import { describe, expect, it } from "vitest";

import type { AgentSocietyService } from "../agent-society/service.js";
import type {
  GovernanceAuditInput,
  GovernanceAuditWriter,
} from "../governance/approval-service.js";
import { IntentExecutionService } from "../intent/service.js";
import { InMemoryIntentStore } from "../intent/store.js";
import { SpatialInteractionService } from "./service.js";
import { InMemorySpatialStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const audits: GovernanceAuditInput[] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const society = {
    formTeam: () => Promise.resolve(undefined),
  } as unknown as AgentSocietyService;
  const intent = new IntentExecutionService(new InMemoryIntentStore(), society, audit);
  const spatial = new SpatialInteractionService(
    new InMemorySpatialStore(),
    intent,
    audit,
  );
  return { audits, ownerId, spatial };
};

describe("SpatialInteractionService", () => {
  it("initializes a local-only spatial interaction baseline", async () => {
    const { ownerId, spatial } = setup();
    const dashboard = await spatial.dashboard(ownerId);

    expect(dashboard.pipeline).toEqual(
      expect.arrayContaining([
        "camera_manager",
        "gesture_recognition",
        "command_routing",
      ]),
    );
    expect(dashboard.routesThroughIntentEngine).toBe(true);
    expect(dashboard.rawFramesPersisted).toBe(false);
    expect(dashboard.directOsControlAvailable).toBe(false);
    expect(dashboard.highRiskGestureApprovalAllowed).toBe(false);
    expect(dashboard.profiles[0]).toMatchObject({
      name: "Productivity",
      active: true,
      disabledHighRiskApproval: true,
    });
    expect(dashboard.cameraDevices[0]).toMatchObject({
      status: "disabled",
      permissionState: "not_requested",
    });
  });

  it("records camera inventory refreshes without requesting permission", async () => {
    const { audits, ownerId, spatial } = setup();
    const dashboard = await spatial.refreshCameras({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(dashboard.cameraDevices[0]?.permissionState).toBe("not_requested");
    expect(dashboard.cameraDevices[0]?.status).toBe("disabled");
    expect(audits.map((audit) => audit.eventType)).toContain(
      "SPATIAL_CAMERA_INVENTORY_REFRESHED",
    );
  });

  it("exposes native spatial runtime metadata without direct input injection", async () => {
    const { ownerId, spatial } = setup();
    const native = await spatial.nativeRuntime(ownerId);

    expect(native.routesThroughIntentEngine).toBe(true);
    expect(native.desktopCapabilityLayerRequired).toBe(true);
    expect(native.directMouseControlAvailable).toBe(false);
    expect(native.directKeyboardControlAvailable).toBe(false);
    expect(native.arbitraryOsAutomationAvailable).toBe(false);
    expect(native.providers[0]).toMatchObject({
      status: "permission_required",
      permissionState: "not_requested",
    });
    expect(native.runtimeSync[0]).toMatchObject({
      sharedProfiles: true,
      sharedCalibration: true,
      sharedMappings: true,
    });
  });

  it("exposes spatial UI framework metadata without direct execution", async () => {
    const { ownerId, spatial } = setup();
    const ui = await spatial.spatialUi(ownerId);

    expect(ui.focusEngineAvailable).toBe(true);
    expect(ui.hoverEngineAvailable).toBe(true);
    expect(ui.dwellEngineAvailable).toBe(true);
    expect(ui.dragDropFrameworkAvailable).toBe(true);
    expect(ui.directExecutionAvailable).toBe(false);
    expect(ui.routesThroughIntentEngine).toBe(true);
    expect(ui.spatialCursorAvailable).toBe(true);
    expect(ui.handRaysAvailable).toBe(true);
    expect(ui.predictionEngineAvailable).toBe(true);
    expect(ui.depthEngineAvailable).toBe(true);
    expect(ui.keyboardFallbackAvailable).toBe(true);
    expect(ui.mouseFallbackAvailable).toBe(true);
    expect(ui.physicsProfiles[0]).toMatchObject({
      id: "spatial.physics.default",
      reducedMotionAware: true,
    });
    expect(ui.gestureSequences[0]).toMatchObject({
      gestures: ["point", "pinch"],
      enabled: true,
    });
    expect(ui.components.map((component) => component.id)).toEqual(
      expect.arrayContaining(["spatial.nav.primary", "spatial.agent.nodes"]),
    );
  });

  it("records spatial UI interaction metrics without enabling execution", async () => {
    const { audits, ownerId, spatial } = setup();
    const ui = await spatial.recordInteractionMetric({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        componentId: "nav:/agents",
        eventType: "spatial_activate",
        state: "activated",
        confidence: 0.9,
        latencyMs: 8,
      },
    });

    expect(ui.metrics[0]).toMatchObject({
      componentId: "nav:/agents",
      eventType: "spatial_activate",
      state: "activated",
      directExecutionAvailable: false,
    });
    expect(audits.map((audit) => audit.eventType)).toContain(
      "SPATIAL_UI_INTERACTION_RECORDED",
    );
  });

  it("records spatial interaction engine metadata without execution authority", async () => {
    const { audits, ownerId, spatial } = setup();
    const ui = await spatial.recordEngineMetric({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        cursor: {
          x: 0.4,
          y: 0.6,
          depth: 0.52,
          velocity: 0.3,
          acceleration: 1.1,
          confidence: 0.86,
          snappedComponentId: "nav:/agents",
        },
        prediction: {
          predictedComponentId: "nav:/agents",
          confidence: 0.8,
          factors: ["cursor_trajectory"],
        },
        ray: {
          source: "right_hand",
          targetComponentId: "nav:/agents",
          confidence: 0.84,
          status: "active",
        },
      },
    });

    expect(ui.cursorMetrics[0]).toMatchObject({
      snappedComponentId: "nav:/agents",
      confidence: 0.86,
    });
    expect(ui.predictions[0]).toMatchObject({
      predictedComponentId: "nav:/agents",
      confidence: 0.8,
    });
    expect(ui.raySessions[0]).toMatchObject({
      source: "right_hand",
      targetComponentId: "nav:/agents",
    });
    expect(audits.map((audit) => audit.eventType)).toContain(
      "SPATIAL_ENGINE_METRIC_RECORDED",
    );
  });

  it("registers and toggles spatial command space without execution authority", async () => {
    const { audits, ownerId, spatial } = setup();
    const initial = await spatial.commandSpace(ownerId);

    expect(initial.spatialModeAvailable).toBe(true);
    expect(initial.standardDashboardAvailable).toBe(true);
    expect(initial.directExecutionAvailable).toBe(false);
    expect(initial.directOsControlAvailable).toBe(false);
    expect(initial.scenes[0]).toMatchObject({
      id: "spatial.scene.command-space",
      mode: "spatial_command_space",
      persistent: true,
    });
    expect(initial.preferences[0]).toMatchObject({
      spatialModeEnabled: false,
      selectedThemeId: "spatial.theme.jarvis",
    });
    expect(initial.visualizations.map((item) => item.visualizationType)).toEqual(
      expect.arrayContaining([
        "agent_constellation",
        "workflow_galaxy",
        "knowledge_universe",
        "system_health",
      ]),
    );

    const enabled = await spatial.updateSpatialMode({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: { enabled: true, source: "dashboard" },
    });

    expect(enabled.preferences[0]).toMatchObject({ spatialModeEnabled: true });
    expect(enabled.sessions[0]).toMatchObject({
      status: "active",
      source: "dashboard",
    });
    expect(audits.map((audit) => audit.eventType)).toEqual(
      expect.arrayContaining([
        "SPATIAL_COMMAND_SPACE_BASELINE_REGISTERED",
        "SPATIAL_MODE_CHANGED",
      ]),
    );
  });

  it("creates custom profiles without enabling camera or high-risk approval", async () => {
    const { audits, ownerId, spatial } = setup();
    const dashboard = await spatial.createProfile({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        name: "Design",
        description: "Design gesture profile.",
        mode: "assistant",
        sensitivity: 0.66,
        debounceMs: 500,
      },
    });

    expect(dashboard.profiles.map((profile) => profile.name)).toContain("Design");
    expect(
      dashboard.profiles.find((profile) => profile.name === "Design")
        ?.disabledHighRiskApproval,
    ).toBe(true);
    expect(audits.map((audit) => audit.eventType)).toContain("SPATIAL_PROFILE_CREATED");
  });

  it("routes a confirmed mapped gesture into the Intent Engine", async () => {
    const { audits, ownerId, spatial } = setup();
    const baseline = await spatial.dashboard(ownerId);
    const profile = baseline.profiles[0];
    expect(profile).toBeDefined();

    const dashboard = await spatial.recordGesture({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        profileId: profile!.id,
        gesture: "pinch",
        confidence: 0.92,
        handedness: "right",
        state: "confirmed",
      },
    });

    expect(dashboard.history[0]).toMatchObject({
      gesture: "pinch",
      state: "completed",
      intentCreated: true,
      rawFrameStored: false,
    });
    expect(dashboard.history[0]?.commandId).toBeTruthy();
    expect(audits.map((audit) => audit.eventType)).toEqual(
      expect.arrayContaining(["COMMAND_RECEIVED", "SPATIAL_GESTURE_MAPPED_TO_INTENT"]),
    );
  });

  it("does not route low-confidence gestures", async () => {
    const { audits, ownerId, spatial } = setup();
    const baseline = await spatial.dashboard(ownerId);
    const profile = baseline.profiles[0];
    expect(profile).toBeDefined();

    const dashboard = await spatial.recordGesture({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        profileId: profile!.id,
        gesture: "pinch",
        confidence: 0.3,
        handedness: "left",
        state: "confirmed",
      },
    });

    expect(dashboard.history[0]).toMatchObject({
      gesture: "pinch",
      state: "failed",
      intentCreated: false,
      commandId: null,
      rawFrameStored: false,
    });
    expect(audits.map((audit) => audit.eventType)).toContain("SPATIAL_GESTURE_DENIED");
  });
});

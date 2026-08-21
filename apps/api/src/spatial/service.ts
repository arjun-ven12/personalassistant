import {
  CameraDeviceRecordSchema,
  CameraProviderRecordSchema,
  CreateGestureProfileRequestSchema,
  CustomGestureRecordSchema,
  DEFAULT_GESTURE_SECURITY_POLICY,
  DesktopContextHistoryRecordSchema,
  GestureCalibrationRecordSchema,
  GestureHistoryRecordSchema,
  GestureMacroRecordSchema,
  GestureMappingRecordSchema,
  GestureMetricRecordSchema,
  GestureProfileRecordSchema,
  GestureVersionRecordSchema,
  MonitorLayoutRecordSchema,
  NativeGestureSessionRecordSchema,
  NativeRuntimeMetricRecordSchema,
  NativeSpatialRuntimeResponseSchema,
  RecordGestureRequestSchema,
  RuntimeProfileRecordSchema,
  RuntimeSyncRecordSchema,
  AnimationProfileRecordSchema,
  CommandSpaceVisualizationRecordSchema,
  CursorMetricRecordSchema,
  GestureSequenceRecordSchema,
  InteractionPredictionRecordSchema,
  InteractionMetricRecordSchema,
  InteractionProfileRecordSchema,
  InteractionSessionRecordSchema,
  ParticleProfileRecordSchema,
  PhysicsProfileRecordSchema,
  RaySessionRecordSchema,
  RecordSpatialEngineMetricRequestSchema,
  RecordSpatialInteractionMetricRequestSchema,
  SceneLayoutRecordSchema,
  ScenePreferenceRecordSchema,
  SpatialCommandSpaceResponseSchema,
  SpatialDashboardResponseSchema,
  SpatialComponentRecordSchema,
  SpatialModeSessionRecordSchema,
  SpatialNavigationHistoryRecordSchema,
  SpatialPreferenceRecordSchema,
  SpatialSceneRecordSchema,
  SpatialUiDashboardResponseSchema,
  SpatialOverlayRecordSchema,
  ThemeProfileRecordSchema,
  TrackingMetricRecordSchema,
  UpdateSpatialModeRequestSchema,
  UpsertGestureMappingRequestSchema,
  VisualizationLayerRecordSchema,
  VisualPositionRecordSchema,
  VisionSessionRecordSchema,
  type GestureMappingRecord,
  type SpatialComponentType,
  type VisionPipelineStage,
} from "@alexa-control/shared";

import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { IntentExecutionService } from "../intent/service.js";
import type { SpatialStore } from "./store.js";

const pipeline: VisionPipelineStage[] = [
  "camera_manager",
  "frame_acquisition",
  "preprocessing",
  "hand_detection",
  "landmark_detection",
  "tracking",
  "gesture_recognition",
  "intent_mapping",
  "command_routing",
  "visualization",
  "metrics",
];

export class SpatialInteractionService {
  constructor(
    readonly store: SpatialStore,
    readonly intent: IntentExecutionService,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return SpatialDashboardResponseSchema.parse({
      cameraDevices: await this.store.listCameraDevices(ownerId, 100),
      visionSessions: await this.store.listVisionSessions(ownerId, 100),
      profiles: await this.store.listProfiles(ownerId, 100),
      mappings: await this.store.listMappings(ownerId, 500),
      macros: await this.store.listMacros(ownerId, 200),
      calibration: await this.store.listCalibration(ownerId, 100),
      history: await this.store.listHistory(ownerId, 500),
      metrics: await this.store.listMetrics(ownerId, 500),
      customGestures: await this.store.listCustomGestures(ownerId, 200),
      versions: await this.store.listVersions(ownerId, 500),
      trackingMetrics: await this.store.listTrackingMetrics(ownerId, 500),
      securityPolicy: DEFAULT_GESTURE_SECURITY_POLICY,
      pipeline,
      rawFramesPersisted: false,
      directOsControlAvailable: false,
      highRiskGestureApprovalAllowed: false,
      routesThroughIntentEngine: true,
    });
  }

  async nativeRuntime(ownerId: string) {
    await this.ensureBaseline(ownerId);
    const sessions = await this.store.listNativeGestureSessions(ownerId, 100);
    return NativeSpatialRuntimeResponseSchema.parse({
      nativeEnabled: sessions.some((session) => session.status === "tracking"),
      state:
        sessions.find((session) => session.status === "tracking")?.status ??
        sessions[0]?.status ??
        "idle",
      providers: await this.store.listCameraProviders(ownerId, 100),
      sessions,
      runtimeProfiles: await this.store.listRuntimeProfiles(ownerId, 100),
      monitorLayouts: await this.store.listMonitorLayouts(ownerId, 100),
      desktopContextHistory: await this.store.listDesktopContextHistory(ownerId, 500),
      nativeMetrics: await this.store.listNativeRuntimeMetrics(ownerId, 500),
      overlays: await this.store.listSpatialOverlays(ownerId, 100),
      runtimeSync: await this.store.listRuntimeSync(ownerId, 100),
      directMouseControlAvailable: false,
      directKeyboardControlAvailable: false,
      arbitraryOsAutomationAvailable: false,
      desktopCapabilityLayerRequired: true,
      routesThroughIntentEngine: true,
    });
  }

  async spatialUi(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return SpatialUiDashboardResponseSchema.parse({
      components: await this.store.listSpatialComponents(ownerId, 500),
      interactionProfiles: await this.store.listInteractionProfiles(ownerId, 100),
      animationProfiles: await this.store.listAnimationProfiles(ownerId, 100),
      preferences: await this.store.listSpatialPreferences(ownerId, 20),
      sessions: await this.store.listInteractionSessions(ownerId, 200),
      metrics: await this.store.listInteractionMetrics(ownerId, 500),
      gestureSequences: await this.store.listGestureSequences(ownerId, 200),
      predictions: await this.store.listInteractionPredictions(ownerId, 500),
      cursorMetrics: await this.store.listCursorMetrics(ownerId, 500),
      raySessions: await this.store.listRaySessions(ownerId, 200),
      physicsProfiles: await this.store.listPhysicsProfiles(ownerId, 100),
      navigationHistory: await this.store.listSpatialNavigationHistory(ownerId, 500),
      focusEngineAvailable: true,
      hoverEngineAvailable: true,
      dwellEngineAvailable: true,
      dragDropFrameworkAvailable: true,
      directExecutionAvailable: false,
      routesThroughIntentEngine: true,
      keyboardFallbackAvailable: true,
      mouseFallbackAvailable: true,
      spatialCursorAvailable: true,
      handRaysAvailable: true,
      predictionEngineAvailable: true,
      magneticTargetingAvailable: true,
      depthEngineAvailable: true,
      radialMenusAvailable: true,
    });
  }

  async commandSpace(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return SpatialCommandSpaceResponseSchema.parse({
      scenes: await this.store.listSpatialScenes(ownerId, 100),
      preferences: await this.store.listScenePreferences(ownerId, 20),
      themes: await this.store.listThemeProfiles(ownerId, 100),
      layers: await this.store.listVisualizationLayers(ownerId, 200),
      particleProfiles: await this.store.listParticleProfiles(ownerId, 100),
      visualPositions: await this.store.listVisualPositions(ownerId, 1_000),
      visualizations: await this.store.listCommandSpaceVisualizations(ownerId, 200),
      layouts: await this.store.listSceneLayouts(ownerId, 100),
      sessions: await this.store.listSpatialModeSessions(ownerId, 200),
      spatialModeAvailable: true,
      standardDashboardAvailable: true,
      routesThroughIntentEngine: true,
      directExecutionAvailable: false,
      directOsControlAvailable: false,
    });
  }

  async updateSpatialMode(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = UpdateSpatialModeRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    const sceneId = parsed.sceneId ?? "spatial.scene.command-space";
    const themeId = parsed.themeId ?? "spatial.theme.jarvis";
    await this.store.saveScenePreference(
      ScenePreferenceRecordSchema.parse({
        id: "spatial.scene.preferences",
        ownerId: input.ownerId,
        spatialModeEnabled: parsed.enabled,
        selectedSceneId: sceneId,
        selectedThemeId: themeId,
        reducedMotion: false,
        bloomEnabled: true,
        particleDensity: 0.46,
        lastModeSwitchAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveSpatialModeSession(
      SpatialModeSessionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        sceneId,
        status: parsed.enabled ? "active" : "completed",
        source: parsed.source,
        startedAt: at,
        endedAt: parsed.enabled ? null : at,
        updatedAt: at,
      }),
    );
    await this.audit({
      eventType: "SPATIAL_MODE_CHANGED",
      ownerId: input.ownerId,
      outcome: "SUCCESS",
      reason: parsed.enabled
        ? "Spatial Command Space enabled without changing execution authority."
        : "Spatial Command Space disabled without changing execution authority.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: {
        enabled: parsed.enabled,
        sceneId,
        themeId,
        directExecutionAvailable: false,
        directOsControlAvailable: false,
      },
    });
    return this.commandSpace(input.ownerId);
  }

  async recordInteractionMetric(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = RecordSpatialInteractionMetricRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    const metric = InteractionMetricRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      sessionId: parsed.sessionId ?? null,
      componentId: parsed.componentId ?? null,
      eventType: parsed.eventType,
      state: parsed.state,
      confidence: parsed.confidence,
      latencyMs: parsed.latencyMs,
      hitBox: parsed.hitBox ?? null,
      intentRouted: ["spatial_activate", "spatial_select", "spatial_inspect"].includes(
        parsed.eventType,
      ),
      directExecutionAvailable: false,
      measuredAt: at,
    });
    await this.store.saveInteractionMetric(metric);
    await this.audit({
      eventType: "SPATIAL_UI_INTERACTION_RECORDED",
      ownerId: input.ownerId,
      outcome: "SUCCESS",
      reason:
        "Spatial UI interaction metadata recorded without direct execution authority.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: {
        componentId: metric.componentId,
        eventType: metric.eventType,
        directExecutionAvailable: false,
        routesThroughIntentEngine: true,
      },
    });
    return this.spatialUi(input.ownerId);
  }

  async recordEngineMetric(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = RecordSpatialEngineMetricRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    if (parsed.cursor) {
      await this.store.saveCursorMetric(
        CursorMetricRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          source: "browser_spatial_runtime",
          x: parsed.cursor.x,
          y: parsed.cursor.y,
          depth: parsed.cursor.depth,
          velocity: parsed.cursor.velocity,
          acceleration: parsed.cursor.acceleration,
          confidence: parsed.cursor.confidence,
          snappedComponentId: parsed.cursor.snappedComponentId ?? null,
          measuredAt: at,
        }),
      );
    }
    if (parsed.prediction) {
      await this.store.saveInteractionPrediction(
        InteractionPredictionRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          predictedComponentId: parsed.prediction.predictedComponentId ?? null,
          actualComponentId: parsed.prediction.actualComponentId ?? null,
          confidence: parsed.prediction.confidence,
          predictionModelId: "spatial.prediction.motion-v1",
          factors: parsed.prediction.factors,
          observedAt: at,
        }),
      );
    }
    if (parsed.ray) {
      await this.store.saveRaySession(
        RaySessionRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          source: parsed.ray.source,
          status: parsed.ray.status,
          targetComponentId: parsed.ray.targetComponentId ?? null,
          confidence: parsed.ray.confidence,
          startedAt: at,
          endedAt: parsed.ray.status === "active" ? null : at,
          updatedAt: at,
        }),
      );
    }
    if (parsed.navigation) {
      await this.store.saveSpatialNavigationHistory(
        SpatialNavigationHistoryRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          fromPath: parsed.navigation.fromPath,
          toPath: parsed.navigation.toPath,
          gesture: parsed.navigation.gesture,
          previewShown: parsed.navigation.previewShown,
          routedThroughIntentEngine: true,
          directExecutionAvailable: false,
          navigatedAt: at,
        }),
      );
    }
    await this.audit({
      eventType: "SPATIAL_ENGINE_METRIC_RECORDED",
      ownerId: input.ownerId,
      outcome: "SUCCESS",
      reason:
        "Spatial interaction engine metadata recorded without direct execution authority.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: {
        cursor: Boolean(parsed.cursor),
        prediction: Boolean(parsed.prediction),
        ray: Boolean(parsed.ray),
        navigation: Boolean(parsed.navigation),
        directExecutionAvailable: false,
      },
    });
    return this.spatialUi(input.ownerId);
  }

  async refreshCameras(input: {
    ownerId: string;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const at = this.now().toISOString();
    await this.store.saveCameraDevice(
      CameraDeviceRecordSchema.parse({
        id: "camera.permission-gated",
        ownerId: input.ownerId,
        label: "Camera inventory permission-gated",
        deviceType: "unknown",
        status: "disabled",
        permissionState: "not_requested",
        supportedResolutions: [],
        supportedFrameRates: [],
        selected: false,
        health:
          "Camera enumeration is disabled until the owner explicitly enables a reviewed local vision provider.",
        lastSeenAt: at,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.audit({
      eventType: "SPATIAL_CAMERA_INVENTORY_REFRESHED",
      ownerId: input.ownerId,
      outcome: "SUCCESS",
      reason:
        "Spatial camera inventory refreshed without requesting camera permission.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: { rawFramesPersisted: false, permissionState: "not_requested" },
    });
    return this.dashboard(input.ownerId);
  }

  async createProfile(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = CreateGestureProfileRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    const profile = GestureProfileRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      name: parsed.name,
      description: parsed.description,
      mode: parsed.mode,
      active: false,
      sensitivity: parsed.sensitivity,
      debounceMs: parsed.debounceMs,
      hysteresis: 0.18,
      disabledHighRiskApproval: true,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveProfile(profile);
    await this.store.saveVersion(
      GestureVersionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        recordType: "profile",
        recordId: profile.id,
        version: "1.0.0",
        changeSummary: "Gesture profile created.",
        createdAt: at,
      }),
    );
    await this.audit({
      eventType: "SPATIAL_PROFILE_CREATED",
      ownerId: input.ownerId,
      outcome: "SUCCESS",
      reason: "Gesture profile created without enabling camera access.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: { profileId: profile.id, highRiskGestureApprovalAllowed: false },
    });
    return this.dashboard(input.ownerId);
  }

  async upsertMapping(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = UpsertGestureMappingRequestSchema.parse(input.body);
    const profile = await this.store.getProfile(input.ownerId, parsed.profileId);
    if (!profile) {
      throw new ExecutionError(
        404,
        "GESTURE_PROFILE_NOT_FOUND",
        "Gesture profile not found.",
      );
    }
    const at = this.now().toISOString();
    const mapping = GestureMappingRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      profileId: parsed.profileId,
      gesture: parsed.gesture,
      lifecycleState: "confirmed",
      intentTemplate: parsed.intentTemplate,
      target: parsed.target,
      safetyLevel: parsed.safetyLevel,
      approvalRequired:
        parsed.approvalRequired || parsed.safetyLevel === "moderate_risk",
      enabled: parsed.enabled,
      cooldownMs: parsed.cooldownMs,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveMapping(mapping);
    await this.store.saveVersion(
      GestureVersionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        recordType: "mapping",
        recordId: mapping.id,
        version: "1.0.0",
        changeSummary: "Gesture mapping updated. Gestures route to Intent Engine only.",
        createdAt: at,
      }),
    );
    await this.audit({
      eventType: "SPATIAL_MAPPING_UPDATED",
      ownerId: input.ownerId,
      outcome: "SUCCESS",
      reason: "Gesture-to-intent mapping recorded.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: {
        mappingId: mapping.id,
        gesture: mapping.gesture,
        routesThroughIntentEngine: true,
      },
    });
    return this.dashboard(input.ownerId);
  }

  async recordGesture(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = RecordGestureRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    const profiles = await this.store.listProfiles(input.ownerId, 100);
    const profileId =
      parsed.profileId ??
      profiles.find((profile) => profile.active)?.id ??
      profiles[0]?.id;
    const mapping =
      profileId && parsed.state === "confirmed" && parsed.confidence >= 0.75
        ? await this.store.findMapping({
            ownerId: input.ownerId,
            profileId,
            gesture: parsed.gesture,
          })
        : null;
    const command = mapping
      ? await this.intent.submit({
          ownerId: input.ownerId,
          body: { request: mapping.intentTemplate, source: "gesture" },
          requestId: input.requestId,
          ipAddress: input.ipAddress,
        })
      : null;
    const history = GestureHistoryRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      profileId: profileId ?? null,
      mappingId: mapping?.id ?? null,
      gesture: parsed.gesture,
      state: mapping
        ? "completed"
        : parsed.state === "confirmed"
          ? "failed"
          : parsed.state,
      confidence: parsed.confidence,
      handedness: parsed.handedness,
      intentCreated: Boolean(command),
      commandId: command?.command.id ?? null,
      rawFrameStored: false,
      reason: mapping
        ? "Confirmed gesture routed to Intent Engine as a governed command."
        : "Gesture was recorded but not routed because confidence, state, or mapping was insufficient.",
      observedAt: at,
    });
    await this.store.saveHistory(history);
    await this.store.saveMetric(
      GestureMetricRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        metricName: "gesture_confidence",
        value: parsed.confidence,
        unit: "ratio",
        measuredAt: at,
      }),
    );
    await this.audit({
      eventType: mapping
        ? "SPATIAL_GESTURE_MAPPED_TO_INTENT"
        : "SPATIAL_GESTURE_DENIED",
      ownerId: input.ownerId,
      outcome: mapping ? "SUCCESS" : "DENIED",
      reason: history.reason,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: {
        gesture: parsed.gesture,
        confidence: parsed.confidence,
        intentCreated: Boolean(command),
        rawFramesPersisted: false,
      },
    });
    return this.dashboard(input.ownerId);
  }

  async ensureBaseline(ownerId: string, requestId = "system") {
    const existingProfiles = await this.store.listProfiles(ownerId, 10);
    if (existingProfiles.length > 0) {
      await this.ensureSpatialUiBaseline(ownerId, requestId);
      await this.ensureCommandSpaceBaseline(ownerId, requestId);
      if ((await this.store.listCameraProviders(ownerId, 1)).length === 0) {
        const at = this.now().toISOString();
        const profileId =
          existingProfiles.find((profile) => profile.active)?.id ??
          existingProfiles[0]!.id;
        await this.store.saveCameraProvider(
          CameraProviderRecordSchema.parse({
            id: "native.camera.provider.pending",
            ownerId,
            providerType: "unknown",
            displayName: "Native camera provider",
            status: "permission_required",
            permissionState: "not_requested",
            hotSwappable: true,
            supportsHardwareAcceleration: false,
            supportedResolutions: ["640x480", "960x540"],
            supportedFrameRates: [15, 30],
            health:
              "Native runtime is explicit and permission-gated. Camera frames remain local to the Mac agent.",
            lastSeenAt: at,
            createdAt: at,
            updatedAt: at,
          }),
        );
        await this.store.saveRuntimeProfile(
          RuntimeProfileRecordSchema.parse({
            id: crypto.randomUUID(),
            ownerId,
            name: "Native productivity",
            mode: "productivity",
            active: true,
            gestureProfileId: profileId,
            desktopCapabilityScope: [
              "desktop.context.read",
              "system_information.framework_status",
            ],
            requiresIntentRouting: true,
            directMouseControlAvailable: false,
            directKeyboardControlAvailable: false,
            createdAt: at,
            updatedAt: at,
          }),
        );
        await this.store.saveNativeGestureSession(
          NativeGestureSessionRecordSchema.parse({
            id: crypto.randomUUID(),
            ownerId,
            deviceId: null,
            providerId: "native.camera.provider.pending",
            runtimeProfileId: null,
            status: "idle",
            localProcessingOnly: true,
            rawFramesPersisted: false,
            desktopCapabilityLayerRequired: true,
            startedAt: at,
            endedAt: null,
            updatedAt: at,
          }),
        );
        await this.store.saveRuntimeSync(
          RuntimeSyncRecordSchema.parse({
            id: crypto.randomUUID(),
            ownerId,
            browserRuntimeVersion: "14A.1",
            nativeRuntimeVersion: "14B.1",
            sharedProfiles: true,
            sharedCalibration: true,
            sharedMappings: true,
            lastSyncedAt: at,
            status: "synced",
          }),
        );
        await this.audit({
          eventType: "NATIVE_SPATIAL_BASELINE_REGISTERED",
          ownerId,
          outcome: "SUCCESS",
          reason:
            "Native spatial baseline registered without requesting camera permission.",
          ipAddress: "system",
          requestId,
          metadata: {
            routesThroughIntentEngine: true,
            desktopCapabilityLayerRequired: true,
            directMouseControlAvailable: false,
            directKeyboardControlAvailable: false,
          },
        });
      }
      return;
    }
    const at = this.now().toISOString();
    const profile = GestureProfileRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      name: "Productivity",
      description:
        "Default local-only gesture profile. Gestures become intents and never directly control the OS.",
      mode: "assistant",
      active: true,
      sensitivity: 0.72,
      debounceMs: 450,
      hysteresis: 0.18,
      disabledHighRiskApproval: true,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveProfile(profile);
    const baselineMappings: Array<
      Pick<
        GestureMappingRecord,
        | "gesture"
        | "intentTemplate"
        | "target"
        | "safetyLevel"
        | "approvalRequired"
        | "enabled"
        | "cooldownMs"
      >
    > = [
      {
        gesture: "pinch",
        intentTemplate: "Open the command center and show available governed actions.",
        target: "intent_engine",
        safetyLevel: "read_only",
        approvalRequired: false,
        enabled: true,
        cooldownMs: 1_000,
      },
      {
        gesture: "open_palm",
        intentTemplate: "Show emergency stop controls and current security posture.",
        target: "intent_engine",
        safetyLevel: "read_only",
        approvalRequired: false,
        enabled: true,
        cooldownMs: 1_000,
      },
      {
        gesture: "swipe_right",
        intentTemplate: "Show the next dashboard context panel.",
        target: "intent_engine",
        safetyLevel: "informational",
        approvalRequired: false,
        enabled: true,
        cooldownMs: 900,
      },
    ];
    for (const mapping of baselineMappings) {
      await this.store.saveMapping(
        GestureMappingRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          profileId: profile.id,
          lifecycleState: "confirmed",
          createdAt: at,
          updatedAt: at,
          ...mapping,
        }),
      );
    }
    await this.store.saveCameraDevice(
      CameraDeviceRecordSchema.parse({
        id: "camera.permission-gated",
        ownerId,
        label: "Camera inventory permission-gated",
        deviceType: "unknown",
        status: "disabled",
        permissionState: "not_requested",
        supportedResolutions: [],
        supportedFrameRates: [],
        selected: false,
        health:
          "Camera access is off. A future local provider must request permission visibly.",
        lastSeenAt: at,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveVisionSession(
      VisionSessionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        cameraDeviceId: null,
        status: "idle",
        pipelineStages: pipeline,
        fpsTarget: 30,
        actualFps: 0,
        latencyMs: 0,
        rawFramesPersisted: false,
        localProcessingOnly: true,
        overlayEnabled: false,
        startedAt: at,
        endedAt: null,
        updatedAt: at,
      }),
    );
    await this.store.saveCalibration(
      GestureCalibrationRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        profileId: profile.id,
        dominantHand: "unknown",
        reach: "normal",
        cameraAngle: "unknown",
        lightingQuality: "unknown",
        trackingQuality: 0,
        handSizeEstimate: "unknown",
        completedAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveMacro(
      GestureMacroRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        profileId: profile.id,
        name: "Double pinch coding mode",
        sequence: ["pinch", "pinch"],
        intentTemplate: "Prepare coding mode as an inspectable governed command.",
        enabled: false,
        version: "1.0.0",
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveCustomGesture(
      CustomGestureRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        profileId: profile.id,
        name: "Custom gesture slot",
        description: "Reserved for future owner-trained gestures.",
        landmarkSignatureSummary: "No landmark signature has been recorded.",
        trainingSampleCount: 0,
        confidenceThreshold: 0.8,
        enabled: false,
        version: "1.0.0",
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveMetric(
      GestureMetricRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        metricName: "spatial_framework_readiness",
        value: 0.5,
        unit: "ratio",
        measuredAt: at,
      }),
    );
    await this.store.saveTrackingMetric(
      TrackingMetricRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        sessionId: null,
        handsTracked: 0,
        landmarkConfidence: 0,
        occlusionRecovered: false,
        stableHandIds: [],
        measuredAt: at,
      }),
    );
    await this.store.saveCameraProvider(
      CameraProviderRecordSchema.parse({
        id: "native.camera.provider.pending",
        ownerId,
        providerType: "unknown",
        displayName: "Native camera provider",
        status: "permission_required",
        permissionState: "not_requested",
        hotSwappable: true,
        supportsHardwareAcceleration: false,
        supportedResolutions: ["640x480", "960x540"],
        supportedFrameRates: [15, 30],
        health:
          "Native runtime is explicit and permission-gated. Camera frames remain local to the Mac agent.",
        lastSeenAt: at,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveRuntimeProfile(
      RuntimeProfileRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        name: "Native productivity",
        mode: "productivity",
        active: true,
        gestureProfileId: profile.id,
        desktopCapabilityScope: [
          "desktop.context.read",
          "system_information.framework_status",
        ],
        requiresIntentRouting: true,
        directMouseControlAvailable: false,
        directKeyboardControlAvailable: false,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveNativeGestureSession(
      NativeGestureSessionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        deviceId: null,
        providerId: "native.camera.provider.pending",
        runtimeProfileId: null,
        status: "idle",
        localProcessingOnly: true,
        rawFramesPersisted: false,
        desktopCapabilityLayerRequired: true,
        startedAt: at,
        endedAt: null,
        updatedAt: at,
      }),
    );
    await this.store.saveMonitorLayout(
      MonitorLayoutRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        displayName: "Uncalibrated monitor layout",
        displayCount: 0,
        primaryDisplayId: null,
        calibrationStatus: "uncalibrated",
        coordinateSpace: "native_unavailable",
        updatedAt: at,
      }),
    );
    await this.store.saveDesktopContextHistory(
      DesktopContextHistoryRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        activeApplicationId: null,
        focusedWindowId: null,
        workspaceLabel: "unknown",
        capturedBy: "metadata_only",
        observedAt: at,
      }),
    );
    await this.store.saveNativeRuntimeMetric(
      NativeRuntimeMetricRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        sessionId: null,
        fps: 0,
        latencyMs: 0,
        cpuPercent: null,
        memoryMb: null,
        trackingQuality: 0,
        droppedFrames: 0,
        thermalState: "unknown",
        measuredAt: at,
      }),
    );
    await this.store.saveSpatialOverlay(
      SpatialOverlayRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        status: "disabled",
        showsHandSkeleton: true,
        showsTargetIndicator: true,
        showsGestureName: true,
        rawScreenCaptureRequired: false,
        updatedAt: at,
      }),
    );
    await this.store.saveRuntimeSync(
      RuntimeSyncRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        browserRuntimeVersion: "14A.1",
        nativeRuntimeVersion: "14B.1",
        sharedProfiles: true,
        sharedCalibration: true,
        sharedMappings: true,
        lastSyncedAt: at,
        status: "synced",
      }),
    );
    await this.store.saveVersion(
      GestureVersionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        recordType: "profile",
        recordId: profile.id,
        version: "1.0.0",
        changeSummary: "Baseline spatial interaction profile registered.",
        createdAt: at,
      }),
    );
    await this.audit({
      eventType: "SPATIAL_BASELINE_REGISTERED",
      ownerId,
      outcome: "SUCCESS",
      reason: "Spatial interaction baseline registered without camera activation.",
      ipAddress: "system",
      requestId,
      metadata: {
        routesThroughIntentEngine: true,
        rawFramesPersisted: false,
        highRiskGestureApprovalAllowed: false,
      },
    });
    await this.ensureSpatialUiBaseline(ownerId, requestId);
    await this.ensureCommandSpaceBaseline(ownerId, requestId);
  }

  private async ensureCommandSpaceBaseline(ownerId: string, requestId = "system") {
    if ((await this.store.listSpatialScenes(ownerId, 1)).length > 0) return;
    const at = this.now().toISOString();
    const sceneId = "spatial.scene.command-space";
    await this.store.saveSpatialScene(
      SpatialSceneRecordSchema.parse({
        id: sceneId,
        ownerId,
        name: "Spatial Command Space",
        mode: "spatial_command_space",
        active: true,
        cameraPreset: "home",
        quality: "adaptive",
        persistent: true,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveScenePreference(
      ScenePreferenceRecordSchema.parse({
        id: "spatial.scene.preferences",
        ownerId,
        spatialModeEnabled: false,
        selectedSceneId: sceneId,
        selectedThemeId: "spatial.theme.jarvis",
        reducedMotion: false,
        bloomEnabled: true,
        particleDensity: 0.46,
        lastModeSwitchAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveThemeProfile(
      ThemeProfileRecordSchema.parse({
        id: "spatial.theme.jarvis",
        ownerId,
        name: "JARVIS command blue",
        theme: "jarvis",
        primaryAccent: "#57B8FF",
        secondaryAccent: "#43E7A2",
        background: "#020407",
        glowIntensity: 0.58,
        createdAt: at,
        updatedAt: at,
      }),
    );
    const layers = [
      "background",
      "particles",
      "world",
      "agents",
      "memory",
      "workflow",
      "hud",
      "interaction",
      "debug",
    ] as const;
    for (const [index, layer] of layers.entries()) {
      await this.store.saveVisualizationLayer(
        VisualizationLayerRecordSchema.parse({
          id: `spatial.layer.${layer}`,
          ownerId,
          sceneId,
          name: layer.replaceAll("_", " "),
          layerType: layer,
          enabled: true,
          order: index,
          opacity: layer === "debug" ? 0 : 1,
          updatedAt: at,
        }),
      );
    }
    await this.store.saveParticleProfile(
      ParticleProfileRecordSchema.parse({
        id: "spatial.particles.default",
        ownerId,
        sceneId,
        name: "Ambient command particles",
        density: 0.46,
        speed: 0.22,
        intentPulses: true,
        workflowBursts: true,
        memorySparks: true,
        updatedAt: at,
      }),
    );
    const visualizations = [
      {
        visualizationType: "agent_constellation",
        title: "Agent Constellation",
        summary: "Active agents appear as orbiting holographic nodes.",
        entityCount: 8,
        health: "nominal",
      },
      {
        visualizationType: "workflow_galaxy",
        title: "Workflow Galaxy",
        summary: "Workflow stages, approvals, validation, and failures form galaxies.",
        entityCount: 0,
        health: "unknown",
      },
      {
        visualizationType: "knowledge_universe",
        title: "Knowledge Universe",
        summary: "Memory clusters and semantic links are visualized spatially.",
        entityCount: 0,
        health: "unknown",
      },
      {
        visualizationType: "system_health",
        title: "System Health",
        summary: "Postgres, runtime, agents, and browser health feed the central core.",
        entityCount: 6,
        health: "nominal",
      },
    ] as const;
    for (const visualization of visualizations) {
      await this.store.saveCommandSpaceVisualization(
        CommandSpaceVisualizationRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          sceneId,
          ...visualization,
          updatedAt: at,
        }),
      );
    }
    await this.store.saveSceneLayout(
      SceneLayoutRecordSchema.parse({
        id: "spatial.layout.default",
        ownerId,
        sceneId,
        layoutName: "Command bridge",
        floatingPanels: [
          "panel.security",
          "panel.workflows",
          "panel.memory",
          "panel.approvals",
        ],
        spatialWindows: [
          "window.agent-inspector",
          "window.workflow-viewer",
          "window.knowledge-universe",
        ],
        cameraHome: { x: 0, y: 1.2, z: 7.2 },
        updatedAt: at,
      }),
    );
    await this.store.saveVisualPosition(
      VisualPositionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        sceneId,
        entityType: "agent",
        entityId: "agent.mesh",
        x: 0,
        y: 1.4,
        z: 0,
        orbitRadius: 2.8,
        pinned: false,
        updatedAt: at,
      }),
    );
    await this.audit({
      eventType: "SPATIAL_COMMAND_SPACE_BASELINE_REGISTERED",
      ownerId,
      outcome: "SUCCESS",
      reason:
        "Spatial Command Space baseline registered without changing execution authority.",
      ipAddress: "system",
      requestId,
      metadata: {
        sceneId,
        directExecutionAvailable: false,
        directOsControlAvailable: false,
      },
    });
  }

  async ensureSpatialUiBaseline(ownerId: string, requestId = "system") {
    const at = this.now().toISOString();
    const animationProfileId = "spatial.animation.default";
    const ensurePhase14DDefaults = async () => {
      if ((await this.store.listPhysicsProfiles(ownerId, 1)).length === 0) {
        await this.store.savePhysicsProfile(
          PhysicsProfileRecordSchema.parse({
            id: "spatial.physics.default",
            ownerId,
            name: "Stable holographic cursor physics",
            cursorSmoothing: 0.72,
            inertia: 0.16,
            friction: 0.84,
            magneticSnapStrength: 0.42,
            snapRadius: 0.065,
            dwellMs: 1_200,
            reducedMotionAware: true,
            createdAt: at,
            updatedAt: at,
          }),
        );
      }
      if ((await this.store.listGestureSequences(ownerId, 1)).length === 0) {
        await this.store.saveGestureSequence(
          GestureSequenceRecordSchema.parse({
            id: crypto.randomUUID(),
            ownerId,
            name: "Inspect then confirm",
            gestures: ["point", "pinch"],
            maxGapMs: 2_500,
            intentTemplate:
              "Inspect the focused dashboard object, then confirm selection.",
            enabled: true,
            version: "14D.1",
            createdAt: at,
            updatedAt: at,
          }),
        );
      }
    };
    if ((await this.store.listSpatialComponents(ownerId, 1)).length > 0) {
      await ensurePhase14DDefaults();
      return;
    }
    await this.store.saveAnimationProfile(
      AnimationProfileRecordSchema.parse({
        id: animationProfileId,
        ownerId,
        name: "Default spatial motion",
        hoverScale: 1.015,
        selectedScale: 1.025,
        glowIntensity: 0.38,
        springStiffness: 180,
        momentumEnabled: false,
        respectsReducedMotion: true,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveInteractionProfile(
      InteractionProfileRecordSchema.parse({
        id: "spatial.interaction.default",
        ownerId,
        name: "Stable dashboard targeting",
        active: true,
        hoverDelayMs: 140,
        hoverSmoothing: 0.72,
        dwellMs: 1_200,
        focusLockEnabled: false,
        largeTargets: true,
        reducedMotionAware: true,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveSpatialPreference(
      SpatialPreferenceRecordSchema.parse({
        id: "spatial.preferences.default",
        ownerId,
        spatialModeEnabled: true,
        dwellActivationEnabled: false,
        pointerSmoothing: 0.76,
        highContrastSpatialFocus: false,
        debugInspectorEnabled: false,
        updatedAt: at,
      }),
    );
    await ensurePhase14DDefaults();
    await this.store.saveInteractionSession(
      InteractionSessionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        source: "browser_spatial_runtime",
        status: "completed",
        componentCount: 0,
        startedAt: at,
        endedAt: at,
        updatedAt: at,
      }),
    );
    const baselineComponents: Array<{
      id: string;
      type: SpatialComponentType;
      label: string;
      capabilities: string[];
      gestures: string[];
    }> = [
      {
        id: "spatial.nav.primary",
        type: "menu",
        label: "Primary navigation",
        capabilities: ["hover", "focus", "select", "activate"],
        gestures: ["point", "pinch", "hover"],
      },
      {
        id: "spatial.command-palette",
        type: "input",
        label: "Global command palette",
        capabilities: ["hover", "focus", "select", "activate", "dwell_activate"],
        gestures: ["point", "pinch", "open_palm"],
      },
      {
        id: "spatial.dashboard.cards",
        type: "card",
        label: "Dashboard cards",
        capabilities: ["hover", "focus", "select", "inspect", "highlight"],
        gestures: ["point", "pinch", "hover"],
      },
      {
        id: "spatial.agent.nodes",
        type: "node",
        label: "Agent nodes",
        capabilities: ["hover", "focus", "select", "inspect", "activate"],
        gestures: ["point", "pinch", "hover"],
      },
      {
        id: "spatial.dialogs",
        type: "dialog",
        label: "Spatial dialogs",
        capabilities: ["hover", "focus", "select", "activate", "cancel"],
        gestures: ["point", "pinch", "open_palm"],
      },
    ];
    for (const component of baselineComponents) {
      await this.store.saveSpatialComponent(
        SpatialComponentRecordSchema.parse({
          id: component.id,
          ownerId,
          componentType: component.type,
          displayName: component.label,
          capabilities: component.capabilities,
          supportedGestures: component.gestures,
          accessibilityLabel: component.label,
          animationProfileId,
          version: "14C.1",
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
    await this.audit({
      eventType: "SPATIAL_UI_BASELINE_REGISTERED",
      ownerId,
      outcome: "SUCCESS",
      reason:
        "Spatial UI framework baseline registered without adding execution authority.",
      ipAddress: "system",
      requestId,
      metadata: {
        componentCount: baselineComponents.length,
        directExecutionAvailable: false,
        routesThroughIntentEngine: true,
      },
    });
  }
}

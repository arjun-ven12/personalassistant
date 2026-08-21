import {
  CameraDeviceRecordSchema,
  CameraProviderRecordSchema,
  CustomGestureRecordSchema,
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
  RuntimeProfileRecordSchema,
  RuntimeSyncRecordSchema,
  AnimationProfileRecordSchema,
  CursorMetricRecordSchema,
  CommandSpaceVisualizationRecordSchema,
  GestureSequenceRecordSchema,
  InteractionPredictionRecordSchema,
  InteractionMetricRecordSchema,
  InteractionProfileRecordSchema,
  InteractionSessionRecordSchema,
  PhysicsProfileRecordSchema,
  ParticleProfileRecordSchema,
  RaySessionRecordSchema,
  SceneLayoutRecordSchema,
  ScenePreferenceRecordSchema,
  SpatialModeSessionRecordSchema,
  SpatialSceneRecordSchema,
  SpatialComponentRecordSchema,
  SpatialNavigationHistoryRecordSchema,
  SpatialPreferenceRecordSchema,
  SpatialOverlayRecordSchema,
  ThemeProfileRecordSchema,
  TrackingMetricRecordSchema,
  VisualizationLayerRecordSchema,
  VisualPositionRecordSchema,
  VisionSessionRecordSchema,
  type CameraDeviceRecord,
  type CameraProviderRecord,
  type CustomGestureRecord,
  type DesktopContextHistoryRecord,
  type GestureCalibrationRecord,
  type GestureHistoryRecord,
  type GestureMacroRecord,
  type GestureMappingRecord,
  type GestureMetricRecord,
  type GestureProfileRecord,
  type GestureVersionRecord,
  type MonitorLayoutRecord,
  type NativeGestureSessionRecord,
  type NativeRuntimeMetricRecord,
  type RuntimeProfileRecord,
  type RuntimeSyncRecord,
  type AnimationProfileRecord,
  type CursorMetricRecord,
  type CommandSpaceVisualizationRecord,
  type GestureSequenceRecord,
  type InteractionPredictionRecord,
  type InteractionMetricRecord,
  type InteractionProfileRecord,
  type InteractionSessionRecord,
  type PhysicsProfileRecord,
  type ParticleProfileRecord,
  type RaySessionRecord,
  type SceneLayoutRecord,
  type ScenePreferenceRecord,
  type SpatialModeSessionRecord,
  type SpatialSceneRecord,
  type SpatialComponentRecord,
  type SpatialNavigationHistoryRecord,
  type SpatialPreferenceRecord,
  type SpatialOverlayRecord,
  type ThemeProfileRecord,
  type TrackingMetricRecord,
  type VisualizationLayerRecord,
  type VisualPositionRecord,
  type VisionSessionRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface SpatialStore {
  saveCameraDevice(record: CameraDeviceRecord): Awaitable<void>;
  listCameraDevices(ownerId: string, limit: number): Awaitable<CameraDeviceRecord[]>;
  saveVisionSession(record: VisionSessionRecord): Awaitable<void>;
  listVisionSessions(ownerId: string, limit: number): Awaitable<VisionSessionRecord[]>;
  saveProfile(record: GestureProfileRecord): Awaitable<void>;
  listProfiles(ownerId: string, limit: number): Awaitable<GestureProfileRecord[]>;
  getProfile(ownerId: string, id: string): Awaitable<GestureProfileRecord | null>;
  saveMapping(record: GestureMappingRecord): Awaitable<void>;
  listMappings(ownerId: string, limit: number): Awaitable<GestureMappingRecord[]>;
  findMapping(input: {
    ownerId: string;
    profileId: string;
    gesture: string;
  }): Awaitable<GestureMappingRecord | null>;
  saveMacro(record: GestureMacroRecord): Awaitable<void>;
  listMacros(ownerId: string, limit: number): Awaitable<GestureMacroRecord[]>;
  saveCalibration(record: GestureCalibrationRecord): Awaitable<void>;
  listCalibration(
    ownerId: string,
    limit: number,
  ): Awaitable<GestureCalibrationRecord[]>;
  saveHistory(record: GestureHistoryRecord): Awaitable<void>;
  listHistory(ownerId: string, limit: number): Awaitable<GestureHistoryRecord[]>;
  saveMetric(record: GestureMetricRecord): Awaitable<void>;
  listMetrics(ownerId: string, limit: number): Awaitable<GestureMetricRecord[]>;
  saveCustomGesture(record: CustomGestureRecord): Awaitable<void>;
  listCustomGestures(ownerId: string, limit: number): Awaitable<CustomGestureRecord[]>;
  saveVersion(record: GestureVersionRecord): Awaitable<void>;
  listVersions(ownerId: string, limit: number): Awaitable<GestureVersionRecord[]>;
  saveTrackingMetric(record: TrackingMetricRecord): Awaitable<void>;
  listTrackingMetrics(
    ownerId: string,
    limit: number,
  ): Awaitable<TrackingMetricRecord[]>;
  saveCameraProvider(record: CameraProviderRecord): Awaitable<void>;
  listCameraProviders(
    ownerId: string,
    limit: number,
  ): Awaitable<CameraProviderRecord[]>;
  saveRuntimeProfile(record: RuntimeProfileRecord): Awaitable<void>;
  listRuntimeProfiles(
    ownerId: string,
    limit: number,
  ): Awaitable<RuntimeProfileRecord[]>;
  saveNativeGestureSession(record: NativeGestureSessionRecord): Awaitable<void>;
  listNativeGestureSessions(
    ownerId: string,
    limit: number,
  ): Awaitable<NativeGestureSessionRecord[]>;
  saveMonitorLayout(record: MonitorLayoutRecord): Awaitable<void>;
  listMonitorLayouts(ownerId: string, limit: number): Awaitable<MonitorLayoutRecord[]>;
  saveDesktopContextHistory(record: DesktopContextHistoryRecord): Awaitable<void>;
  listDesktopContextHistory(
    ownerId: string,
    limit: number,
  ): Awaitable<DesktopContextHistoryRecord[]>;
  saveNativeRuntimeMetric(record: NativeRuntimeMetricRecord): Awaitable<void>;
  listNativeRuntimeMetrics(
    ownerId: string,
    limit: number,
  ): Awaitable<NativeRuntimeMetricRecord[]>;
  saveSpatialOverlay(record: SpatialOverlayRecord): Awaitable<void>;
  listSpatialOverlays(
    ownerId: string,
    limit: number,
  ): Awaitable<SpatialOverlayRecord[]>;
  saveRuntimeSync(record: RuntimeSyncRecord): Awaitable<void>;
  listRuntimeSync(ownerId: string, limit: number): Awaitable<RuntimeSyncRecord[]>;
  saveSpatialComponent(record: SpatialComponentRecord): Awaitable<void>;
  listSpatialComponents(
    ownerId: string,
    limit: number,
  ): Awaitable<SpatialComponentRecord[]>;
  saveInteractionProfile(record: InteractionProfileRecord): Awaitable<void>;
  listInteractionProfiles(
    ownerId: string,
    limit: number,
  ): Awaitable<InteractionProfileRecord[]>;
  saveAnimationProfile(record: AnimationProfileRecord): Awaitable<void>;
  listAnimationProfiles(
    ownerId: string,
    limit: number,
  ): Awaitable<AnimationProfileRecord[]>;
  saveSpatialPreference(record: SpatialPreferenceRecord): Awaitable<void>;
  listSpatialPreferences(
    ownerId: string,
    limit: number,
  ): Awaitable<SpatialPreferenceRecord[]>;
  saveInteractionSession(record: InteractionSessionRecord): Awaitable<void>;
  listInteractionSessions(
    ownerId: string,
    limit: number,
  ): Awaitable<InteractionSessionRecord[]>;
  saveInteractionMetric(record: InteractionMetricRecord): Awaitable<void>;
  listInteractionMetrics(
    ownerId: string,
    limit: number,
  ): Awaitable<InteractionMetricRecord[]>;
  saveGestureSequence(record: GestureSequenceRecord): Awaitable<void>;
  listGestureSequences(
    ownerId: string,
    limit: number,
  ): Awaitable<GestureSequenceRecord[]>;
  saveInteractionPrediction(record: InteractionPredictionRecord): Awaitable<void>;
  listInteractionPredictions(
    ownerId: string,
    limit: number,
  ): Awaitable<InteractionPredictionRecord[]>;
  saveCursorMetric(record: CursorMetricRecord): Awaitable<void>;
  listCursorMetrics(ownerId: string, limit: number): Awaitable<CursorMetricRecord[]>;
  saveRaySession(record: RaySessionRecord): Awaitable<void>;
  listRaySessions(ownerId: string, limit: number): Awaitable<RaySessionRecord[]>;
  savePhysicsProfile(record: PhysicsProfileRecord): Awaitable<void>;
  listPhysicsProfiles(
    ownerId: string,
    limit: number,
  ): Awaitable<PhysicsProfileRecord[]>;
  saveSpatialNavigationHistory(record: SpatialNavigationHistoryRecord): Awaitable<void>;
  listSpatialNavigationHistory(
    ownerId: string,
    limit: number,
  ): Awaitable<SpatialNavigationHistoryRecord[]>;
  saveSpatialScene(record: SpatialSceneRecord): Awaitable<void>;
  listSpatialScenes(ownerId: string, limit: number): Awaitable<SpatialSceneRecord[]>;
  saveScenePreference(record: ScenePreferenceRecord): Awaitable<void>;
  listScenePreferences(
    ownerId: string,
    limit: number,
  ): Awaitable<ScenePreferenceRecord[]>;
  saveThemeProfile(record: ThemeProfileRecord): Awaitable<void>;
  listThemeProfiles(ownerId: string, limit: number): Awaitable<ThemeProfileRecord[]>;
  saveVisualizationLayer(record: VisualizationLayerRecord): Awaitable<void>;
  listVisualizationLayers(
    ownerId: string,
    limit: number,
  ): Awaitable<VisualizationLayerRecord[]>;
  saveParticleProfile(record: ParticleProfileRecord): Awaitable<void>;
  listParticleProfiles(
    ownerId: string,
    limit: number,
  ): Awaitable<ParticleProfileRecord[]>;
  saveVisualPosition(record: VisualPositionRecord): Awaitable<void>;
  listVisualPositions(
    ownerId: string,
    limit: number,
  ): Awaitable<VisualPositionRecord[]>;
  saveCommandSpaceVisualization(
    record: CommandSpaceVisualizationRecord,
  ): Awaitable<void>;
  listCommandSpaceVisualizations(
    ownerId: string,
    limit: number,
  ): Awaitable<CommandSpaceVisualizationRecord[]>;
  saveSceneLayout(record: SceneLayoutRecord): Awaitable<void>;
  listSceneLayouts(ownerId: string, limit: number): Awaitable<SceneLayoutRecord[]>;
  saveSpatialModeSession(record: SpatialModeSessionRecord): Awaitable<void>;
  listSpatialModeSessions(
    ownerId: string,
    limit: number,
  ): Awaitable<SpatialModeSessionRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemorySpatialStore implements SpatialStore {
  readonly #cameras = new Map<string, CameraDeviceRecord>();
  readonly #sessions = new Map<string, VisionSessionRecord>();
  readonly #profiles = new Map<string, GestureProfileRecord>();
  readonly #mappings = new Map<string, GestureMappingRecord>();
  readonly #macros = new Map<string, GestureMacroRecord>();
  readonly #calibration = new Map<string, GestureCalibrationRecord>();
  readonly #history = new Map<string, GestureHistoryRecord>();
  readonly #metrics = new Map<string, GestureMetricRecord>();
  readonly #customGestures = new Map<string, CustomGestureRecord>();
  readonly #versions = new Map<string, GestureVersionRecord>();
  readonly #trackingMetrics = new Map<string, TrackingMetricRecord>();
  readonly #cameraProviders = new Map<string, CameraProviderRecord>();
  readonly #runtimeProfiles = new Map<string, RuntimeProfileRecord>();
  readonly #nativeSessions = new Map<string, NativeGestureSessionRecord>();
  readonly #monitorLayouts = new Map<string, MonitorLayoutRecord>();
  readonly #desktopContextHistory = new Map<string, DesktopContextHistoryRecord>();
  readonly #nativeMetrics = new Map<string, NativeRuntimeMetricRecord>();
  readonly #overlays = new Map<string, SpatialOverlayRecord>();
  readonly #runtimeSync = new Map<string, RuntimeSyncRecord>();
  readonly #spatialComponents = new Map<string, SpatialComponentRecord>();
  readonly #interactionProfiles = new Map<string, InteractionProfileRecord>();
  readonly #animationProfiles = new Map<string, AnimationProfileRecord>();
  readonly #spatialPreferences = new Map<string, SpatialPreferenceRecord>();
  readonly #interactionSessions = new Map<string, InteractionSessionRecord>();
  readonly #interactionMetrics = new Map<string, InteractionMetricRecord>();
  readonly #gestureSequences = new Map<string, GestureSequenceRecord>();
  readonly #interactionPredictions = new Map<string, InteractionPredictionRecord>();
  readonly #cursorMetrics = new Map<string, CursorMetricRecord>();
  readonly #raySessions = new Map<string, RaySessionRecord>();
  readonly #physicsProfiles = new Map<string, PhysicsProfileRecord>();
  readonly #navigationHistory = new Map<string, SpatialNavigationHistoryRecord>();
  readonly #spatialScenes = new Map<string, SpatialSceneRecord>();
  readonly #scenePreferences = new Map<string, ScenePreferenceRecord>();
  readonly #themeProfiles = new Map<string, ThemeProfileRecord>();
  readonly #visualizationLayers = new Map<string, VisualizationLayerRecord>();
  readonly #particleProfiles = new Map<string, ParticleProfileRecord>();
  readonly #visualPositions = new Map<string, VisualPositionRecord>();
  readonly #commandSpaceVisualizations = new Map<
    string,
    CommandSpaceVisualizationRecord
  >();
  readonly #sceneLayouts = new Map<string, SceneLayoutRecord>();
  readonly #spatialModeSessions = new Map<string, SpatialModeSessionRecord>();

  saveCameraDevice(record: CameraDeviceRecord) {
    this.#cameras.set(
      `${record.ownerId}:${record.id}`,
      clone(CameraDeviceRecordSchema.parse(record)),
    );
  }
  listCameraDevices(ownerId: string, limit: number) {
    return ordered(
      [...this.#cameras.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveVisionSession(record: VisionSessionRecord) {
    this.#sessions.set(record.id, clone(VisionSessionRecordSchema.parse(record)));
  }
  listVisionSessions(ownerId: string, limit: number) {
    return ordered(
      [...this.#sessions.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveProfile(record: GestureProfileRecord) {
    this.#profiles.set(record.id, clone(GestureProfileRecordSchema.parse(record)));
  }
  listProfiles(ownerId: string, limit: number) {
    return ordered(
      [...this.#profiles.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getProfile(ownerId: string, id: string) {
    const profile = this.#profiles.get(id);
    return profile?.ownerId === ownerId ? clone(profile) : null;
  }
  saveMapping(record: GestureMappingRecord) {
    this.#mappings.set(record.id, clone(GestureMappingRecordSchema.parse(record)));
  }
  listMappings(ownerId: string, limit: number) {
    return ordered(
      [...this.#mappings.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  findMapping(input: { ownerId: string; profileId: string; gesture: string }) {
    const mapping = ordered(
      [...this.#mappings.values()].filter(
        (item) =>
          item.ownerId === input.ownerId &&
          item.profileId === input.profileId &&
          item.gesture === input.gesture &&
          item.enabled,
      ),
      "updatedAt",
      1,
    )[0];
    return mapping ? clone(mapping) : null;
  }
  saveMacro(record: GestureMacroRecord) {
    this.#macros.set(record.id, clone(GestureMacroRecordSchema.parse(record)));
  }
  listMacros(ownerId: string, limit: number) {
    return ordered(
      [...this.#macros.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveCalibration(record: GestureCalibrationRecord) {
    this.#calibration.set(
      record.id,
      clone(GestureCalibrationRecordSchema.parse(record)),
    );
  }
  listCalibration(ownerId: string, limit: number) {
    return ordered(
      [...this.#calibration.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveHistory(record: GestureHistoryRecord) {
    this.#history.set(record.id, clone(GestureHistoryRecordSchema.parse(record)));
  }
  listHistory(ownerId: string, limit: number) {
    return ordered(
      [...this.#history.values()].filter((item) => item.ownerId === ownerId),
      "observedAt",
      limit,
    );
  }
  saveMetric(record: GestureMetricRecord) {
    this.#metrics.set(record.id, clone(GestureMetricRecordSchema.parse(record)));
  }
  listMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#metrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveCustomGesture(record: CustomGestureRecord) {
    this.#customGestures.set(record.id, clone(CustomGestureRecordSchema.parse(record)));
  }
  listCustomGestures(ownerId: string, limit: number) {
    return ordered(
      [...this.#customGestures.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveVersion(record: GestureVersionRecord) {
    this.#versions.set(record.id, clone(GestureVersionRecordSchema.parse(record)));
  }
  listVersions(ownerId: string, limit: number) {
    return ordered(
      [...this.#versions.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveTrackingMetric(record: TrackingMetricRecord) {
    this.#trackingMetrics.set(
      record.id,
      clone(TrackingMetricRecordSchema.parse(record)),
    );
  }
  listTrackingMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#trackingMetrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveCameraProvider(record: CameraProviderRecord) {
    this.#cameraProviders.set(
      `${record.ownerId}:${record.id}`,
      clone(CameraProviderRecordSchema.parse(record)),
    );
  }
  listCameraProviders(ownerId: string, limit: number) {
    return ordered(
      [...this.#cameraProviders.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveRuntimeProfile(record: RuntimeProfileRecord) {
    this.#runtimeProfiles.set(
      record.id,
      clone(RuntimeProfileRecordSchema.parse(record)),
    );
  }
  listRuntimeProfiles(ownerId: string, limit: number) {
    return ordered(
      [...this.#runtimeProfiles.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveNativeGestureSession(record: NativeGestureSessionRecord) {
    this.#nativeSessions.set(
      record.id,
      clone(NativeGestureSessionRecordSchema.parse(record)),
    );
  }
  listNativeGestureSessions(ownerId: string, limit: number) {
    return ordered(
      [...this.#nativeSessions.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveMonitorLayout(record: MonitorLayoutRecord) {
    this.#monitorLayouts.set(record.id, clone(MonitorLayoutRecordSchema.parse(record)));
  }
  listMonitorLayouts(ownerId: string, limit: number) {
    return ordered(
      [...this.#monitorLayouts.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveDesktopContextHistory(record: DesktopContextHistoryRecord) {
    this.#desktopContextHistory.set(
      record.id,
      clone(DesktopContextHistoryRecordSchema.parse(record)),
    );
  }
  listDesktopContextHistory(ownerId: string, limit: number) {
    return ordered(
      [...this.#desktopContextHistory.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "observedAt",
      limit,
    );
  }
  saveNativeRuntimeMetric(record: NativeRuntimeMetricRecord) {
    this.#nativeMetrics.set(
      record.id,
      clone(NativeRuntimeMetricRecordSchema.parse(record)),
    );
  }
  listNativeRuntimeMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#nativeMetrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveSpatialOverlay(record: SpatialOverlayRecord) {
    this.#overlays.set(record.id, clone(SpatialOverlayRecordSchema.parse(record)));
  }
  listSpatialOverlays(ownerId: string, limit: number) {
    return ordered(
      [...this.#overlays.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveRuntimeSync(record: RuntimeSyncRecord) {
    this.#runtimeSync.set(record.id, clone(RuntimeSyncRecordSchema.parse(record)));
  }
  listRuntimeSync(ownerId: string, limit: number) {
    return ordered(
      [...this.#runtimeSync.values()].filter((item) => item.ownerId === ownerId),
      "lastSyncedAt",
      limit,
    );
  }
  saveSpatialComponent(record: SpatialComponentRecord) {
    this.#spatialComponents.set(
      `${record.ownerId}:${record.id}`,
      clone(SpatialComponentRecordSchema.parse(record)),
    );
  }
  listSpatialComponents(ownerId: string, limit: number) {
    return ordered(
      [...this.#spatialComponents.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveInteractionProfile(record: InteractionProfileRecord) {
    this.#interactionProfiles.set(
      `${record.ownerId}:${record.id}`,
      clone(InteractionProfileRecordSchema.parse(record)),
    );
  }
  listInteractionProfiles(ownerId: string, limit: number) {
    return ordered(
      [...this.#interactionProfiles.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
  saveAnimationProfile(record: AnimationProfileRecord) {
    this.#animationProfiles.set(
      `${record.ownerId}:${record.id}`,
      clone(AnimationProfileRecordSchema.parse(record)),
    );
  }
  listAnimationProfiles(ownerId: string, limit: number) {
    return ordered(
      [...this.#animationProfiles.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveSpatialPreference(record: SpatialPreferenceRecord) {
    this.#spatialPreferences.set(
      `${record.ownerId}:${record.id}`,
      clone(SpatialPreferenceRecordSchema.parse(record)),
    );
  }
  listSpatialPreferences(ownerId: string, limit: number) {
    return ordered(
      [...this.#spatialPreferences.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveInteractionSession(record: InteractionSessionRecord) {
    this.#interactionSessions.set(
      record.id,
      clone(InteractionSessionRecordSchema.parse(record)),
    );
  }
  listInteractionSessions(ownerId: string, limit: number) {
    return ordered(
      [...this.#interactionSessions.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
  saveInteractionMetric(record: InteractionMetricRecord) {
    this.#interactionMetrics.set(
      record.id,
      clone(InteractionMetricRecordSchema.parse(record)),
    );
  }
  listInteractionMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#interactionMetrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveGestureSequence(record: GestureSequenceRecord) {
    this.#gestureSequences.set(
      record.id,
      clone(GestureSequenceRecordSchema.parse(record)),
    );
  }
  listGestureSequences(ownerId: string, limit: number) {
    return ordered(
      [...this.#gestureSequences.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveInteractionPrediction(record: InteractionPredictionRecord) {
    this.#interactionPredictions.set(
      record.id,
      clone(InteractionPredictionRecordSchema.parse(record)),
    );
  }
  listInteractionPredictions(ownerId: string, limit: number) {
    return ordered(
      [...this.#interactionPredictions.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "observedAt",
      limit,
    );
  }
  saveCursorMetric(record: CursorMetricRecord) {
    this.#cursorMetrics.set(record.id, clone(CursorMetricRecordSchema.parse(record)));
  }
  listCursorMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#cursorMetrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveRaySession(record: RaySessionRecord) {
    this.#raySessions.set(record.id, clone(RaySessionRecordSchema.parse(record)));
  }
  listRaySessions(ownerId: string, limit: number) {
    return ordered(
      [...this.#raySessions.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  savePhysicsProfile(record: PhysicsProfileRecord) {
    this.#physicsProfiles.set(
      `${record.ownerId}:${record.id}`,
      clone(PhysicsProfileRecordSchema.parse(record)),
    );
  }
  listPhysicsProfiles(ownerId: string, limit: number) {
    return ordered(
      [...this.#physicsProfiles.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveSpatialNavigationHistory(record: SpatialNavigationHistoryRecord) {
    this.#navigationHistory.set(
      record.id,
      clone(SpatialNavigationHistoryRecordSchema.parse(record)),
    );
  }
  listSpatialNavigationHistory(ownerId: string, limit: number) {
    return ordered(
      [...this.#navigationHistory.values()].filter((item) => item.ownerId === ownerId),
      "navigatedAt",
      limit,
    );
  }
  saveSpatialScene(record: SpatialSceneRecord) {
    this.#spatialScenes.set(
      `${record.ownerId}:${record.id}`,
      clone(SpatialSceneRecordSchema.parse(record)),
    );
  }
  listSpatialScenes(ownerId: string, limit: number) {
    return ordered(
      [...this.#spatialScenes.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveScenePreference(record: ScenePreferenceRecord) {
    this.#scenePreferences.set(
      `${record.ownerId}:${record.id}`,
      clone(ScenePreferenceRecordSchema.parse(record)),
    );
  }
  listScenePreferences(ownerId: string, limit: number) {
    return ordered(
      [...this.#scenePreferences.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveThemeProfile(record: ThemeProfileRecord) {
    this.#themeProfiles.set(
      `${record.ownerId}:${record.id}`,
      clone(ThemeProfileRecordSchema.parse(record)),
    );
  }
  listThemeProfiles(ownerId: string, limit: number) {
    return ordered(
      [...this.#themeProfiles.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveVisualizationLayer(record: VisualizationLayerRecord) {
    this.#visualizationLayers.set(
      `${record.ownerId}:${record.id}`,
      clone(VisualizationLayerRecordSchema.parse(record)),
    );
  }
  listVisualizationLayers(ownerId: string, limit: number) {
    return ordered(
      [...this.#visualizationLayers.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
  saveParticleProfile(record: ParticleProfileRecord) {
    this.#particleProfiles.set(
      `${record.ownerId}:${record.id}`,
      clone(ParticleProfileRecordSchema.parse(record)),
    );
  }
  listParticleProfiles(ownerId: string, limit: number) {
    return ordered(
      [...this.#particleProfiles.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveVisualPosition(record: VisualPositionRecord) {
    this.#visualPositions.set(
      record.id,
      clone(VisualPositionRecordSchema.parse(record)),
    );
  }
  listVisualPositions(ownerId: string, limit: number) {
    return ordered(
      [...this.#visualPositions.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveCommandSpaceVisualization(record: CommandSpaceVisualizationRecord) {
    this.#commandSpaceVisualizations.set(
      record.id,
      clone(CommandSpaceVisualizationRecordSchema.parse(record)),
    );
  }
  listCommandSpaceVisualizations(ownerId: string, limit: number) {
    return ordered(
      [...this.#commandSpaceVisualizations.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
  saveSceneLayout(record: SceneLayoutRecord) {
    this.#sceneLayouts.set(
      `${record.ownerId}:${record.id}`,
      clone(SceneLayoutRecordSchema.parse(record)),
    );
  }
  listSceneLayouts(ownerId: string, limit: number) {
    return ordered(
      [...this.#sceneLayouts.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveSpatialModeSession(record: SpatialModeSessionRecord) {
    this.#spatialModeSessions.set(
      record.id,
      clone(SpatialModeSessionRecordSchema.parse(record)),
    );
  }
  listSpatialModeSessions(ownerId: string, limit: number) {
    return ordered(
      [...this.#spatialModeSessions.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
}

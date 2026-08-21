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
  CommandSpaceVisualizationRecordSchema,
  CursorMetricRecordSchema,
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
  type CommandSpaceVisualizationRecord,
  type CursorMetricRecord,
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
import type { Pool } from "pg";

import type { SpatialStore } from "./store.js";

const list = async <T>(
  pool: Pool,
  table: string,
  ownerId: string,
  order: string,
  limit: number,
  schema: { parse: (value: unknown) => T },
) => {
  const result = await pool.query<{ record: unknown }>(
    `SELECT record FROM ${table} WHERE owner_id=$1 ORDER BY ${order} DESC LIMIT $2`,
    [ownerId, limit],
  );
  return result.rows.map((row) => schema.parse(row.record));
};

const insertRecord = async (
  pool: Pool,
  table: string,
  record: { id: string; ownerId: string },
  columns: Record<string, string | number | boolean | null>,
) => {
  const names = ["id", "owner_id", ...Object.keys(columns), "record"];
  const values = [record.id, record.ownerId, ...Object.values(columns), record];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
  await pool.query(
    `INSERT INTO ${table}(${names.join(",")}) VALUES (${placeholders})
     ON CONFLICT (owner_id, id) DO UPDATE SET record=EXCLUDED.record`,
    values,
  );
};

export class PostgresSpatialStore implements SpatialStore {
  constructor(readonly pool: Pool) {}

  async saveCameraDevice(record: CameraDeviceRecord) {
    const parsed = CameraDeviceRecordSchema.parse(record);
    await insertRecord(this.pool, "camera_devices", parsed, {
      updated_at: parsed.updatedAt,
    });
  }
  listCameraDevices(ownerId: string, limit: number) {
    return list(
      this.pool,
      "camera_devices",
      ownerId,
      "updated_at",
      limit,
      CameraDeviceRecordSchema,
    );
  }
  async saveVisionSession(record: VisionSessionRecord) {
    const parsed = VisionSessionRecordSchema.parse(record);
    await insertRecord(this.pool, "vision_sessions", parsed, {});
  }
  listVisionSessions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "vision_sessions",
      ownerId,
      "created_at",
      limit,
      VisionSessionRecordSchema,
    );
  }
  async saveProfile(record: GestureProfileRecord) {
    const parsed = GestureProfileRecordSchema.parse(record);
    await insertRecord(this.pool, "gesture_profiles", parsed, {});
  }
  listProfiles(ownerId: string, limit: number) {
    return list(
      this.pool,
      "gesture_profiles",
      ownerId,
      "created_at",
      limit,
      GestureProfileRecordSchema,
    );
  }
  async getProfile(ownerId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM gesture_profiles WHERE owner_id=$1 AND id=$2",
      [ownerId, id],
    );
    return result.rows[0]
      ? GestureProfileRecordSchema.parse(result.rows[0].record)
      : null;
  }
  async saveMapping(record: GestureMappingRecord) {
    const parsed = GestureMappingRecordSchema.parse(record);
    await insertRecord(this.pool, "gesture_mappings", parsed, {
      profile_id: parsed.profileId,
      gesture: parsed.gesture,
    });
  }
  listMappings(ownerId: string, limit: number) {
    return list(
      this.pool,
      "gesture_mappings",
      ownerId,
      "created_at",
      limit,
      GestureMappingRecordSchema,
    );
  }
  async findMapping(input: { ownerId: string; profileId: string; gesture: string }) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM gesture_mappings
       WHERE owner_id=$1 AND profile_id=$2 AND gesture=$3
       ORDER BY created_at DESC LIMIT 1`,
      [input.ownerId, input.profileId, input.gesture],
    );
    const mapping = result.rows[0]
      ? GestureMappingRecordSchema.parse(result.rows[0].record)
      : null;
    return mapping?.enabled ? mapping : null;
  }
  async saveMacro(record: GestureMacroRecord) {
    const parsed = GestureMacroRecordSchema.parse(record);
    await insertRecord(this.pool, "gesture_macros", parsed, {
      profile_id: parsed.profileId,
    });
  }
  listMacros(ownerId: string, limit: number) {
    return list(
      this.pool,
      "gesture_macros",
      ownerId,
      "created_at",
      limit,
      GestureMacroRecordSchema,
    );
  }
  async saveCalibration(record: GestureCalibrationRecord) {
    const parsed = GestureCalibrationRecordSchema.parse(record);
    await insertRecord(this.pool, "gesture_calibration", parsed, {
      profile_id: parsed.profileId,
    });
  }
  listCalibration(ownerId: string, limit: number) {
    return list(
      this.pool,
      "gesture_calibration",
      ownerId,
      "created_at",
      limit,
      GestureCalibrationRecordSchema,
    );
  }
  async saveHistory(record: GestureHistoryRecord) {
    const parsed = GestureHistoryRecordSchema.parse(record);
    await insertRecord(this.pool, "gesture_history", parsed, {});
  }
  listHistory(ownerId: string, limit: number) {
    return list(
      this.pool,
      "gesture_history",
      ownerId,
      "created_at",
      limit,
      GestureHistoryRecordSchema,
    );
  }
  async saveMetric(record: GestureMetricRecord) {
    const parsed = GestureMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "gesture_metrics", parsed, {});
  }
  listMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "gesture_metrics",
      ownerId,
      "created_at",
      limit,
      GestureMetricRecordSchema,
    );
  }
  async saveCustomGesture(record: CustomGestureRecord) {
    const parsed = CustomGestureRecordSchema.parse(record);
    await insertRecord(this.pool, "custom_gestures", parsed, {
      profile_id: parsed.profileId,
    });
  }
  listCustomGestures(ownerId: string, limit: number) {
    return list(
      this.pool,
      "custom_gestures",
      ownerId,
      "created_at",
      limit,
      CustomGestureRecordSchema,
    );
  }
  async saveVersion(record: GestureVersionRecord) {
    const parsed = GestureVersionRecordSchema.parse(record);
    await insertRecord(this.pool, "gesture_versions", parsed, {});
  }
  listVersions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "gesture_versions",
      ownerId,
      "created_at",
      limit,
      GestureVersionRecordSchema,
    );
  }
  async saveTrackingMetric(record: TrackingMetricRecord) {
    const parsed = TrackingMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "tracking_metrics", parsed, {});
  }
  listTrackingMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "tracking_metrics",
      ownerId,
      "created_at",
      limit,
      TrackingMetricRecordSchema,
    );
  }
  async saveCameraProvider(record: CameraProviderRecord) {
    const parsed = CameraProviderRecordSchema.parse(record);
    await insertRecord(this.pool, "camera_providers", parsed, {
      updated_at: parsed.updatedAt,
    });
  }
  listCameraProviders(ownerId: string, limit: number) {
    return list(
      this.pool,
      "camera_providers",
      ownerId,
      "updated_at",
      limit,
      CameraProviderRecordSchema,
    );
  }
  async saveRuntimeProfile(record: RuntimeProfileRecord) {
    const parsed = RuntimeProfileRecordSchema.parse(record);
    await insertRecord(this.pool, "runtime_profiles", parsed, {
      updated_at: parsed.updatedAt,
    });
  }
  listRuntimeProfiles(ownerId: string, limit: number) {
    return list(
      this.pool,
      "runtime_profiles",
      ownerId,
      "updated_at",
      limit,
      RuntimeProfileRecordSchema,
    );
  }
  async saveNativeGestureSession(record: NativeGestureSessionRecord) {
    const parsed = NativeGestureSessionRecordSchema.parse(record);
    await insertRecord(this.pool, "native_gesture_sessions", parsed, {
      device_id: parsed.deviceId,
      updated_at: parsed.updatedAt,
    });
  }
  listNativeGestureSessions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "native_gesture_sessions",
      ownerId,
      "updated_at",
      limit,
      NativeGestureSessionRecordSchema,
    );
  }
  async saveMonitorLayout(record: MonitorLayoutRecord) {
    const parsed = MonitorLayoutRecordSchema.parse(record);
    await insertRecord(this.pool, "monitor_layouts", parsed, {
      updated_at: parsed.updatedAt,
    });
  }
  listMonitorLayouts(ownerId: string, limit: number) {
    return list(
      this.pool,
      "monitor_layouts",
      ownerId,
      "updated_at",
      limit,
      MonitorLayoutRecordSchema,
    );
  }
  async saveDesktopContextHistory(record: DesktopContextHistoryRecord) {
    const parsed = DesktopContextHistoryRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_context_history", parsed, {});
  }
  listDesktopContextHistory(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_context_history",
      ownerId,
      "created_at",
      limit,
      DesktopContextHistoryRecordSchema,
    );
  }
  async saveNativeRuntimeMetric(record: NativeRuntimeMetricRecord) {
    const parsed = NativeRuntimeMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "native_runtime_metrics", parsed, {});
  }
  listNativeRuntimeMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "native_runtime_metrics",
      ownerId,
      "created_at",
      limit,
      NativeRuntimeMetricRecordSchema,
    );
  }
  async saveSpatialOverlay(record: SpatialOverlayRecord) {
    const parsed = SpatialOverlayRecordSchema.parse(record);
    await insertRecord(this.pool, "spatial_overlays", parsed, {
      updated_at: parsed.updatedAt,
    });
  }
  listSpatialOverlays(ownerId: string, limit: number) {
    return list(
      this.pool,
      "spatial_overlays",
      ownerId,
      "updated_at",
      limit,
      SpatialOverlayRecordSchema,
    );
  }
  async saveRuntimeSync(record: RuntimeSyncRecord) {
    const parsed = RuntimeSyncRecordSchema.parse(record);
    await insertRecord(this.pool, "runtime_sync", parsed, {});
  }
  listRuntimeSync(ownerId: string, limit: number) {
    return list(
      this.pool,
      "runtime_sync",
      ownerId,
      "created_at",
      limit,
      RuntimeSyncRecordSchema,
    );
  }
  async saveSpatialComponent(record: SpatialComponentRecord) {
    const parsed = SpatialComponentRecordSchema.parse(record);
    await insertRecord(this.pool, "spatial_components", parsed, {
      component_type: parsed.componentType,
      updated_at: parsed.updatedAt,
    });
  }
  listSpatialComponents(ownerId: string, limit: number) {
    return list(
      this.pool,
      "spatial_components",
      ownerId,
      "updated_at",
      limit,
      SpatialComponentRecordSchema,
    );
  }
  async saveInteractionProfile(record: InteractionProfileRecord) {
    const parsed = InteractionProfileRecordSchema.parse(record);
    await insertRecord(this.pool, "interaction_profiles", parsed, {
      updated_at: parsed.updatedAt,
    });
  }
  listInteractionProfiles(ownerId: string, limit: number) {
    return list(
      this.pool,
      "interaction_profiles",
      ownerId,
      "updated_at",
      limit,
      InteractionProfileRecordSchema,
    );
  }
  async saveAnimationProfile(record: AnimationProfileRecord) {
    const parsed = AnimationProfileRecordSchema.parse(record);
    await insertRecord(this.pool, "animation_profiles", parsed, {
      updated_at: parsed.updatedAt,
    });
  }
  listAnimationProfiles(ownerId: string, limit: number) {
    return list(
      this.pool,
      "animation_profiles",
      ownerId,
      "updated_at",
      limit,
      AnimationProfileRecordSchema,
    );
  }
  async saveSpatialPreference(record: SpatialPreferenceRecord) {
    const parsed = SpatialPreferenceRecordSchema.parse(record);
    await insertRecord(this.pool, "spatial_preferences", parsed, {
      updated_at: parsed.updatedAt,
    });
  }
  listSpatialPreferences(ownerId: string, limit: number) {
    return list(
      this.pool,
      "spatial_preferences",
      ownerId,
      "updated_at",
      limit,
      SpatialPreferenceRecordSchema,
    );
  }
  async saveInteractionSession(record: InteractionSessionRecord) {
    const parsed = InteractionSessionRecordSchema.parse(record);
    await insertRecord(this.pool, "interaction_sessions", parsed, {
      updated_at: parsed.updatedAt,
    });
  }
  listInteractionSessions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "interaction_sessions",
      ownerId,
      "updated_at",
      limit,
      InteractionSessionRecordSchema,
    );
  }
  async saveInteractionMetric(record: InteractionMetricRecord) {
    const parsed = InteractionMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "interaction_metrics", parsed, {});
  }
  listInteractionMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "interaction_metrics",
      ownerId,
      "created_at",
      limit,
      InteractionMetricRecordSchema,
    );
  }
  async saveGestureSequence(record: GestureSequenceRecord) {
    const parsed = GestureSequenceRecordSchema.parse(record);
    await insertRecord(this.pool, "gesture_sequences", parsed, {
      updated_at: parsed.updatedAt,
    });
  }
  listGestureSequences(ownerId: string, limit: number) {
    return list(
      this.pool,
      "gesture_sequences",
      ownerId,
      "updated_at",
      limit,
      GestureSequenceRecordSchema,
    );
  }
  async saveInteractionPrediction(record: InteractionPredictionRecord) {
    const parsed = InteractionPredictionRecordSchema.parse(record);
    await insertRecord(this.pool, "interaction_predictions", parsed, {});
  }
  listInteractionPredictions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "interaction_predictions",
      ownerId,
      "created_at",
      limit,
      InteractionPredictionRecordSchema,
    );
  }
  async saveCursorMetric(record: CursorMetricRecord) {
    const parsed = CursorMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "cursor_metrics", parsed, {});
  }
  listCursorMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "cursor_metrics",
      ownerId,
      "created_at",
      limit,
      CursorMetricRecordSchema,
    );
  }
  async saveRaySession(record: RaySessionRecord) {
    const parsed = RaySessionRecordSchema.parse(record);
    await insertRecord(this.pool, "ray_sessions", parsed, {
      updated_at: parsed.updatedAt,
    });
  }
  listRaySessions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "ray_sessions",
      ownerId,
      "updated_at",
      limit,
      RaySessionRecordSchema,
    );
  }
  async savePhysicsProfile(record: PhysicsProfileRecord) {
    const parsed = PhysicsProfileRecordSchema.parse(record);
    await insertRecord(this.pool, "physics_profiles", parsed, {
      updated_at: parsed.updatedAt,
    });
  }
  listPhysicsProfiles(ownerId: string, limit: number) {
    return list(
      this.pool,
      "physics_profiles",
      ownerId,
      "updated_at",
      limit,
      PhysicsProfileRecordSchema,
    );
  }
  async saveSpatialNavigationHistory(record: SpatialNavigationHistoryRecord) {
    const parsed = SpatialNavigationHistoryRecordSchema.parse(record);
    await insertRecord(this.pool, "spatial_navigation_history", parsed, {});
  }
  listSpatialNavigationHistory(ownerId: string, limit: number) {
    return list(
      this.pool,
      "spatial_navigation_history",
      ownerId,
      "created_at",
      limit,
      SpatialNavigationHistoryRecordSchema,
    );
  }
  async saveSpatialScene(record: SpatialSceneRecord) {
    const parsed = SpatialSceneRecordSchema.parse(record);
    await insertRecord(this.pool, "spatial_scenes", parsed, {
      mode: parsed.mode,
      active: parsed.active,
      updated_at: parsed.updatedAt,
    });
  }
  listSpatialScenes(ownerId: string, limit: number) {
    return list(
      this.pool,
      "spatial_scenes",
      ownerId,
      "updated_at",
      limit,
      SpatialSceneRecordSchema,
    );
  }
  async saveScenePreference(record: ScenePreferenceRecord) {
    const parsed = ScenePreferenceRecordSchema.parse(record);
    await insertRecord(this.pool, "scene_preferences", parsed, {
      spatial_mode_enabled: parsed.spatialModeEnabled,
      selected_scene_id: parsed.selectedSceneId,
      updated_at: parsed.updatedAt,
    });
  }
  listScenePreferences(ownerId: string, limit: number) {
    return list(
      this.pool,
      "scene_preferences",
      ownerId,
      "updated_at",
      limit,
      ScenePreferenceRecordSchema,
    );
  }
  async saveThemeProfile(record: ThemeProfileRecord) {
    const parsed = ThemeProfileRecordSchema.parse(record);
    await insertRecord(this.pool, "theme_profiles", parsed, {
      theme: parsed.theme,
      updated_at: parsed.updatedAt,
    });
  }
  listThemeProfiles(ownerId: string, limit: number) {
    return list(
      this.pool,
      "theme_profiles",
      ownerId,
      "updated_at",
      limit,
      ThemeProfileRecordSchema,
    );
  }
  async saveVisualizationLayer(record: VisualizationLayerRecord) {
    const parsed = VisualizationLayerRecordSchema.parse(record);
    await insertRecord(this.pool, "visualization_layers", parsed, {
      scene_id: parsed.sceneId,
      layer_type: parsed.layerType,
      enabled: parsed.enabled,
      updated_at: parsed.updatedAt,
    });
  }
  listVisualizationLayers(ownerId: string, limit: number) {
    return list(
      this.pool,
      "visualization_layers",
      ownerId,
      "updated_at",
      limit,
      VisualizationLayerRecordSchema,
    );
  }
  async saveParticleProfile(record: ParticleProfileRecord) {
    const parsed = ParticleProfileRecordSchema.parse(record);
    await insertRecord(this.pool, "particle_profiles", parsed, {
      scene_id: parsed.sceneId,
      density: parsed.density,
      updated_at: parsed.updatedAt,
    });
  }
  listParticleProfiles(ownerId: string, limit: number) {
    return list(
      this.pool,
      "particle_profiles",
      ownerId,
      "updated_at",
      limit,
      ParticleProfileRecordSchema,
    );
  }
  async saveVisualPosition(record: VisualPositionRecord) {
    const parsed = VisualPositionRecordSchema.parse(record);
    await insertRecord(this.pool, "agent_visual_positions", parsed, {
      scene_id: parsed.sceneId,
      entity_type: parsed.entityType,
      entity_id: parsed.entityId,
      updated_at: parsed.updatedAt,
    });
  }
  listVisualPositions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "agent_visual_positions",
      ownerId,
      "updated_at",
      limit,
      VisualPositionRecordSchema,
    );
  }
  async saveCommandSpaceVisualization(record: CommandSpaceVisualizationRecord) {
    const parsed = CommandSpaceVisualizationRecordSchema.parse(record);
    const tableByType: Record<string, string> = {
      agent_constellation: "workflow_visualizations",
      workflow_galaxy: "workflow_visualizations",
      knowledge_universe: "memory_visualizations",
      system_health: "workflow_visualizations",
      relationship_graph: "workflow_visualizations",
      floating_panels: "workflow_visualizations",
    };
    await insertRecord(
      this.pool,
      tableByType[parsed.visualizationType] ?? "workflow_visualizations",
      parsed,
      {
        scene_id: parsed.sceneId,
        visualization_type: parsed.visualizationType,
        updated_at: parsed.updatedAt,
      },
    );
  }
  async listCommandSpaceVisualizations(ownerId: string, limit: number) {
    const workflow = await list(
      this.pool,
      "workflow_visualizations",
      ownerId,
      "updated_at",
      limit,
      CommandSpaceVisualizationRecordSchema,
    );
    const memory = await list(
      this.pool,
      "memory_visualizations",
      ownerId,
      "updated_at",
      limit,
      CommandSpaceVisualizationRecordSchema,
    );
    return [...workflow, ...memory]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
  }
  async saveSceneLayout(record: SceneLayoutRecord) {
    const parsed = SceneLayoutRecordSchema.parse(record);
    await insertRecord(this.pool, "scene_layouts", parsed, {
      scene_id: parsed.sceneId,
      updated_at: parsed.updatedAt,
    });
  }
  listSceneLayouts(ownerId: string, limit: number) {
    return list(
      this.pool,
      "scene_layouts",
      ownerId,
      "updated_at",
      limit,
      SceneLayoutRecordSchema,
    );
  }
  async saveSpatialModeSession(record: SpatialModeSessionRecord) {
    const parsed = SpatialModeSessionRecordSchema.parse(record);
    await insertRecord(this.pool, "spatial_mode_sessions", parsed, {
      scene_id: parsed.sceneId,
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  listSpatialModeSessions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "spatial_mode_sessions",
      ownerId,
      "updated_at",
      limit,
      SpatialModeSessionRecordSchema,
    );
  }
}

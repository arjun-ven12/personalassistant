import { z } from "zod";

export const SpatialInteractionStateSchema = z.enum([
  "idle",
  "hover",
  "candidate",
  "focused",
  "selected",
  "activated",
  "dragging",
  "dropped",
  "cancelled",
  "disabled",
]);

export const SpatialComponentTypeSchema = z.enum([
  "button",
  "card",
  "panel",
  "node",
  "list",
  "menu",
  "dialog",
  "window",
  "input",
  "slider",
  "toggle",
  "timeline",
  "canvas",
  "link",
  "container",
  "custom",
]);

export const SpatialInteractionCapabilitySchema = z.enum([
  "hover",
  "focus",
  "blur",
  "highlight",
  "inspect",
  "select",
  "activate",
  "drag_start",
  "drag_move",
  "drag_end",
  "drop",
  "cancel",
  "dwell_activate",
]);

export const SpatialEventTypeSchema = z.enum([
  "spatial_hover",
  "spatial_focus",
  "spatial_select",
  "spatial_activate",
  "spatial_drag",
  "spatial_inspect",
  "spatial_cancel",
  "spatial_dwell",
  "spatial_ray_intersect",
  "spatial_sequence_confirmed",
  "spatial_navigation",
]);

export const SpatialHitBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  })
  .strict();

export const SpatialComponentRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    componentType: SpatialComponentTypeSchema,
    displayName: z.string().min(1).max(160),
    capabilities: z.array(SpatialInteractionCapabilitySchema).min(1).max(20),
    supportedGestures: z.array(z.string().min(1).max(80)).max(30),
    accessibilityLabel: z.string().min(1).max(200),
    animationProfileId: z.string().min(3).max(160).nullable(),
    version: z.string().min(1).max(40),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const InteractionProfileRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    active: z.boolean(),
    hoverDelayMs: z.number().int().min(0).max(5_000),
    hoverSmoothing: z.number().min(0).max(1),
    dwellMs: z.number().int().min(250).max(10_000),
    focusLockEnabled: z.boolean(),
    largeTargets: z.boolean(),
    reducedMotionAware: z.literal(true),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AnimationProfileRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    hoverScale: z.number().min(1).max(1.2),
    selectedScale: z.number().min(1).max(1.25),
    glowIntensity: z.number().min(0).max(1),
    springStiffness: z.number().min(1).max(1_000),
    momentumEnabled: z.boolean(),
    respectsReducedMotion: z.literal(true),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SpatialPreferenceRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    spatialModeEnabled: z.boolean(),
    dwellActivationEnabled: z.boolean(),
    pointerSmoothing: z.number().min(0).max(1),
    highContrastSpatialFocus: z.boolean(),
    debugInspectorEnabled: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const InteractionSessionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    source: z.enum([
      "browser_spatial_runtime",
      "native_spatial_runtime",
      "mouse",
      "keyboard",
      "test",
    ]),
    status: z.enum(["active", "completed", "cancelled", "expired"]),
    componentCount: z.number().int().nonnegative().max(100_000),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const InteractionMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    sessionId: z.string().uuid().nullable(),
    componentId: z.string().min(3).max(160).nullable(),
    eventType: SpatialEventTypeSchema,
    state: SpatialInteractionStateSchema,
    confidence: z.number().min(0).max(1),
    latencyMs: z.number().min(0).max(10_000),
    hitBox: SpatialHitBoxSchema.nullable(),
    intentRouted: z.boolean(),
    directExecutionAvailable: z.literal(false),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const GestureSequenceRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    gestures: z.array(z.string().min(1).max(80)).min(2).max(12),
    maxGapMs: z.number().int().min(100).max(10_000),
    intentTemplate: z.string().min(1).max(1_000),
    enabled: z.boolean(),
    version: z.string().min(1).max(40),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const InteractionPredictionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    predictedComponentId: z.string().min(3).max(160).nullable(),
    actualComponentId: z.string().min(3).max(160).nullable(),
    confidence: z.number().min(0).max(1),
    predictionModelId: z.string().min(3).max(160),
    factors: z.array(z.string().min(1).max(120)).max(20),
    observedAt: z.iso.datetime(),
  })
  .strict();

export const CursorMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    source: z.enum(["browser_spatial_runtime", "native_spatial_runtime", "test"]),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    depth: z.number().min(0).max(1),
    velocity: z.number().min(0).max(10),
    acceleration: z.number().min(0).max(100),
    confidence: z.number().min(0).max(1),
    snappedComponentId: z.string().min(3).max(160).nullable(),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const RaySessionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    source: z.enum(["left_hand", "right_hand", "unknown"]),
    status: z.enum(["active", "completed", "cancelled"]),
    targetComponentId: z.string().min(3).max(160).nullable(),
    confidence: z.number().min(0).max(1),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const PhysicsProfileRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    cursorSmoothing: z.number().min(0).max(1),
    inertia: z.number().min(0).max(1),
    friction: z.number().min(0).max(1),
    magneticSnapStrength: z.number().min(0).max(1),
    snapRadius: z.number().min(0).max(1),
    dwellMs: z.number().int().min(250).max(10_000),
    reducedMotionAware: z.literal(true),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SpatialNavigationHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    fromPath: z.string().min(1).max(200),
    toPath: z.string().min(1).max(200),
    gesture: z.string().min(1).max(80),
    previewShown: z.boolean(),
    routedThroughIntentEngine: z.literal(true),
    directExecutionAvailable: z.literal(false),
    navigatedAt: z.iso.datetime(),
  })
  .strict();

export const SpatialSceneRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    mode: z.enum(["standard_dashboard", "spatial_command_space"]),
    active: z.boolean(),
    cameraPreset: z.enum(["home", "orbit", "focus", "overview"]),
    quality: z.enum(["adaptive", "low", "medium", "high"]),
    persistent: z.literal(true),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ScenePreferenceRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    spatialModeEnabled: z.boolean(),
    selectedSceneId: z.string().min(3).max(160),
    selectedThemeId: z.string().min(3).max(160),
    reducedMotion: z.boolean(),
    bloomEnabled: z.boolean(),
    particleDensity: z.number().min(0).max(1),
    lastModeSwitchAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ThemeProfileRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    theme: z.enum([
      "jarvis",
      "blueprint",
      "cyber",
      "minimal",
      "enterprise",
      "dark",
      "light",
      "custom",
    ]),
    primaryAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    secondaryAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    glowIntensity: z.number().min(0).max(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const VisualizationLayerRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    sceneId: z.string().min(3).max(160),
    name: z.string().min(1).max(120),
    layerType: z.enum([
      "background",
      "particles",
      "world",
      "agents",
      "memory",
      "workflow",
      "hud",
      "interaction",
      "debug",
      "future_ar",
    ]),
    enabled: z.boolean(),
    order: z.number().int().min(0).max(100),
    opacity: z.number().min(0).max(1),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ParticleProfileRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    sceneId: z.string().min(3).max(160),
    name: z.string().min(1).max(120),
    density: z.number().min(0).max(1),
    speed: z.number().min(0).max(1),
    intentPulses: z.boolean(),
    workflowBursts: z.boolean(),
    memorySparks: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const VisualPositionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    sceneId: z.string().min(3).max(160),
    entityType: z.enum(["agent", "workflow", "memory", "repository", "panel"]),
    entityId: z.string().min(1).max(160),
    x: z.number().min(-10).max(10),
    y: z.number().min(-10).max(10),
    z: z.number().min(-10).max(10),
    orbitRadius: z.number().min(0).max(10),
    pinned: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CommandSpaceVisualizationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    sceneId: z.string().min(3).max(160),
    visualizationType: z.enum([
      "agent_constellation",
      "workflow_galaxy",
      "knowledge_universe",
      "system_health",
      "relationship_graph",
      "floating_panels",
    ]),
    title: z.string().min(1).max(160),
    summary: z.string().min(1).max(500),
    entityCount: z.number().int().nonnegative().max(100_000),
    health: z.enum(["nominal", "degraded", "attention", "unknown"]),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SceneLayoutRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    sceneId: z.string().min(3).max(160),
    layoutName: z.string().min(1).max(120),
    floatingPanels: z.array(z.string().min(3).max(160)).max(100),
    spatialWindows: z.array(z.string().min(3).max(160)).max(100),
    cameraHome: z
      .object({
        x: z.number().min(-20).max(20),
        y: z.number().min(-20).max(20),
        z: z.number().min(-20).max(20),
      })
      .strict(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SpatialModeSessionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    sceneId: z.string().min(3).max(160),
    status: z.enum(["active", "completed", "cancelled"]),
    source: z.enum(["dashboard", "browser_spatial_runtime", "native_spatial_runtime"]),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SpatialUiDashboardResponseSchema = z
  .object({
    components: z.array(SpatialComponentRecordSchema).max(500),
    interactionProfiles: z.array(InteractionProfileRecordSchema).max(100),
    animationProfiles: z.array(AnimationProfileRecordSchema).max(100),
    preferences: z.array(SpatialPreferenceRecordSchema).max(20),
    sessions: z.array(InteractionSessionRecordSchema).max(200),
    metrics: z.array(InteractionMetricRecordSchema).max(500),
    gestureSequences: z.array(GestureSequenceRecordSchema).max(200),
    predictions: z.array(InteractionPredictionRecordSchema).max(500),
    cursorMetrics: z.array(CursorMetricRecordSchema).max(500),
    raySessions: z.array(RaySessionRecordSchema).max(200),
    physicsProfiles: z.array(PhysicsProfileRecordSchema).max(100),
    navigationHistory: z.array(SpatialNavigationHistoryRecordSchema).max(500),
    focusEngineAvailable: z.literal(true),
    hoverEngineAvailable: z.literal(true),
    dwellEngineAvailable: z.literal(true),
    dragDropFrameworkAvailable: z.literal(true),
    directExecutionAvailable: z.literal(false),
    routesThroughIntentEngine: z.literal(true),
    keyboardFallbackAvailable: z.literal(true),
    mouseFallbackAvailable: z.literal(true),
    spatialCursorAvailable: z.literal(true),
    handRaysAvailable: z.literal(true),
    predictionEngineAvailable: z.literal(true),
    magneticTargetingAvailable: z.literal(true),
    depthEngineAvailable: z.literal(true),
    radialMenusAvailable: z.literal(true),
  })
  .strict();

export const RecordSpatialInteractionMetricRequestSchema = z
  .object({
    sessionId: z.string().uuid().optional(),
    componentId: z.string().min(3).max(160).optional(),
    eventType: SpatialEventTypeSchema,
    state: SpatialInteractionStateSchema,
    confidence: z.number().min(0).max(1).default(1),
    latencyMs: z.number().min(0).max(10_000).default(0),
    hitBox: SpatialHitBoxSchema.optional(),
  })
  .strict();

export const RecordSpatialEngineMetricRequestSchema = z
  .object({
    cursor: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        depth: z.number().min(0).max(1).default(0.5),
        velocity: z.number().min(0).max(10).default(0),
        acceleration: z.number().min(0).max(100).default(0),
        confidence: z.number().min(0).max(1),
        snappedComponentId: z.string().min(3).max(160).optional(),
      })
      .strict()
      .optional(),
    prediction: z
      .object({
        predictedComponentId: z.string().min(3).max(160).optional(),
        actualComponentId: z.string().min(3).max(160).optional(),
        confidence: z.number().min(0).max(1),
        factors: z.array(z.string().min(1).max(120)).max(20).default([]),
      })
      .strict()
      .optional(),
    ray: z
      .object({
        source: z.enum(["left_hand", "right_hand", "unknown"]).default("unknown"),
        targetComponentId: z.string().min(3).max(160).optional(),
        confidence: z.number().min(0).max(1),
        status: z.enum(["active", "completed", "cancelled"]).default("active"),
      })
      .strict()
      .optional(),
    navigation: z
      .object({
        fromPath: z.string().min(1).max(200),
        toPath: z.string().min(1).max(200),
        gesture: z.string().min(1).max(80),
        previewShown: z.boolean().default(false),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) => value.cursor || value.prediction || value.ray || value.navigation,
    "At least one spatial engine metric must be provided.",
  );

export const SpatialCommandSpaceResponseSchema = z
  .object({
    scenes: z.array(SpatialSceneRecordSchema).max(100),
    preferences: z.array(ScenePreferenceRecordSchema).max(20),
    themes: z.array(ThemeProfileRecordSchema).max(100),
    layers: z.array(VisualizationLayerRecordSchema).max(200),
    particleProfiles: z.array(ParticleProfileRecordSchema).max(100),
    visualPositions: z.array(VisualPositionRecordSchema).max(1_000),
    visualizations: z.array(CommandSpaceVisualizationRecordSchema).max(200),
    layouts: z.array(SceneLayoutRecordSchema).max(100),
    sessions: z.array(SpatialModeSessionRecordSchema).max(200),
    spatialModeAvailable: z.literal(true),
    standardDashboardAvailable: z.literal(true),
    routesThroughIntentEngine: z.literal(true),
    directExecutionAvailable: z.literal(false),
    directOsControlAvailable: z.literal(false),
  })
  .strict();

export const UpdateSpatialModeRequestSchema = z
  .object({
    enabled: z.boolean(),
    sceneId: z.string().min(3).max(160).optional(),
    themeId: z.string().min(3).max(160).optional(),
    source: z
      .enum(["dashboard", "browser_spatial_runtime", "native_spatial_runtime"])
      .default("dashboard"),
  })
  .strict();

export type SpatialInteractionState = z.infer<typeof SpatialInteractionStateSchema>;
export type SpatialComponentType = z.infer<typeof SpatialComponentTypeSchema>;
export type SpatialInteractionCapability = z.infer<
  typeof SpatialInteractionCapabilitySchema
>;
export type SpatialEventType = z.infer<typeof SpatialEventTypeSchema>;
export type SpatialHitBox = z.infer<typeof SpatialHitBoxSchema>;
export type SpatialComponentRecord = z.infer<typeof SpatialComponentRecordSchema>;
export type InteractionProfileRecord = z.infer<typeof InteractionProfileRecordSchema>;
export type AnimationProfileRecord = z.infer<typeof AnimationProfileRecordSchema>;
export type SpatialPreferenceRecord = z.infer<typeof SpatialPreferenceRecordSchema>;
export type InteractionSessionRecord = z.infer<typeof InteractionSessionRecordSchema>;
export type InteractionMetricRecord = z.infer<typeof InteractionMetricRecordSchema>;
export type GestureSequenceRecord = z.infer<typeof GestureSequenceRecordSchema>;
export type InteractionPredictionRecord = z.infer<
  typeof InteractionPredictionRecordSchema
>;
export type CursorMetricRecord = z.infer<typeof CursorMetricRecordSchema>;
export type RaySessionRecord = z.infer<typeof RaySessionRecordSchema>;
export type PhysicsProfileRecord = z.infer<typeof PhysicsProfileRecordSchema>;
export type SpatialNavigationHistoryRecord = z.infer<
  typeof SpatialNavigationHistoryRecordSchema
>;
export type SpatialSceneRecord = z.infer<typeof SpatialSceneRecordSchema>;
export type ScenePreferenceRecord = z.infer<typeof ScenePreferenceRecordSchema>;
export type ThemeProfileRecord = z.infer<typeof ThemeProfileRecordSchema>;
export type VisualizationLayerRecord = z.infer<typeof VisualizationLayerRecordSchema>;
export type ParticleProfileRecord = z.infer<typeof ParticleProfileRecordSchema>;
export type VisualPositionRecord = z.infer<typeof VisualPositionRecordSchema>;
export type CommandSpaceVisualizationRecord = z.infer<
  typeof CommandSpaceVisualizationRecordSchema
>;
export type SceneLayoutRecord = z.infer<typeof SceneLayoutRecordSchema>;
export type SpatialModeSessionRecord = z.infer<typeof SpatialModeSessionRecordSchema>;
export type SpatialUiDashboardResponse = z.infer<
  typeof SpatialUiDashboardResponseSchema
>;
export type RecordSpatialInteractionMetricRequest = z.infer<
  typeof RecordSpatialInteractionMetricRequestSchema
>;
export type RecordSpatialEngineMetricRequest = z.infer<
  typeof RecordSpatialEngineMetricRequestSchema
>;
export type SpatialCommandSpaceResponse = z.infer<
  typeof SpatialCommandSpaceResponseSchema
>;
export type UpdateSpatialModeRequest = z.infer<typeof UpdateSpatialModeRequestSchema>;

import { z } from "zod";

import { RegistryIdSchema } from "./applications.js";

const NormalizedCoordinateSchema = z.number().min(0).max(1);
const ConfidenceSchema = z.number().min(0).max(1);

export const Point2DSchema = z
  .object({
    x: NormalizedCoordinateSchema,
    y: NormalizedCoordinateSchema,
  })
  .strict();

export const Point3DSchema = z
  .object({
    x: NormalizedCoordinateSchema,
    y: NormalizedCoordinateSchema,
    z: NormalizedCoordinateSchema,
  })
  .strict();

export const HandednessSchema = z.enum(["left", "right", "unknown"]);

export const HandLandmarkFrameSchema = z
  .object({
    timestamp: z.number().nonnegative(),
    handedness: HandednessSchema,
    confidence: ConfidenceSchema,
    landmarks: z.array(Point3DSchema),
    worldLandmarks: z.array(Point3DSchema).optional(),
  })
  .strict();

export const GestureNameSchema = z.enum([
  "none",
  "point",
  "pinch",
  "double_pinch",
  "open_palm",
  "fist",
  "closed_fist",
  "peace_sign",
  "swipe_left",
  "swipe_right",
  "swipe_up",
  "swipe_down",
  "thumbs_up",
  "thumbs_down",
  "two_finger_point",
  "grab",
  "release",
  "rotate",
  "circle",
  "push",
  "pull",
  "zoom",
  "hover",
  "custom",
]);

export const GestureModeSchema = z.enum([
  "disabled",
  "assistant",
  "cursor",
  "media",
  "presentation",
  "calibration",
]);

export const GestureEventSchema = z
  .object({
    id: z.string().trim().min(1),
    gesture: GestureNameSchema,
    mode: GestureModeSchema,
    handedness: HandednessSchema,
    confidence: ConfidenceSchema,
    startedAt: z.number().nonnegative(),
    endedAt: z.number().nonnegative().optional(),
    durationMs: z.number().nonnegative(),
    position: Point2DSchema.optional(),
    metadata: z.record(z.string(), z.unknown()),
  })
  .strict()
  .refine(({ endedAt, startedAt }) => endedAt === undefined || endedAt >= startedAt, {
    message: "endedAt cannot be before startedAt",
    path: ["endedAt"],
  });

export const GestureEngineStateSchema = z.enum([
  "idle",
  "requesting_permission",
  "loading_model",
  "calibrating",
  "tracking",
  "paused",
  "disabled",
  "error",
]);

export const GestureSecurityPolicySchema = z
  .object({
    cameraProcessingLocalOnly: z.boolean().default(true),
    rawFramesPersisted: z.boolean().default(false),
    highRiskApprovalAllowed: z.boolean().default(false),
    inactiveTimeoutMs: z.number().int().positive(),
    emergencyShortcutRequired: z.boolean().default(true),
    visibleCameraIndicatorRequired: z.boolean().default(true),
  })
  .strict();

export const DEFAULT_GESTURE_SECURITY_POLICY = {
  cameraProcessingLocalOnly: true,
  rawFramesPersisted: false,
  highRiskApprovalAllowed: false,
  inactiveTimeoutMs: 30_000,
  emergencyShortcutRequired: true,
  visibleCameraIndicatorRequired: true,
} as const;

export const VisionPipelineStageSchema = z.enum([
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
]);

export const GestureLifecycleStateSchema = z.enum([
  "detected",
  "tracking",
  "confirmed",
  "executing",
  "completed",
  "cancelled",
  "failed",
]);

export const CameraPermissionStateSchema = z.enum([
  "not_requested",
  "granted",
  "denied",
  "restricted",
  "unknown",
]);

export const CameraDeviceRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    label: z.string().min(1).max(160),
    deviceType: z.enum(["internal", "usb", "virtual", "mobile", "unknown"]),
    status: z.enum(["available", "unavailable", "disabled"]),
    permissionState: CameraPermissionStateSchema,
    supportedResolutions: z.array(z.string().min(3).max(40)).max(20),
    supportedFrameRates: z.array(z.number().int().positive()).max(20),
    selected: z.boolean(),
    health: z.string().min(1).max(500),
    lastSeenAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const VisionSessionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    cameraDeviceId: z.string().min(3).max(160).nullable(),
    status: z.enum(["idle", "calibrating", "tracking", "paused", "stopped", "error"]),
    pipelineStages: z.array(VisionPipelineStageSchema).min(1).max(20),
    fpsTarget: z.number().int().min(1).max(120),
    actualFps: z.number().min(0).max(120),
    latencyMs: z.number().min(0).max(10_000),
    rawFramesPersisted: z.literal(false),
    localProcessingOnly: z.literal(true),
    overlayEnabled: z.boolean(),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const GestureProfileRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    mode: GestureModeSchema,
    active: z.boolean(),
    sensitivity: z.number().min(0).max(1),
    debounceMs: z.number().int().min(0).max(5_000),
    hysteresis: z.number().min(0).max(1),
    disabledHighRiskApproval: z.literal(true),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const GestureMappingRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    profileId: z.string().uuid(),
    gesture: GestureNameSchema,
    lifecycleState: GestureLifecycleStateSchema.default("confirmed"),
    intentTemplate: z.string().min(1).max(1_000),
    target: z.string().min(1).max(200),
    safetyLevel: z.enum(["informational", "read_only", "low_risk", "moderate_risk"]),
    approvalRequired: z.boolean(),
    enabled: z.boolean(),
    cooldownMs: z.number().int().min(0).max(60_000),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const GestureMacroRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    profileId: z.string().uuid(),
    name: z.string().min(1).max(120),
    sequence: z.array(GestureNameSchema).min(1).max(12),
    intentTemplate: z.string().min(1).max(1_000),
    enabled: z.boolean(),
    version: z.string().min(1).max(40),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const GestureCalibrationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    profileId: z.string().uuid(),
    dominantHand: HandednessSchema,
    reach: z.enum(["close", "normal", "far"]),
    cameraAngle: z.enum(["low", "eye_level", "high", "unknown"]),
    lightingQuality: z.enum(["poor", "fair", "good", "excellent", "unknown"]),
    trackingQuality: z.number().min(0).max(1),
    handSizeEstimate: z.enum(["small", "medium", "large", "unknown"]),
    completedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const GestureHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    profileId: z.string().uuid().nullable(),
    mappingId: z.string().uuid().nullable(),
    gesture: GestureNameSchema,
    state: GestureLifecycleStateSchema,
    confidence: ConfidenceSchema,
    handedness: HandednessSchema,
    intentCreated: z.boolean(),
    commandId: z.string().uuid().nullable(),
    rawFrameStored: z.literal(false),
    reason: z.string().min(1).max(500),
    observedAt: z.iso.datetime(),
  })
  .strict();

export const GestureMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    metricName: z.string().min(1).max(120),
    value: z.number(),
    unit: z.string().min(1).max(40),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const CustomGestureRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    profileId: z.string().uuid(),
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    landmarkSignatureSummary: z.string().min(1).max(500),
    trainingSampleCount: z.number().int().nonnegative().max(10_000),
    confidenceThreshold: z.number().min(0).max(1),
    enabled: z.boolean(),
    version: z.string().min(1).max(40),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const GestureVersionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    recordType: z.enum(["profile", "mapping", "macro", "custom_gesture"]),
    recordId: z.string().min(1).max(160),
    version: z.string().min(1).max(40),
    changeSummary: z.string().min(1).max(500),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const TrackingMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    sessionId: z.string().uuid().nullable(),
    handsTracked: z.number().int().min(0).max(2),
    landmarkConfidence: ConfidenceSchema,
    occlusionRecovered: z.boolean(),
    stableHandIds: z.array(z.string().min(1).max(80)).max(2),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const NativeSpatialRuntimeStateSchema = z.enum([
  "disabled",
  "idle",
  "requesting_permission",
  "initializing",
  "tracking",
  "paused",
  "stopped",
  "error",
]);

export const CameraProviderRecordSchema = z
  .object({
    id: z.string().min(3).max(160),
    ownerId: z.string().uuid(),
    providerType: z.enum([
      "built_in",
      "usb",
      "continuity",
      "virtual",
      "depth",
      "stereo",
      "ar_headset",
      "unknown",
    ]),
    displayName: z.string().min(1).max(160),
    status: z.enum(["available", "unavailable", "permission_required", "disabled"]),
    permissionState: CameraPermissionStateSchema,
    hotSwappable: z.boolean(),
    supportsHardwareAcceleration: z.boolean(),
    supportedResolutions: z.array(z.string().min(3).max(40)).max(20),
    supportedFrameRates: z.array(z.number().int().positive()).max(20),
    health: z.string().min(1).max(500),
    lastSeenAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const RuntimeProfileRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    mode: z.enum([
      "development",
      "presentation",
      "productivity",
      "gaming",
      "accessibility",
      "meeting",
      "design",
      "custom",
    ]),
    active: z.boolean(),
    gestureProfileId: z.string().uuid().nullable(),
    desktopCapabilityScope: z.array(z.string().min(3).max(160)).max(50),
    requiresIntentRouting: z.literal(true),
    directMouseControlAvailable: z.literal(false),
    directKeyboardControlAvailable: z.literal(false),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const NativeGestureSessionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    deviceId: z.string().uuid().nullable(),
    providerId: z.string().min(3).max(160).nullable(),
    runtimeProfileId: z.string().uuid().nullable(),
    status: NativeSpatialRuntimeStateSchema,
    localProcessingOnly: z.literal(true),
    rawFramesPersisted: z.literal(false),
    desktopCapabilityLayerRequired: z.literal(true),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const MonitorLayoutRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    displayName: z.string().min(1).max(120),
    displayCount: z.number().int().min(0).max(16),
    primaryDisplayId: z.string().min(1).max(120).nullable(),
    calibrationStatus: z.enum(["uncalibrated", "calibrated", "stale"]),
    coordinateSpace: z.enum(["normalized", "native_unavailable"]),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DesktopContextHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    activeApplicationId: z.string().min(1).max(160).nullable(),
    focusedWindowId: z.string().min(1).max(160).nullable(),
    workspaceLabel: z.string().min(1).max(160),
    capturedBy: z.literal("metadata_only"),
    observedAt: z.iso.datetime(),
  })
  .strict();

export const NativeRuntimeMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    sessionId: z.string().uuid().nullable(),
    fps: z.number().min(0).max(240),
    latencyMs: z.number().min(0).max(10_000),
    cpuPercent: z.number().min(0).max(100).nullable(),
    memoryMb: z.number().min(0).max(1_000_000).nullable(),
    trackingQuality: z.number().min(0).max(1),
    droppedFrames: z.number().int().nonnegative(),
    thermalState: z.enum(["unknown", "nominal", "fair", "serious", "critical"]),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const SpatialOverlayRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    status: z.enum(["available", "disabled", "unavailable"]),
    showsHandSkeleton: z.boolean(),
    showsTargetIndicator: z.boolean(),
    showsGestureName: z.boolean(),
    rawScreenCaptureRequired: z.literal(false),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const RuntimeSyncRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    browserRuntimeVersion: z.string().min(1).max(40),
    nativeRuntimeVersion: z.string().min(1).max(40),
    sharedProfiles: z.boolean(),
    sharedCalibration: z.boolean(),
    sharedMappings: z.boolean(),
    lastSyncedAt: z.iso.datetime(),
    status: z.enum(["synced", "stale", "unavailable"]),
  })
  .strict();

export const NativeSpatialRuntimeResponseSchema = z
  .object({
    nativeEnabled: z.boolean(),
    state: NativeSpatialRuntimeStateSchema,
    providers: z.array(CameraProviderRecordSchema).max(100),
    sessions: z.array(NativeGestureSessionRecordSchema).max(100),
    runtimeProfiles: z.array(RuntimeProfileRecordSchema).max(100),
    monitorLayouts: z.array(MonitorLayoutRecordSchema).max(100),
    desktopContextHistory: z.array(DesktopContextHistoryRecordSchema).max(500),
    nativeMetrics: z.array(NativeRuntimeMetricRecordSchema).max(500),
    overlays: z.array(SpatialOverlayRecordSchema).max(100),
    runtimeSync: z.array(RuntimeSyncRecordSchema).max(100),
    directMouseControlAvailable: z.literal(false),
    directKeyboardControlAvailable: z.literal(false),
    arbitraryOsAutomationAvailable: z.literal(false),
    desktopCapabilityLayerRequired: z.literal(true),
    routesThroughIntentEngine: z.literal(true),
  })
  .strict();

export const NativeSpatialGesturePayloadSchema = z
  .object({
    operation: z.literal("native_spatial_gesture"),
    profileId: z.string().uuid().optional(),
    sessionId: z.string().uuid().optional(),
    gesture: GestureNameSchema,
    confidence: ConfidenceSchema,
    handedness: HandednessSchema,
    state: GestureLifecycleStateSchema,
    cursor: Point2DSchema.optional(),
    runtimeState: NativeSpatialRuntimeStateSchema,
    source: z.literal("native_spatial_runtime"),
    applicationTarget: z
      .object({
        providerId: RegistryIdSchema,
        applicationId: RegistryIdSchema,
        capability: z.enum(["launch", "focus"]),
      })
      .strict()
      .optional(),
  })
  .strict();

export const SpatialDashboardResponseSchema = z
  .object({
    cameraDevices: z.array(CameraDeviceRecordSchema).max(100),
    visionSessions: z.array(VisionSessionRecordSchema).max(100),
    profiles: z.array(GestureProfileRecordSchema).max(100),
    mappings: z.array(GestureMappingRecordSchema).max(500),
    macros: z.array(GestureMacroRecordSchema).max(200),
    calibration: z.array(GestureCalibrationRecordSchema).max(100),
    history: z.array(GestureHistoryRecordSchema).max(500),
    metrics: z.array(GestureMetricRecordSchema).max(500),
    customGestures: z.array(CustomGestureRecordSchema).max(200),
    versions: z.array(GestureVersionRecordSchema).max(500),
    trackingMetrics: z.array(TrackingMetricRecordSchema).max(500),
    securityPolicy: GestureSecurityPolicySchema,
    pipeline: z.array(VisionPipelineStageSchema).min(1).max(20),
    rawFramesPersisted: z.literal(false),
    directOsControlAvailable: z.literal(false),
    highRiskGestureApprovalAllowed: z.literal(false),
    routesThroughIntentEngine: z.literal(true),
  })
  .strict();

export const CreateGestureProfileRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500),
    mode: GestureModeSchema.default("assistant"),
    sensitivity: z.number().min(0).max(1).default(0.7),
    debounceMs: z.number().int().min(0).max(5_000).default(450),
  })
  .strict();

export const UpsertGestureMappingRequestSchema = z
  .object({
    profileId: z.string().uuid(),
    gesture: GestureNameSchema,
    intentTemplate: z.string().trim().min(1).max(1_000),
    target: z.string().trim().min(1).max(200).default("intent_engine"),
    safetyLevel: z
      .enum(["informational", "read_only", "low_risk", "moderate_risk"])
      .default("read_only"),
    approvalRequired: z.boolean().default(false),
    enabled: z.boolean().default(true),
    cooldownMs: z.number().int().min(0).max(60_000).default(1_000),
  })
  .strict();

export const RecordGestureRequestSchema = z
  .object({
    profileId: z.string().uuid().optional(),
    gesture: GestureNameSchema,
    confidence: ConfidenceSchema,
    handedness: HandednessSchema.default("unknown"),
    state: GestureLifecycleStateSchema.default("confirmed"),
  })
  .strict();

export type Point2D = z.infer<typeof Point2DSchema>;
export type Point3D = z.infer<typeof Point3DSchema>;
export type Handedness = z.infer<typeof HandednessSchema>;
export type HandLandmarkFrame = z.infer<typeof HandLandmarkFrameSchema>;
export type GestureName = z.infer<typeof GestureNameSchema>;
export type GestureMode = z.infer<typeof GestureModeSchema>;
export type GestureEvent = z.infer<typeof GestureEventSchema>;
export type GestureEngineState = z.infer<typeof GestureEngineStateSchema>;
export type GestureSecurityPolicy = z.infer<typeof GestureSecurityPolicySchema>;
export type VisionPipelineStage = z.infer<typeof VisionPipelineStageSchema>;
export type GestureLifecycleState = z.infer<typeof GestureLifecycleStateSchema>;
export type CameraDeviceRecord = z.infer<typeof CameraDeviceRecordSchema>;
export type VisionSessionRecord = z.infer<typeof VisionSessionRecordSchema>;
export type GestureProfileRecord = z.infer<typeof GestureProfileRecordSchema>;
export type GestureMappingRecord = z.infer<typeof GestureMappingRecordSchema>;
export type GestureMacroRecord = z.infer<typeof GestureMacroRecordSchema>;
export type GestureCalibrationRecord = z.infer<typeof GestureCalibrationRecordSchema>;
export type GestureHistoryRecord = z.infer<typeof GestureHistoryRecordSchema>;
export type GestureMetricRecord = z.infer<typeof GestureMetricRecordSchema>;
export type CustomGestureRecord = z.infer<typeof CustomGestureRecordSchema>;
export type GestureVersionRecord = z.infer<typeof GestureVersionRecordSchema>;
export type TrackingMetricRecord = z.infer<typeof TrackingMetricRecordSchema>;
export type NativeSpatialRuntimeState = z.infer<typeof NativeSpatialRuntimeStateSchema>;
export type CameraProviderRecord = z.infer<typeof CameraProviderRecordSchema>;
export type RuntimeProfileRecord = z.infer<typeof RuntimeProfileRecordSchema>;
export type NativeGestureSessionRecord = z.infer<
  typeof NativeGestureSessionRecordSchema
>;
export type MonitorLayoutRecord = z.infer<typeof MonitorLayoutRecordSchema>;
export type DesktopContextHistoryRecord = z.infer<
  typeof DesktopContextHistoryRecordSchema
>;
export type NativeRuntimeMetricRecord = z.infer<typeof NativeRuntimeMetricRecordSchema>;
export type SpatialOverlayRecord = z.infer<typeof SpatialOverlayRecordSchema>;
export type RuntimeSyncRecord = z.infer<typeof RuntimeSyncRecordSchema>;
export type NativeSpatialRuntimeResponse = z.infer<
  typeof NativeSpatialRuntimeResponseSchema
>;
export type NativeSpatialGesturePayload = z.infer<
  typeof NativeSpatialGesturePayloadSchema
>;
export type SpatialDashboardResponse = z.infer<typeof SpatialDashboardResponseSchema>;
export type CreateGestureProfileRequest = z.infer<
  typeof CreateGestureProfileRequestSchema
>;
export type UpsertGestureMappingRequest = z.infer<
  typeof UpsertGestureMappingRequestSchema
>;
export type RecordGestureRequest = z.infer<typeof RecordGestureRequestSchema>;

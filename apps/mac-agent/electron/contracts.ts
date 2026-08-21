import { z } from "zod";
import {
  GestureLifecycleStateSchema,
  GestureNameSchema,
  ApplicationDiscoveryResponseSchema,
  HandednessSchema,
  NativeCapabilityDispatchRequestSchema,
  NativeProviderExecutionTransportResultSchema,
  NativeProviderHostStatusSchema,
  NativeSpatialRuntimeStateSchema,
  Point2DSchema,
} from "@alexa-control/shared";
import type {
  ActiveContextResponseSchema,
  DeviceVoiceRuntimePayloadSchema,
  VoiceDashboardResponseSchema,
  VoiceCaptureLeaseResponseSchema,
  VoiceTranscriptResponseSchema,
  VoiceTurnCancellationResponseSchema,
} from "@alexa-control/shared";

export const EmptyIpcPayloadSchema = z.undefined();

export const NativeVoiceRecognitionEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), onDevice: z.boolean() }).strict(),
  z.object({ type: z.literal("audioLevel"), level: z.number().min(0).max(1) }).strict(),
  z.object({ type: z.literal("interim"), text: z.string().min(1).max(4_000) }).strict(),
  z.object({ type: z.literal("final"), text: z.string().min(1).max(4_000) }).strict(),
  z
    .object({
      type: z.literal("error"),
      code: z.enum([
        "MIC_PERMISSION_DENIED",
        "STT_PERMISSION_DENIED",
        "STT_PROVIDER_UNAVAILABLE",
        "STT_AUDIO_CAPTURE_ERROR",
        "STT_DICTATION_DISABLED",
        "STT_RECOGNITION_FAILED",
      ]),
      diagnosticDomain: z.string().min(1).max(120).optional(),
      diagnosticCode: z.number().int().safe().optional(),
    })
    .strict(),
]);

export const AgentConnectionResultSchema = z
  .object({
    ok: z.boolean(),
    status: z.enum(["online", "offline", "invalid_response"]),
    checkedAt: z.iso.datetime(),
    message: z.string().min(1),
    https: z.boolean().default(false),
  })
  .strict();

export const AgentDiagnosticsSchema = z
  .object({
    agentName: z.literal("Alexa Control Mac Agent"),
    version: z.literal("0.1.0"),
    apiEndpoint: z.string().url(),
    deviceIdentityStatus: z.enum([
      "not_configured",
      "pending",
      "trusted",
      "revoked",
      "expired",
    ]),
    privateNetworkStatus: z.literal("unknown"),
    executionEnabled: z.boolean(),
    readOnlyCapabilityExecution: z.enum(["available", "unavailable"]),
    writeExecutionAvailable: z.literal(false),
    privilegedExecutionAvailable: z.literal(false),
    pollingState: z.enum(["active", "paused", "unavailable"]),
    lastPollAt: z.iso.datetime().nullable(),
    lastHeartbeatAt: z.iso.datetime().nullable(),
    lastExecutionFailureCode: z.string().min(1).max(120).nullable(),
    currentExecutionRequestId: z.string().uuid().nullable(),
    platform: z.literal("macOS"),
  })
  .strict();

export const LocalExecutionResultSchema = z
  .object({
    success: z.literal(true),
    executionEnabled: z.literal(false),
    disabledAt: z.iso.datetime(),
  })
  .strict();

export const CapabilityAvailabilitySchema = z.enum([
  "available",
  "unavailable",
  "not_requested",
]);

export const CapabilityStatusSchema = z.record(
  z.string(),
  CapabilityAvailabilitySchema,
);

export const BeginPairingInputSchema = z
  .object({
    pairingCode: z.string().regex(/^[A-Z0-9]{8}$/),
    deviceName: z.string().trim().min(1).max(100),
  })
  .strict();

export const AgentPairingStatusSchema = z
  .object({
    configured: z.boolean(),
    deviceId: z.string().uuid().optional(),
    trustStatus: z.enum(["PENDING", "TRUSTED", "REVOKED", "EXPIRED"]).optional(),
    fingerprint: z.string().min(1).optional(),
    serverExecutionKeyFingerprint: z.string().min(16).max(200).optional(),
    message: z.string().min(1),
  })
  .strict();

export const DeviceIdentityStatusSchema = z
  .object({
    configured: z.boolean(),
    deviceId: z.string().uuid().optional(),
    fingerprint: z.string().min(1).optional(),
    trustStatus: z
      .enum(["PENDING", "TRUSTED", "REVOKED", "EXPIRED", "UNAVAILABLE"])
      .optional(),
    keyStorageStatus: z.enum(["AVAILABLE", "MISSING", "UNAVAILABLE", "CORRUPT"]),
    serverExecutionKeyFingerprint: z.string().min(16).max(200).optional(),
    workspaceMappingsConfirmedAt: z.iso.datetime().nullable().optional(),
    requiresRepairing: z.boolean(),
    privilegedExecutionAvailable: z.literal(false),
  })
  .strict();

export const ResetLocalDeviceIdentityInputSchema = z
  .object({ confirmed: z.literal(true) })
  .strict();

export const ResetLocalDeviceIdentityResponseSchema = z
  .object({
    success: z.literal(true),
    requiresRepairing: z.literal(true),
    privilegedExecutionAvailable: z.literal(false),
  })
  .strict();

export const ConfirmWorkspaceMappingsResponseSchema = z
  .object({
    success: z.literal(true),
    confirmedAt: z.iso.datetime(),
    privilegedExecutionAvailable: z.literal(false),
    writeExecutionAvailable: z.literal(false),
  })
  .strict();

export const NativeSpatialStatusSchema = z
  .object({
    available: z.boolean(),
    state: NativeSpatialRuntimeStateSchema,
    cameraPermission: z.enum([
      "not_requested",
      "granted",
      "denied",
      "restricted",
      "unknown",
    ]),
    activeProviderId: z.string().min(3).max(160).nullable(),
    activeSessionId: z.string().uuid().nullable(),
    fps: z.number().min(0).max(240),
    latencyMs: z.number().min(0).max(10_000),
    lastGesture: GestureNameSchema,
    lastIntentCreated: z.boolean(),
    lastError: z.string().min(1).max(500).nullable(),
    directMouseControlAvailable: z.literal(false),
    directKeyboardControlAvailable: z.literal(false),
    routesThroughIntentEngine: z.literal(true),
    desktopCapabilityLayerRequired: z.literal(true),
    rawFramesPersisted: z.literal(false),
  })
  .strict();

export const NativeSpatialStartInputSchema = z
  .object({
    providerId: z.string().min(3).max(160).default("native.browser.media-devices"),
  })
  .strict();

export const NativeSpatialGestureInputSchema = z
  .object({
    profileId: z.string().uuid().optional(),
    sessionId: z.string().uuid().optional(),
    gesture: GestureNameSchema,
    confidence: z.number().min(0).max(1),
    handedness: HandednessSchema.default("unknown"),
    state: GestureLifecycleStateSchema.default("confirmed"),
    cursor: Point2DSchema.optional(),
    applicationTarget: z
      .object({
        providerId: z
          .string()
          .trim()
          .regex(/^provider\.[a-z][a-z0-9._-]{2,63}$/),
        applicationId: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9._-]{2,63}$/),
        capability: z.enum(["launch", "focus"]),
      })
      .strict()
      .optional(),
  })
  .strict();

export const NativeProviderExecutionResultSchema =
  NativeProviderExecutionTransportResultSchema;
export const ApplicationDiscoverySyncResultSchema =
  ApplicationDiscoveryResponseSchema.extend({
    scanned: z.number().int().min(0),
  });

export const VoiceOverlayStateSchema = z.enum([
  "collapsed",
  "listening",
  "transcribing",
  "thinking",
  "speaking",
  "reconnecting",
  "error",
]);

export const VoiceOverlayActivationSchema = z
  .object({ source: z.enum(["shortcut", "renderer"]) })
  .strict();

export type AgentConnectionResult = z.infer<typeof AgentConnectionResultSchema>;
export type AgentDiagnostics = z.infer<typeof AgentDiagnosticsSchema>;
export type LocalExecutionResult = z.infer<typeof LocalExecutionResultSchema>;
export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;
export type BeginPairingInput = z.infer<typeof BeginPairingInputSchema>;
export type AgentPairingStatus = z.infer<typeof AgentPairingStatusSchema>;
export type DeviceIdentityStatus = z.infer<typeof DeviceIdentityStatusSchema>;
export type ResetLocalDeviceIdentityInput = z.infer<
  typeof ResetLocalDeviceIdentityInputSchema
>;
export type ResetLocalDeviceIdentityResponse = z.infer<
  typeof ResetLocalDeviceIdentityResponseSchema
>;
export type ConfirmWorkspaceMappingsResponse = z.infer<
  typeof ConfirmWorkspaceMappingsResponseSchema
>;
export type NativeSpatialStatus = z.infer<typeof NativeSpatialStatusSchema>;
export type NativeSpatialStartInput = z.infer<typeof NativeSpatialStartInputSchema>;
export type NativeSpatialGestureInput = z.infer<typeof NativeSpatialGestureInputSchema>;
export type NativeProviderHostStatus = z.infer<typeof NativeProviderHostStatusSchema>;
export type NativeProviderExecutionResult = z.infer<
  typeof NativeProviderExecutionResultSchema
>;
export type ApplicationDiscoverySyncResult = z.infer<
  typeof ApplicationDiscoverySyncResultSchema
>;
export type VoiceOverlayState = z.infer<typeof VoiceOverlayStateSchema>;
export type VoiceOverlayActivation = z.infer<typeof VoiceOverlayActivationSchema>;

export interface AlexaAgentApi {
  testApiConnection: () => Promise<AgentConnectionResult>;
  testSecureApiConnection: () => Promise<AgentConnectionResult>;
  getAgentDiagnostics: () => Promise<AgentDiagnostics>;
  disableLocalExecution: () => Promise<LocalExecutionResult>;
  getCapabilityStatus: () => Promise<CapabilityStatus>;
  beginPairing: (input: BeginPairingInput) => Promise<AgentPairingStatus>;
  getPairingStatus: () => Promise<AgentPairingStatus>;
  getDeviceIdentityStatus: () => Promise<DeviceIdentityStatus>;
  resetLocalDeviceIdentity: (
    input: ResetLocalDeviceIdentityInput,
  ) => Promise<ResetLocalDeviceIdentityResponse>;
  confirmWorkspaceMappings: () => Promise<ConfirmWorkspaceMappingsResponse>;
  getNativeSpatialStatus: () => Promise<NativeSpatialStatus>;
  startNativeSpatialRuntime: (
    input?: Partial<NativeSpatialStartInput>,
  ) => Promise<NativeSpatialStatus>;
  stopNativeSpatialRuntime: () => Promise<NativeSpatialStatus>;
  submitNativeSpatialGesture: (
    input: NativeSpatialGestureInput,
  ) => Promise<NativeSpatialStatus>;
  getNativeProviderHostStatus: () => Promise<NativeProviderHostStatus>;
  executeNativeProviderCapability: (
    input: z.infer<typeof NativeCapabilityDispatchRequestSchema>,
  ) => Promise<NativeProviderExecutionResult>;
  refreshApplicationDiscovery: () => Promise<ApplicationDiscoverySyncResult>;
  showVoiceOverlay: () => Promise<void>;
  hideVoiceOverlay: () => Promise<void>;
  startOverlayVoiceSession: () => Promise<z.infer<typeof VoiceDashboardResponseSchema>>;
  submitOverlayVoiceTranscript: (
    input: Extract<
      z.infer<typeof DeviceVoiceRuntimePayloadSchema>,
      { operation: "submit_transcript" }
    >,
  ) => Promise<z.infer<typeof VoiceTranscriptResponseSchema>>;
  cancelOverlayVoiceTurn: (
    input: Extract<
      z.infer<typeof DeviceVoiceRuntimePayloadSchema>,
      { operation: "cancel_turn" }
    >,
  ) => Promise<z.infer<typeof VoiceTurnCancellationResponseSchema>>;
  manageOverlayVoiceCaptureLease: (
    input: Extract<
      z.infer<typeof DeviceVoiceRuntimePayloadSchema>,
      { operation: "capture_lease" }
    >,
  ) => Promise<z.infer<typeof VoiceCaptureLeaseResponseSchema>>;
  startNativeVoiceRecognition: () => Promise<void>;
  stopNativeVoiceRecognition: () => Promise<void>;
  onNativeVoiceRecognitionEvent: (
    listener: (event: z.infer<typeof NativeVoiceRecognitionEventSchema>) => void,
  ) => () => void;
  onVoiceOverlayActivation: (
    listener: (input: VoiceOverlayActivation) => void,
  ) => () => void;
  getActiveContext: () => Promise<z.infer<typeof ActiveContextResponseSchema>>;
  onActiveContextChanged: (
    listener: (input: z.infer<typeof ActiveContextResponseSchema>) => void,
  ) => () => void;
}

export const IPC_CHANNELS = {
  testApiConnection: "agent:test-api-connection",
  testSecureApiConnection: "agent:test-secure-api-connection",
  getAgentDiagnostics: "agent:get-diagnostics",
  disableLocalExecution: "agent:disable-local-execution",
  getCapabilityStatus: "agent:get-capability-status",
  beginPairing: "agent:begin-pairing",
  getPairingStatus: "agent:get-pairing-status",
  getDeviceIdentityStatus: "agent:get-device-identity-status",
  resetLocalDeviceIdentity: "agent:reset-local-device-identity",
  confirmWorkspaceMappings: "agent:confirm-workspace-mappings",
  getNativeSpatialStatus: "agent:get-native-spatial-status",
  startNativeSpatialRuntime: "agent:start-native-spatial-runtime",
  stopNativeSpatialRuntime: "agent:stop-native-spatial-runtime",
  submitNativeSpatialGesture: "agent:submit-native-spatial-gesture",
  getNativeProviderHostStatus: "agent:get-native-provider-host-status",
  executeNativeProviderCapability: "agent:execute-native-provider-capability",
  refreshApplicationDiscovery: "agent:refresh-application-discovery",
  showVoiceOverlay: "agent:show-voice-overlay",
  hideVoiceOverlay: "agent:hide-voice-overlay",
  startOverlayVoiceSession: "agent:start-overlay-voice-session",
  submitOverlayVoiceTranscript: "agent:submit-overlay-voice-transcript",
  cancelOverlayVoiceTurn: "agent:cancel-overlay-voice-turn",
  manageOverlayVoiceCaptureLease: "agent:manage-overlay-voice-capture-lease",
  startNativeVoiceRecognition: "agent:start-native-voice-recognition",
  stopNativeVoiceRecognition: "agent:stop-native-voice-recognition",
  nativeVoiceRecognitionEvent: "agent:native-voice-recognition-event",
  voiceOverlayActivated: "agent:voice-overlay-activated",
  getActiveContext: "agent:get-active-context",
  activeContextChanged: "agent:active-context-changed",
} as const;

export { NativeCapabilityDispatchRequestSchema, NativeProviderHostStatusSchema };

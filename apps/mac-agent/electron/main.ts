import { parseMacAgentEnvironment } from "@alexa-control/config";
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  safeStorage,
  shell,
  systemPreferences,
} from "electron";
import path from "node:path";

import {
  AgentConnectionResultSchema,
  AgentDiagnosticsSchema,
  AgentPairingStatusSchema,
  BeginPairingInputSchema,
  CapabilityStatusSchema,
  EmptyIpcPayloadSchema,
  IPC_CHANNELS,
  ApplicationDiscoverySyncResultSchema,
  LocalExecutionResultSchema,
  DeviceIdentityStatusSchema,
  NativeSpatialGestureInputSchema,
  NativeSpatialStartInputSchema,
  NativeSpatialStatusSchema,
  NativeCapabilityDispatchRequestSchema,
  NativeProviderExecutionResultSchema,
  NativeProviderHostStatusSchema,
  ResetLocalDeviceIdentityInputSchema,
  ResetLocalDeviceIdentityResponseSchema,
  type NativeSpatialStatus,
} from "./contracts.js";
import {
  ActiveContextResponseSchema,
  DeviceVoiceRuntimePayloadSchema,
  type ActiveContextResponse,
} from "@alexa-control/shared";
import {
  beginFixedPairing,
  checkFixedPairingStatus,
  signDeviceCommand,
  submitDeviceVoiceRuntime,
  submitApplicationDiscovery,
  submitDeviceActiveContext,
  testFixedApiConnection,
  type PendingPairing,
} from "./services.js";
import {
  DeviceMetadataStore,
  ElectronSafeStorageDeviceKeyStore,
  type LocalDeviceMetadata,
} from "./device-key-store.js";
import { ReadOnlyExecutionClient } from "./execution/execution-client.js";
import { discoverInstalledMacApplications } from "./application-discovery.js";
import { MacNativeProviderHost } from "./native-providers.js";
import { NativeSpeechRecognitionSession } from "./native-speech.js";
import {
  checkWhisperCppHealth,
  NativeWhisperRecognitionSession,
  type DesktopSttEvent,
  type WhisperCppConfig,
} from "./native-whisper.js";
import { NativeActiveContextSession } from "./native-active-context.js";

try {
  process.loadEnvFile?.(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const environment = parseMacAgentEnvironment(process.env);

const whisperCppConfig = (): WhisperCppConfig => {
  const appPath = app.getAppPath();
  return {
    binaryPath:
      environment.DESKTOP_STT_WHISPER_BINARY_PATH ??
      path.join(appPath, ".local/whisper.cpp/build/bin/whisper-cli"),
    modelPath:
      environment.DESKTOP_STT_WHISPER_MODEL_PATH ??
      path.join(appPath, ".local/whisper.cpp/models/ggml-base.en.bin"),
    modelVersion: environment.DESKTOP_STT_WHISPER_MODEL_VERSION,
    threads: environment.DESKTOP_STT_WHISPER_THREADS,
    noSpeechThreshold: environment.DESKTOP_STT_WHISPER_NO_SPEECH_THRESHOLD,
  };
};
let localExecutionEnabled = true;
let pendingPairing: PendingPairing | null = null;
let persistedIdentity: PendingPairing["identity"] | null = null;
let keyStorageStatus: "AVAILABLE" | "MISSING" | "UNAVAILABLE" | "CORRUPT" = "MISSING";
let deviceKeyStore: ElectronSafeStorageDeviceKeyStore;
let deviceMetadataStore: DeviceMetadataStore;
let persistedMetadata: LocalDeviceMetadata | null = null;
let executionClient: ReadOnlyExecutionClient | null = null;
let mainWindow: BrowserWindow | null = null;
let voiceOverlayWindow: BrowserWindow | null = null;
type NativeVoiceRecognition = Pick<NativeSpeechRecognitionSession, "start" | "stop">;
let nativeVoiceRecognition: NativeVoiceRecognition | null = null;
let nativeActiveContext: NativeActiveContextSession | null = null;
let activeContextUpdatePending = false;
let latestActiveContext: ActiveContextResponse = ActiveContextResponseSchema.parse({
  context: null,
  refreshed: false,
});
let nativeProviderHost: MacNativeProviderHost | null = null;
let nativeSpatialStatus: NativeSpatialStatus = NativeSpatialStatusSchema.parse({
  available: false,
  state: "idle",
  cameraPermission: "not_requested",
  activeProviderId: null,
  activeSessionId: null,
  fps: 0,
  latencyMs: 0,
  lastGesture: "none",
  lastIntentCreated: false,
  lastError: null,
  directMouseControlAvailable: false,
  directKeyboardControlAvailable: false,
  routesThroughIntentEngine: true,
  desktopCapabilityLayerRequired: true,
  rawFramesPersisted: false,
});

const startExecutionClientIfReady = () => {
  const pinnedServerPublicKey =
    persistedMetadata?.serverExecutionPublicKey ??
    environment.ALEXA_SERVER_EXECUTION_PUBLIC_KEY;
  if (
    !localExecutionEnabled ||
    !environment.ALEXA_READ_ONLY_EXECUTION_ENABLED ||
    !pinnedServerPublicKey ||
    !persistedIdentity ||
    !persistedMetadata ||
    persistedMetadata.trustStatus !== "TRUSTED"
  ) {
    executionClient?.stop();
    executionClient = null;
    return;
  }
  if (executionClient?.deviceId === persistedMetadata.deviceId) return;
  executionClient?.stop();
  executionClient = null;
  executionClient = new ReadOnlyExecutionClient(
    environment.ALEXA_API_BASE_URL,
    persistedMetadata.deviceId,
    persistedIdentity,
    pinnedServerPublicKey,
    environment.ALEXA_EXECUTION_POLL_INTERVAL_MS,
    {
      maxFileReadBytes: environment.ALEXA_MAX_FILE_READ_BYTES,
      maxGitOutputBytes: environment.ALEXA_MAX_GIT_OUTPUT_BYTES,
      maxGitEntries: 1_000,
    },
    nativeProviderHost
      ? {
          status: () => nativeProviderHost!.status(isAccessibilityTrusted()),
          execute: (input) => nativeProviderHost!.execute(input),
        }
      : undefined,
  );
  executionClient.start();
};

const capabilities = CapabilityStatusSchema.parse({
  "Application launch": "unavailable",
  "Application automation": "unavailable",
  "Workspace read": environment.ALEXA_READ_ONLY_EXECUTION_ENABLED
    ? "available"
    : "unavailable",
  "Repository intelligence": environment.ALEXA_READ_ONLY_EXECUTION_ENABLED
    ? "available"
    : "unavailable",
  "Semantic code intelligence": environment.ALEXA_READ_ONLY_EXECUTION_ENABLED
    ? "available"
    : "unavailable",
  "Workspace write": "unavailable",
  "Terminal tools": "unavailable",
  "Codex integration": "unavailable",
  "Browser automation": "unavailable",
  "Screen capture": "unavailable",
  "Gesture control": "available",
  "Voice input": "unavailable",
  "Accessibility permission": "not_requested",
  "Camera permission": "not_requested",
  "Screen-recording permission": "not_requested",
});

const isAccessibilityTrusted = () => {
  if (process.platform !== "darwin") return false;
  return systemPreferences.isTrustedAccessibilityClient(false);
};

const currentCapabilityStatus = () =>
  CapabilityStatusSchema.parse({
    ...capabilities,
    "Application launch": process.platform === "darwin" ? "available" : "unavailable",
    "Application automation": "unavailable",
    "Terminal tools": "unavailable",
    "Accessibility permission": isAccessibilityTrusted()
      ? "available"
      : "not_requested",
  });

const startActiveContextIfReady = () => {
  if (
    !persistedIdentity ||
    !persistedMetadata ||
    persistedMetadata.trustStatus !== "TRUSTED" ||
    process.platform !== "darwin"
  ) {
    nativeActiveContext?.stop();
    nativeActiveContext = null;
    return;
  }
  if (nativeActiveContext) return;
  nativeActiveContext = new NativeActiveContextSession((observation) => {
    if (activeContextUpdatePending || !persistedIdentity || !persistedMetadata) return;
    activeContextUpdatePending = true;
    void submitDeviceActiveContext(
      environment.ALEXA_API_BASE_URL,
      persistedMetadata.deviceId,
      persistedIdentity,
      observation,
    )
      .then((response) => {
        latestActiveContext = ActiveContextResponseSchema.parse(response);
        voiceOverlayWindow?.webContents.send(
          IPC_CHANNELS.activeContextChanged,
          latestActiveContext,
        );
      })
      .catch(() => undefined)
      .finally(() => {
        activeContextUpdatePending = false;
      });
  });
  void nativeActiveContext.start().catch(() => {
    nativeActiveContext?.stop();
    nativeActiveContext = null;
  });
};

const syncApplicationDiscovery = async (
  source: "mac_agent_startup" | "mac_agent_manual_refresh",
) => {
  if (
    !persistedIdentity ||
    !persistedMetadata ||
    persistedMetadata.trustStatus !== "TRUSTED"
  ) {
    return ApplicationDiscoverySyncResultSchema.parse({
      scanned: 0,
      ingested: 0,
      createdApplications: 0,
      updatedInstallations: 0,
      markedUnavailable: 0,
      installations: [],
      permissionsGranted: false,
      dynamicAdaptersCreated: false,
    });
  }
  const applications = await discoverInstalledMacApplications(source);
  const result = await submitApplicationDiscovery(
    environment.ALEXA_API_BASE_URL,
    persistedMetadata.deviceId,
    persistedIdentity,
    {
      operation: "application_discovery_ingest",
      source,
      applications,
    },
  );
  return ApplicationDiscoverySyncResultSchema.parse({
    scanned: applications.length,
    ...result,
  });
};

const registerIpc = () => {
  const testSecureConnection = async (_event: unknown, payload: unknown) => {
    EmptyIpcPayloadSchema.parse(payload);
    return AgentConnectionResultSchema.parse(
      await testFixedApiConnection(environment.ALEXA_API_BASE_URL),
    );
  };
  ipcMain.handle(IPC_CHANNELS.testApiConnection, testSecureConnection);
  ipcMain.handle(IPC_CHANNELS.testSecureApiConnection, testSecureConnection);

  ipcMain.handle(IPC_CHANNELS.getAgentDiagnostics, (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    return AgentDiagnosticsSchema.parse({
      agentName: "Alexa Control Mac Agent",
      version: "0.1.0",
      apiEndpoint: environment.ALEXA_API_BASE_URL,
      deviceIdentityStatus:
        pendingPairing?.trustStatus.toLowerCase() ?? "not_configured",
      privateNetworkStatus: "unknown",
      executionEnabled:
        localExecutionEnabled && executionClient?.status.polling === true,
      readOnlyCapabilityExecution:
        executionClient?.status.polling === true ? "available" : "unavailable",
      writeExecutionAvailable: false,
      privilegedExecutionAvailable: false,
      pollingState: executionClient?.status.polling
        ? "active"
        : environment.ALEXA_READ_ONLY_EXECUTION_ENABLED
          ? "paused"
          : "unavailable",
      lastPollAt: executionClient?.status.lastPollAt ?? null,
      lastHeartbeatAt: executionClient?.status.lastHeartbeatAt ?? null,
      lastExecutionFailureCode: executionClient?.status.lastFailureCode ?? null,
      currentExecutionRequestId:
        executionClient?.status.currentExecutionRequestId ?? null,
      platform: "macOS",
    });
  });

  ipcMain.handle(IPC_CHANNELS.disableLocalExecution, (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    localExecutionEnabled = false;
    executionClient?.stop();
    executionClient = null;
    return LocalExecutionResultSchema.parse({
      success: true,
      executionEnabled: false,
      disabledAt: new Date().toISOString(),
    });
  });

  ipcMain.handle(IPC_CHANNELS.getCapabilityStatus, (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    return currentCapabilityStatus();
  });

  ipcMain.handle(IPC_CHANNELS.beginPairing, async (_event, payload) => {
    const input = BeginPairingInputSchema.parse(payload);
    try {
      executionClient?.stop();
      executionClient = null;
      pendingPairing = await beginFixedPairing(
        environment.ALEXA_API_BASE_URL,
        input.pairingCode,
        input.deviceName,
      );
      await deviceKeyStore.saveKeyPair(pendingPairing.identity);
      persistedIdentity = pendingPairing.identity;
      keyStorageStatus = "AVAILABLE";
      persistedMetadata = {
        deviceId: pendingPairing.deviceId,
        fingerprint: pendingPairing.identity.fingerprint,
        trustStatus: pendingPairing.trustStatus,
        ...(pendingPairing.serverExecutionPublicKey
          ? { serverExecutionPublicKey: pendingPairing.serverExecutionPublicKey }
          : {}),
        ...(pendingPairing.serverExecutionKeyFingerprint
          ? {
              serverExecutionKeyFingerprint:
                pendingPairing.serverExecutionKeyFingerprint,
            }
          : {}),
      };
      await deviceMetadataStore.save(persistedMetadata);
      return AgentPairingStatusSchema.parse({
        configured: true,
        deviceId: pendingPairing.deviceId,
        trustStatus: "PENDING",
        fingerprint: pendingPairing.identity.fingerprint,
        ...(pendingPairing.serverExecutionKeyFingerprint
          ? {
              serverExecutionKeyFingerprint:
                pendingPairing.serverExecutionKeyFingerprint,
            }
          : {}),
        message: "Pairing request submitted. Compare the fingerprint before approval.",
      });
    } catch (error) {
      pendingPairing = null;
      return AgentPairingStatusSchema.parse({
        configured: false,
        message:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Pairing request failed.",
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.getPairingStatus, async (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    if (!pendingPairing) {
      return AgentPairingStatusSchema.parse({
        configured: false,
        message: "No local device identity is configured.",
      });
    }
    try {
      const result = await checkFixedPairingStatus(
        environment.ALEXA_API_BASE_URL,
        pendingPairing,
      );
      persistedMetadata = {
        deviceId: result.deviceId!,
        fingerprint: result.fingerprint!,
        trustStatus: result.trustStatus!,
        ...(pendingPairing.serverExecutionPublicKey
          ? { serverExecutionPublicKey: pendingPairing.serverExecutionPublicKey }
          : persistedMetadata?.serverExecutionPublicKey
            ? { serverExecutionPublicKey: persistedMetadata.serverExecutionPublicKey }
            : {}),
        ...(pendingPairing.serverExecutionKeyFingerprint
          ? {
              serverExecutionKeyFingerprint:
                pendingPairing.serverExecutionKeyFingerprint,
            }
          : persistedMetadata?.serverExecutionKeyFingerprint
            ? {
                serverExecutionKeyFingerprint:
                  persistedMetadata.serverExecutionKeyFingerprint,
              }
            : {}),
        ...(persistedMetadata?.workspaceMappingsConfirmedAt !== undefined
          ? {
              workspaceMappingsConfirmedAt:
                persistedMetadata.workspaceMappingsConfirmedAt,
            }
          : {}),
      };
      await deviceMetadataStore.save(persistedMetadata);
      startExecutionClientIfReady();
      startActiveContextIfReady();
      if (persistedMetadata.trustStatus === "TRUSTED") {
        void syncApplicationDiscovery("mac_agent_startup").catch(() => undefined);
      }
      return result;
    } catch (error) {
      return AgentPairingStatusSchema.parse({
        configured: true,
        deviceId: pendingPairing.deviceId,
        trustStatus: pendingPairing.trustStatus,
        fingerprint: pendingPairing.identity.fingerprint,
        message:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Pairing status could not be checked.",
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.getDeviceIdentityStatus, (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    return DeviceIdentityStatusSchema.parse({
      configured: persistedIdentity !== null,
      ...(pendingPairing
        ? { deviceId: pendingPairing.deviceId }
        : persistedMetadata
          ? { deviceId: persistedMetadata.deviceId }
          : {}),
      ...(persistedIdentity ? { fingerprint: persistedIdentity.fingerprint } : {}),
      ...(pendingPairing
        ? { trustStatus: pendingPairing.trustStatus }
        : persistedMetadata
          ? { trustStatus: persistedMetadata.trustStatus }
          : persistedIdentity
            ? { trustStatus: "UNAVAILABLE" }
            : {}),
      keyStorageStatus,
      ...(persistedMetadata?.serverExecutionKeyFingerprint
        ? {
            serverExecutionKeyFingerprint:
              persistedMetadata.serverExecutionKeyFingerprint,
          }
        : {}),
      ...(persistedMetadata?.workspaceMappingsConfirmedAt !== undefined
        ? {
            workspaceMappingsConfirmedAt:
              persistedMetadata.workspaceMappingsConfirmedAt,
          }
        : {}),
      requiresRepairing:
        persistedIdentity !== null &&
        (persistedMetadata === null || persistedMetadata.trustStatus === "PENDING"),
      privilegedExecutionAvailable: false,
    });
  });

  ipcMain.handle(IPC_CHANNELS.resetLocalDeviceIdentity, async (_event, payload) => {
    ResetLocalDeviceIdentityInputSchema.parse(payload);
    await deviceKeyStore.deleteKeyPair();
    await deviceMetadataStore.delete();
    executionClient?.stop();
    executionClient = null;
    nativeActiveContext?.stop();
    nativeActiveContext = null;
    persistedIdentity = null;
    pendingPairing = null;
    keyStorageStatus = "MISSING";
    persistedMetadata = null;
    return ResetLocalDeviceIdentityResponseSchema.parse({
      success: true,
      requiresRepairing: true,
      privilegedExecutionAvailable: false,
    });
  });

  ipcMain.handle(IPC_CHANNELS.confirmWorkspaceMappings, async (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    const confirmedAt = new Date().toISOString();
    if (persistedMetadata) {
      persistedMetadata = {
        ...persistedMetadata,
        workspaceMappingsConfirmedAt: confirmedAt,
      };
      await deviceMetadataStore.save(persistedMetadata);
    }
    return {
      success: true,
      confirmedAt,
      privilegedExecutionAvailable: false,
      writeExecutionAvailable: false,
    };
  });

  ipcMain.handle(IPC_CHANNELS.getNativeSpatialStatus, (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    return NativeSpatialStatusSchema.parse(nativeSpatialStatus);
  });

  ipcMain.handle(IPC_CHANNELS.startNativeSpatialRuntime, (_event, payload) => {
    const input = NativeSpatialStartInputSchema.parse(payload);
    nativeSpatialStatus = NativeSpatialStatusSchema.parse({
      ...nativeSpatialStatus,
      available: true,
      state: "requesting_permission",
      activeProviderId: input.providerId,
      activeSessionId: crypto.randomUUID(),
      lastError: null,
      directMouseControlAvailable: false,
      directKeyboardControlAvailable: false,
      routesThroughIntentEngine: true,
      desktopCapabilityLayerRequired: true,
      rawFramesPersisted: false,
    });
    return nativeSpatialStatus;
  });

  ipcMain.handle(IPC_CHANNELS.stopNativeSpatialRuntime, (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    nativeSpatialStatus = NativeSpatialStatusSchema.parse({
      ...nativeSpatialStatus,
      state: "stopped",
      fps: 0,
      latencyMs: 0,
    });
    return nativeSpatialStatus;
  });

  ipcMain.handle(IPC_CHANNELS.submitNativeSpatialGesture, async (_event, payload) => {
    const input = NativeSpatialGestureInputSchema.parse(payload);
    if (!persistedIdentity || !persistedMetadata?.deviceId) {
      nativeSpatialStatus = NativeSpatialStatusSchema.parse({
        ...nativeSpatialStatus,
        state: "error",
        lastError:
          "Native spatial gestures require a paired trusted Mac agent identity.",
      });
      return nativeSpatialStatus;
    }
    const signed = await signDeviceCommand(
      persistedMetadata.deviceId,
      persistedIdentity,
      {
        operation: "native_spatial_gesture",
        ...(input.profileId ? { profileId: input.profileId } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        gesture: input.gesture,
        confidence: input.confidence,
        handedness: input.handedness,
        state: input.state,
        ...(input.cursor ? { cursor: input.cursor } : {}),
        ...(input.applicationTarget
          ? { applicationTarget: input.applicationTarget }
          : {}),
        runtimeState: nativeSpatialStatus.state,
        source: "native_spatial_runtime",
      },
    );
    const response = await fetch(
      `${environment.ALEXA_API_BASE_URL}/api/agent/spatial/gestures`,
      {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(signed),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      nativeSpatialStatus = NativeSpatialStatusSchema.parse({
        ...nativeSpatialStatus,
        state: "error",
        lastGesture: input.gesture,
        lastIntentCreated: false,
        lastError: `Native gesture route rejected with HTTP ${response.status}.`,
      });
      return nativeSpatialStatus;
    }
    const dashboard = (await response.json()) as {
      history?: Array<{ gesture?: string; intentCreated?: boolean }>;
    };
    const routed = dashboard.history?.some(
      (event) => event.gesture === input.gesture && event.intentCreated === true,
    );
    nativeSpatialStatus = NativeSpatialStatusSchema.parse({
      ...nativeSpatialStatus,
      available: true,
      state: "tracking",
      cameraPermission: "granted",
      lastGesture: input.gesture,
      lastIntentCreated: Boolean(routed),
      lastError: null,
    });
    return nativeSpatialStatus;
  });

  ipcMain.handle(IPC_CHANNELS.getNativeProviderHostStatus, (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    return NativeProviderHostStatusSchema.parse(
      nativeProviderHost?.status(isAccessibilityTrusted()),
    );
  });

  ipcMain.handle(
    IPC_CHANNELS.executeNativeProviderCapability,
    async (_event, payload) => {
      const input = NativeCapabilityDispatchRequestSchema.parse(payload);
      if (!nativeProviderHost) {
        return NativeProviderExecutionResultSchema.parse({
          providerId: input.providerId,
          applicationId: input.applicationId,
          capability: input.capability,
          status: "failed",
          verified: false,
          verificationSummary: "Native provider host is not initialized.",
          resultSummary: "No macOS operation was performed.",
          errorCode: "NATIVE_PROVIDER_HOST_UNAVAILABLE",
          latencyMs: 0,
          completedAt: new Date().toISOString(),
          nativeBridgeUsed: false,
          arbitraryExecutionAvailable: false,
          arbitraryAppleScriptAvailable: false,
          arbitraryShellAvailable: false,
          coordinateClickingAvailable: false,
          keyboardReplayAvailable: false,
          unrestrictedAccessibilityAvailable: false,
        });
      }
      return NativeProviderExecutionResultSchema.parse(
        await nativeProviderHost.execute(input),
      );
    },
  );

  ipcMain.handle(IPC_CHANNELS.refreshApplicationDiscovery, async (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    return syncApplicationDiscovery("mac_agent_manual_refresh");
  });

  const requireTrustedVoiceDevice = () => {
    if (
      !persistedIdentity ||
      !persistedMetadata ||
      persistedMetadata.trustStatus !== "TRUSTED"
    )
      throw new Error(
        "A paired trusted Mac Agent identity is required for voice overlay.",
      );
    return { deviceId: persistedMetadata.deviceId, identity: persistedIdentity };
  };

  ipcMain.handle(IPC_CHANNELS.showVoiceOverlay, async (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    await showVoiceOverlay("renderer");
  });

  ipcMain.handle(IPC_CHANNELS.hideVoiceOverlay, (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    voiceOverlayWindow?.hide();
  });

  ipcMain.handle(IPC_CHANNELS.openApprovalCenter, async (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    const url = new URL("/approvals", environment.ALEXA_WEB_BASE_URL);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new Error("Configured Alexa Control URL must use HTTP or HTTPS.");
    await shell.openExternal(url.toString());
  });

  ipcMain.handle(IPC_CHANNELS.startOverlayVoiceSession, async (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    const device = requireTrustedVoiceDevice();
    return submitDeviceVoiceRuntime(
      environment.ALEXA_API_BASE_URL,
      device.deviceId,
      device.identity,
      {
        operation: "start_session",
        session: { wakeWordEnabled: true, reuseActiveSession: true },
      },
    );
  });

  ipcMain.handle(IPC_CHANNELS.submitOverlayVoiceTranscript, async (_event, payload) => {
    const input = DeviceVoiceRuntimePayloadSchema.parse(payload);
    if (input.operation !== "submit_transcript")
      throw new Error("Voice transcript payload is required.");
    const device = requireTrustedVoiceDevice();
    return submitDeviceVoiceRuntime(
      environment.ALEXA_API_BASE_URL,
      device.deviceId,
      device.identity,
      input,
    );
  });

  ipcMain.handle(IPC_CHANNELS.cancelOverlayVoiceTurn, async (_event, payload) => {
    const input = DeviceVoiceRuntimePayloadSchema.parse(payload);
    if (input.operation !== "cancel_turn")
      throw new Error("Voice cancellation payload is required.");
    const device = requireTrustedVoiceDevice();
    return submitDeviceVoiceRuntime(
      environment.ALEXA_API_BASE_URL,
      device.deviceId,
      device.identity,
      input,
    );
  });

  ipcMain.handle(
    IPC_CHANNELS.manageOverlayVoiceCaptureLease,
    async (_event, payload) => {
      const input = DeviceVoiceRuntimePayloadSchema.parse(payload);
      if (input.operation !== "capture_lease")
        throw new Error("Voice capture lease payload is required.");
      const device = requireTrustedVoiceDevice();
      return submitDeviceVoiceRuntime(
        environment.ALEXA_API_BASE_URL,
        device.deviceId,
        device.identity,
        input,
      );
    },
  );

  ipcMain.handle(IPC_CHANNELS.startNativeVoiceRecognition, async (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    // Request through Electron first so macOS attributes microphone consent to
    // the actual overlay app instead of its short-lived native STT helper.
    const microphoneStatus = systemPreferences.getMediaAccessStatus("microphone");
    const microphoneGranted =
      microphoneStatus === "granted" ||
      (microphoneStatus === "not-determined" &&
        (await systemPreferences.askForMediaAccess("microphone")));
    if (!microphoneGranted) {
      voiceOverlayWindow?.webContents.send(
        IPC_CHANNELS.nativeVoiceRecognitionEvent,
        { type: "error", code: "MIC_PERMISSION_DENIED" },
      );
      return;
    }
    nativeVoiceRecognition?.stop();
    let fallbackStarted = false;
    const forward = (event: DesktopSttEvent) => {
      voiceOverlayWindow?.webContents.send(
        IPC_CHANNELS.nativeVoiceRecognitionEvent,
        event,
      );
    };
    const startAppleFallback = async (reason: string) => {
      if (fallbackStarted || environment.DESKTOP_STT_FALLBACK_PROVIDER !== "apple_speech") {
        forward({ type: "error", code: "STT_PROVIDER_UNAVAILABLE" });
        return;
      }
      fallbackStarted = true;
      console.warn(`[desktop-stt] whisper.cpp unavailable; using Apple Speech fallback (${reason}).`);
      nativeVoiceRecognition?.stop();
      nativeVoiceRecognition = new NativeSpeechRecognitionSession((event) => forward(event));
      await nativeVoiceRecognition.start();
    };
    if (environment.DESKTOP_STT_PROVIDER === "apple_speech") {
      nativeVoiceRecognition = new NativeSpeechRecognitionSession((event) => forward(event));
      await nativeVoiceRecognition.start();
      return;
    }

    const health = await checkWhisperCppHealth(whisperCppConfig());
    if (!health.available) {
      await startAppleFallback(health.message);
      return;
    }
    nativeVoiceRecognition = new NativeWhisperRecognitionSession(
      whisperCppConfig(),
      (event) => {
        if (
          event.type === "error" &&
          (event.code === "STT_PROVIDER_UNAVAILABLE" || event.code === "STT_TRANSCRIPTION_FAILED")
        ) {
          void startAppleFallback(event.code);
          return;
        }
        forward(event);
      },
    );
    await nativeVoiceRecognition.start();
  });

  ipcMain.handle(IPC_CHANNELS.stopNativeVoiceRecognition, (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    nativeVoiceRecognition?.stop();
    nativeVoiceRecognition = null;
  });

  ipcMain.handle(IPC_CHANNELS.getActiveContext, (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    return ActiveContextResponseSchema.parse(latestActiveContext);
  });
};

const createVoiceOverlayWindow = async () => {
  if (voiceOverlayWindow && !voiceOverlayWindow.isDestroyed())
    return voiceOverlayWindow;
  const window = new BrowserWindow({
    width: 372,
    height: 560,
    minWidth: 320,
    minHeight: 78,
    maxWidth: 480,
    maxHeight: 720,
    show: false,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#0a0b0d",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  window.setAlwaysOnTop(true, "floating", 1);
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.on("closed", () => {
    if (voiceOverlayWindow === window) voiceOverlayWindow = null;
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(`${process.env.VITE_DEV_SERVER_URL}?view=voice-overlay`);
  } else {
    await window.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: { view: "voice-overlay" },
    });
  }
  voiceOverlayWindow = window;
  return window;
};

const showVoiceOverlay = async (source: "shortcut" | "renderer") => {
  const window = await createVoiceOverlayWindow();
  window.showInactive();
  window.webContents.send(IPC_CHANNELS.voiceOverlayActivated, { source });
};

const createWindow = async () => {
  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 760,
    minHeight: 600,
    show: false,
    backgroundColor: "#090d12",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  mainWindow = window;

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  window.webContents.on("did-fail-load", (_event, _errorCode, errorDescription) => {
    console.error("Mac agent renderer failed to load.", errorDescription);
    window.show();
  });
  window.webContents.on("did-finish-load", () => {
    if (!window.isVisible()) window.show();
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  window.once("ready-to-show", () => {
    window.show();
    window.focus();
  });
};

const startAgent = async () => {
  await app.whenReady();
  deviceKeyStore = new ElectronSafeStorageDeviceKeyStore(
    safeStorage,
    path.join(app.getPath("userData"), "device-identity.secure"),
  );
  deviceMetadataStore = new DeviceMetadataStore(
    path.join(app.getPath("userData"), "device-identity.json"),
  );
  nativeProviderHost = new MacNativeProviderHost(undefined, undefined, {
    downloads: () => app.getPath("downloads"),
    desktop: () => app.getPath("desktop"),
  });
  try {
    [persistedIdentity, persistedMetadata] = await Promise.all([
      deviceKeyStore.loadKeyPair(),
      deviceMetadataStore.load(),
    ]);
    if (Boolean(persistedIdentity) !== Boolean(persistedMetadata)) {
      persistedIdentity = null;
      persistedMetadata = null;
      keyStorageStatus = "CORRUPT";
    } else {
      keyStorageStatus = persistedIdentity ? "AVAILABLE" : "MISSING";
    }
  } catch {
    persistedIdentity = null;
    keyStorageStatus = safeStorage.isEncryptionAvailable() ? "CORRUPT" : "UNAVAILABLE";
  }
  startExecutionClientIfReady();
  startActiveContextIfReady();
  if (persistedMetadata?.trustStatus === "TRUSTED") {
    void syncApplicationDiscovery("mac_agent_startup").catch(() => undefined);
  }
  registerIpc();
  await createWindow();
  globalShortcut.register("Alt+Space", () => {
    void showVoiceOverlay("shortcut");
  });

  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("will-quit", () => {
    nativeVoiceRecognition?.stop();
    nativeActiveContext?.stop();
    globalShortcut.unregisterAll();
  });

  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
};

void startAgent().catch((error: unknown) => {
  console.error("Mac agent failed to start.", error);
  app.quit();
});

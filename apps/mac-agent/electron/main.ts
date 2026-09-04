import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  safeStorage,
  shell,
  systemPreferences,
  Tray,
} from "electron";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  AgentConnectionResultSchema,
  AgentDiagnosticsSchema,
  MacAgentProductStatusSchema,
  SetLaunchAtLoginInputSchema,
  OpenPermissionSettingsInputSchema,
  ExportDiagnosticsResultSchema,
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
import { NativeSemanticInteractionBridge } from "./native-semantic-interaction.js";
import { loadMacAgentConfiguration } from "./configuration.js";
import { BoundedOperationalLog } from "./operational-log.js";
import { createElectronUpdateAdapter } from "./electron-update-adapter.js";
import { isDeveloperIdSigned } from "./code-signing.js";
import {
  MacAgentUpdateRuntime,
  productionUpdateEnabled,
  type MacAgentUpdateAdapter,
} from "./update-runtime.js";
import {
  connectionStateFor,
  maskDeviceId,
  resolveAgentResource,
  type MacAgentConnectionState,
} from "./product-runtime.js";

app.setName("Athena Mac Agent");
const environment = loadMacAgentConfiguration({
  isPackaged: app.isPackaged,
  packagedConfigPath: path.join(process.resourcesPath, "mac-agent.config.json"),
  environment: process.env,
  loadDevelopmentEnv: () => {
    try {
      process.loadEnvFile?.(".env");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  },
});

const resourcePath = (relativePath: string) =>
  resolveAgentResource({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    moduleDirectory: __dirname,
    relativePath: app.isPackaged
      ? relativePath
      : relativePath.startsWith("native/")
        ? `dist-native/${relativePath.slice("native/".length)}`
        : `build-resources/${relativePath.slice("assets/".length)}`,
  });

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
    captureAppBundlePath: resourcePath("native/AlexaWhisperCapture.app"),
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
let tray: Tray | null = null;
let sleeping = false;
let revokedLocally = false;
let lastLoggedConnectionState: MacAgentConnectionState | null = null;
let operationalLog: BoundedOperationalLog;
let updateRuntime: MacAgentUpdateRuntime | null = null;
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
    fetch,
    (status) => {
      const state = connectionStateFor(status);
      if (state !== lastLoggedConnectionState) {
        lastLoggedConnectionState = state;
        void operationalLog?.record({
          category: "connection",
          event: `CONNECTION_${state}`,
          detail:
            state === "ONLINE"
              ? "Canonical backend connection is healthy."
              : `Transport state changed to ${state}.`,
        });
      }
      if (state === "DEVICE_REVOKED" && !revokedLocally) {
        revokedLocally = true;
        if (persistedMetadata) {
          persistedMetadata = { ...persistedMetadata, trustStatus: "REVOKED" };
          void deviceMetadataStore.save(persistedMetadata).catch(() => undefined);
        }
        executionClient?.stop();
        void operationalLog?.record({
          category: "device",
          event: "DEVICE_REVOKED",
          detail: "Execution stopped; explicit re-pairing is required.",
        });
      }
      rebuildTrayMenu();
    },
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

const currentConnectionState = (): MacAgentConnectionState => {
  if (persistedMetadata?.trustStatus === "REVOKED" || revokedLocally)
    return "DEVICE_REVOKED";
  if (
    !persistedIdentity ||
    !persistedMetadata ||
    persistedMetadata.trustStatus !== "TRUSTED"
  )
    return "AUTH_REQUIRED";
  if (!executionClient) return sleeping ? "OFFLINE" : "OFFLINE";
  return connectionStateFor(executionClient.status);
};

const mediaPermission = (mediaType: "camera" | "microphone" | "screen") => {
  if (process.platform !== "darwin") return "UNKNOWN" as const;
  const status = systemPreferences.getMediaAccessStatus(mediaType);
  if (status === "granted") return "GRANTED" as const;
  if (["denied", "restricted", "not-determined"].includes(status))
    return "NOT_GRANTED" as const;
  return "UNKNOWN" as const;
};

const nativeHelperPaths = () => [
  resourcePath("native/AlexaActiveContext.app"),
  resourcePath("native/AlexaInteraction.app"),
  resourcePath("native/AlexaVoiceSTT.app"),
  resourcePath("native/AlexaWhisperCapture.app"),
];

const productStatus = () => {
  const helperCount = nativeHelperPaths().filter(existsSync).length;
  const state = currentConnectionState();
  const capabilityCount = nativeProviderHost
    ? nativeProviderHost
        .status(isAccessibilityTrusted())
        .providerImplementations.reduce(
          (total, provider) => total + provider.implementedCapabilities.length,
          0,
        )
    : 0;
  return MacAgentProductStatusSchema.parse({
    appName: "Alexa Mac Agent",
    appVersion: app.getVersion(),
    buildVersion: process.env.ALEXA_MAC_AGENT_BUILD_NUMBER ?? app.getVersion(),
    environment: environment.ALEXA_AGENT_ENVIRONMENT,
    connectionState: state,
    backend: environment.ALEXA_API_BASE_URL,
    deviceName: persistedMetadata?.deviceName ?? os.hostname(),
    maskedDeviceId: maskDeviceId(persistedMetadata?.deviceId),
    launchAtLogin: app.getLoginItemSettings().openAtLogin,
    lastSuccessfulConnectionAt:
      executionClient?.status.lastSuccessfulConnectionAt ?? null,
    lastHeartbeatAt: executionClient?.status.lastHeartbeatAt ?? null,
    capabilityCount,
    nativeHelperStatus:
      helperCount === nativeHelperPaths().length
        ? "READY"
        : helperCount > 0
          ? "PARTIAL"
          : "UNAVAILABLE",
    realtimeStatus: sleeping
      ? "SUSPENDED"
      : state === "ONLINE"
        ? "ACTIVE"
        : state === "RECONNECTING" || state === "CONNECTING"
          ? "RECONNECTING"
          : "INACTIVE",
    permissions: {
      accessibility: isAccessibilityTrusted() ? "GRANTED" : "NOT_GRANTED",
      automation: "NOT_REQUIRED",
      screenRecording: "NOT_REQUIRED",
      microphone: mediaPermission("microphone"),
      camera: mediaPermission("camera"),
      notifications: "NOT_REQUIRED",
    },
    update: updateRuntime?.status ?? {
      enabled: false,
      phase: "IDLE",
      channel: environment.ALEXA_UPDATE_CHANNEL,
      currentVersion: app.getVersion(),
      availableVersion: null,
      downloadPercent: null,
      lastCheckedAt: null,
      restartDeferred: false,
      message: "Production auto-update is disabled for this build.",
    },
  });
};

const connectionLabel: Record<MacAgentConnectionState, string> = {
  ONLINE: "Online",
  CONNECTING: "Connecting…",
  RECONNECTING: "Reconnecting…",
  OFFLINE: "Offline",
  AUTH_REQUIRED: "Authentication required",
  DEVICE_REVOKED: "Device revoked",
  ERROR: "Error",
};

const showMainWindow = async () => {
  if (!mainWindow || mainWindow.isDestroyed()) await createWindow();
  void app.dock?.show();
  mainWindow?.show();
  mainWindow?.focus();
};

const rebuildTrayMenu = () => {
  if (!tray) return;
  const status = productStatus();
  tray.setToolTip(`Athena Mac Agent — ${connectionLabel[status.connectionState]}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Athena Mac Agent", enabled: false },
      { label: `Status: ${connectionLabel[status.connectionState]}`, enabled: false },
      {
        label: `Connected to: ${status.environment === "production" ? "Athena Production" : "Athena Development"}`,
        enabled: false,
      },
      { label: `Device: ${status.deviceName}`, enabled: false },
      { type: "separator" },
      {
        label: "Open Athena",
        click: () => void shell.openExternal(environment.ALEXA_WEB_BASE_URL),
      },
      { label: "Diagnostics", click: () => void showMainWindow() },
      { label: "Permissions", click: () => void showMainWindow() },
      {
        label: "Launch at Login",
        type: "checkbox",
        checked: status.launchAtLogin,
        click: (item) => {
          app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true });
          rebuildTrayMenu();
        },
      },
      {
        label: "Reconnect",
        enabled: status.connectionState !== "DEVICE_REVOKED",
        click: () => executionClient?.reconnectNow(),
      },
      {
        label: "Check for Updates…",
        enabled: status.update.enabled && status.update.phase !== "CHECKING",
        click: () => void updateRuntime?.check(),
      },
      {
        label: "Download Update",
        visible: status.update.phase === "AVAILABLE",
        click: () => void updateRuntime?.download(),
      },
      {
        label: status.update.restartDeferred
          ? "Restart After Current Execution"
          : "Restart to Update",
        visible: ["DOWNLOADED", "RESTART_REQUIRED"].includes(status.update.phase),
        click: () => void updateRuntime?.restartAndInstall(),
      },
      { type: "separator" },
      { label: "Quit Athena Mac Agent", click: () => app.quit() },
    ]),
  );
};

const createTray = () => {
  const pathname = resourcePath("assets/trayTemplate.png");
  const image = nativeImage.createFromPath(pathname);
  image.setTemplateImage(true);
  tray = new Tray(image.resize({ width: 18, height: 18 }));
  tray.on("click", () => void showMainWindow());
  rebuildTrayMenu();
};

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
  nativeActiveContext = new NativeActiveContextSession(
    (observation) => {
      if (activeContextUpdatePending || !persistedIdentity || !persistedMetadata)
        return;
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
    },
    () => undefined,
    resourcePath("native/AlexaActiveContext.app"),
  );
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
      version: app.getVersion(),
      apiEndpoint: environment.ALEXA_API_BASE_URL,
      deviceIdentityStatus:
        pendingPairing?.trustStatus.toLowerCase() ??
        persistedMetadata?.trustStatus.toLowerCase() ??
        "not_configured",
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

  ipcMain.handle(IPC_CHANNELS.getProductStatus, (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    return productStatus();
  });

  ipcMain.handle(IPC_CHANNELS.checkForUpdates, async (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    if (!updateRuntime) throw new Error("Update runtime is unavailable.");
    return updateRuntime.check();
  });

  ipcMain.handle(IPC_CHANNELS.downloadUpdate, async (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    if (!updateRuntime) throw new Error("Update runtime is unavailable.");
    return updateRuntime.download();
  });

  ipcMain.handle(IPC_CHANNELS.restartToUpdate, async (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    if (!updateRuntime) throw new Error("Update runtime is unavailable.");
    return updateRuntime.restartAndInstall();
  });

  ipcMain.handle(IPC_CHANNELS.setLaunchAtLogin, (_event, payload) => {
    const input = SetLaunchAtLoginInputSchema.parse(payload);
    app.setLoginItemSettings({ openAtLogin: input.enabled, openAsHidden: true });
    rebuildTrayMenu();
    return productStatus();
  });

  ipcMain.handle(IPC_CHANNELS.reconnect, (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    if (currentConnectionState() !== "DEVICE_REVOKED") {
      startExecutionClientIfReady();
      executionClient?.reconnectNow();
    }
    return productStatus();
  });

  ipcMain.handle(IPC_CHANNELS.openPermissionSettings, async (_event, payload) => {
    const input = OpenPermissionSettingsInputSchema.parse(payload);
    const settingsUrls = {
      accessibility:
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      automation:
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
      screenRecording:
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
      microphone:
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
      camera: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
      notifications:
        "x-apple.systempreferences:com.apple.Notifications-Settings.extension",
    } as const;
    await shell.openExternal(settingsUrls[input.permission]);
  });

  ipcMain.handle(IPC_CHANNELS.exportDiagnostics, async (_event, payload) => {
    EmptyIpcPayloadSchema.parse(payload);
    const options = {
      title: "Export Athena Mac Agent Diagnostics",
      defaultPath: `Athena-Mac-Agent-Diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    };
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath)
      return ExportDiagnosticsResultSchema.parse({ exported: false, pathname: null });
    const diagnostics = {
      generatedAt: new Date().toISOString(),
      product: productStatus(),
      capabilities: currentCapabilityStatus(),
      nativeProviderHost: nativeProviderHost?.status(isAccessibilityTrusted()) ?? null,
      events: await operationalLog.recent(100),
      security: {
        rendererSandboxed: true,
        nodeIntegration: false,
        contextIsolation: true,
        privilegedExecutionAvailable: false,
      },
    };
    await writeFile(result.filePath, JSON.stringify(diagnostics, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    return ExportDiagnosticsResultSchema.parse({
      exported: true,
      pathname: result.filePath,
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
        deviceName: input.deviceName,
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
        ...(persistedMetadata?.deviceName
          ? { deviceName: persistedMetadata.deviceName }
          : {}),
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
      throw new Error("Configured Athena Control URL must use HTTP or HTTPS.");
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
      voiceOverlayWindow?.webContents.send(IPC_CHANNELS.nativeVoiceRecognitionEvent, {
        type: "error",
        code: "MIC_PERMISSION_DENIED",
      });
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
      if (
        fallbackStarted ||
        environment.DESKTOP_STT_FALLBACK_PROVIDER !== "apple_speech"
      ) {
        forward({ type: "error", code: "STT_PROVIDER_UNAVAILABLE" });
        return;
      }
      fallbackStarted = true;
      console.warn(
        `[desktop-stt] whisper.cpp unavailable; using Apple Speech fallback (${reason}).`,
      );
      nativeVoiceRecognition?.stop();
      nativeVoiceRecognition = new NativeSpeechRecognitionSession(
        (event) => forward(event),
        resourcePath("native/AlexaVoiceSTT.app"),
      );
      await nativeVoiceRecognition.start();
    };
    if (environment.DESKTOP_STT_PROVIDER === "apple_speech") {
      nativeVoiceRecognition = new NativeSpeechRecognitionSession(
        (event) => forward(event),
        resourcePath("native/AlexaVoiceSTT.app"),
      );
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
          (event.code === "STT_PROVIDER_UNAVAILABLE" ||
            event.code === "STT_TRANSCRIPTION_FAILED")
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

const createWindow = async (showOnReady = true) => {
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
    if (showOnReady && !window.isVisible()) window.show();
  });
  window.on("close", () => {
    app.dock?.hide();
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
    if (showOnReady) {
      void app.dock?.show();
      window.show();
      window.focus();
    } else {
      app.dock?.hide();
    }
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
  operationalLog = new BoundedOperationalLog(
    path.join(app.getPath("logs"), "alexa-mac-agent.jsonl"),
  );
  const updateEnabled = productionUpdateEnabled({
    isPackaged: app.isPackaged,
    developerIdSigned: isDeveloperIdSigned(app.getAppPath()),
    environment: environment.ALEXA_AGENT_ENVIRONMENT,
    provider: environment.ALEXA_UPDATE_PROVIDER,
    ...(environment.ALEXA_UPDATE_FEED_URL
      ? { feedUrl: environment.ALEXA_UPDATE_FEED_URL }
      : {}),
  });
  const disabledAdapter: MacAgentUpdateAdapter = {
    subscribe: () => () => undefined,
    checkForUpdates: () => Promise.resolve(),
    downloadUpdate: () => Promise.resolve(),
    quitAndInstall: () => undefined,
  };
  updateRuntime = new MacAgentUpdateRuntime({
    enabled: updateEnabled,
    channel: environment.ALEXA_UPDATE_CHANNEL,
    currentVersion: app.getVersion(),
    adapter: updateEnabled
      ? createElectronUpdateAdapter({
          feedUrl: environment.ALEXA_UPDATE_FEED_URL!,
          channel: environment.ALEXA_UPDATE_CHANNEL,
        })
      : disabledAdapter,
    isExecutionActive: () => Boolean(executionClient?.status.currentExecutionRequestId),
    onChanged: () => rebuildTrayMenu(),
    record: (event, detail) =>
      operationalLog.record({
        category: "update",
        event,
        ...(detail ? { detail } : {}),
      }),
  });
  nativeProviderHost = new MacNativeProviderHost(
    undefined,
    undefined,
    {
      downloads: () => app.getPath("downloads"),
      desktop: () => app.getPath("desktop"),
    },
    new NativeSemanticInteractionBridge(resourcePath("native/AlexaInteraction.app")),
  );
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
  createTray();
  if (updateEnabled && environment.ALEXA_UPDATE_AUTO_CHECK) {
    updateRuntime.scheduleAutomaticChecks(
      60_000,
      environment.ALEXA_UPDATE_CHECK_INTERVAL_HOURS * 60 * 60 * 1_000,
    );
  }
  const requiresOnboarding =
    !persistedIdentity ||
    !persistedMetadata ||
    persistedMetadata.trustStatus !== "TRUSTED";
  if (requiresOnboarding) await createWindow(true);
  else app.dock?.hide();
  await operationalLog.record({
    category: "device",
    event: "AGENT_STARTED",
    detail: `${app.isPackaged ? "Packaged" : "Development"} ${app.getVersion()}`,
  });
  globalShortcut.register("Alt+Space", () => {
    void showVoiceOverlay("shortcut");
  });

  app.on("window-all-closed", () => {
    app.dock?.hide();
  });

  app.on("will-quit", () => {
    nativeVoiceRecognition?.stop();
    nativeActiveContext?.stop();
    executionClient?.stop();
    updateRuntime?.dispose();
    tray?.destroy();
    tray = null;
    globalShortcut.unregisterAll();
  });

  powerMonitor.on("suspend", () => {
    sleeping = true;
    executionClient?.suspend();
    nativeActiveContext?.stop();
    nativeActiveContext = null;
    rebuildTrayMenu();
  });

  powerMonitor.on("resume", () => {
    sleeping = false;
    executionClient?.resume();
    startActiveContextIfReady();
    if (persistedMetadata?.trustStatus === "TRUSTED")
      void syncApplicationDiscovery("mac_agent_startup").catch(() => undefined);
    rebuildTrayMenu();
  });

  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      void showMainWindow();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
};

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => void showMainWindow());
  void startAgent().catch((error: unknown) => {
    console.error("Mac agent failed to start.", error);
    app.quit();
  });
}

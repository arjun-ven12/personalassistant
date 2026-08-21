import { contextBridge, ipcRenderer } from "electron";

import {
  AgentConnectionResultSchema,
  AgentDiagnosticsSchema,
  AgentPairingStatusSchema,
  BeginPairingInputSchema,
  CapabilityStatusSchema,
  IPC_CHANNELS,
  LocalExecutionResultSchema,
  DeviceIdentityStatusSchema,
  ResetLocalDeviceIdentityInputSchema,
  ResetLocalDeviceIdentityResponseSchema,
  ConfirmWorkspaceMappingsResponseSchema,
  NativeSpatialGestureInputSchema,
  NativeSpatialStartInputSchema,
  NativeSpatialStatusSchema,
  NativeCapabilityDispatchRequestSchema,
  ApplicationDiscoverySyncResultSchema,
  NativeProviderExecutionResultSchema,
  NativeProviderHostStatusSchema,
  VoiceOverlayActivationSchema,
  NativeVoiceRecognitionEventSchema,
  type AlexaAgentApi,
} from "./contracts.js";
import {
  DeviceVoiceRuntimePayloadSchema,
  VoiceDashboardResponseSchema,
  VoiceTranscriptResponseSchema,
  VoiceTurnCancellationResponseSchema,
  VoiceCaptureLeaseResponseSchema,
  ActiveContextResponseSchema,
} from "@alexa-control/shared";

const api: AlexaAgentApi = {
  testApiConnection: async () =>
    AgentConnectionResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.testApiConnection),
    ),
  testSecureApiConnection: async () =>
    AgentConnectionResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.testSecureApiConnection),
    ),
  getAgentDiagnostics: async () =>
    AgentDiagnosticsSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.getAgentDiagnostics),
    ),
  disableLocalExecution: async () =>
    LocalExecutionResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.disableLocalExecution),
    ),
  getCapabilityStatus: async () =>
    CapabilityStatusSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.getCapabilityStatus),
    ),
  beginPairing: async (input) =>
    AgentPairingStatusSchema.parse(
      await ipcRenderer.invoke(
        IPC_CHANNELS.beginPairing,
        BeginPairingInputSchema.parse(input),
      ),
    ),
  getPairingStatus: async () =>
    AgentPairingStatusSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.getPairingStatus),
    ),
  getDeviceIdentityStatus: async () =>
    DeviceIdentityStatusSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.getDeviceIdentityStatus),
    ),
  resetLocalDeviceIdentity: async (input) =>
    ResetLocalDeviceIdentityResponseSchema.parse(
      await ipcRenderer.invoke(
        IPC_CHANNELS.resetLocalDeviceIdentity,
        ResetLocalDeviceIdentityInputSchema.parse(input),
      ),
    ),
  confirmWorkspaceMappings: async () =>
    ConfirmWorkspaceMappingsResponseSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.confirmWorkspaceMappings),
    ),
  getNativeSpatialStatus: async () =>
    NativeSpatialStatusSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.getNativeSpatialStatus),
    ),
  startNativeSpatialRuntime: async (input = {}) =>
    NativeSpatialStatusSchema.parse(
      await ipcRenderer.invoke(
        IPC_CHANNELS.startNativeSpatialRuntime,
        NativeSpatialStartInputSchema.parse(input),
      ),
    ),
  stopNativeSpatialRuntime: async () =>
    NativeSpatialStatusSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.stopNativeSpatialRuntime),
    ),
  submitNativeSpatialGesture: async (input) =>
    NativeSpatialStatusSchema.parse(
      await ipcRenderer.invoke(
        IPC_CHANNELS.submitNativeSpatialGesture,
        NativeSpatialGestureInputSchema.parse(input),
      ),
    ),
  getNativeProviderHostStatus: async () =>
    NativeProviderHostStatusSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.getNativeProviderHostStatus),
    ),
  executeNativeProviderCapability: async (input) =>
    NativeProviderExecutionResultSchema.parse(
      await ipcRenderer.invoke(
        IPC_CHANNELS.executeNativeProviderCapability,
        NativeCapabilityDispatchRequestSchema.parse(input),
      ),
    ),
  refreshApplicationDiscovery: async () =>
    ApplicationDiscoverySyncResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.refreshApplicationDiscovery),
    ),
  showVoiceOverlay: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.showVoiceOverlay);
  },
  hideVoiceOverlay: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.hideVoiceOverlay);
  },
  startOverlayVoiceSession: async () =>
    VoiceDashboardResponseSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.startOverlayVoiceSession),
    ),
  submitOverlayVoiceTranscript: async (input) =>
    VoiceTranscriptResponseSchema.parse(
      await ipcRenderer.invoke(
        IPC_CHANNELS.submitOverlayVoiceTranscript,
        DeviceVoiceRuntimePayloadSchema.parse(input),
      ),
    ),
  cancelOverlayVoiceTurn: async (input) =>
    VoiceTurnCancellationResponseSchema.parse(
      await ipcRenderer.invoke(
        IPC_CHANNELS.cancelOverlayVoiceTurn,
        DeviceVoiceRuntimePayloadSchema.parse(input),
      ),
    ),
  manageOverlayVoiceCaptureLease: async (input) =>
    VoiceCaptureLeaseResponseSchema.parse(
      await ipcRenderer.invoke(
        IPC_CHANNELS.manageOverlayVoiceCaptureLease,
        DeviceVoiceRuntimePayloadSchema.parse(input),
      ),
    ),
  startNativeVoiceRecognition: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.startNativeVoiceRecognition);
  },
  stopNativeVoiceRecognition: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.stopNativeVoiceRecognition);
  },
  onNativeVoiceRecognitionEvent: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) =>
      listener(NativeVoiceRecognitionEventSchema.parse(payload));
    ipcRenderer.on(IPC_CHANNELS.nativeVoiceRecognitionEvent, wrapped);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.nativeVoiceRecognitionEvent, wrapped);
  },
  onVoiceOverlayActivation: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) =>
      listener(VoiceOverlayActivationSchema.parse(payload));
    ipcRenderer.on(IPC_CHANNELS.voiceOverlayActivated, wrapped);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.voiceOverlayActivated, wrapped);
  },
  getActiveContext: async () =>
    ActiveContextResponseSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.getActiveContext),
    ),
  onActiveContextChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) =>
      listener(ActiveContextResponseSchema.parse(payload));
    ipcRenderer.on(IPC_CHANNELS.activeContextChanged, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.activeContextChanged, wrapped);
  },
};

contextBridge.exposeInMainWorld("alexaAgent", Object.freeze(api));

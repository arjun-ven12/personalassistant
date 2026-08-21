import { type FormEvent, useEffect, useRef, useState } from "react";

import type {
  AgentConnectionResult,
  AgentDiagnostics,
  AgentPairingStatus,
  CapabilityStatus,
  DeviceIdentityStatus,
  NativeProviderHostStatus,
  NativeSpatialStatus,
} from "../electron/contracts.js";
import {
  NativeSpatialRuntime,
  type NativeSpatialFrame,
  type NativeSpatialGesture,
} from "./nativeSpatialRuntime.js";
import { VoiceOverlay } from "./VoiceOverlay.js";

const AgentControlApp = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const runtimeRef = useRef<NativeSpatialRuntime | null>(null);
  const [diagnostics, setDiagnostics] = useState<AgentDiagnostics | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityStatus>({});
  const [connection, setConnection] = useState<AgentConnectionResult | null>(null);
  const [pairing, setPairing] = useState<AgentPairingStatus | null>(null);
  const [identity, setIdentity] = useState<DeviceIdentityStatus | null>(null);
  const [nativeProviderHost, setNativeProviderHost] =
    useState<NativeProviderHostStatus | null>(null);
  const [applicationTargetKey, setApplicationTargetKey] = useState("");
  const [nativeSpatial, setNativeSpatial] = useState<NativeSpatialStatus | null>(null);
  const [nativeFrame, setNativeFrame] = useState<NativeSpatialFrame>({
    state: "idle",
    fps: 0,
    latencyMs: 0,
    gesture: "none",
    confidence: 0,
    handedness: "unknown",
    cursor: null,
    landmarks: [],
    message: "Native spatial runtime is idle.",
  });
  const [nativeSpatialError, setNativeSpatialError] = useState<string | null>(null);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([
    "Agent shell started with governed signed execution transport pending trust.",
    "No macOS permissions requested.",
  ]);

  const addLog = (message: string) => {
    setLogs((current) => [
      `${new Date().toLocaleTimeString()} · ${message}`,
      ...current,
    ]);
  };

  useEffect(() => {
    void Promise.all([
      window.alexaAgent.getAgentDiagnostics(),
      window.alexaAgent.getCapabilityStatus(),
      window.alexaAgent.getDeviceIdentityStatus(),
      window.alexaAgent.getNativeSpatialStatus(),
      window.alexaAgent.getNativeProviderHostStatus(),
    ])
      .then(
        ([
          nextDiagnostics,
          nextCapabilities,
          nextIdentity,
          nextNative,
          nextProviderHost,
        ]) => {
          setDiagnosticError(null);
          setDiagnostics(nextDiagnostics);
          setCapabilities(nextCapabilities);
          setIdentity(nextIdentity);
          setNativeSpatial(nextNative);
          setNativeProviderHost(nextProviderHost);
        },
      )
      .catch((error: unknown) => {
        setDiagnosticError(
          error instanceof Error
            ? error.message
            : "Mac Agent diagnostics failed to load.",
        );
        addLog("Mac Agent diagnostics failed to load.");
      });
    return () => {
      runtimeRef.current?.stop();
      runtimeRef.current = null;
      void window.alexaAgent.stopNativeSpatialRuntime();
    };
  }, []);

  const submitNativeGesture = async (gesture: NativeSpatialGesture) => {
    const applicationTarget = nativeProviderHost?.providerImplementations
      .flatMap((provider) =>
        provider.implementedCapabilities
          .filter((capability) => capability === "launch" || capability === "focus")
          .map((capability) => ({
            providerId: provider.providerId,
            applicationId: provider.applicationId,
            capability,
          })),
      )
      .find(
        (target) =>
          `${target.providerId}:${target.applicationId}:${target.capability}` ===
          applicationTargetKey,
      );
    const result = await window.alexaAgent.submitNativeSpatialGesture({
      gesture: gesture.gesture,
      confidence: gesture.confidence,
      handedness: gesture.handedness,
      state: "confirmed",
      ...(nativeSpatial?.activeSessionId
        ? { sessionId: nativeSpatial.activeSessionId }
        : {}),
      ...(gesture.cursor ? { cursor: gesture.cursor } : {}),
      ...(applicationTarget ? { applicationTarget } : {}),
    });
    setNativeSpatial(result);
    addLog(
      result.lastIntentCreated
        ? applicationTarget && gesture.gesture === "pinch"
          ? `Native pinch was routed to ${applicationTarget.capability} ${applicationTarget.applicationId}; server trust and provider policy still apply.`
          : `Native gesture ${gesture.gesture} was signed and routed to the Intent Engine.`
        : `Native gesture ${gesture.gesture} was signed but no intent was created.`,
    );
  };

  const startNativeSpatial = async () => {
    if (!videoRef.current || runtimeRef.current) return;
    setNativeSpatialError(null);
    const status = await window.alexaAgent.startNativeSpatialRuntime({
      providerId: "native.browser.media-devices",
    });
    setNativeSpatial(status);
    const runtime = new NativeSpatialRuntime({
      onFrame: setNativeFrame,
      onGesture: (gesture) => void submitNativeGesture(gesture),
      onError: setNativeSpatialError,
    });
    runtimeRef.current = runtime;
    await runtime.start(videoRef.current);
    addLog("Native spatial runtime requested camera access.");
  };

  const stopNativeSpatial = async () => {
    runtimeRef.current?.stop();
    runtimeRef.current = null;
    const status = await window.alexaAgent.stopNativeSpatialRuntime();
    setNativeSpatial(status);
    addLog("Native spatial runtime stopped and camera tracks were released.");
  };

  const testConnection = async () => {
    addLog("Testing the fixed API health endpoint.");
    const result = await window.alexaAgent.testSecureApiConnection();
    setConnection(result);
    addLog(result.message);
  };

  const resetIdentity = async () => {
    if (
      !window.confirm(
        "Reset this assistant device identity? The existing device must be revoked and paired again.",
      )
    ) {
      return;
    }
    await window.alexaAgent.resetLocalDeviceIdentity({ confirmed: true });
    setIdentity(await window.alexaAgent.getDeviceIdentityStatus());
    setPairing(null);
    addLog("Assistant-owned local identity reset. Re-pairing is required.");
  };

  const disableExecution = async () => {
    const result = await window.alexaAgent.disableLocalExecution();
    const nextDiagnostics = await window.alexaAgent.getAgentDiagnostics();
    setDiagnostics(nextDiagnostics);
    addLog(
      result.executionEnabled
        ? "Unexpected execution state."
        : "Local execution disabled.",
    );
  };

  const confirmWorkspaceMappings = async () => {
    const result = await window.alexaAgent.confirmWorkspaceMappings();
    setIdentity(await window.alexaAgent.getDeviceIdentityStatus());
    addLog(
      `Workspace mappings confirmed at ${new Date(result.confirmedAt).toLocaleString()}.`,
    );
  };

  const beginPairing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pairingCode = form.get("pairingCode");
    const deviceName = form.get("deviceName");
    addLog("Submitting a fixed-endpoint pairing request.");
    const result = await window.alexaAgent.beginPairing({
      pairingCode: typeof pairingCode === "string" ? pairingCode.toUpperCase() : "",
      deviceName: typeof deviceName === "string" ? deviceName : "",
    });
    setPairing(result);
    addLog(result.message);
    setDiagnostics(await window.alexaAgent.getAgentDiagnostics());
    setIdentity(await window.alexaAgent.getDeviceIdentityStatus());
  };

  const refreshPairing = async () => {
    const result = await window.alexaAgent.getPairingStatus();
    setPairing(result);
    addLog(result.message);
    setDiagnostics(await window.alexaAgent.getAgentDiagnostics());
    setIdentity(await window.alexaAgent.getDeviceIdentityStatus());
  };

  return (
    <main className="agent-shell">
      <header className="agent-header">
        <div>
          <p className="eyebrow">Local secure shell</p>
          <h1>{diagnostics?.agentName ?? "Alexa Control Mac Agent"}</h1>
          <p>
            Trusted applications can be launched or focused through finite signed
            provider capabilities. Generic operating-system control remains unavailable.
          </p>
        </div>
        <div className={`agent-state ${diagnostics?.executionEnabled ? "active" : ""}`}>
          <span aria-hidden="true" />
          {diagnostics?.executionEnabled
            ? "Signed execution enabled"
            : "Execution disabled"}
        </div>
      </header>

      {diagnosticError ? (
        <section className="pairing-result" role="alert">
          <strong>Diagnostics failed to load</strong>
          <span>{diagnosticError}</span>
        </section>
      ) : null}

      <section className="diagnostic-grid" aria-label="Agent diagnostics">
        <article>
          <span>Version</span>
          <strong>{diagnostics?.version ?? "0.1.0"}</strong>
        </article>
        <article>
          <span>API endpoint</span>
          <strong>{diagnostics?.apiEndpoint ?? "Loading…"}</strong>
        </article>
        <article>
          <span>Connection</span>
          <strong>{connection?.status ?? "not tested"}</strong>
        </article>
        <article>
          <span>API HTTPS</span>
          <strong>
            {connection ? (connection.https ? "yes" : "no") : "not tested"}
          </strong>
        </article>
        <article>
          <span>Device identity</span>
          <strong>
            {identity?.trustStatus ??
              diagnostics?.deviceIdentityStatus ??
              "not_configured"}
          </strong>
        </article>
        <article>
          <span>Private network</span>
          <strong>{diagnostics?.privateNetworkStatus ?? "unknown"}</strong>
        </article>
        <article>
          <span>Execution</span>
          <strong>{diagnostics?.executionEnabled ? "enabled" : "disabled"}</strong>
        </article>
        <article>
          <span>Read-only polling</span>
          <strong>{diagnostics?.pollingState ?? "unavailable"}</strong>
        </article>
        <article>
          <span>Read-only capability</span>
          <strong>{diagnostics?.readOnlyCapabilityExecution ?? "unavailable"}</strong>
        </article>
        <article>
          <span>Native spatial</span>
          <strong>{nativeSpatial?.state ?? "idle"}</strong>
        </article>
        <article>
          <span>Camera permission</span>
          <strong>{nativeSpatial?.cameraPermission ?? "not_requested"}</strong>
        </article>
        <article>
          <span>Current request</span>
          <strong>{diagnostics?.currentExecutionRequestId ?? "none"}</strong>
        </article>
        <article>
          <span>Last poll</span>
          <strong>
            {diagnostics?.lastPollAt
              ? new Date(diagnostics.lastPollAt).toLocaleTimeString()
              : "none"}
          </strong>
        </article>
        <article>
          <span>Last execution failure</span>
          <strong>{diagnostics?.lastExecutionFailureCode ?? "none"}</strong>
        </article>
        <article>
          <span>Last heartbeat</span>
          <strong>
            {diagnostics?.lastHeartbeatAt
              ? new Date(diagnostics.lastHeartbeatAt).toLocaleTimeString()
              : "none"}
          </strong>
        </article>
      </section>

      <section className="native-spatial-panel">
        <div className="native-spatial-copy">
          <p className="eyebrow">Phase 14B</p>
          <h2>Native Spatial Runtime</h2>
          <p>
            Electron performs local hand tracking and submits only signed gesture
            metadata. A confirmed pinch can launch or focus the selected registered
            application after the server verifies its trusted metadata, permissions,
            provider health, and policy. The runtime never injects raw mouse or keyboard
            input or bypasses the Desktop Capability Layer.
          </p>
          <label className="native-target-select">
            <span>Pinch application target</span>
            <select
              aria-label="Pinch application target"
              onChange={(event) => setApplicationTargetKey(event.target.value)}
              value={applicationTargetKey}
            >
              <option value="">Intent mapping only</option>
              {nativeProviderHost?.providerImplementations.flatMap((provider) =>
                provider.implementedCapabilities
                  .filter(
                    (capability) => capability === "launch" || capability === "focus",
                  )
                  .map((capability) => {
                    const value = `${provider.providerId}:${provider.applicationId}:${capability}`;
                    return (
                      <option key={value} value={value}>
                        {capability === "launch" ? "Launch" : "Focus"}{" "}
                        {provider.applicationId}
                      </option>
                    );
                  }),
              )}
            </select>
            <small>
              Selection is inert unless the application is trusted in server metadata
              and its reviewed provider is healthy.
            </small>
          </label>
          <div className="control-row compact-controls">
            <button
              disabled={
                nativeFrame.state === "tracking" ||
                nativeFrame.state === "initializing" ||
                nativeFrame.state === "requesting_permission"
              }
              onClick={() => void startNativeSpatial()}
              type="button"
            >
              Start native tracking
            </button>
            <button
              className="secondary-button"
              disabled={nativeFrame.state === "idle" || nativeFrame.state === "stopped"}
              onClick={() => void stopNativeSpatial()}
              type="button"
            >
              Stop and release camera
            </button>
          </div>
          {nativeSpatialError ? (
            <p className="native-error">{nativeSpatialError}</p>
          ) : null}
          <dl>
            <div>
              <dt>Gesture</dt>
              <dd>{nativeFrame.gesture}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{Math.round(nativeFrame.confidence * 100)}%</dd>
            </div>
            <div>
              <dt>FPS</dt>
              <dd>{nativeFrame.fps}</dd>
            </div>
            <div>
              <dt>Latency</dt>
              <dd>{nativeFrame.latencyMs}ms</dd>
            </div>
          </dl>
        </div>
        <div className="native-camera-stage">
          <video ref={videoRef} aria-label="Native spatial camera preview" />
          <div className="native-spatial-hud" aria-hidden="true">
            {nativeFrame.landmarks.map((point, index) => (
              <span
                className="native-landmark"
                key={`${index}-${point.x}-${point.y}`}
                style={{
                  left: `${(1 - point.x) * 100}%`,
                  top: `${point.y * 100}%`,
                }}
              />
            ))}
            {nativeFrame.cursor ? (
              <span
                className="native-cursor"
                style={{
                  left: `${nativeFrame.cursor.x * 100}%`,
                  top: `${nativeFrame.cursor.y * 100}%`,
                }}
              />
            ) : null}
            <span className="native-hud-label">{nativeFrame.message}</span>
          </div>
        </div>
      </section>

      <section className="native-spatial-panel">
        <div className="native-spatial-copy">
          <p className="eyebrow">Phase 17H</p>
          <h2>Reviewed Native Provider Host</h2>
          <p>
            The existing Mac Agent hosts finite reviewed provider operations. It reports
            coverage and permission health, but exposes no raw shell, AppleScript,
            Accessibility, keyboard, mouse, OCR, screenshot, or coordinate automation.
          </p>
          <dl>
            <div>
              <dt>Host</dt>
              <dd>{nativeProviderHost?.available ? "available" : "unavailable"}</dd>
            </div>
            <div>
              <dt>Native bridge</dt>
              <dd>{nativeProviderHost?.nativeBridgeStatus ?? "not_required"}</dd>
            </div>
            <div>
              <dt>Accessibility</dt>
              <dd>
                {nativeProviderHost?.accessibilityTrusted
                  ? "trusted"
                  : "not trusted / not requested"}
              </dd>
            </div>
            <div>
              <dt>Raw automation</dt>
              <dd>unavailable</dd>
            </div>
          </dl>
        </div>
        <div className="capability-grid">
          {nativeProviderHost?.providerImplementations.map((provider) => (
            <article key={provider.providerId}>
              <strong>{provider.providerId}</strong>
              <span>
                {provider.implementedCapabilities.length} implemented ·{" "}
                {provider.unsupportedCapabilities.length} fail closed
              </span>
              <span className="capability-status capability-status-available">
                {provider.implementedCapabilities.join(", ") || "none"}
              </span>
            </article>
          )) ?? (
            <article>
              <strong>Provider host</strong>
              <span>No provider diagnostics loaded.</span>
            </article>
          )}
        </div>
      </section>

      <section className="control-row" aria-label="Safe agent controls">
        <button onClick={() => void testConnection()} type="button">
          Test API connection
        </button>
        <button
          className="danger-button"
          onClick={() => void disableExecution()}
          type="button"
        >
          Disable execution locally
        </button>
        <button
          className="secondary-button"
          onClick={() => void confirmWorkspaceMappings()}
          type="button"
        >
          Confirm workspace mappings
        </button>
      </section>

      <section className="pairing-panel">
        <div>
          <p className="eyebrow">Device identity</p>
          <h2>Secure pairing</h2>
          <p>
            Enter the short-lived one-use code from Dashboard → Devices. The Ed25519
            private key remains in this isolated main process and is never sent through
            IPC or to the API.
          </p>
        </div>
        <form onSubmit={(event) => void beginPairing(event)}>
          <label>
            Device name
            <input defaultValue="Owner Mac" name="deviceName" required type="text" />
          </label>
          <label>
            Pairing code
            <input
              autoCapitalize="characters"
              maxLength={8}
              minLength={8}
              name="pairingCode"
              pattern="[A-Za-z0-9]{8}"
              required
              type="text"
            />
          </label>
          <button type="submit">Request pairing</button>
          <button
            className="secondary-button"
            onClick={() => void refreshPairing()}
            type="button"
          >
            Check status
          </button>
          <button
            className="danger-button"
            onClick={() => void resetIdentity()}
            type="button"
          >
            Reset local identity and re-pair
          </button>
        </form>
        {pairing ? (
          <div className="pairing-result" aria-live="polite">
            <strong>{pairing.trustStatus ?? "NOT CONFIGURED"}</strong>
            <span>{pairing.message}</span>
            {pairing.fingerprint ? <code>{pairing.fingerprint}</code> : null}
          </div>
        ) : null}
        {identity ? (
          <div className="pairing-result">
            <strong>Key storage: {identity.keyStorageStatus}</strong>
            {identity.deviceId ? <span>Device ID: {identity.deviceId}</span> : null}
            {identity.fingerprint ? <code>{identity.fingerprint}</code> : null}
            {identity.serverExecutionKeyFingerprint ? (
              <span>Server key: {identity.serverExecutionKeyFingerprint}</span>
            ) : null}
            {identity.workspaceMappingsConfirmedAt ? (
              <span>
                Workspace mappings confirmed:{" "}
                {new Date(identity.workspaceMappingsConfirmedAt).toLocaleString()}
              </span>
            ) : null}
            <span>Privileged execution unavailable</span>
          </div>
        ) : null}
      </section>

      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Capability boundary</p>
            <h2>Guarded local capabilities</h2>
          </div>
          <span>{Object.keys(capabilities).length} guarded capabilities</span>
        </div>
        <div className="capability-grid">
          {Object.entries(capabilities).map(([name, status]) => (
            <article key={name}>
              <strong>{name}</strong>
              <span className={`capability-status capability-status-${status}`}>
                {status.replace("_", " ")}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="lower-grid">
        <article className="panel">
          <p className="eyebrow">Diagnostics</p>
          <h2>Security posture</h2>
          <dl>
            <div>
              <dt>Renderer isolation</dt>
              <dd>Enabled</dd>
            </div>
            <div>
              <dt>Node integration</dt>
              <dd>Disabled</dd>
            </div>
            <div>
              <dt>Sandbox</dt>
              <dd>Enabled</dd>
            </div>
            <div>
              <dt>Permission requests</dt>
              <dd>None</dd>
            </div>
          </dl>
        </article>
        <article className="panel">
          <p className="eyebrow">Development log</p>
          <h2>Local events</h2>
          <ol className="log-list">
            {logs.map((log, index) => (
              <li key={`${index}-${log}`}>{log}</li>
            ))}
          </ol>
        </article>
      </section>
    </main>
  );
};

export const AgentApp = () =>
  new URLSearchParams(window.location.search).get("view") === "voice-overlay" ? (
    <VoiceOverlay />
  ) : (
    <AgentControlApp />
  );

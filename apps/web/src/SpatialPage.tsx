import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  CircleStop,
  Crosshair,
  Gauge,
  Hand,
  History,
  Layers3,
  Play,
  RefreshCcw,
  Route,
  ShieldCheck,
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";

import type { GestureName, GestureMappingRecord } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";
import { usePersistentSpatialRuntime } from "./PersistentSpatialRuntime.js";

const stateClass = (state: string) =>
  ["available", "tracking", "completed", "granted", "active"].includes(state)
    ? "success-text"
    : ["idle", "calibrating", "not_requested"].includes(state)
      ? "warning-text"
      : "danger-text";

const configurableGestures = [
  "open_palm",
  "pinch",
  "grab",
  "peace_sign",
  "thumbs_up",
] as const satisfies GestureName[];

const dashboardActions = [
  {
    label: "Open Command Center",
    target: "dashboard:/commands",
    intentTemplate: "Open the command center and show available governed actions.",
  },
  {
    label: "Open Security",
    target: "dashboard:/security",
    intentTemplate: "Show emergency stop controls and current security posture.",
  },
  {
    label: "Open Agents",
    target: "dashboard:/agents",
    intentTemplate: "Show the agent command center and current agent activity.",
  },
  {
    label: "Open Workflows",
    target: "dashboard:/workflows",
    intentTemplate: "Show active workflows and workflow progress.",
  },
  {
    label: "Open Approvals",
    target: "dashboard:/approvals",
    intentTemplate: "Show pending approvals and governed review requests.",
  },
  {
    label: "Open Tasks",
    target: "dashboard:/tasks",
    intentTemplate: "Show tasks, routines, and scheduled work.",
  },
  {
    label: "Open Memory",
    target: "dashboard:/memory",
    intentTemplate: "Show cognitive memory and recent learned context.",
  },
  {
    label: "Open Repositories",
    target: "dashboard:/repositories",
    intentTemplate: "Show registered repositories and repository intelligence.",
  },
  {
    label: "Open Dashboard",
    target: "dashboard:/",
    intentTemplate: "Open the main dashboard.",
  },
  {
    label: "Intent only / no local navigation",
    target: "intent_engine",
    intentTemplate:
      "Record this gesture as a governed intent without local navigation.",
  },
];

type ConfigurableGesture = (typeof configurableGestures)[number];

interface GestureMappingDraft {
  gesture: ConfigurableGesture;
  target: string;
  intentTemplate: string;
  safetyLevel: "informational" | "read_only" | "low_risk" | "moderate_risk";
  approvalRequired: boolean;
  enabled: boolean;
  cooldownMs: number;
}

const defaultActionByGesture: Record<
  ConfigurableGesture,
  (typeof dashboardActions)[number]
> = {
  open_palm: dashboardActions[1]!,
  pinch: dashboardActions[0]!,
  grab: dashboardActions[2]!,
  peace_sign: dashboardActions[3]!,
  thumbs_up: dashboardActions[4]!,
};

const draftFromMapping = (
  gesture: ConfigurableGesture,
  mapping?: GestureMappingRecord,
): GestureMappingDraft => {
  const fallback = defaultActionByGesture[gesture];
  return {
    gesture,
    target: mapping?.target ?? fallback.target,
    intentTemplate: mapping?.intentTemplate ?? fallback.intentTemplate,
    safetyLevel: mapping?.safetyLevel ?? "read_only",
    approvalRequired: mapping?.approvalRequired ?? false,
    enabled: mapping?.enabled ?? true,
    cooldownMs: mapping?.cooldownMs ?? 1_000,
  };
};

export const SpatialPage = ({
  apiClient,
}: {
  apiClient: ApiClient;
  onNavigate?: (path: string) => void;
}) => {
  const queryClient = useQueryClient();
  const persistentRuntime = usePersistentSpatialRuntime();
  const spatial = useQuery({
    queryKey: ["spatial-dashboard"],
    queryFn: apiClient.getSpatialDashboard,
    refetchInterval: 20_000,
  });
  const nativeSpatial = useQuery({
    queryKey: ["native-spatial-runtime"],
    queryFn: apiClient.getNativeSpatialRuntime,
    refetchInterval: 20_000,
  });
  const spatialUi = useQuery({
    queryKey: ["spatial-ui-framework"],
    queryFn: apiClient.getSpatialUiDashboard,
    refetchInterval: 20_000,
  });
  const data = spatial.data;
  const nativeData = nativeSpatial.data;
  const spatialUiData = spatialUi.data;
  const activeProfile = data?.profiles.find((profile) => profile.active);
  const firstMapping = data?.mappings[0];
  const [gesture, setGesture] = useState<GestureName>(firstMapping?.gesture ?? "pinch");
  const [mappingDrafts, setMappingDrafts] = useState<
    Record<ConfigurableGesture, GestureMappingDraft>
  >(
    () =>
      Object.fromEntries(
        configurableGestures.map((item) => [item, draftFromMapping(item)]),
      ) as Record<ConfigurableGesture, GestureMappingDraft>,
  );
  const runtimeFrame = persistentRuntime.frame;
  const engineFrame = persistentRuntime.engineFrame;
  const runtimeError = persistentRuntime.runtimeError;
  const lastDashboardAction = persistentRuntime.lastAction;
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["spatial-dashboard"] });
  };
  const refreshCameras = useMutation({
    mutationFn: apiClient.refreshSpatialCameras,
    onSuccess: refresh,
  });
  const recordGesture = useMutation({
    mutationFn: apiClient.recordGesture,
    onSuccess: refresh,
  });
  const createProfile = useMutation({
    mutationFn: apiClient.createGestureProfile,
    onSuccess: refresh,
  });
  const upsertMapping = useMutation({
    mutationFn: apiClient.upsertGestureMapping,
    onSuccess: refresh,
  });
  const enabledMappings = useMemo(
    () => data?.mappings.filter((mapping) => mapping.enabled) ?? [],
    [data?.mappings],
  );
  useEffect(() => {
    if (!data?.mappings) return;
    setMappingDrafts(
      Object.fromEntries(
        configurableGestures.map((item) => [
          item,
          draftFromMapping(
            item,
            data.mappings.find((mapping) => mapping.gesture === item),
          ),
        ]),
      ) as Record<ConfigurableGesture, GestureMappingDraft>,
    );
  }, [data?.mappings]);

  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Phase 14</p>
      <h1>Spatial Interaction System</h1>
      <p>
        Gesture Lab is now a governed spatial input layer. Camera and hand-tracking
        providers are modular and permission-aware; confirmed gestures become Intent
        Engine commands instead of controlling the operating system directly.
      </p>

      <section className="status-grid">
        <article className="status-card">
          <span>
            <Camera size={14} /> Cameras
          </span>
          <strong>{data?.cameraDevices.length ?? 0}</strong>
          <small>{data?.cameraDevices[0]?.permissionState ?? "not loaded"}</small>
        </article>
        <article className="status-card">
          <span>
            <Hand size={14} /> Profiles
          </span>
          <strong>{data?.profiles.length ?? 0}</strong>
          <small>{activeProfile?.name ?? "No active profile"}</small>
        </article>
        <article className="status-card">
          <span>
            <Route size={14} /> Gesture mappings
          </span>
          <strong>{enabledMappings.length}</strong>
          <small>All route through intents</small>
        </article>
        <article className="status-card">
          <span>
            <ShieldCheck size={14} /> Direct OS control
          </span>
          <strong>{data?.directOsControlAvailable ? "Available" : "Blocked"}</strong>
          <small>Must remain blocked</small>
        </article>
      </section>

      <section className="panel-list">
        <h2>
          <Crosshair size={18} /> Spatial UI framework
        </h2>
        <section className="status-grid">
          <article className="status-card">
            <span>Registered components</span>
            <strong>{spatialUiData?.components.length ?? 0}</strong>
            <small>Reusable primitives, not page-specific gestures</small>
          </article>
          <article className="status-card">
            <span>Focus engine</span>
            <strong
              className={spatialUiData?.focusEngineAvailable ? "success-text" : ""}
            >
              {spatialUiData?.focusEngineAvailable ? "available" : "not loaded"}
            </strong>
            <small>One primary spatial focus target</small>
          </article>
          <article className="status-card">
            <span>Dwell engine</span>
            <strong
              className={spatialUiData?.dwellEngineAvailable ? "success-text" : ""}
            >
              {spatialUiData?.dwellEngineAvailable ? "available" : "not loaded"}
            </strong>
            <small>
              {spatialUiData?.interactionProfiles[0]?.dwellMs ?? 0}ms default dwell
            </small>
          </article>
          <article className="status-card">
            <span>Direct execution</span>
            <strong>
              {spatialUiData?.directExecutionAvailable ? "Available" : "Blocked"}
            </strong>
            <small>Spatial UI emits governed interaction events</small>
          </article>
          <article className="status-card">
            <span>Spatial cursor</span>
            <strong
              className={spatialUiData?.spatialCursorAvailable ? "success-text" : ""}
            >
              {spatialUiData?.spatialCursorAvailable ? "available" : "not loaded"}
            </strong>
            <small>
              {spatialUiData?.cursorMetrics.length ?? 0} cursor metric samples
            </small>
          </article>
          <article className="status-card">
            <span>Hand rays</span>
            <strong className={spatialUiData?.handRaysAvailable ? "success-text" : ""}>
              {spatialUiData?.handRaysAvailable ? "available" : "not loaded"}
            </strong>
            <small>{spatialUiData?.raySessions.length ?? 0} ray sessions</small>
          </article>
          <article className="status-card">
            <span>Gesture sequences</span>
            <strong>{spatialUiData?.gestureSequences.length ?? 0}</strong>
            <small>
              {engineFrame.sequence.length
                ? engineFrame.sequence.join(" → ")
                : "No active sequence"}
            </small>
          </article>
          <article className="status-card">
            <span>Physics profile</span>
            <strong>{spatialUiData?.physicsProfiles[0]?.name ?? "not loaded"}</strong>
            <small>Dashboard-only deterministic motion</small>
          </article>
        </section>
      </section>

      <section className="panel-list">
        <h2>
          <Camera size={18} /> Native Spatial Runtime
        </h2>
        <section className="status-grid">
          <article className="status-card">
            <span>Native tracking</span>
            <strong className={stateClass(nativeData?.state ?? "idle")}>
              {nativeData?.state ?? "not loaded"}
            </strong>
            <small>Electron runtime, local camera only</small>
          </article>
          <article className="status-card">
            <span>Camera providers</span>
            <strong>{nativeData?.providers.length ?? 0}</strong>
            <small>{nativeData?.providers[0]?.permissionState ?? "not loaded"}</small>
          </article>
          <article className="status-card">
            <span>Runtime sync</span>
            <strong
              className={stateClass(nativeData?.runtimeSync[0]?.status ?? "idle")}
            >
              {nativeData?.runtimeSync[0]?.status ?? "not loaded"}
            </strong>
            <small>Profiles, calibration, mappings</small>
          </article>
          <article className="status-card">
            <span>Direct input injection</span>
            <strong>
              {nativeData?.directMouseControlAvailable ||
              nativeData?.directKeyboardControlAvailable
                ? "Available"
                : "Blocked"}
            </strong>
            <small>Gestures must become intents</small>
          </article>
        </section>
      </section>

      <section className="spatial-runtime-panel" aria-label="Browser hand control">
        <div className="spatial-runtime-copy">
          <p className="eyebrow">Phase 14A · Browser spatial runtime</p>
          <h2>Live hand control</h2>
          <p>
            Camera frames stay inside this browser. MediaPipe performs local hand
            tracking, and only compact gesture metadata is sent to the governed Spatial
            API.
          </p>
          <div className="button-row">
            <button
              disabled={persistentRuntime.active}
              onClick={() => void persistentRuntime.start()}
              type="button"
            >
              <Play size={13} /> Start hand control
            </button>
            <button
              className="text-button"
              disabled={!persistentRuntime.active && !persistentRuntime.paused}
              onClick={persistentRuntime.stop}
              type="button"
            >
              <CircleStop size={13} /> Stop and release camera
            </button>
          </div>
          {runtimeError ? <p className="form-error">{runtimeError}</p> : null}
          <div className="spatial-runtime-readout">
            <span>
              State{" "}
              <strong className={stateClass(runtimeFrame.state)}>
                {runtimeFrame.state}
              </strong>
            </span>
            <span>
              Gesture <strong>{runtimeFrame.gesture}</strong>
            </span>
            <span>
              Confidence <strong>{Math.round(runtimeFrame.confidence * 100)}%</strong>
            </span>
            <span>
              FPS <strong>{runtimeFrame.fps}</strong>
            </span>
            <span>
              Latency <strong>{runtimeFrame.latencyMs}ms</strong>
            </span>
            <span>
              Hands <strong>{runtimeFrame.handsTracked}</strong>
            </span>
            <span>
              Dwell <strong>{Math.round(engineFrame.dwellProgress * 100)}%</strong>
            </span>
            <span>
              Prediction{" "}
              <strong>{Math.round(engineFrame.predictionConfidence * 100)}%</strong>
            </span>
          </div>
          <p className="notice">{lastDashboardAction}</p>
        </div>
        <div className="spatial-camera-stage">
          <div
            className="spatial-camera-diagnostic-surface"
            aria-label="Persistent hand tracking diagnostic preview"
          />
          <div className="spatial-hud" aria-hidden="true">
            {runtimeFrame.landmarks.map((point, index) => (
              <span
                className="landmark-dot"
                key={`${index}-${point.x}-${point.y}`}
                style={{
                  left: `${(1 - point.x) * 100}%`,
                  top: `${point.y * 100}%`,
                }}
              />
            ))}
            {runtimeFrame.cursor ? (
              <span
                className="virtual-cursor"
                style={{
                  left: `${(engineFrame.cursor?.x ?? runtimeFrame.cursor.x) * 100}%`,
                  top: `${(engineFrame.cursor?.y ?? runtimeFrame.cursor.y) * 100}%`,
                }}
              />
            ) : null}
            {engineFrame.ray ? (
              <span
                className="spatial-ray"
                style={{
                  left: `${engineFrame.ray.start.x * 100}%`,
                  top: `${engineFrame.ray.start.y * 100}%`,
                  width: `${
                    Math.hypot(
                      engineFrame.ray.end.x - engineFrame.ray.start.x,
                      engineFrame.ray.end.y - engineFrame.ray.start.y,
                    ) * 100
                  }%`,
                  transform: `rotate(${Math.atan2(
                    engineFrame.ray.end.y - engineFrame.ray.start.y,
                    engineFrame.ray.end.x - engineFrame.ray.start.x,
                  )}rad)`,
                  opacity: 0.28 + engineFrame.ray.confidence * 0.45,
                }}
              />
            ) : null}
            {engineFrame.cursor && engineFrame.dwellProgress > 0 ? (
              <span
                className="dwell-ring"
                style={
                  {
                    left: `${engineFrame.cursor.x * 100}%`,
                    top: `${engineFrame.cursor.y * 100}%`,
                    "--dwell-progress": `${engineFrame.dwellProgress * 360}deg`,
                  } as CSSProperties
                }
              />
            ) : null}
            <span className="hud-label">{runtimeFrame.message}</span>
          </div>
        </div>
      </section>

      <section className="panel-list">
        <h2>
          <Layers3 size={18} /> Vision pipeline
        </h2>
        <div className="status-grid">
          {data?.pipeline.map((stage) => (
            <article className="status-card" key={stage}>
              <span>{stage.replaceAll("_", " ")}</span>
              <strong className="warning-text">standby</strong>
              <small>Replaceable pipeline stage</small>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-list">
        <h2>
          <Crosshair size={18} /> Gesture routing
        </h2>
        <div className="button-row">
          <select
            value={gesture}
            onChange={(event) => setGesture(event.target.value as GestureName)}
          >
            {data?.mappings.map((mapping) => (
              <option key={mapping.id} value={mapping.gesture}>
                {mapping.gesture} · {mapping.safetyLevel}
              </option>
            ))}
          </select>
          <button
            disabled={recordGesture.isPending || !activeProfile}
            onClick={() =>
              recordGesture.mutate({
                profileId: activeProfile?.id,
                gesture,
                confidence: 0.91,
                handedness: "right",
                state: "confirmed",
              })
            }
            type="button"
          >
            <Play size={13} /> Simulate confirmed gesture
          </button>
          <button
            disabled={refreshCameras.isPending}
            onClick={() => refreshCameras.mutate()}
            type="button"
          >
            <RefreshCcw size={13} /> Refresh camera inventory
          </button>
          <button
            disabled={createProfile.isPending}
            onClick={() =>
              createProfile.mutate({
                name: "Presentation",
                description: "Presentation-mode gesture profile.",
                mode: "presentation",
                sensitivity: 0.68,
                debounceMs: 500,
              })
            }
            type="button"
          >
            <Hand size={13} /> Create profile
          </button>
        </div>
        <section className="gesture-config-grid" aria-label="Configurable gestures">
          {configurableGestures.map((item) => {
            const draft = mappingDrafts[item];
            return (
              <article className="gesture-config-card" key={item}>
                <div>
                  <p className="eyebrow">{item.replaceAll("_", " ")}</p>
                  <h3>{draft.enabled ? "Enabled" : "Disabled"}</h3>
                </div>
                <label>
                  Dashboard action
                  <select
                    value={draft.target}
                    onChange={(event) => {
                      const action = dashboardActions.find(
                        (option) => option.target === event.target.value,
                      );
                      setMappingDrafts((current) => ({
                        ...current,
                        [item]: {
                          ...current[item],
                          target: event.target.value,
                          ...(action ? { intentTemplate: action.intentTemplate } : {}),
                        },
                      }));
                    }}
                  >
                    {dashboardActions.map((action) => (
                      <option key={action.target} value={action.target}>
                        {action.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Governed intent text
                  <textarea
                    rows={3}
                    value={draft.intentTemplate}
                    onChange={(event) =>
                      setMappingDrafts((current) => ({
                        ...current,
                        [item]: {
                          ...current[item],
                          intentTemplate: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <div className="gesture-config-row">
                  <label>
                    Safety
                    <select
                      value={draft.safetyLevel}
                      onChange={(event) =>
                        setMappingDrafts((current) => ({
                          ...current,
                          [item]: {
                            ...current[item],
                            safetyLevel: event.target
                              .value as GestureMappingDraft["safetyLevel"],
                          },
                        }))
                      }
                    >
                      <option value="informational">Informational</option>
                      <option value="read_only">Read only</option>
                      <option value="low_risk">Low risk</option>
                      <option value="moderate_risk">Moderate risk</option>
                    </select>
                  </label>
                  <label>
                    Cooldown ms
                    <input
                      min={0}
                      max={60_000}
                      step={100}
                      type="number"
                      value={draft.cooldownMs}
                      onChange={(event) =>
                        setMappingDrafts((current) => ({
                          ...current,
                          [item]: {
                            ...current[item],
                            cooldownMs: Number(event.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="gesture-config-flags">
                  <label>
                    <input
                      checked={draft.enabled}
                      type="checkbox"
                      onChange={(event) =>
                        setMappingDrafts((current) => ({
                          ...current,
                          [item]: {
                            ...current[item],
                            enabled: event.target.checked,
                          },
                        }))
                      }
                    />
                    Enabled
                  </label>
                  <label>
                    <input
                      checked={draft.approvalRequired}
                      type="checkbox"
                      onChange={(event) =>
                        setMappingDrafts((current) => ({
                          ...current,
                          [item]: {
                            ...current[item],
                            approvalRequired: event.target.checked,
                          },
                        }))
                      }
                    />
                    Requires approval
                  </label>
                </div>
                <button
                  disabled={!activeProfile || upsertMapping.isPending}
                  onClick={() => {
                    if (!activeProfile) return;
                    upsertMapping.mutate({
                      profileId: activeProfile.id,
                      gesture: draft.gesture,
                      intentTemplate: draft.intentTemplate,
                      target: draft.target,
                      safetyLevel: draft.safetyLevel,
                      approvalRequired: draft.approvalRequired,
                      enabled: draft.enabled,
                      cooldownMs: draft.cooldownMs,
                    });
                  }}
                  type="button"
                >
                  Save {item.replaceAll("_", " ")}
                </button>
              </article>
            );
          })}
        </section>
        <section className="status-grid">
          {data?.mappings.slice(0, 8).map((mapping) => (
            <article className="status-card" key={mapping.id}>
              <span>{mapping.gesture}</span>
              <strong className={mapping.enabled ? "success-text" : "danger-text"}>
                {mapping.enabled ? "enabled" : "disabled"}
              </strong>
              <small>{mapping.intentTemplate}</small>
            </article>
          ))}
        </section>
      </section>

      <section className="panel-list">
        <h2>
          <Gauge size={18} /> Tracking, calibration, and metrics
        </h2>
        <section className="status-grid">
          <article className="status-card">
            <span>Raw frames persisted</span>
            <strong>{data?.rawFramesPersisted ? "Yes" : "No"}</strong>
            <small>Privacy invariant</small>
          </article>
          <article className="status-card">
            <span>High-risk approval</span>
            <strong>
              {data?.highRiskGestureApprovalAllowed ? "Allowed" : "Blocked"}
            </strong>
            <small>Gesture is not authentication</small>
          </article>
          <article className="status-card">
            <span>Tracking samples</span>
            <strong>{data?.trackingMetrics.length ?? 0}</strong>
            <small>
              Confidence {data?.trackingMetrics[0]?.landmarkConfidence ?? 0}
            </small>
          </article>
          <article className="status-card">
            <span>Calibration quality</span>
            <strong>{data?.calibration[0]?.trackingQuality ?? 0}</strong>
            <small>{data?.calibration[0]?.lightingQuality ?? "unknown"} lighting</small>
          </article>
        </section>
      </section>

      <section className="panel-list">
        <h2>
          <History size={18} /> Recognition timeline
        </h2>
        {data?.history.slice(0, 6).map((event) => (
          <article className="panel" key={event.id}>
            <p className="eyebrow">
              {event.gesture} ·{" "}
              <span className={stateClass(event.state)}>{event.state}</span>
            </p>
            <h3>{event.intentCreated ? "Intent created" : "Gesture recorded"}</h3>
            <p>{event.reason}</p>
            <small>confidence {event.confidence} · raw frame stored: no</small>
          </article>
        ))}
      </section>
    </section>
  );
};

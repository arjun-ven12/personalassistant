import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Camera,
  ChevronDown,
  CircleStop,
  Crosshair,
  Hand,
  Move,
  Pause,
  Play,
  Route,
  Settings,
} from "lucide-react";

import type { ApiClient } from "./api.js";
import {
  BrowserSpatialRuntime,
  type BrowserSpatialFrame,
  type ConfirmedBrowserGesture,
} from "./browserSpatialRuntime.js";
import {
  SpatialInteractionEngine,
  type SpatialEngineFrame,
} from "./spatial-ui/SpatialInteractionEngine.js";
import { spatialInteractionBridge } from "./spatial-ui/SpatialFramework.js";

const RUNTIME_ENABLED_KEY = "alexa.spatialRuntime.enabled";
const PANEL_STATE_KEY = "alexa.spatialRuntime.panel";

const initialFrame: BrowserSpatialFrame = {
  state: "idle",
  fps: 0,
  latencyMs: 0,
  handsTracked: 0,
  handedness: "unknown",
  gesture: "none",
  confidence: 0,
  cursor: null,
  landmarks: [],
  message: "Hand tracking is stopped.",
};

const initialEngineFrame: SpatialEngineFrame = {
  cursor: null,
  predictedTargetId: null,
  predictionConfidence: 0,
  ray: null,
  dwellProgress: 0,
  sequence: [],
};

interface PanelState {
  x: number;
  y: number;
  collapsed: boolean;
  pinned: boolean;
  hudEnabled: boolean;
  skeletonEnabled: boolean;
  raysEnabled: boolean;
  cursorEnabled: boolean;
}

type OverlayToggleKey =
  "hudEnabled" | "skeletonEnabled" | "raysEnabled" | "cursorEnabled";

const overlayToggles: Array<[string, OverlayToggleKey]> = [
  ["Skeleton", "skeletonEnabled"],
  ["Rays", "raysEnabled"],
  ["Cursor", "cursorEnabled"],
  ["HUD", "hudEnabled"],
];

const defaultPanelState: PanelState = {
  x: 24,
  y: 92,
  collapsed: false,
  pinned: true,
  hudEnabled: true,
  skeletonEnabled: true,
  raysEnabled: true,
  cursorEnabled: true,
};

export interface PersistentSpatialRuntimeValue {
  frame: BrowserSpatialFrame;
  engineFrame: SpatialEngineFrame;
  runtimeError: string | null;
  lastAction: string;
  active: boolean;
  paused: boolean;
  panelState: PanelState;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  stop: () => void;
  setPanelState: (updater: (current: PanelState) => PanelState) => void;
}

const PersistentSpatialRuntimeContext =
  createContext<PersistentSpatialRuntimeValue | null>(null);

const stateClass = (state: BrowserSpatialFrame["state"], paused: boolean) => {
  if (paused) return "persistent-spatial-waiting";
  if (state === "tracking") return "persistent-spatial-good";
  if (state === "error") return "persistent-spatial-bad";
  return "persistent-spatial-waiting";
};

const clampPanelState = (state: PanelState): PanelState => ({
  ...state,
  x: Math.max(12, Math.min(window.innerWidth - 280, state.x)),
  y: Math.max(72, Math.min(window.innerHeight - 160, state.y)),
});

const readPanelState = (): PanelState => {
  try {
    const stored = window.localStorage.getItem(PANEL_STATE_KEY);
    if (!stored) return defaultPanelState;
    const parsed = JSON.parse(stored) as Partial<PanelState>;
    return clampPanelState({ ...defaultPanelState, ...parsed });
  } catch {
    return defaultPanelState;
  }
};

const dashboardPathFromTarget = (target: string) =>
  target.startsWith("dashboard:") ? target.slice("dashboard:".length) : null;

export const PersistentSpatialRuntimeProvider = ({
  apiClient,
  onNavigate,
  children,
}: {
  apiClient: ApiClient;
  onNavigate: (path: string) => void;
  children: ReactNode;
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const runtimeRef = useRef<BrowserSpatialRuntime | null>(null);
  const engineRef = useRef(new SpatialInteractionEngine());
  const lastEngineMetricAt = useRef(0);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const [frame, setFrame] = useState<BrowserSpatialFrame>(initialFrame);
  const [engineFrame, setEngineFrame] =
    useState<SpatialEngineFrame>(initialEngineFrame);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [lastAction, setLastAction] = useState(
    "Start hand tracking once; it will stay active across pages.",
  );
  const [panelState, setPanelStateState] = useState<PanelState>(readPanelState);

  const active =
    !paused &&
    (frame.state === "requesting_permission" ||
      frame.state === "loading_model" ||
      frame.state === "tracking");

  const updatePanelState = useCallback(
    (updater: (current: PanelState) => PanelState) => {
      setPanelStateState((current) => {
        const next = clampPanelState(updater(current));
        window.localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const targetElement = frame.cursor
      ? document
          .elementFromPoint(
            frame.cursor.x * window.innerWidth,
            frame.cursor.y * window.innerHeight,
          )
          ?.closest<HTMLElement>("[data-spatial-id]")
      : null;
    const nextEngineFrame = engineRef.current.update(
      {
        at: performance.now(),
        cursor: frame.cursor,
        confidence: frame.confidence,
        handedness: frame.handedness,
        gesture: frame.gesture,
        landmarks: frame.landmarks,
      },
      targetElement?.dataset.spatialId ?? null,
    );
    setEngineFrame(nextEngineFrame);
    spatialInteractionBridge.updatePointer(
      nextEngineFrame.cursor
        ? {
            x: nextEngineFrame.cursor.x,
            y: nextEngineFrame.cursor.y,
            confidence: nextEngineFrame.cursor.confidence,
            source: "browser",
          }
        : null,
    );

    if (
      nextEngineFrame.cursor &&
      performance.now() - lastEngineMetricAt.current > 1_500
    ) {
      lastEngineMetricAt.current = performance.now();
      void apiClient
        .recordSpatialEngineMetric({
          cursor: {
            x: nextEngineFrame.cursor.x,
            y: nextEngineFrame.cursor.y,
            depth: nextEngineFrame.cursor.depth,
            velocity: Math.min(10, nextEngineFrame.cursor.velocity),
            acceleration: Math.min(100, nextEngineFrame.cursor.acceleration),
            confidence: nextEngineFrame.cursor.confidence,
            ...(nextEngineFrame.predictedTargetId
              ? { snappedComponentId: nextEngineFrame.predictedTargetId }
              : {}),
          },
          prediction: {
            ...(nextEngineFrame.predictedTargetId
              ? { predictedComponentId: nextEngineFrame.predictedTargetId }
              : {}),
            confidence: nextEngineFrame.predictionConfidence,
            factors: ["persistent_runtime", "cross_page_hit_test"],
          },
          ...(nextEngineFrame.ray
            ? {
                ray: {
                  source: nextEngineFrame.ray.source,
                  ...(nextEngineFrame.predictedTargetId
                    ? { targetComponentId: nextEngineFrame.predictedTargetId }
                    : {}),
                  confidence: nextEngineFrame.ray.confidence,
                  status: "active",
                },
              }
            : {}),
        })
        .catch(() => undefined);
    }
  }, [
    apiClient,
    frame.confidence,
    frame.cursor,
    frame.gesture,
    frame.handedness,
    frame.landmarks,
  ]);

  const handleConfirmedGesture = useCallback(
    (confirmed: ConfirmedBrowserGesture) => {
      const confidence = Math.max(0, Math.min(1, confirmed.confidence));
      spatialInteractionBridge.confirmGesture(confirmed.gesture, confidence);
      void apiClient
        .recordGesture({
          gesture: confirmed.gesture,
          confidence,
          handedness: confirmed.handedness,
          state: "confirmed",
        })
        .then((dashboard) => {
          const routed = dashboard.history.find(
            (event) => event.gesture === confirmed.gesture && event.intentCreated,
          );
          const mapping = dashboard.mappings.find(
            (item) => item.id === routed?.mappingId,
          );
          const path = mapping ? dashboardPathFromTarget(mapping.target) : null;
          if (routed && path) {
            onNavigate(path);
            setLastAction(
              `${confirmed.gesture} routed through Intent Engine and opened ${path}.`,
            );
            return;
          }
          setLastAction(
            `${confirmed.gesture} confirmed at ${Math.round(
              confidence * 100,
            )}% confidence.`,
          );
        })
        .catch(() => {
          setLastAction(
            `${confirmed.gesture} confirmed locally; server gesture record failed closed.`,
          );
        });
    },
    [apiClient, onNavigate],
  );

  const stopInternal = useCallback((message = "Hand tracking stopped.") => {
    runtimeRef.current?.stop();
    runtimeRef.current = null;
    setFrame({
      ...initialFrame,
      state: "stopped",
      message,
    });
    setEngineFrame(initialEngineFrame);
    setPaused(false);
    setRuntimeError(null);
    setLastAction(message);
    window.localStorage.removeItem(RUNTIME_ENABLED_KEY);
    spatialInteractionBridge.updatePointer(null);
  }, []);

  const start = useCallback(async () => {
    if (!videoRef.current || runtimeRef.current) return;
    setRuntimeError(null);
    setPaused(false);
    setLastAction("Requesting camera permission for persistent hand tracking.");
    window.localStorage.setItem(RUNTIME_ENABLED_KEY, "true");
    const runtime = new BrowserSpatialRuntime({
      onFrame: setFrame,
      onGesture: handleConfirmedGesture,
      onError: (message) => {
        setRuntimeError(message);
        setLastAction("Camera or local hand tracking could not start.");
        runtimeRef.current = null;
        window.localStorage.removeItem(RUNTIME_ENABLED_KEY);
      },
      minConfidence: 0.7,
      cooldownMs: 850,
    });
    runtimeRef.current = runtime;
    await runtime.start(videoRef.current);
  }, [handleConfirmedGesture]);

  const pause = useCallback(() => {
    if (!runtimeRef.current) return;
    runtimeRef.current.stop();
    runtimeRef.current = null;
    setFrame({
      ...initialFrame,
      state: "stopped",
      message: "Hand tracking paused. Camera released until resumed.",
    });
    setEngineFrame(initialEngineFrame);
    setPaused(true);
    setLastAction("Hand tracking paused. Camera released until resumed.");
    spatialInteractionBridge.updatePointer(null);
  }, []);

  const resume = useCallback(async () => {
    setPaused(false);
    await start();
  }, [start]);

  const stop = useCallback(() => {
    stopInternal("Hand tracking stopped. Camera released.");
  }, [stopInternal]);

  useEffect(() => {
    if (window.localStorage.getItem(RUNTIME_ENABLED_KEY) === "true") {
      void start();
    }
    return () => {
      runtimeRef.current?.stop();
      runtimeRef.current = null;
      spatialInteractionBridge.updatePointer(null);
    };
  }, [start]);

  useEffect(() => {
    const handleVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        window.localStorage.getItem(RUNTIME_ENABLED_KEY) === "true" &&
        !runtimeRef.current &&
        !paused
      ) {
        setLastAction("Recovering persistent hand tracking after browser suspension.");
        void start();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [paused, start]);

  const value = useMemo<PersistentSpatialRuntimeValue>(
    () => ({
      frame,
      engineFrame,
      runtimeError,
      lastAction,
      active,
      paused,
      panelState,
      start,
      pause,
      resume,
      stop,
      setPanelState: updatePanelState,
    }),
    [
      active,
      engineFrame,
      frame,
      lastAction,
      panelState,
      pause,
      paused,
      resume,
      runtimeError,
      start,
      stop,
      updatePanelState,
    ],
  );

  return (
    <PersistentSpatialRuntimeContext.Provider value={value}>
      {children}
      <video
        ref={videoRef}
        aria-label="Persistent local hand tracking camera feed"
        className="persistent-spatial-video"
        muted
        playsInline
      />
      {panelState.hudEnabled && active ? (
        <div className="persistent-spatial-overlay" aria-hidden="true">
          {panelState.skeletonEnabled
            ? frame.landmarks.map((point, index) => (
                <span
                  className="persistent-spatial-landmark"
                  key={`${index}-${point.x}-${point.y}`}
                  style={{
                    left: `${(1 - point.x) * 100}%`,
                    top: `${point.y * 100}%`,
                  }}
                />
              ))
            : null}
          {panelState.raysEnabled && engineFrame.ray ? (
            <span
              className="persistent-spatial-ray"
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
                opacity: 0.24 + engineFrame.ray.confidence * 0.46,
              }}
            />
          ) : null}
          {panelState.cursorEnabled && engineFrame.cursor ? (
            <span
              className="persistent-spatial-cursor"
              style={{
                left: `${engineFrame.cursor.x * 100}%`,
                top: `${engineFrame.cursor.y * 100}%`,
              }}
            />
          ) : null}
          <span className="persistent-spatial-label">
            {frame.gesture} · {Math.round(frame.confidence * 100)}% · {frame.fps}fps
          </span>
        </div>
      ) : null}
      <aside
        className={[
          "persistent-spatial-panel",
          panelState.collapsed ? "persistent-spatial-panel-collapsed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          {
            "--persistent-panel-x": `${panelState.x}px`,
            "--persistent-panel-y": `${panelState.y}px`,
          } as CSSProperties
        }
      >
        <button
          className="persistent-spatial-panel-grip"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragOffsetRef.current = {
              x: event.clientX - panelState.x,
              y: event.clientY - panelState.y,
            };
          }}
          onPointerMove={(event) => {
            if (!dragOffsetRef.current) return;
            updatePanelState((current) => ({
              ...current,
              x: event.clientX - dragOffsetRef.current!.x,
              y: event.clientY - dragOffsetRef.current!.y,
            }));
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            dragOffsetRef.current = null;
          }}
          type="button"
        >
          <Move size={13} /> Spatial Runtime
        </button>
        <button
          className="persistent-spatial-collapse"
          onClick={() =>
            updatePanelState((current) => ({
              ...current,
              collapsed: !current.collapsed,
            }))
          }
          type="button"
        >
          <ChevronDown size={14} />
        </button>
        {!panelState.collapsed ? (
          <>
            <div className="persistent-spatial-status">
              <span className={stateClass(frame.state, paused)}>
                {paused ? "paused" : frame.state.replaceAll("_", " ")}
              </span>
              <strong>{frame.gesture}</strong>
              <small>{runtimeError ?? frame.message}</small>
            </div>
            <div className="persistent-spatial-metrics">
              <span>
                <Hand size={13} /> {frame.handsTracked}
              </span>
              <span>
                <Crosshair size={13} /> {Math.round(frame.confidence * 100)}%
              </span>
              <span>
                <Route size={13} /> {Math.round(engineFrame.dwellProgress * 100)}%
              </span>
              <span>{frame.latencyMs}ms</span>
            </div>
            <div className="persistent-spatial-controls">
              <button disabled={active} onClick={() => void start()} type="button">
                <Play size={13} /> Start
              </button>
              <button disabled={!active} onClick={pause} type="button">
                <Pause size={13} /> Pause
              </button>
              <button disabled={!paused} onClick={() => void resume()} type="button">
                <Camera size={13} /> Resume
              </button>
              <button
                className="persistent-runtime-stop"
                disabled={!active && !paused}
                onClick={stop}
                type="button"
              >
                <CircleStop size={13} /> Stop
              </button>
            </div>
            <div className="persistent-spatial-toggles">
              {overlayToggles.map(([label, key]) => (
                <button
                  className={
                    panelState[key]
                      ? "persistent-toggle-active"
                      : "persistent-toggle-inactive"
                  }
                  key={key}
                  onClick={() =>
                    updatePanelState((current) => ({
                      ...current,
                      [key]: !current[key],
                    }))
                  }
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <p>{lastAction}</p>
            <button
              className="persistent-spatial-lab-link"
              onClick={() => onNavigate("/gesture-lab")}
              type="button"
            >
              <Settings size={13} /> Open Gesture Lab
            </button>
          </>
        ) : null}
      </aside>
    </PersistentSpatialRuntimeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const usePersistentSpatialRuntime = () => {
  const context = useContext(PersistentSpatialRuntimeContext);
  if (!context) {
    throw new Error(
      "usePersistentSpatialRuntime must be used inside PersistentSpatialRuntimeProvider",
    );
  }
  return context;
};

import type { GestureName, Handedness, Point3D } from "@alexa-control/shared";

const MEDIAPIPE_TASKS_VERSION = "1.0.0";
const assetBase = import.meta.env.BASE_URL.replace(/\/$/, "");
const MEDIAPIPE_WASM_BASE = `${assetBase}/mediapipe/wasm`;
const GESTURE_MODEL_URL = `${assetBase}/mediapipe/models/gesture_recognizer.task`;
const REMOTE_MEDIAPIPE_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_TASKS_VERSION}/wasm`;
const REMOTE_GESTURE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

export const nativeSpatialModelAssetUrls = () => ({
  wasmBase: MEDIAPIPE_WASM_BASE,
  modelUrl: GESTURE_MODEL_URL,
  remoteWasmBase: REMOTE_MEDIAPIPE_WASM_BASE,
  remoteModelUrl: REMOTE_GESTURE_MODEL_URL,
});

type Landmark = Point3D;

export interface NativeSpatialFrame {
  state:
    | "idle"
    | "requesting_permission"
    | "initializing"
    | "tracking"
    | "stopped"
    | "error";
  fps: number;
  latencyMs: number;
  gesture: GestureName;
  confidence: number;
  handedness: Handedness;
  cursor: { x: number; y: number } | null;
  landmarks: Landmark[];
  message: string;
}

export interface NativeSpatialGesture {
  gesture: GestureName;
  confidence: number;
  handedness: Handedness;
  cursor: { x: number; y: number } | null;
}

export interface NativeSpatialRuntimeOptions {
  onFrame: (frame: NativeSpatialFrame) => void;
  onGesture: (gesture: NativeSpatialGesture) => void;
  onError: (message: string) => void;
}

export const nativeSpatialModelFallbackMessage = (error: unknown) => {
  const detail = error instanceof Error ? error.message : "model unavailable";
  return `Camera tracking is running locally, but the gesture model could not load (${detail}). Raw frames remain local; gesture submission is paused.`;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const distance = (a: Landmark, b: Landmark) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const tipIndexes = {
  thumb: 4,
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20,
} as const;

const normalizeMediaPipeGesture = (categoryName?: string): GestureName | null => {
  const normalized = categoryName?.trim().toLowerCase();
  if (!normalized || normalized === "none") return null;
  if (normalized === "closed_fist") return "closed_fist";
  if (normalized === "open_palm") return "open_palm";
  if (normalized === "pointing_up") return "point";
  if (normalized === "victory") return "peace_sign";
  if (normalized === "thumb_up") return "thumbs_up";
  if (normalized === "thumb_down") return "thumbs_down";
  return null;
};

const recognize = (
  landmarks: Landmark[],
  input: {
    handedness: Handedness;
    mediaPipeGesture?: string;
    mediaPipeConfidence?: number;
  },
): NativeSpatialGesture | null => {
  if (landmarks.length < 21) return null;
  const indexTip = landmarks[tipIndexes.index]!;
  const thumbTip = landmarks[tipIndexes.thumb]!;
  const middleTip = landmarks[tipIndexes.middle]!;
  const cursor = { x: clamp(1 - indexTip.x), y: clamp(indexTip.y) };
  const pinchDistance = distance(thumbTip, indexTip);
  if (pinchDistance < 0.055) {
    return {
      gesture: "pinch",
      confidence: clamp(1 - pinchDistance * 10),
      handedness: input.handedness,
      cursor,
    };
  }
  const grabDistance = distance(thumbTip, middleTip);
  if (grabDistance < 0.08) {
    return {
      gesture: "grab",
      confidence: clamp(0.88 - grabDistance),
      handedness: input.handedness,
      cursor,
    };
  }
  const builtInGesture = normalizeMediaPipeGesture(input.mediaPipeGesture);
  if (builtInGesture && (input.mediaPipeConfidence ?? 0) >= 0.55) {
    return {
      gesture: builtInGesture,
      confidence: input.mediaPipeConfidence ?? 0.55,
      handedness: input.handedness,
      cursor,
    };
  }
  return {
    gesture: "hover",
    confidence: 0.55,
    handedness: input.handedness,
    cursor,
  };
};

class NativeGestureStateMachine {
  #candidate: GestureName = "none";
  #frames = 0;
  #lastConfirmedAt = 0;

  update(candidate: NativeSpatialGesture | null, at: number) {
    if (!candidate || candidate.confidence < 0.72) {
      this.#candidate = "none";
      this.#frames = 0;
      return null;
    }
    if (candidate.gesture !== this.#candidate) {
      this.#candidate = candidate.gesture;
      this.#frames = 1;
    } else {
      this.#frames += 1;
    }
    if (candidate.gesture === "hover" || this.#frames < 3) return null;
    if (at - this.#lastConfirmedAt < 900) return null;
    this.#lastConfirmedAt = at;
    return candidate;
  }
}

export class NativeSpatialRuntime {
  readonly #options: NativeSpatialRuntimeOptions;
  readonly #machine = new NativeGestureStateMachine();
  #stream: MediaStream | null = null;
  #recognizer: unknown = null;
  #running = false;
  #animationFrame = 0;
  #lastFrameAt = 0;
  #modelFallbackMessage: string | null = null;

  constructor(options: NativeSpatialRuntimeOptions) {
    this.#options = options;
  }

  async start(video: HTMLVideoElement) {
    if (this.#running) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      const message = "Native spatial camera access is unavailable in this renderer.";
      this.#options.onError(message);
      this.#emit({
        state: "error",
        fps: 0,
        latencyMs: 0,
        gesture: "none",
        confidence: 0,
        handedness: "unknown",
        cursor: null,
        landmarks: [],
        message,
      });
      return;
    }
    this.#running = true;
    this.#emit({
      state: "requesting_permission",
      fps: 0,
      latencyMs: 0,
      gesture: "none",
      confidence: 0,
      handedness: "unknown",
      cursor: null,
      landmarks: [],
      message: "Requesting camera permission…",
    });
    try {
      this.#stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 540 },
          frameRate: { ideal: 30, max: 60 },
        },
        audio: false,
      });
      video.srcObject = this.#stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      this.#emit({
        state: "initializing",
        fps: 0,
        latencyMs: 0,
        gesture: "none",
        confidence: 0,
        handedness: "unknown",
        cursor: null,
        landmarks: [],
        message: "Loading local MediaPipe model…",
      });
      await this.#loadRecognizer();
      this.#loop(video);
    } catch (error) {
      this.stop();
      const message =
        error instanceof Error ? error.message : "Native spatial runtime failed.";
      this.#options.onError(message);
      this.#emit({
        state: "error",
        fps: 0,
        latencyMs: 0,
        gesture: "none",
        confidence: 0,
        handedness: "unknown",
        cursor: null,
        landmarks: [],
        message,
      });
    }
  }

  stop() {
    this.#running = false;
    if (this.#animationFrame) window.cancelAnimationFrame(this.#animationFrame);
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = null;
    this.#emit({
      state: "stopped",
      fps: 0,
      latencyMs: 0,
      gesture: "none",
      confidence: 0,
      handedness: "unknown",
      cursor: null,
      landmarks: [],
      message: "Native spatial runtime stopped. Camera released.",
    });
  }

  async #loadRecognizer() {
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const options = (delegate: "GPU" | "CPU") => ({
        baseOptions: {
          modelAssetPath: GESTURE_MODEL_URL,
          delegate,
        },
        runningMode: "VIDEO" as const,
        numHands: 2,
      });
      try {
        const resolver =
          await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE);
        this.#recognizer = await vision.GestureRecognizer.createFromOptions(
          resolver,
          options("GPU"),
        );
      } catch {
        try {
          const resolver =
            await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE);
          this.#recognizer = await vision.GestureRecognizer.createFromOptions(
            resolver,
            options("CPU"),
          );
        } catch {
          const remoteResolver = await vision.FilesetResolver.forVisionTasks(
            REMOTE_MEDIAPIPE_WASM_BASE,
          );
          this.#recognizer = await vision.GestureRecognizer.createFromOptions(
            remoteResolver,
            {
              runningMode: "VIDEO" as const,
              numHands: 2,
              baseOptions: {
                modelAssetPath: REMOTE_GESTURE_MODEL_URL,
                delegate: "CPU",
              },
            },
          );
        }
      }
      this.#modelFallbackMessage = null;
    } catch (error) {
      this.#recognizer = null;
      this.#modelFallbackMessage = nativeSpatialModelFallbackMessage(error);
    }
  }

  #loop(video: HTMLVideoElement) {
    if (!this.#running) return;
    const started = performance.now();
    const recognizer = this.#recognizer as {
      recognizeForVideo: (
        video: HTMLVideoElement,
        at: number,
      ) => {
        landmarks?: Landmark[][];
        handednesses?: Array<Array<{ categoryName?: string; score?: number }>>;
        gestures?: Array<Array<{ categoryName?: string; score?: number }>>;
      };
    } | null;
    if (!recognizer) {
      const fps =
        this.#lastFrameAt > 0
          ? Math.round(1000 / Math.max(1, started - this.#lastFrameAt))
          : 0;
      this.#lastFrameAt = started;
      this.#emit({
        state: "tracking",
        fps,
        latencyMs: Math.round(performance.now() - started),
        gesture: "none",
        confidence: 0,
        handedness: "unknown",
        cursor: null,
        landmarks: [],
        message:
          this.#modelFallbackMessage ??
          "Camera preview is running locally; gesture model is unavailable.",
      });
      this.#animationFrame = window.requestAnimationFrame(() => this.#loop(video));
      return;
    }
    const result = recognizer.recognizeForVideo(video, started);
    const landmarks = result.landmarks?.[0] ?? [];
    const handedness =
      result.handednesses?.[0]?.[0]?.categoryName?.toLowerCase() === "left"
        ? "left"
        : result.handednesses?.[0]?.[0]?.categoryName?.toLowerCase() === "right"
          ? "right"
          : "unknown";
    const candidate = recognize(landmarks, {
      handedness,
      ...(result.gestures?.[0]?.[0]?.categoryName
        ? { mediaPipeGesture: result.gestures[0][0].categoryName }
        : {}),
      ...(result.gestures?.[0]?.[0]?.score === undefined
        ? {}
        : { mediaPipeConfidence: result.gestures[0][0].score }),
    });
    const confirmed = this.#machine.update(candidate, started);
    if (confirmed) this.#options.onGesture(confirmed);
    const elapsed = performance.now() - started;
    const fps =
      this.#lastFrameAt > 0
        ? Math.round(1000 / Math.max(1, started - this.#lastFrameAt))
        : 0;
    this.#lastFrameAt = started;
    this.#emit({
      state: "tracking",
      fps,
      latencyMs: Math.round(elapsed),
      gesture: candidate?.gesture ?? "none",
      confidence: candidate?.confidence ?? 0,
      handedness,
      cursor: candidate?.cursor ?? null,
      landmarks,
      message:
        result.landmarks && result.landmarks.length > 0
          ? "Tracking locally in Electron."
          : "Show your hand to the camera.",
    });
    this.#animationFrame = window.requestAnimationFrame(() => this.#loop(video));
  }

  #emit(frame: NativeSpatialFrame) {
    this.#options.onFrame(frame);
  }
}

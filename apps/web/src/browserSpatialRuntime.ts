import type { GestureName, Handedness, Point3D } from "@alexa-control/shared";

const MEDIAPIPE_TASKS_VERSION = "1.0.0";
const MEDIAPIPE_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_TASKS_VERSION}/wasm`;
const GESTURE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

type Landmark = Point3D;

export type BrowserSpatialRuntimeState =
  "idle" | "requesting_permission" | "loading_model" | "tracking" | "stopped" | "error";

export interface BrowserSpatialFrame {
  state: BrowserSpatialRuntimeState;
  fps: number;
  latencyMs: number;
  handsTracked: number;
  handedness: Handedness;
  gesture: GestureName;
  confidence: number;
  cursor: { x: number; y: number } | null;
  landmarks: Landmark[];
  message: string;
}

export interface ConfirmedBrowserGesture {
  gesture: GestureName;
  confidence: number;
  handedness: Handedness;
  cursor: { x: number; y: number } | null;
}

export interface GestureCandidate {
  gesture: GestureName;
  confidence: number;
  handedness: Handedness;
  cursor: { x: number; y: number } | null;
}

export interface BrowserSpatialRuntimeOptions {
  onFrame: (frame: BrowserSpatialFrame) => void;
  onGesture: (gesture: ConfirmedBrowserGesture) => void;
  onError: (message: string) => void;
  minConfidence?: number;
  cooldownMs?: number;
}

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

const pipIndexes = {
  index: 6,
  middle: 10,
  ring: 14,
  pinky: 18,
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

const extendedFingerCount = (landmarks: Landmark[]) => {
  if (landmarks.length < 21) return 0;
  return (Object.keys(pipIndexes) as Array<keyof typeof pipIndexes>).filter(
    (finger) => {
      const tip = landmarks[tipIndexes[finger]];
      const pip = landmarks[pipIndexes[finger]];
      return tip && pip && tip.y < pip.y;
    },
  ).length;
};

const centerOf = (landmarks: Landmark[]) => {
  const wrist = landmarks[0];
  const index = landmarks[tipIndexes.index];
  if (!wrist || !index) return null;
  return {
    x: clamp((wrist.x + index.x) / 2),
    y: clamp((wrist.y + index.y) / 2),
  };
};

export interface MovementSample {
  at: number;
  x: number;
  y: number;
}

export const recognizeGestureFromLandmarks = (
  landmarks: Landmark[],
  input: {
    at: number;
    handedness: Handedness;
    mediaPipeGesture?: string;
    mediaPipeConfidence?: number;
    movementHistory?: MovementSample[];
  },
): GestureCandidate | null => {
  if (landmarks.length < 21) return null;
  const cursorSource = landmarks[tipIndexes.index];
  const cursor = cursorSource
    ? { x: clamp(1 - cursorSource.x), y: clamp(cursorSource.y) }
    : null;
  const builtInGesture = normalizeMediaPipeGesture(input.mediaPipeGesture);
  const builtInConfidence = input.mediaPipeConfidence ?? 0;
  const thumbTip = landmarks[tipIndexes.thumb]!;
  const indexTip = landmarks[tipIndexes.index]!;
  const middleTip = landmarks[tipIndexes.middle]!;
  const pinchDistance = distance(thumbTip, indexTip);
  const grabDistance = distance(thumbTip, middleTip);
  const fingers = extendedFingerCount(landmarks);
  const recent = input.movementHistory?.filter((sample) => input.at - sample.at <= 650);
  const first = recent?.[0];
  const last = recent?.at(-1);

  if (first && last && recent.length >= 4) {
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) > 0.22) {
      if (absX > absY * 1.35) {
        return {
          gesture: dx > 0 ? "swipe_right" : "swipe_left",
          confidence: clamp(0.76 + absX / 2),
          handedness: input.handedness,
          cursor,
        };
      }
      if (absY > absX * 1.35) {
        return {
          gesture: dy > 0 ? "swipe_down" : "swipe_up",
          confidence: clamp(0.76 + absY / 2),
          handedness: input.handedness,
          cursor,
        };
      }
    }
  }

  if (pinchDistance < 0.055) {
    return {
      gesture: "pinch",
      confidence: clamp(1 - pinchDistance * 10),
      handedness: input.handedness,
      cursor,
    };
  }

  if (grabDistance < 0.08 && fingers <= 1) {
    return {
      gesture: "grab",
      confidence: clamp(0.88 - grabDistance),
      handedness: input.handedness,
      cursor,
    };
  }

  if (builtInGesture && builtInConfidence >= 0.45) {
    return {
      gesture: builtInGesture,
      confidence: builtInConfidence,
      handedness: input.handedness,
      cursor,
    };
  }

  if (fingers >= 4) {
    return {
      gesture: "open_palm",
      confidence: 0.78,
      handedness: input.handedness,
      cursor,
    };
  }

  if (fingers === 1) {
    return {
      gesture: "point",
      confidence: 0.72,
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

export class GestureStateMachine {
  readonly #minConfidence: number;
  readonly #cooldownMs: number;
  #candidate: GestureName = "none";
  #candidateFrames = 0;
  #lastConfirmedAt = 0;
  #lastPinchAt = 0;

  constructor(options: { minConfidence?: number; cooldownMs?: number } = {}) {
    this.#minConfidence = options.minConfidence ?? 0.72;
    this.#cooldownMs = options.cooldownMs ?? 850;
  }

  update(
    candidate: GestureCandidate | null,
    at: number,
  ): ConfirmedBrowserGesture | null {
    if (!candidate || candidate.confidence < this.#minConfidence) {
      this.#candidate = "none";
      this.#candidateFrames = 0;
      return null;
    }

    if (candidate.gesture !== this.#candidate) {
      this.#candidate = candidate.gesture;
      this.#candidateFrames = 1;
    } else {
      this.#candidateFrames += 1;
    }

    if (candidate.gesture === "hover" || this.#candidateFrames < 3) return null;
    if (at - this.#lastConfirmedAt < this.#cooldownMs) return null;

    this.#lastConfirmedAt = at;
    if (candidate.gesture === "pinch") {
      const doublePinch = at - this.#lastPinchAt < 550;
      this.#lastPinchAt = at;
      if (doublePinch) return { ...candidate, gesture: "double_pinch" };
    }

    return candidate;
  }
}

export class BrowserSpatialRuntime {
  readonly #options: BrowserSpatialRuntimeOptions;
  readonly #machine: GestureStateMachine;
  #stream: MediaStream | null = null;
  #recognizer: unknown = null;
  #running = false;
  #animationFrame = 0;
  #lastFrameAt = 0;
  #history: MovementSample[] = [];

  constructor(options: BrowserSpatialRuntimeOptions) {
    this.#options = options;
    this.#machine = new GestureStateMachine({
      ...(options.minConfidence === undefined
        ? {}
        : { minConfidence: options.minConfidence }),
      ...(options.cooldownMs === undefined ? {} : { cooldownMs: options.cooldownMs }),
    });
  }

  async start(video: HTMLVideoElement) {
    if (this.#running) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      const message =
        "Browser camera access is unavailable. Use a supported browser on localhost or HTTPS.";
      this.#options.onError(message);
      this.#emit({
        state: "error",
        fps: 0,
        latencyMs: 0,
        handsTracked: 0,
        handedness: "unknown",
        gesture: "none",
        confidence: 0,
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
      handsTracked: 0,
      handedness: "unknown",
      gesture: "none",
      confidence: 0,
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
        state: "loading_model",
        fps: 0,
        latencyMs: 0,
        handsTracked: 0,
        handedness: "unknown",
        gesture: "none",
        confidence: 0,
        cursor: null,
        landmarks: [],
        message: "Loading local hand tracking model…",
      });
      await this.#loadRecognizer();
      this.#loop(video);
    } catch (error) {
      this.stop();
      const message =
        error instanceof Error
          ? error.message
          : "Browser spatial runtime could not start.";
      this.#options.onError(message);
      this.#emit({
        state: "error",
        fps: 0,
        latencyMs: 0,
        handsTracked: 0,
        handedness: "unknown",
        gesture: "none",
        confidence: 0,
        cursor: null,
        landmarks: [],
        message,
      });
    }
  }

  stop() {
    this.#running = false;
    if (this.#animationFrame) window.cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = 0;
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = null;
    this.#history = [];
    this.#emit({
      state: "stopped",
      fps: 0,
      latencyMs: 0,
      handsTracked: 0,
      handedness: "unknown",
      gesture: "none",
      confidence: 0,
      cursor: null,
      landmarks: [],
      message: "Hand control stopped. Camera released.",
    });
  }

  async #loadRecognizer() {
    const vision = await import("@mediapipe/tasks-vision");
    const resolver = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE);
    const options = (delegate: "GPU" | "CPU") => ({
      baseOptions: {
        modelAssetPath: GESTURE_MODEL_URL,
        delegate,
      },
      runningMode: "VIDEO" as const,
      numHands: 2,
    });
    try {
      this.#recognizer = await vision.GestureRecognizer.createFromOptions(
        resolver,
        options("GPU"),
      );
    } catch {
      this.#recognizer = await vision.GestureRecognizer.createFromOptions(
        resolver,
        options("CPU"),
      );
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
    };
    const result = recognizer.recognizeForVideo(video, started);
    const landmarks = result.landmarks?.[0] ?? [];
    const handedness =
      result.handednesses?.[0]?.[0]?.categoryName?.toLowerCase() === "left"
        ? "left"
        : result.handednesses?.[0]?.[0]?.categoryName?.toLowerCase() === "right"
          ? "right"
          : "unknown";
    const center = centerOf(landmarks);
    if (center) {
      this.#history.push({ at: started, x: center.x, y: center.y });
      this.#history = this.#history.filter((sample) => started - sample.at <= 900);
    }
    const candidate = recognizeGestureFromLandmarks(landmarks, {
      at: started,
      handedness,
      movementHistory: this.#history,
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
      handsTracked: result.landmarks?.length ?? 0,
      handedness,
      gesture: candidate?.gesture ?? "none",
      confidence: candidate?.confidence ?? 0,
      cursor: candidate?.cursor ?? null,
      landmarks,
      message:
        result.landmarks && result.landmarks.length > 0
          ? "Tracking locally in browser."
          : "Show your hand to the camera.",
    });
    this.#animationFrame = window.requestAnimationFrame(() => this.#loop(video));
  }

  #emit(frame: BrowserSpatialFrame) {
    this.#options.onFrame(frame);
  }
}

import type { GestureName, Handedness, Point3D } from "@alexa-control/shared";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export interface SpatialEngineInput {
  at: number;
  cursor: { x: number; y: number } | null;
  confidence: number;
  handedness: Handedness;
  gesture: GestureName;
  landmarks: Point3D[];
}

export interface SpatialRay {
  source: "left_hand" | "right_hand" | "unknown";
  start: { x: number; y: number };
  end: { x: number; y: number };
  confidence: number;
}

export interface SpatialEngineFrame {
  cursor: {
    x: number;
    y: number;
    depth: number;
    confidence: number;
    velocity: number;
    acceleration: number;
  } | null;
  predictedTargetId: string | null;
  predictionConfidence: number;
  ray: SpatialRay | null;
  dwellProgress: number;
  sequence: GestureName[];
}

export interface SpatialEngineOptions {
  smoothing?: number;
  inertia?: number;
  snapRadius?: number;
  dwellMs?: number;
  sequenceGapMs?: number;
}

interface CursorSample {
  at: number;
  x: number;
  y: number;
  velocity: number;
}

export const rayFromLandmarks = (
  landmarks: Point3D[],
  handedness: Handedness,
  confidence: number,
): SpatialRay | null => {
  const wrist = landmarks[0];
  const index = landmarks[8];
  if (!wrist || !index) return null;
  const start = { x: clamp(1 - wrist.x), y: clamp(wrist.y) };
  const tip = { x: clamp(1 - index.x), y: clamp(index.y) };
  const dx = tip.x - start.x;
  const dy = tip.y - start.y;
  return {
    source:
      handedness === "left"
        ? "left_hand"
        : handedness === "right"
          ? "right_hand"
          : "unknown",
    start,
    end: {
      x: clamp(tip.x + dx * 0.22),
      y: clamp(tip.y + dy * 0.22),
    },
    confidence,
  };
};

export class SpatialInteractionEngine {
  readonly #smoothing: number;
  readonly #inertia: number;
  readonly #dwellMs: number;
  readonly #sequenceGapMs: number;
  #lastCursor: CursorSample | null = null;
  #smoothed: { x: number; y: number } | null = null;
  #lastAcceleration = 0;
  #focusStartedAt = 0;
  #focusedTargetId: string | null = null;
  #sequence: Array<{ gesture: GestureName; at: number }> = [];

  constructor(options: SpatialEngineOptions = {}) {
    this.#smoothing = options.smoothing ?? 0.72;
    this.#inertia = options.inertia ?? 0.16;
    this.#dwellMs = options.dwellMs ?? 1_200;
    this.#sequenceGapMs = options.sequenceGapMs ?? 2_500;
  }

  update(
    input: SpatialEngineInput,
    targetId: string | null = this.#focusedTargetId,
  ): SpatialEngineFrame {
    if (!input.cursor) {
      this.#lastCursor = null;
      this.#smoothed = null;
      this.#focusedTargetId = null;
      this.#focusStartedAt = 0;
      return {
        cursor: null,
        predictedTargetId: null,
        predictionConfidence: 0,
        ray: null,
        dwellProgress: 0,
        sequence: this.#sequence.map((item) => item.gesture),
      };
    }

    const previous = this.#lastCursor;
    const dt = previous ? Math.max(1, input.at - previous.at) : 16;
    const rawVelocity = previous
      ? Math.hypot(input.cursor.x - previous.x, input.cursor.y - previous.y) /
        (dt / 1_000)
      : 0;
    const velocity = previous
      ? previous.velocity * this.#inertia + rawVelocity * (1 - this.#inertia)
      : rawVelocity;
    this.#lastAcceleration = previous
      ? Math.abs(velocity - previous.velocity) / (dt / 1_000)
      : 0;
    this.#smoothed = this.#smoothed
      ? {
          x: clamp(
            this.#smoothed.x * this.#smoothing + input.cursor.x * (1 - this.#smoothing),
          ),
          y: clamp(
            this.#smoothed.y * this.#smoothing + input.cursor.y * (1 - this.#smoothing),
          ),
        }
      : input.cursor;
    this.#lastCursor = {
      at: input.at,
      x: input.cursor.x,
      y: input.cursor.y,
      velocity,
    };

    if (targetId !== this.#focusedTargetId) {
      this.#focusedTargetId = targetId;
      this.#focusStartedAt = targetId ? input.at : 0;
    }
    const dwellProgress =
      targetId && this.#focusStartedAt
        ? clamp((input.at - this.#focusStartedAt) / this.#dwellMs)
        : 0;
    if (input.gesture !== "none" && input.gesture !== "hover") {
      const last = this.#sequence.at(-1);
      if (!last || last.gesture !== input.gesture || input.at - last.at > 400) {
        this.#sequence.push({ gesture: input.gesture, at: input.at });
      }
      this.#sequence = this.#sequence.filter(
        (item) => input.at - item.at <= this.#sequenceGapMs,
      );
    }

    const predictedTargetId = targetId;
    const predictionConfidence = predictedTargetId
      ? clamp(
          input.confidence * (1 - Math.min(velocity, 1) * 0.22) + dwellProgress * 0.16,
        )
      : 0;

    return {
      cursor: {
        x: this.#smoothed.x,
        y: this.#smoothed.y,
        depth: clamp(0.5 + velocity * 0.05),
        confidence: input.confidence,
        velocity,
        acceleration: this.#lastAcceleration,
      },
      predictedTargetId,
      predictionConfidence,
      ray: rayFromLandmarks(input.landmarks, input.handedness, input.confidence),
      dwellProgress,
      sequence: this.#sequence.map((item) => item.gesture),
    };
  }
}

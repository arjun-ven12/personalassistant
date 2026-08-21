import { describe, expect, it } from "vitest";

import {
  GestureStateMachine,
  recognizeGestureFromLandmarks,
  type MovementSample,
} from "./browserSpatialRuntime.js";

const landmarks = () =>
  Array.from({ length: 21 }, (_, index) => ({
    x: 0.5,
    y: 0.5 + index * 0.002,
    z: 0.5,
  }));

describe("Browser Spatial Runtime gesture recognition", () => {
  it("recognizes a pinch from thumb and index proximity", () => {
    const frame = landmarks();
    frame[4] = { x: 0.42, y: 0.42, z: 0.5 };
    frame[8] = { x: 0.435, y: 0.43, z: 0.5 };

    expect(
      recognizeGestureFromLandmarks(frame, {
        at: 1_000,
        handedness: "right",
      }),
    ).toMatchObject({
      gesture: "pinch",
      handedness: "right",
    });
  });

  it("uses MediaPipe classifications when no stronger local heuristic wins", () => {
    const frame = landmarks();
    frame[4] = { x: 0.22, y: 0.68, z: 0.5 };
    frame[8] = { x: 0.72, y: 0.18, z: 0.5 };

    expect(
      recognizeGestureFromLandmarks(frame, {
        at: 1_000,
        handedness: "left",
        mediaPipeGesture: "Victory",
        mediaPipeConfidence: 0.88,
      }),
    ).toMatchObject({
      gesture: "peace_sign",
      confidence: 0.88,
      handedness: "left",
    });
  });

  it("recognizes horizontal swipes from recent movement", () => {
    const frame = landmarks();
    const movementHistory: MovementSample[] = [
      { at: 1_000, x: 0.25, y: 0.5 },
      { at: 1_100, x: 0.35, y: 0.51 },
      { at: 1_200, x: 0.48, y: 0.5 },
      { at: 1_300, x: 0.58, y: 0.49 },
    ];

    expect(
      recognizeGestureFromLandmarks(frame, {
        at: 1_300,
        handedness: "right",
        movementHistory,
      }),
    ).toMatchObject({ gesture: "swipe_right" });
  });

  it("debounces candidates before confirming a governed gesture", () => {
    const machine = new GestureStateMachine({ minConfidence: 0.7, cooldownMs: 500 });
    const candidate = {
      gesture: "open_palm" as const,
      confidence: 0.91,
      handedness: "right" as const,
      cursor: null,
    };

    expect(machine.update(candidate, 1_000)).toBeNull();
    expect(machine.update(candidate, 1_016)).toBeNull();
    expect(machine.update(candidate, 1_032)).toMatchObject({
      gesture: "open_palm",
    });
    expect(machine.update(candidate, 1_200)).toBeNull();
  });
});

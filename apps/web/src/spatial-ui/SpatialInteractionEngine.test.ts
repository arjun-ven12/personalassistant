import { describe, expect, it } from "vitest";

import {
  rayFromLandmarks,
  SpatialInteractionEngine,
} from "./SpatialInteractionEngine.js";

const landmarks = () =>
  Array.from({ length: 21 }, (_, index) => ({
    x: 0.5 + index * 0.001,
    y: 0.5 + index * 0.001,
    z: 0.5,
  }));

describe("SpatialInteractionEngine", () => {
  it("smooths cursor movement and reports velocity", () => {
    const engine = new SpatialInteractionEngine({ smoothing: 0.5, inertia: 0 });
    engine.update({
      at: 1_000,
      cursor: { x: 0.1, y: 0.1 },
      confidence: 0.9,
      handedness: "right",
      gesture: "hover",
      landmarks: landmarks(),
    });
    const frame = engine.update(
      {
        at: 1_100,
        cursor: { x: 0.5, y: 0.5 },
        confidence: 0.9,
        handedness: "right",
        gesture: "hover",
        landmarks: landmarks(),
      },
      "nav:/agents",
    );

    expect(frame.cursor?.x).toBeGreaterThan(0.1);
    expect(frame.cursor?.x).toBeLessThan(0.5);
    expect(frame.cursor?.velocity).toBeGreaterThan(0);
    expect(frame.predictedTargetId).toBe("nav:/agents");
  });

  it("tracks dwell progress and gesture sequences", () => {
    const engine = new SpatialInteractionEngine({ dwellMs: 1_000 });
    engine.update(
      {
        at: 1_000,
        cursor: { x: 0.5, y: 0.5 },
        confidence: 0.9,
        handedness: "right",
        gesture: "point",
        landmarks: landmarks(),
      },
      "spatial.agent.nodes",
    );
    const frame = engine.update(
      {
        at: 1_800,
        cursor: { x: 0.52, y: 0.5 },
        confidence: 0.9,
        handedness: "right",
        gesture: "pinch",
        landmarks: landmarks(),
      },
      "spatial.agent.nodes",
    );

    expect(frame.dwellProgress).toBeGreaterThan(0.7);
    expect(frame.sequence).toEqual(["point", "pinch"]);
  });

  it("creates hand rays from wrist and index landmarks", () => {
    const frame = landmarks();
    frame[0] = { x: 0.6, y: 0.6, z: 0.5 };
    frame[8] = { x: 0.4, y: 0.4, z: 0.5 };

    expect(rayFromLandmarks(frame, "left", 0.82)).toMatchObject({
      source: "left_hand",
      confidence: 0.82,
    });
  });
});

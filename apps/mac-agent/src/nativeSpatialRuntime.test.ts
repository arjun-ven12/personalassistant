import { describe, expect, it } from "vitest";

import {
  nativeSpatialModelAssetUrls,
  nativeSpatialModelFallbackMessage,
} from "./nativeSpatialRuntime.js";

describe("NativeSpatialRuntime", () => {
  it("keeps camera tracking recoverable when the gesture model cannot load", () => {
    const message = nativeSpatialModelFallbackMessage(new Error("network blocked"));

    expect(message).toContain("Camera tracking is running locally");
    expect(message).toContain("gesture model could not load");
    expect(message).toContain("Raw frames remain local");
    expect(message).toContain("gesture submission is paused");
  });

  it("loads MediaPipe assets from bundled Mac Agent files before remote fallback", () => {
    const urls = nativeSpatialModelAssetUrls();
    expect(urls.wasmBase).toMatch(/\.?\/mediapipe\/wasm$/);
    expect(urls.modelUrl).toMatch(/\.?\/mediapipe\/models\/gesture_recognizer\.task$/);
    expect(urls.remoteWasmBase).toContain("@mediapipe/tasks-vision");
  });
});

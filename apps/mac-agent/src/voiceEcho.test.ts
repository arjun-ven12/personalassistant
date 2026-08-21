import { describe, expect, it } from "vitest";

import { isLikelyPlaybackEcho } from "./voiceEcho.js";

describe("voice playback echo detection", () => {
  it("matches partial and lightly misrecognized playback text", () => {
    const response = "The build failed because the validation step timed out.";
    expect(isLikelyPlaybackEcho("the build failed", response)).toBe(true);
    expect(isLikelyPlaybackEcho("build failed validation timed out", response)).toBe(true);
  });

  it("does not suppress a genuinely different interruption", () => {
    const response = "The build failed because the validation step timed out.";
    expect(isLikelyPlaybackEcho("shut up", response)).toBe(false);
    expect(isLikelyPlaybackEcho("open the workflows page", response)).toBe(false);
  });
});
